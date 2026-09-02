import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from './AppIcon.js';
import LinearGradient from 'react-native-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { dashboardService } from '../api/services';
import { setNotifications, setUnreadCount } from '../store/slices/notificationSlice';

/**
 * Reusable Screen Header Component
 * Provides consistent header with hamburger menu across all screens
 * 
 * @param {Object} props
 * @param {string} props.title - Main header title
 * @param {string} props.subtitle - Optional subtitle text
 * @param {Function} props.onMenuPress - Callback for hamburger menu press
 * @param {Function} props.onNotificationPress - Optional callback for notification button
 * @param {boolean} props.showNotifications - Show notification button (default: true)
 * @param {boolean} props.useGradient - Use gradient background (default: true)
 */
const ScreenHeader = ({
  title,
  subtitle,
  onMenuPress,
  onNotificationPress,
  showNotifications = true,
  useGradient = true,
}) => {
  const navigation = useNavigation();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const unreadCount = useSelector(state => state.notification.unreadCount);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const dispatch = useDispatch();
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const depotName = String(user?.Depot || user?.depot || '').trim();

  const handleNotificationPress = async () => {
    try {
      setLoadingNotifications(true);
      const userId = user?.User || user?.user || user?.username || user?.Code || user?.code || '';
      const response = await dashboardService.getNotifications(dbName || 'MUTSPL_TEST', userId);
      const rows = Array.isArray(response?.Data) ? response.Data : Array.isArray(response?.data) ? response.data : [];
      const loadedNotifications = rows.map((item, index) => ({
        ...item,
        id: item?.id || item?.Code || item?.DocEntry || `notification-${index}`,
        code: item?.Code || item?.id || item?.DocEntry,
        title: item?.Title || item?.title || item?.Message || 'Notification',
        message: item?.Message || item?.message || '',
        type: String(item?.Type || item?.type || '').trim().toUpperCase(),
        read: String(item?.Read || '').trim().toUpperCase() === 'Y',
        timestamp: item?.Date || item?.timestamp || null,
      }));
      dispatch(setNotifications(loadedNotifications));
      dispatch(setUnreadCount(loadedNotifications.filter(item => !item.read).length));
      if (typeof onNotificationPress === 'function') {
        onNotificationPress();
      } else {
        navigation.navigate('Notifications');
      }
    } catch (error) {
      console.warn('Unable to preload notifications before opening screen:', error?.message || error);
      navigation.navigate('Main', { screen: 'Notifications' });
    } finally {
      setLoadingNotifications(false);
    }
  };

  const headerContent = (
    <View style={styles.headerContent}>
      <TouchableOpacity
        onPress={onMenuPress}
        style={styles.menuButton}
      >
        <MaterialIcons name="menu" size={28} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && (
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        )}
        {depotName ? <Text style={styles.headerSubtitle}>Depot: {depotName}</Text> : null}
      </View>
      
      {showNotifications ? (
        <TouchableOpacity
          onPress={handleNotificationPress}
          disabled={loadingNotifications}
          style={styles.notificationButton}
        >
          <MaterialIcons name="notifications" size={24} color="#fff" />
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.danger || COLORS.danger }]}> 
              <Text style={[styles.badgeText, { color: colors.white || COLORS.white }]}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );

  if (useGradient) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primaryDark || colors.primary }}>
        <LinearGradient
          colors={[colors.primaryDark || colors.primary, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {headerContent}
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        {headerContent}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    padding: SPACING.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  notificationButton: {
    padding: SPACING.xs,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

export default ScreenHeader;

