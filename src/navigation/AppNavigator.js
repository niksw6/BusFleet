import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
import * as SplashScreen from 'expo-splash-screen';

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
import { getUserData, getDBName } from '../utils/storage';
import { setNavigationRef } from '../api/client';
import { COLORS, DARK_COLORS } from '../constants/theme';

const Stack = createNativeStackNavigator();

SplashScreen.preventAutoHideAsync();

const AppNavigator = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

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
        await SplashScreen.hideAsync();
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
        colors: {
          background: isDarkMode ? colors.background : colors.light,
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
            <Stack.Screen
              name="CreateJobCard"
              component={CreateJobCardScreen}
              options={{
                title: 'Create Job Card',
                presentation: 'modal',
              }}
            />
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
