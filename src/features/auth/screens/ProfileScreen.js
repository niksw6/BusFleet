import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, List, Divider, Switch } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { logout } from '../../../store/slices/authSlice';
import { toggleTheme } from '../../../store/slices/themeSlice';
import { clearAuthData } from '../../../utils/storage';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';

const ProfileScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await clearAuthData();
            dispatch(logout());
            Toast.show({
              type: 'info',
              text1: 'Logged Out',
              text2: 'You have been logged out successfully',
            });
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const handleToggleTheme = () => {
    dispatch(toggleTheme());
    Toast.show({
      type: 'success',
      text1: isDarkMode ? 'Light Mode Enabled' : 'Dark Mode Enabled',
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView>
        <View style={[styles.header, { backgroundColor: colors.white }]}>
          <View style={[styles.avatarContainer, { backgroundColor: colors.primary + '15' }]}>
            <MaterialIcons name="account-circle" size={80} color={colors.primary} />
          </View>
          <Text style={[styles.name, { color: isDarkMode ? colors.text : colors.dark }]}>{user?.name || user?.Name || user?.FirstName || 'User'}</Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email || user?.username || ''}</Text>
          <View style={[styles.companyBadge, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.company, { color: colors.primary }]}>{dbName}</Text>
          </View>
        </View>

        <View style={styles.contentWrapper}>
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <List.Item
            title="Dark Mode"
            description="Toggle dark mode theme"
            left={props => <List.Icon {...props} icon="brightness-6" color={colors.primary} />}
            right={() => (
              <Switch
                value={isDarkMode}
                onValueChange={handleToggleTheme}
                color={colors.primary}
              />
            )}
          />
          <Divider />

          <List.Item
            title="Notifications"
            description="Manage notification preferences"
            left={props => <List.Icon {...props} icon="bell" color={colors.primary} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              Toast.show({
                type: 'info',
                text1: 'Coming Soon',
                text2: 'Notification settings will be available soon',
              });
            }}
          />
          <Divider />

          <List.Item
            title="Language"
            description="English"
            left={props => <List.Icon {...props} icon="translate" color={colors.primary} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              Toast.show({
                type: 'info',
                text1: 'Coming Soon',
                text2: 'Language settings will be available soon',
              });
            }}
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <List.Item
            title="About"
            description="Version 1.0.0"
            left={props => <List.Icon {...props} icon="information" color={colors.info} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              Toast.show({
                type: 'info',
                text1: 'Fleet Data Management',
                text2: 'Version 1.0.0',
              });
            }}
          />
          <Divider />

          <List.Item
            title="Help & Support"
            description="Get help and support"
            left={props => <List.Icon {...props} icon="help-circle" color={colors.info} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              Toast.show({
                type: 'info',
                text1: 'Support',
                text2: 'Contact your administrator for support',
              });
            }}
          />
          <Divider />

          <List.Item
            title="Privacy Policy"
            description="Read our privacy policy"
            left={props => <List.Icon {...props} icon="shield-check" color={colors.info} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {
              Toast.show({
                type: 'info',
                text1: 'Privacy Policy',
                text2: 'Contact your administrator',
              });
            }}
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.danger }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <MaterialIcons name="logout" size={24} color="#fff" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    marginBottom: SPACING.md,
  },
  contentWrapper: {
    paddingBottom: SPACING.lg,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: 16,
    marginBottom: SPACING.sm,
  },
  companyBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.xs,
  },
  company: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    elevation: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    margin: SPACING.md,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: SPACING.sm,
  },
});

export default ProfileScreen;
