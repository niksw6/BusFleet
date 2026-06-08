import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Clipboard,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';
import { getLogs, clearLogs } from '../../../utils/logger';

import { setNotifications, setUnreadCount, markAsRead, markAllAsRead } from '../../../store/slices/notificationSlice';
import { dashboardService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';

const NotificationsScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const { notifications, unreadCount } = useSelector(state => state.notification);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logEntries, setLogEntries] = useState([]);

  const openLogs = () => {
    setLogEntries(getLogs());
    setShowLogs(true);
  };

  const copyLogs = () => {
    Clipboard.setString(logEntries.join('\n'));
    Toast.show({ type: 'success', text1: 'Logs copied to clipboard' });
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const resolveUserId = () => (
    user?.User || user?.user || user?.username || user?.Code || user?.code || user?.Name || user?.name || ''
  );

  const mapNotificationItem = (item) => ({
    ...item,
    id: item?.id || item?.Code,
    code: item?.Code || item?.id,
    title: item?.Message || item?.Title || 'Notification',
    message: item?.Message || item?.message || '',
    read: String(item?.Read || '').trim().toUpperCase() === 'Y',
    type: String(item?.Type || '').trim().toUpperCase(),
    timestamp: item?.Date || item?.timestamp || null,
    docEntry: item?.DocEntry,
  });

  const fetchNotifications = async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const userId = resolveUserId();

      const [notificationsResponse, countResponse] = await Promise.all([
        dashboardService.getNotifications(companyDb, userId),
        dashboardService.getNotificationCount(companyDb, userId),
      ]);

      if (notificationsResponse?.Success && Array.isArray(notificationsResponse?.Data)) {
        dispatch(setNotifications(notificationsResponse.Data.map(mapNotificationItem)));
      } else if (notificationsResponse?.success && Array.isArray(notificationsResponse?.data)) {
        dispatch(setNotifications(notificationsResponse.data.map(mapNotificationItem)));
      } else {
        dispatch(setNotifications([]));
      }

      if (countResponse?.Success) {
        dispatch(setUnreadCount(Number(countResponse?.Data) || 0));
      }
    } catch (error) {
      console.error('Error fetching notifications:', error.message || error);
      Toast.show({
        type: 'error',
        text1: 'Notifications Error',
        text2: String(error.message || error),
        visibilityTime: 8000,
      });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (notificationCode) => {
    try {
      await dashboardService.markNotificationAsRead({
        CompanyDB: dbName || 'MUTSPL_TEST',
        Code: String(notificationCode),
      });
      dispatch(markAsRead(notificationCode));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadNotifications = notifications.filter(item => !item.read);
    try {
      await Promise.all(
        unreadNotifications.map((item) =>
          dashboardService.markNotificationAsRead({
            CompanyDB: dbName || 'MUTSPL_TEST',
            Code: String(item.code || item.id || item.Code),
          })
        )
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }

    dispatch(markAllAsRead());
    Toast.show({
      type: 'success',
      text1: 'All notifications marked as read',
    });
  };

  const handleNotificationPress = async (item) => {
    const notificationCode = item.code || item.id || item.Code;
    if (!item.read && notificationCode) {
      await handleMarkAsRead(notificationCode);
    }

    const type = String(item.type || item.Type || '').trim().toUpperCase();
    const docEntry = item.docEntry || item.DocEntry;

    if (type === 'J') {
      navigation.navigate('WorkOrderDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
      });
      return;
    }

    if (type === 'W') {
      navigation.navigate('WorkOrderApiDetail', {
        workOrderDocEntry: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
      });
      return;
    }

    if (type === 'D' || type === 'B') {
      navigation.navigate('ComplaintDetail', {
        complaintNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: type === 'B' ? 'Breakdown' : 'Driver Complaint',
      });
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'D':
        return 'report-problem';
      case 'B':
        return 'warning';
      case 'J':
        return 'assignment';
      case 'W':
        return 'engineering';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'D':
        return '#0070F2'; // SAP Blue
      case 'B':
        return '#BB0000'; // SAP Red
      case 'J':
        return '#2B7D2B'; // SAP Green
      case 'W':
        return '#00689E'; // SAP Teal
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
          borderLeftColor: item.read ? colors.grayLight : getNotificationColor(item.type || item.Type),
        },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: getNotificationColor(item.type || item.Type) + '20' },
          ]}
        >
          <MaterialIcons
            name={getNotificationIcon(item.type || item.Type)}
            size={24}
            color={getNotificationColor(item.type || item.Type)}
          />
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              { color: colors.dark, fontWeight: item.read ? 'normal' : 'bold' },
            ]}
          >
            {item.title || 'Notification'}
          </Text>
          <Text style={[styles.message, { color: colors.gray }]} numberOfLines={2}>
            {item.message || item.Message}
          </Text>
          <Text style={[styles.time, { color: colors.gray }]}>
            {formatDateTime(item.timestamp || item.Date)}
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
      {/* Debug log modal */}
      <Modal visible={showLogs} animationType="slide" onRequestClose={() => setShowLogs(false)}>
        <View style={{ flex: 1, backgroundColor: '#111', padding: 8, paddingTop: 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Debug Logs ({logEntries.length})</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={copyLogs} style={{ backgroundColor: '#0070F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Copy All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { clearLogs(); setLogEntries([]); }} style={{ backgroundColor: '#BB0000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowLogs(false)} style={{ backgroundColor: '#444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {logEntries.map((entry, i) => (
              <Text key={i} style={{ color: entry.includes('ERROR') ? '#ff6b6b' : entry.includes('WARN') ? '#ffd93d' : '#aaffaa', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 }}>
                {entry}
              </Text>
            ))}
            {logEntries.length === 0 && (
              <Text style={{ color: '#888', fontSize: 13 }}>No logs captured yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <View style={[styles.headerActions, { backgroundColor: colors.white }]}>
        {unreadCount > 0 ? (
          <Text style={[styles.unreadCount, { color: colors.dark }]}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
        ) : (
          <Text style={[styles.unreadCount, { color: colors.gray }]}>Notifications</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllAsRead}>
              <Text style={[styles.markAllButton, { color: colors.primary }]}>Mark all as read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openLogs} style={{ marginLeft: 8, backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 11 }}>🛠 Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

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

