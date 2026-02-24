import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { setNotifications, markAsRead, markAllAsRead } from '../../../store/slices/notificationSlice';
import { dashboardService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';

const NotificationsScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const { notifications, unreadCount } = useSelector(state => state.notification);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await dashboardService.getNotifications();
      if (response && response.Success) {
        dispatch(setNotifications(response.Data || []));
      } else if (response && response.success) {
        dispatch(setNotifications(response.data || []));
      }
    } catch (error) {
      console.error('Error fetching notifications:', error.message || error);
      // Silently fail - notifications are not critical
      // The app will continue to work with cached/empty notifications
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await dashboardService.markNotificationAsRead(notificationId);
      dispatch(markAsRead(notificationId));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead());
    Toast.show({
      type: 'success',
      text1: 'All notifications marked as read',
    });
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'complaint':
        return 'report-problem';
      case 'breakdown':
        return 'warning';
      case 'fuel':
        return 'local-gas-station';
      case 'schedule':
        return 'schedule';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'complaint':
        return '#0070F2'; // SAP Blue
      case 'breakdown':
        return '#BB0000'; // SAP Red
      case 'fuel':
        return '#00689E'; // SAP Teal
      case 'schedule':
        return '#2B7D2B'; // SAP Green
      default:
        return '#0070F2'; // SAP Blue
    }
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        {
          backgroundColor: colors.white,
          borderLeftColor: item.read ? colors.grayLight : getNotificationColor(item.type),
        },
      ]}
      onPress={() => handleMarkAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: getNotificationColor(item.type) + '20' },
          ]}
        >
          <MaterialIcons
            name={getNotificationIcon(item.type)}
            size={24}
            color={getNotificationColor(item.type)}
          />
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              { color: colors.dark, fontWeight: item.read ? 'normal' : 'bold' },
            ]}
          >
            {item.title}
          </Text>
          <Text style={[styles.message, { color: colors.gray }]} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={[styles.time, { color: colors.gray }]}>
            {formatDateTime(item.timestamp)}
          </Text>
        </View>

        {!item.read && (
          <View style={[styles.unreadIndicator, { backgroundColor: colors.primary }]} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      {unreadCount > 0 && (
        <View style={[styles.headerActions, { backgroundColor: colors.white }]}>
          <Text style={[styles.unreadCount, { color: colors.dark }]}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={handleMarkAllAsRead}>
            <Text style={[styles.markAllButton, { color: colors.primary }]}>
              Mark all as read
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="notifications-none" size={64} color={colors.gray} />
            <Text style={[styles.emptyText, { color: colors.gray }]}>
              No notifications yet
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    elevation: 2,
  },
  unreadCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  markAllButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: SPACING.md,
  },
  notificationCard: {
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
  },
  notificationContent: {
    flexDirection: 'row',
    padding: SPACING.md,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
  },
  unreadIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: SPACING.sm,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    marginTop: SPACING.xxl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
});

export default NotificationsScreen;
