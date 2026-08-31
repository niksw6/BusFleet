import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
// Removed expo-splash-screen usage

// Feature-based imports
import { LoginScreen } from '../features/auth';
import { CreateFuelLogScreen, CreateScheduleScreen } from '../features/maintenance';
import { CreateJobCardScreen, JobCardsScreen, WorkOrderDetailScreen, WorkEntryScreen, TeamApprovalsScreen, MechanicDashboardScreen, FaultWorkScreen, PartsApprovalScreen, ReviewWorkEntriesScreen } from '../features/jobCards';
import { CreateIncidentScreen, RepairIncidentReviewScreen, RepairJobCardAssignmentScreen, RepairWorkScreen, RepairAssemblyIssueScreen, RepairPartsRequestsScreen } from '../features/complaints';
import BreakdownTeamsListScreen from '../features/breakdownTeams/screens/BreakdownTeamsListScreen';
import BreakdownTeamPortalScreen from '../features/breakdownTeams/screens/BreakdownTeamPortalScreen';
import DrawerNavigator from './DrawerNavigator';

// Legacy screens (to be refactored)
import ComplaintDetailScreen from '../screens/ComplaintDetailScreen';
import WorkflowGuideScreen from '../screens/WorkflowGuideScreen';

import { loginSuccess } from '../store/slices/authSlice';
import { setUnreadCount } from '../store/slices/notificationSlice';
import { getUserData, getDBName } from '../utils/storage';
import { setNavigationRef } from '../api/client';
import { dashboardService } from '../api/services';
import { COLORS, DARK_COLORS } from '../constants/theme';
import { isSupervisorUser, isStoreUser, isMechanicUser, isElectricianUser, isTeamLeaderUser, isFieldStaffUser, isDriverUser } from '../utils/roleAccess';

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
  const storeUser = isStoreUser(user);
  const mechanicUser = isMechanicUser(user);
  const fieldStaffUser = isFieldStaffUser(user);
  const teamLeaderUser = isTeamLeaderUser(user);
  const driverUser = isDriverUser(user);

  const refreshNotificationCount = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    const userId = user?.User || user?.user || user?.username || user?.Code || user?.code || '';
    try {
      const response = await dashboardService.getNotificationCount(dbName || 'MUTSPL_TEST', userId);
      const data = response?.Data ?? response?.data ?? response;
      const count = typeof data === 'number' ? data : Number(
        data?.Count ?? data?.UnreadCount ?? response?.Count ?? response?.UnreadCount ?? 0,
      );
      if (Number.isFinite(count)) dispatch(setUnreadCount(count));
    } catch (error) {
      console.warn('Unable to refresh notification count:', error?.message || error);
    }
  }, [dbName, dispatch, isAuthenticated, user]);

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

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    const interval = setInterval(refreshNotificationCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshNotificationCount, user]);

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
            {(supervisorUser || storeUser || fieldStaffUser || driverUser) && (
              <Stack.Screen
                name="CreateIncident"
                component={CreateIncidentScreen}
                options={({ route }) => {
                  const type = route.params?.type;
                  let title = 'Create Incident';
                  if (type === 'breakdown') title = 'Report Breakdown';
                  else if (type === 'complaint') title = 'Report Incident';
                  else if (type === 'repair') title = 'Create Repair Incident';
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
                name="RepairIncidentReview"
                component={RepairIncidentReviewScreen}
                options={{ title: 'Repair Incident Review' }}
              />
            )}
            {fieldStaffUser && (
              <Stack.Screen
                name="RepairJobCardAssignment"
                component={RepairJobCardAssignmentScreen}
                options={{ title: 'Repair Job Assignment' }}
              />
            )}
            {fieldStaffUser && (
              <Stack.Screen
                name="RepairWork"
                component={RepairWorkScreen}
                options={{ title: 'Repair Work' }}
              />
            )}
            {storeUser && (
              <Stack.Screen
                name="RepairAssemblyIssue"
                component={RepairAssemblyIssueScreen}
                options={{ title: 'Issue Repair Assembly' }}
              />
            )}
            {(supervisorUser || storeUser) && (
              <Stack.Screen name="RepairPartsRequests" component={RepairPartsRequestsScreen} options={{ headerShown: false }} />
            )}
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
            {fieldStaffUser && (
              <Stack.Screen
                name="WorkEntry"
                component={WorkEntryScreen}
                options={{
                  title: 'Work Entry',
                  presentation: 'modal',
                }}
              />
            )}
                        {supervisorUser && (
                          <Stack.Screen
                            name="BreakdownTeams"
                            component={BreakdownTeamsListScreen}
                            options={{
                              title: 'Breakdown Teams',
                            }}
                          />
                        )}
                        {fieldStaffUser && (
                          <Stack.Screen
                            name="BreakdownPortal"
                            component={BreakdownTeamPortalScreen}
                            options={{
                              title: 'Breakdown Portal',
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
            {supervisorUser && (
              <Stack.Screen
                name="ReviewWorkEntries"
                component={ReviewWorkEntriesScreen}
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
