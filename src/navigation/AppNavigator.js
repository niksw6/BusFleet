import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
// Removed expo-splash-screen usage

// Feature-based imports
import { LoginScreen } from '../features/auth';
import { CreateFuelLogScreen, CreateScheduleScreen } from '../features/maintenance';
import { CreateJobCardScreen, JobCardsScreen, WorkOrderDetailScreen, WorkOrderApiDetailScreen } from '../features/jobCards';
import { CreateIncidentScreen } from '../features/complaints';
import DrawerNavigator from './DrawerNavigator';

// Legacy screens (to be refactored)
import ComplaintDetailScreen from '../screens/ComplaintDetailScreen';
import WorkOrderScreen from '../screens/WorkOrderScreen';
import WorkflowGuideScreen from '../screens/WorkflowGuideScreen';

import { loginSuccess } from '../store/slices/authSlice';
import { setUnreadCount } from '../store/slices/notificationSlice';
import { getUserData, getDBName } from '../utils/storage';
import { setNavigationRef } from '../api/client';
import { dashboardService } from '../api/services';
import { COLORS, DARK_COLORS } from '../constants/theme';
import { isSupervisorUser } from '../utils/roleAccess';

const Stack = createNativeStackNavigator();

// no-op splash handling

const AppNavigator = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const user = useSelector(state => state.auth.user);
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const supervisorUser = isSupervisorUser(user);

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

          // Fetch notification count on session restore so badge is populated before BottomTab mounts
          const userId = userData?.User || userData?.user || userData?.username || userData?.Code || userData?.code || userData?.Name || userData?.name || '';
          if (userId) {
            dashboardService.getNotificationCount(dbName, userId)
              .then(res => { if (res?.Success) dispatch(setUnreadCount(Number(res?.Data) || 0)); })
              .catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Error restoring session:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <NavigationContainer
      ref={(ref) => setNavigationRef(ref)}
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
            {supervisorUser && (
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
            <Stack.Screen
              name="WorkOrder"
              component={WorkOrderScreen}
              options={{
                title: 'Work Order',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="JobCards"
              component={JobCardsScreen}
              options={{
                title: 'Job Cards',
              }}
            />
            <Stack.Screen
              name="WorkOrderDetail"
              component={WorkOrderDetailScreen}
              options={{
                headerShown: true,
                title: 'Job Card Details',
              }}
            />
            <Stack.Screen
              name="WorkOrderApiDetail"
              component={WorkOrderApiDetailScreen}
              options={{
                headerShown: true,
                title: 'Work Order Details',
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
