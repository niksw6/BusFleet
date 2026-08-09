import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
// Removed expo-splash-screen usage

// Feature-based imports
import { LoginScreen } from '../features/auth';
import { CreateFuelLogScreen, CreateScheduleScreen } from '../features/maintenance';
import { CreateJobCardScreen, JobCardsScreen, WorkOrderDetailScreen, TeamApprovalsScreen, MechanicDashboardScreen, FaultWorkScreen, PartsApprovalScreen } from '../features/jobCards';
import { CreateIncidentScreen } from '../features/complaints';
import DrawerNavigator from './DrawerNavigator';

// Legacy screens (to be refactored)
import ComplaintDetailScreen from '../screens/ComplaintDetailScreen';
import WorkflowGuideScreen from '../screens/WorkflowGuideScreen';

import { loginSuccess } from '../store/slices/authSlice';
import { setUnreadCount } from '../store/slices/notificationSlice';
import { getUserData, getDBName } from '../utils/storage';
import { setNavigationRef } from '../api/client';
import { dashboardService, storeService, teamService, mechanicService, jobCardService } from '../api/services';
import { COLORS, DARK_COLORS } from '../constants/theme';
import { isSupervisorUser, isMechanicUser, isElectricianUser, isTeamLeaderUser, isFieldStaffUser, isDriverUser, getUserTeamCode } from '../utils/roleAccess';

const Stack = createNativeStackNavigator();

// no-op splash handling

const AppNavigator = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const supervisorUser = isSupervisorUser(user);
  const mechanicUser = isMechanicUser(user);
  const fieldStaffUser = isFieldStaffUser(user);
  const teamLeaderUser = isTeamLeaderUser(user);
  const driverUser = isDriverUser(user);

  const isSupervisorVerificationPending = (entity) => {
    const raw = String(entity?.Status ?? entity?.WorkStatus ?? entity?.FaultStatus ?? '').trim().toUpperCase();
    return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(raw);
  };

  const isPendingPartApproval = (part) => {
    const status = String(part?.Status ?? part?.ApprovalStatus ?? '').trim().toUpperCase();
    return !status || ['P', 'PENDING', 'RQ', 'REQUESTED'].includes(status);
  };

  // Refresh the badge whenever navigation changes. Some actionable items are
  // workflow queues rather than rows from GetNotifications, so count them here.
  const refreshNotificationCount = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    const companyDb = dbName || 'MUTSPL_TEST';
    const userCode = String(user?.User || user?.user || user?.username || user?.Code || user?.code || user?.Name || user?.name || '').trim();
    let unreadCount = 0;

    try {
      if (userCode) {
        const countResponse = await dashboardService.getNotificationCount(companyDb, userCode);
        unreadCount = Number(countResponse?.Data) || 0;
      }

      if (teamLeaderUser && userCode) {
        const teamResponse = await teamService.getMechanicalDashboard(companyDb, userCode);
        const source = teamResponse?.Data ?? teamResponse;
        const jobs = Array.isArray(source)
          ? source
          : (Array.isArray(source?.JobCards) ? source.JobCards : (Array.isArray(source?.Jobs) ? source.Jobs : []));
        const teamCode = getUserTeamCode(user);
        const pendingTeamJobs = jobs.filter((job) => {
          const status = String(job?.TeamStatus ?? job?.Status ?? job?.AcceptStatus ?? '').trim().toUpperCase();
          const belongsToTeam = !teamCode || !job?.TeamCode || String(job.TeamCode).trim() === teamCode;
          return belongsToTeam && !['A', 'ACCEPTED', 'R', 'REJECTED'].includes(status);
        }).length;
        unreadCount += pendingTeamJobs;
      }

      if (fieldStaffUser && userCode) {
        // Count only this mechanic/electrician's own queue. Prefer the new
        // assignment-scoped endpoint and retain the live dashboard fallback.
        let mechanicResponse;
        try {
          mechanicResponse = await mechanicService.getMyJobs(companyDb, userCode);
        } catch (queueError) {
          mechanicResponse = await mechanicService.getMechanicDashboard(companyDb, userCode);
        }
        const source = mechanicResponse?.Data ?? mechanicResponse;
        const jobs = Array.isArray(source)
          ? source
          : (Array.isArray(source?.Faults) ? source.Faults : (Array.isArray(source?.Jobs) ? source.Jobs : (Array.isArray(source?.Items) ? source.Items : [])));
        const assignedPending = jobs.filter((job) => {
          const status = String(job?.Status ?? job?.FaultStatus ?? job?.WorkStatus ?? '').trim().toUpperCase();
          return !['C', 'CM', 'COMPLETED', 'COMPLETE'].includes(status);
        }).length;
        let approvedPartJobs = 0;
        try {
          const approvedResponse = await storeService.getApprovedJobCardParts(companyDb, userCode);
          const approvedParts = Array.isArray(approvedResponse?.Data)
            ? approvedResponse.Data
            : (Array.isArray(approvedResponse?.data) ? approvedResponse.data : []);
          approvedPartJobs = new Set(
            approvedParts
              .filter((part) => !part?.Received && String(part?.Status ?? part?.ApprovalStatus ?? 'A').trim().toUpperCase() !== 'R')
              .map((part) => part?.JobCardDocEntry ?? part?.JobCardNo ?? part?.DocEntry)
              .filter((value) => value !== undefined && value !== null && String(value).trim())
              .map(String)
          ).size;
        } catch (approvedPartsError) {
          // Keep the work-queue badge available on server versions without this endpoint.
        }
        unreadCount = Math.max(unreadCount, assignedPending + approvedPartJobs);
      }

      if (supervisorUser) {
        try {
          const partsResponse = await storeService.getMechanicPartRequests(companyDb);
          const partRows = Array.isArray(partsResponse?.Data) ? partsResponse.Data : (Array.isArray(partsResponse?.data) ? partsResponse.data : []);
          const pendingWorkEntries = new Set(
            partRows
              .filter(isPendingPartApproval)
              .map((part) => part?.WorkEntryDocEntry ?? part?.WorkEntryNo ?? part?.DocEntry)
              .filter((value) => value !== undefined && value !== null && String(value).trim())
              .map(String)
          );
          unreadCount += pendingWorkEntries.size;
        } catch (partsError) {
          // A parts endpoint failure must not hide other supervisor badges.
          console.warn('Parts-request badge refresh failed:', partsError?.message || partsError);
        }

        try {
          const jobCardsResponse = await jobCardService.getJobCards(companyDb);
          const jobCards = Array.isArray(jobCardsResponse?.Data) ? jobCardsResponse.Data : [];
          unreadCount += jobCards.filter(isSupervisorVerificationPending).length;
        } catch (verificationError) {
          console.warn('Verification badge refresh failed:', verificationError?.message || verificationError);
        }
      }

      dispatch(setUnreadCount(unreadCount));
    } catch (error) {
      console.warn('Notification badge refresh failed:', error?.message || error);
    }
  }, [dbName, dispatch, fieldStaffUser, isAuthenticated, supervisorUser, teamLeaderUser, user]);

  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        const userData = await getUserData();
        const dbName = await getDBName();

        if (userData && dbName) {
          dispatch(loginSuccess({
            user: userData,
            dbName: dbName,
            token: null,
          }));

        }
      } catch (e) {
        console.warn('Error restoring session:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    refreshNotificationCount();
  }, [refreshNotificationCount]);

  if (!appIsReady) {
    return null;
  }

  return (
    <NavigationContainer
      ref={(ref) => setNavigationRef(ref)}
      onStateChange={refreshNotificationCount}
      theme={{
        ...(isDarkMode ? DarkTheme : DefaultTheme),
        colors: {
          ...(isDarkMode ? DarkTheme.colors : DefaultTheme.colors),
          background: isDarkMode ? colors.background : colors.light,
          primary: colors.primary,
          card: isDarkMode ? colors.card : colors.white,
          text: isDarkMode ? colors.text : colors.dark,
          border: isDarkMode ? colors.gray : colors.grayLight,
          notification: colors.danger,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              headerShown: false,
            }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={DrawerNavigator}
              options={{
                headerShown: false,
              }}
            />
            {(supervisorUser || fieldStaffUser || driverUser) && (
              <Stack.Screen
                name="CreateIncident"
                component={CreateIncidentScreen}
                options={({ route }) => {
                  const type = route.params?.type;
                  let title = 'Create Incident';
                  if (type === 'breakdown') title = 'Report Breakdown';
                  else if (type === 'complaint') title = 'Report Incident';
                  return { title, presentation: 'modal' };
                }}
              />
            )}
            <Stack.Screen
              name="CreateFuelLog"
              component={CreateFuelLogScreen}
              options={{
                title: 'Log Fuel',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="CreateSchedule"
              component={CreateScheduleScreen}
              options={{
                title: 'Add Schedule',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="ComplaintDetail"
              component={ComplaintDetailScreen}
              options={{
                title: 'Incident Details',
              }}
            />
            {supervisorUser && (
              <Stack.Screen
                name="CreateJobCard"
                component={CreateJobCardScreen}
                options={{
                  title: 'Create Job Card',
                  presentation: 'modal',
                }}
              />
            )}
            {teamLeaderUser && (
              <Stack.Screen
                name="TeamApprovals"
                component={TeamApprovalsScreen}
                options={{
                  headerShown: false,
                }}
              />
            )}
            {fieldStaffUser && (
              <Stack.Screen
                name="MechanicDashboard"
                component={MechanicDashboardScreen}
                options={{
                  headerShown: false,
                }}
              />
            )}
            {fieldStaffUser && (
              <Stack.Screen
                name="FaultWork"
                component={FaultWorkScreen}
                options={{
                  headerShown: true,
                  title: 'Fault Work',
                }}
              />
            )}
            {supervisorUser && (
              <Stack.Screen
                name="PartsApproval"
                component={PartsApprovalScreen}
                options={{
                  headerShown: false,
                }}
              />
            )}
            <Stack.Screen
              name="JobCards"
              component={JobCardsScreen}
              options={{
                title: 'Job Cards',
              }}
            />
            <Stack.Screen
              name="JobCardDetail"
              component={WorkOrderDetailScreen}
              options={{
                headerShown: true,
                title: 'Job Card Details',
              }}
            />
            <Stack.Screen
              name="WorkflowGuide"
              component={WorkflowGuideScreen}
              options={{
                headerShown: false,
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
