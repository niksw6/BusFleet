import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { Badge } from 'react-native-paper';

// Feature-based imports
import { DashboardScreen, NotificationsScreen } from '../features/dashboard';
import { ComplaintsScreen } from '../features/complaints';
import { ProfileScreen } from '../features/auth';
import { JobCardsScreen, WorkOrdersDashboardScreen } from '../features/jobCards';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { logout } from '../store/slices/authSlice';

const Drawer = createDrawerNavigator();

// Custom Drawer Content with Modern Design
const CustomDrawerContent = (props) => {
  const { state, navigation } = props;
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const unreadCount = useSelector(state => state.notification.unreadCount);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const menuItems = [
    { 
      name: 'Dashboard', 
      label: 'Dashboard', 
      icon: 'dashboard', 
      color: '#3B82F6',
      gradient: ['#3B82F6', '#2563EB']
    },
    { 
      name: 'Complaints', 
      label: 'Incidents', 
      icon: 'assignment', 
      color: '#F59E0B',
      gradient: ['#F59E0B', '#D97706']
    },
    { 
      name: 'JobCards', 
      label: 'Job Cards', 
      icon: 'build-circle', 
      color: '#8B5CF6',
      gradient: ['#8B5CF6', '#7C3AED']
    },
    {
      name: 'WorkOrders',
      label: 'Work Orders',
      icon: 'receipt-long',
      color: '#06B6D4',
      gradient: ['#06B6D4', '#0891B2']
    },
    { 
      name: 'Notifications', 
      label: 'Notifications', 
      icon: 'notifications', 
      color: '#10B981',
      gradient: ['#10B981', '#059669'],
      badge: unreadCount
    },
    { 
      name: 'Profile', 
      label: 'Profile', 
      icon: 'person', 
      color: '#6366F1',
      gradient: ['#6366F1', '#4F46E5']
    },
  ];

  const handleLogout = () => {
    dispatch(logout());
  };

  const activeRoute = state.routes[state.index].name;

  return (
    <DrawerContentScrollView 
      {...props} 
      style={[styles.drawerContainer, { backgroundColor: isDarkMode ? colors.background : '#F8FAFC' }]}
      contentContainerStyle={styles.drawerContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Modern Header with Gradient */}
      <LinearGradient
        colors={['#1E293B', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <MaterialIcons name="person" size={32} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Text style={styles.userName}>{user?.name || 'User Name'}</Text>
        {(user?.Code || user?.code || user?.id) && (
          <Text style={styles.userCode}>ID: {user?.Code || user?.code || user?.id}</Text>
        )}
      </LinearGradient>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        {menuItems.map((item, index) => {
          const isActive = activeRoute === item.name;
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                isActive && styles.menuItemActive
              ]}
              onPress={() => navigation.navigate(item.name)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={isActive ? item.gradient : ['transparent', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.menuItemGradient}
              >
                <View style={[
                  styles.iconContainer,
                  !isActive && { backgroundColor: item.color + '15' }
                ]}>
                  <MaterialIcons 
                    name={item.icon} 
                    size={24} 
                    color={isActive ? '#FFFFFF' : item.color} 
                  />
                </View>
                <Text style={[
                  styles.menuLabel,
                  isActive ? styles.menuLabelActive : { color: isDarkMode ? colors.text : '#475569' }
                ]}>
                  {item.label}
                </Text>
                {item.badge > 0 && (
                  <Badge style={styles.badge} size={20}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Badge>
                )}
                {isActive && (
                  <MaterialIcons name="chevron-right" size={24} color="#FFFFFF" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Settings & Logout */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={() => navigation.navigate('WorkflowGuide')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#3B82F615' }]}>
            <MaterialIcons name="info" size={24} color="#3B82F6" />
          </View>
          <Text style={[styles.menuLabel, { color: isDarkMode ? colors.text : '#475569' }]}>
            How It Works
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsItem}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#64748B15' }]}>
            <MaterialIcons name="settings" size={24} color="#64748B" />
          </View>
          <Text style={[styles.menuLabel, { color: isDarkMode ? colors.text : '#475569' }]}>
            Settings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsItem}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#EF444415' }]}>
            <MaterialIcons name="logout" size={24} color="#EF4444" />
          </View>
          <Text style={[styles.menuLabel, { color: '#EF4444' }]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Fleet Management App</Text>
        <Text style={styles.footerVersion}>Version 2.0</Text>
      </View>
    </DrawerContentScrollView>
  );
};

const DrawerNavigator = () => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerType: 'slide',
        drawerStyle: {
          width: 300,
        },
        headerStyle: {
          backgroundColor: colors.primary,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 20,
        },
        // Modern hamburger menu icon
        headerLeft: () => null, // We'll add custom hamburger in each screen
      }}
    >
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="Complaints"
        component={ComplaintsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="JobCards"
        component={JobCardsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="WorkOrders"
        component={WorkOrdersDashboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <Drawer.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          title: 'Notifications',
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: true,
          title: 'Profile',
        }}
      />
    </Drawer.Navigator>
  );
};

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
  },
  drawerContent: {
    flexGrow: 1,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF30',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  userCode: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF90',
    textAlign: 'center',
    marginTop: 2,
  },
  userRole: {
    fontSize: 12,
    color: '#FFFFFF90',
    textAlign: 'center',
  },
  menuSection: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  menuItem: {
    marginBottom: 4,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  menuItemActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  menuItemGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xs,
    paddingVertical: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  menuLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#EF4444',
    marginRight: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.md,
  },
  bottomSection: {
    paddingHorizontal: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xs,
    paddingVertical: 10,
    marginBottom: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  logoutButton: {
    marginTop: 4,
  },
  footer: {
    padding: SPACING.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: SPACING.xs,
  },
  footerText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  footerVersion: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
});

export default DrawerNavigator;
