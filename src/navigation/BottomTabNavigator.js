import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { Badge } from 'react-native-paper';

// Feature-based imports
import { DashboardScreen, NotificationsScreen } from '../features/dashboard';
import { ComplaintsScreen } from '../features/complaints';
import { ProfileScreen } from '../features/auth';
import { COLORS, DARK_COLORS } from '../constants/theme';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const unreadCount = useSelector(state => state.notification.unreadCount);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Tasks') {
            iconName = 'assignment';
          } else if (route.name === 'Notifications') {
            iconName = 'notifications';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          }

          return (
            <View>
              <MaterialIcons name={iconName} size={size} color={color} />
              {route.name === 'Notifications' && unreadCount > 0 && (
                <Badge
                  style={styles.badge}
                  size={16}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
              )}
            </View>
          );
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray,
        tabBarStyle: {
          backgroundColor: isDarkMode ? colors.card : colors.white,
          borderTopColor: colors.grayLight,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: colors.primary,
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 20,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={ComplaintsScreen}
        options={{
          title: 'Incidents',
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifications',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
  },
});

export default BottomTabNavigator;
