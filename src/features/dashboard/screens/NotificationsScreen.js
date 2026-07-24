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
import { dashboardService, complaintService, teamService, mechanicService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';
import { isTeamLeaderUser, isSupervisorUser, isFieldStaffUser } from '../../../utils/roleAccess';

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
  const [hasBackendCountMismatch, setHasBackendCountMismatch] = useState(false);

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

  const resolveUserIdCandidates = () => {
    const candidates = [
      user?.User,
      user?.user,
      user?.username,
      user?.Code,
      user?.code,
      user?.Name,
      user?.name,
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);

    return [...new Set(candidates)];
  };

  const getIncidentTypeCode = (item) => {
    const explicitType = String(item?.ComplaintType || item?.complaintType || '').trim().toLowerCase();
    if (explicitType.includes('breakdown')) return 'B';
    if (explicitType.includes('preventive')) return 'M';

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'B';
    if (typeCode === 'M') return 'M';
    if (typeCode === 'D') return 'D';

    const text = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'B';
    if (text.includes('preventive')) return 'M';
    return 'D';
  };

  const resolveIncidentDocEntryFromNotification = (item) => {
    const directCandidates = [
      item?.ComplaintNo,
      item?.complaintNo,
      item?.IncidentNo,
      item?.incidentNo,
      item?.IncidentDocEntry,
      item?.incidentDocEntry,
      item?.ReferenceDocEntry,
      item?.RefDocEntry,
      item?.detailDocEntry,
      item?.docEntry,
      item?.DocEntry,
    ];

    const direct = directCandidates
      .map((value) => String(value || '').trim())
      .find(Boolean);
    if (direct) return direct;

    const text = `${item?.title || ''} ${item?.message || ''}`;
    const match = text.match(/incident\s*#\s*(\d+)/i);
    return match?.[1] || null;
  };

  const formatIncidentTitle = (item) => {
    const incidentDocEntry = resolveIncidentDocEntryFromNotification(item);
    if (!incidentDocEntry) return item?.Message || item?.Title || item?.title || 'Notification';

    const typeCode = getIncidentTypeCode(item);
    const baseTitle = String(item?.Message || item?.Title || item?.title || '').trim();

    if (!baseTitle.toLowerCase().includes('incident')) {
      return `Incident #${typeCode}-${incidentDocEntry}`;
    }

    return baseTitle.replace(/incident\s*#\s*\d+/i, `Incident #${typeCode}-${incidentDocEntry}`);
  };

  const mapNotificationItem = (item) => ({
    creatorName: item?.CreatedBy || item?.CreatorName || item?.UserName || item?.AssignBy || item?.SprvsrNm || item?.DriverName || '',
    priority: item?.Priority || item?.Severity || item?.Significance || '',
    busNo: item?.BusNo || item?.Vehicle || item?.BusCode || item?.BusRegistrationNo || item?.RegNo || '',
    detailDocEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo || null,
    significance: item?.Significance || item?.Severity || item?.Priority || item?.Type || '',
    ...item,
    id: item?.id || item?.Code || item?.DocEntry,
    code: item?.Code || item?.id || item?.DocEntry,
    title: formatIncidentTitle(item),
    message: item?.Message || item?.message || '',
    read: String(item?.Read || '').trim().toUpperCase() === 'Y',
    type: String(item?.Type || '').trim().toUpperCase(),
    timestamp: item?.Date || item?.timestamp || null,
    docEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo,
  });

  const getSignificanceLabel = (item) => {
    const raw = String(item?.significance || item?.priority || '').trim();
    if (!raw) return 'Normal';
    return raw;
  };

  const inferComplaintTypeFromNotification = (item) => {
    const explicit = String(item?.ComplaintType || item?.complaintType || '').trim();
    if (explicit) return explicit;

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'Breakdown';
    if (typeCode === 'D') return 'Driver Complaint';

    const text = `${item?.title || ''} ${item?.message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'Breakdown';
    return 'Driver Complaint';
  };

  const extractTeamLeaderJobCards = (dashboardData) => {
    const source = dashboardData?.Data ?? dashboardData;
    return Array.isArray(source)
      ? source
      : (Array.isArray(source?.JobCards)
        ? source.JobCards
        : Array.isArray(source?.Jobs)
          ? source.Jobs
          : []);
  };

  const deriveTeamLeaderStatus = (job) => {
    const teamStatus = String(job?.TeamStatus ?? job?.Status ?? job?.AcceptStatus ?? job?.ApprovalStatus ?? '').trim().toUpperCase();
    if (['A', 'ACCEPTED', 'ACCEPT'].includes(teamStatus)) return 'ACCEPTED';
    if (['R', 'REJECTED', 'REJECT'].includes(teamStatus)) return 'REJECTED';
    return 'PENDING';
  };

  const buildWorkflowNotifications = async (companyDb, identityCandidates) => {
    const primaryIdentity = identityCandidates[0] || '';
    const nowIso = new Date().toISOString();

    if (isSupervisorUser(user)) {
      const incidentsRes = await complaintService.getIncidents(companyDb, null, null);
      const incidents = Array.isArray(incidentsRes?.Data) ? incidentsRes.Data : [];
      const pendingReview = incidents
        .filter((item) => {
          const status = String(item?.Status || '').trim().toUpperCase();
          const jobCardNo = String(item?.JobcardNo || item?.JobCardNo || '').trim();
          return status === 'O' && !jobCardNo;
        })
        .sort((a, b) => Number(b?.DocEntry || 0) - Number(a?.DocEntry || 0));

      if (pendingReview.length > 0) {
        return pendingReview.map((item) => ({
          id: `workflow-supervisor-${item?.DocEntry}`,
          code: `workflow-supervisor-${item?.DocEntry}`,
          title: `Incident #${String(item?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D'}-${item?.DocEntry || '-'} requires supervisor action`,
          message: `Create job card and route this ${String(item?.ComplaintType || 'incident').toLowerCase()} to a team.`,
          creatorName: String(item?.DrvName || item?.DriverName || item?.CreatedBy || 'Driver'),
          significance: String(item?.Priority || 'Medium'),
          priority: String(item?.Priority || 'Medium'),
          busNo: String(item?.BusNo || item?.Vehicle || item?.RegNo || '').trim(),
          detailDocEntry: item?.DocEntry,
          docEntry: item?.DocEntry,
          read: false,
          type: String(item?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D',
          complaintType: item?.ComplaintType,
          timestamp: item?.IncidentDate || item?.RegDate || nowIso,
          workflowDerived: true,
        }));
      }
    }

    if (isTeamLeaderUser(user) && primaryIdentity) {
      const teamRes = await teamService.getMechanicalDashboard(companyDb, primaryIdentity);
      const teamCards = extractTeamLeaderJobCards(teamRes);
      const pendingCards = teamCards
        .filter(card => deriveTeamLeaderStatus(card) === 'PENDING')
        .sort((a, b) => Number(b?.DocEntry || b?.JobCardDocEntry || b?.JobCardNo || 0) - Number(a?.DocEntry || a?.JobCardDocEntry || a?.JobCardNo || 0));

      if (pendingCards.length > 0) {
        return pendingCards.map((card, index) => {
          const docEntry = card?.DocEntry ?? card?.JobCardDocEntry ?? card?.JobCardNo ?? `${index + 1}`;
          const busNo = String(card?.BusNo || card?.Vehicle || card?.BusCode || card?.BusRegistrationNo || card?.RegNo || '').trim();
          const priority = String(card?.Priority || 'Medium').trim();
          const createdAt = card?.RegDate || card?.CreatedDate || card?.JobCardDate || nowIso;
          return {
            id: `workflow-team-${primaryIdentity}-${docEntry}`,
            code: `workflow-team-${primaryIdentity}-${docEntry}`,
            title: `Team approval needed for Job Card #${card?.JobCardNo || docEntry}`,
            message: `${busNo || 'Bus -'} · ${priority} priority · accept or reject this job card.`,
            creatorName: String(card?.SprvsrNm || card?.SupervisorName || card?.AssignBy || 'Supervisor'),
            significance: priority,
            priority,
            busNo,
            detailDocEntry: docEntry,
            docEntry,
            read: false,
            type: 'T',
            timestamp: createdAt,
            workflowDerived: true,
          };
        });
      }
    }

    if (isFieldStaffUser(user) && primaryIdentity) {
      const mechanicRes = await mechanicService.getMechanicDashboard(companyDb, primaryIdentity);
      const source = mechanicRes?.Data ?? mechanicRes;
      const list = Array.isArray(source)
        ? source
        : (Array.isArray(source?.Faults)
          ? source.Faults
          : Array.isArray(source?.Items)
            ? source.Items
            : []);

      const pendingItems = list.filter((item) => {
        const status = String(item?.Status ?? item?.FaultStatus ?? '').trim().toUpperCase();
        return !['A', 'ACCEPTED', 'STARTED', 'IN PROGRESS', 'INPROGRESS', 'C', 'CM', 'COMPLETED'].includes(status);
      });

      if (pendingItems.length > 0) {
        return pendingItems.map((item, idx) => ({
          id: `workflow-mechanic-${primaryIdentity}-${item?.DocEntry || idx}`,
          code: `workflow-mechanic-${primaryIdentity}-${item?.DocEntry || idx}`,
          title: `Fault pending acceptance on Job Card #${item?.DocNum || item?.DocEntry || '-'}`,
          message: `${String(item?.FaultName || item?.FaultCode || 'Fault').trim()} is waiting for you to accept/start work.`,
          creatorName: String(item?.AssignBy || item?.SprvsrNm || 'Supervisor'),
          significance: String(item?.Priority || 'High'),
          priority: String(item?.Priority || 'High'),
          busNo: String(item?.Vehicle || item?.BusNo || item?.RegNo || '').trim(),
          detailDocEntry: item?.DocEntry,
          docEntry: item?.DocEntry,
          read: false,
          type: 'W',
          timestamp: item?.AcceptDate || item?.AssignDt || nowIso,
          workflowDerived: true,
        }));
      }
    }

    return [];
  };

  const fetchNotifications = async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const identityCandidates = resolveUserIdCandidates();

      const probeResults = await Promise.all(
        identityCandidates.map(async (identity) => {
          try {
            const [notificationsResponse, countResponse] = await Promise.all([
              dashboardService.getNotifications(companyDb, identity),
              dashboardService.getNotificationCount(companyDb, identity),
            ]);

            const notificationData = Array.isArray(notificationsResponse?.Data)
              ? notificationsResponse.Data
              : (Array.isArray(notificationsResponse?.data) ? notificationsResponse.data : []);

            return {
              identity,
              notifications: notificationData,
              unreadCount: Number(countResponse?.Data) || 0,
              success: true,
            };
          } catch (probeError) {
            return {
              identity,
              notifications: [],
              unreadCount: 0,
              success: false,
              error: probeError,
            };
          }
        })
      );

      if (probeResults.length > 0 && probeResults.every(result => !result.success)) {
        throw probeResults[0].error || new Error('Unable to fetch notifications from backend');
      }

      const bestProbe = probeResults.sort((a, b) => {
        if (b.notifications.length !== a.notifications.length) {
          return b.notifications.length - a.notifications.length;
        }
        return b.unreadCount - a.unreadCount;
      })[0] || { notifications: [], unreadCount: 0 };

      let mappedNotifications = bestProbe.notifications.map(mapNotificationItem);
      let effectiveUnreadCount = Number(bestProbe.unreadCount) || 0;
      if (mappedNotifications.length === 0) {
        try {
          const workflowNotifications = await buildWorkflowNotifications(companyDb, identityCandidates);
          if (workflowNotifications.length > 0) {
            mappedNotifications = workflowNotifications;
            effectiveUnreadCount = workflowNotifications.length;
          }
        } catch (workflowError) {
          console.warn('Workflow notification derivation failed:', workflowError?.message || workflowError);
        }
      }

      const mismatch = mappedNotifications.length === 0 && effectiveUnreadCount > 0;
      setHasBackendCountMismatch(mismatch);

      dispatch(setNotifications(mappedNotifications));
      const unreadFromList = mappedNotifications.filter(item => !item.read).length;
      dispatch(setUnreadCount(unreadFromList || effectiveUnreadCount));
    } catch (error) {
      setHasBackendCountMismatch(false);
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

  const navigateToIncidentDetail = async (item, fallbackDocEntry = null) => {
    const companyDb = dbName || 'MUTSPL_TEST';
    const incidentDocEntry = String(
      fallbackDocEntry
      || resolveIncidentDocEntryFromNotification(item)
      || '',
    ).trim();

    if (!incidentDocEntry) {
      return false;
    }

    let matchedIncident = null;
    try {
      const incidentsResponse = await complaintService.getIncidents(companyDb, null, null);
      const incidents = Array.isArray(incidentsResponse?.Data) ? incidentsResponse.Data : [];
      matchedIncident = incidents.find((row) => {
        const rowDocEntry = String(row?.DocEntry || row?.ComplaintNo || '').trim();
        return rowDocEntry && rowDocEntry === incidentDocEntry;
      }) || null;
    } catch (lookupError) {
      console.warn('Notification incident lookup failed:', lookupError?.message || lookupError);
    }

    const payload = {
      complaintNo: matchedIncident?.DocEntry || incidentDocEntry,
      dbName: companyDb,
      complaintType: matchedIncident?.ComplaintType || item?.ComplaintType || inferComplaintTypeFromNotification(item),
      jobCardNo: matchedIncident?.JobCardNo || matchedIncident?.JobcardNo || item?.JobCardNo || item?.jobCardNo || item?.JobcardNo || '',
      source: matchedIncident?._source || 'incident',
      busNo: matchedIncident?.BusNo || item?.busNo || item?.BusNo || item?.Vehicle || '',
      lastSrvDt: matchedIncident?.LastSrvDt || item?.LastSrvDt || '',
      lastSrvKM: matchedIncident?.LastSrvKM || item?.LastSrvKM || 0,
      active: matchedIncident?.Active || item?.Active || 'Y',
    };

    navigation.navigate('ComplaintDetail', payload);
    return true;
  };

  const handleMarkAsRead = async (notificationCode, item = null) => {
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
        unreadNotifications
          .map((item) =>
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
      await handleMarkAsRead(notificationCode, item);
    }

    const type = String(item.type || item.Type || '').trim().toUpperCase();
    const docEntry = item.detailDocEntry || item.docEntry || item.DocEntry;
    const incidentDocEntry = resolveIncidentDocEntryFromNotification(item);

    if (incidentDocEntry) {
      const navigatedToIncident = await navigateToIncidentDetail(item, incidentDocEntry);
      if (navigatedToIncident) {
        return;
      }
    }

    if (type === 'D' || type === 'B') {
      const navigatedToIncident = await navigateToIncidentDetail(item, docEntry);
      if (navigatedToIncident) {
        return;
      }

      navigation.navigate('ComplaintDetail', {
        complaintNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: type === 'B' ? 'Breakdown' : 'Driver Complaint',
        source: 'incident',
      });
      return;
    }

    if (item?.workflowDerived && type === 'W') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if ((type === 'T' || (isTeamLeaderUser(user) && type === 'J')) && docEntry) {
      navigation.navigate('TeamApprovals', {
        focusDocEntry: docEntry,
      });
      return;
    }

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

    if (docEntry) {
      navigation.navigate('WorkOrderDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
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
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              By: {item.creatorName || 'System'}
            </Text>
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              Significance: {getSignificanceLabel(item)}
            </Text>
          </View>
          {!!item.busNo && (
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              Bus: {item.busNo}
            </Text>
          )}
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

      {hasBackendCountMismatch && (
        <View style={[styles.mismatchBanner, { backgroundColor: colors.white, borderColor: '#FFB300' }]}>
          <MaterialIcons name="info-outline" size={18} color="#A66B00" />
          <Text style={[styles.mismatchText, { color: '#7A5A00' }]}>Unread count is available, but details are not returned by backend yet. Pull to refresh.</Text>
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
              {hasBackendCountMismatch ? 'Notifications are pending backend sync' : 'No notifications yet'}
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
  mismatchBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mismatchText: {
    fontSize: 12,
    flex: 1,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  metaText: {
    fontSize: 11,
    flex: 1,
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

