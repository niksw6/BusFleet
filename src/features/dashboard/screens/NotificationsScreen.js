import React, { useState, useCallback } from 'react';
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
import MaterialIcons from '../../../shared/components/AppIcon.js';
import Toast from 'react-native-toast-message';
import { getLogs, clearLogs } from '../../../utils/logger';

import { setNotifications, setUnreadCount, markAsRead, markAllAsRead } from '../../../store/slices/notificationSlice';
import { dashboardService, complaintService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';
import { isTeamLeaderUser, isMechanicUser, isFieldStaffUser, isSupervisorUser } from '../../../utils/roleAccess';
import { useFocusEffect } from '@react-navigation/native';

const NotificationsScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const supervisorUser = isSupervisorUser(user);
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

  useFocusEffect(useCallback(() => {
    fetchNotifications();
  }, [dbName, user]));

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
    if (typeCode === 'JB') return 'B';
    if (typeCode === 'JCT') return 'B';
    if (typeCode === 'JCA') return 'B';
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

  const mapNotificationItem = (item) => {
    const rawType = String(item?.Type || '').trim().toUpperCase();
    const normalizedType = rawType === 'WE' ? 'V' : rawType;
    const workEntryDoc = String(item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || '').trim();
    const defaultTitle = item?.Message || item?.Title || item?.title || 'Notification';
    const resolvedTitle = rawType === 'WE'
      ? `Mechanic completed Work Entry ${workEntryDoc || '-'}`
      : formatIncidentTitle(item);

    return {
    creatorName: item?.CreatedBy || item?.CreatorName || item?.UserName || item?.AssignBy || item?.SprvsrNm || item?.DriverName || '',
    priority: item?.Priority || item?.Severity || item?.Significance || '',
    busNo: item?.BusNo || item?.Vehicle || item?.BusCode || item?.BusRegistrationNo || item?.RegNo || '',
    detailDocEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo || null,
    significance: item?.Significance || item?.Severity || item?.Priority || item?.Type || '',
    ...item,
    id: item?.id || item?.Code || item?.DocEntry,
    code: item?.Code || item?.id || item?.DocEntry,
    title: resolvedTitle || defaultTitle,
    message: item?.Message || item?.message || '',
    read: String(item?.Read || '').trim().toUpperCase() === 'Y',
    type: normalizedType,
    timestamp: item?.Date || item?.timestamp || null,
    docEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo,
    };
  };

  const parseBackendDateTimeToMs = (dateValue, timeValue) => {
    const rawDate = String(dateValue || '').trim();
    const rawTime = String(timeValue || '').trim();

    if (!rawDate && !rawTime) return 0;

    const dotNetMatch = rawDate.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/i);
    if (dotNetMatch?.[1]) {
      const ticksMs = Number(dotNetMatch[1]);
      if (Number.isFinite(ticksMs)) return ticksMs;
    }

    const dateOnlyMdy = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const hhmmss24 = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (dateOnlyMdy && hhmmss24) {
      const month = Number(dateOnlyMdy[1]);
      const day = Number(dateOnlyMdy[2]);
      const year = Number(dateOnlyMdy[3]);
      const hour = Number(hhmmss24[1]);
      const minute = Number(hhmmss24[2]);
      const second = Number(hhmmss24[3] || 0);
      const d = new Date(year, month - 1, day, hour, minute, second);
      const ms = d.getTime();
      return Number.isNaN(ms) ? 0 : ms;
    }

    const combined = [rawDate, rawTime].filter(Boolean).join(' ');
    const parsed = new Date(combined || rawDate || rawTime);
    const ms = parsed.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  const getNotificationSortMs = (item) => {
    const dateCandidate = item?.timestamp || item?.Date || item?.CreatedDate || item?.ReqDate || item?.RequestDate;
    const timeCandidate = item?.Time || item?.time || item?.ReqTime || item?.RequestTime;
    return parseBackendDateTimeToMs(dateCandidate, timeCandidate);
  };

  const getSignificanceLabel = (item) => {
    const raw = String(item?.significance || item?.priority || '').trim();
    if (!raw) return 'Normal';
    return raw;
  };

  const ensureUniqueNotificationKeys = (items = []) => {
    const seen = new Map();
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const baseKey = [
        item?.id,
        item?.code,
        item?.type,
        item?.docEntry,
        item?.detailDocEntry,
        item?.timestamp,
        item?.title,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join('|') || `notification-${index}`;

      const occurrence = seen.get(baseKey) || 0;
      seen.set(baseKey, occurrence + 1);

      return {
        ...item,
        _listKey: occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`,
      };
    });
  };

  const inferComplaintTypeFromNotification = (item) => {
    const explicit = String(item?.ComplaintType || item?.complaintType || '').trim();
    if (explicit) return explicit;

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'Breakdown';
    if (typeCode === 'JB') return 'Breakdown';
    if (typeCode === 'JCT') return 'Breakdown';
    if (typeCode === 'JCA') return 'Breakdown';
    if (typeCode === 'D') return 'Driver Complaint';

    const text = `${item?.title || ''} ${item?.message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'Breakdown';
    return 'Driver Complaint';
  };


  async function fetchNotifications() {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const identityCandidates = resolveUserIdCandidates();
      const primaryIdentity = identityCandidates[0] || '';

      const notificationsResponse = await dashboardService.getNotifications(companyDb, primaryIdentity || user?.User || user?.user || user?.username || user?.Code || user?.code || '');
      const notificationData = Array.isArray(notificationsResponse?.Data)
        ? notificationsResponse.Data
        : (Array.isArray(notificationsResponse?.data) ? notificationsResponse.data : []);

      let mappedNotifications = notificationData.map(mapNotificationItem);

      mappedNotifications.sort((a, b) => getNotificationSortMs(b) - getNotificationSortMs(a));
      mappedNotifications = ensureUniqueNotificationKeys(mappedNotifications);

      dispatch(setNotifications(mappedNotifications));
      const unreadFromList = mappedNotifications.filter(item => !item.read).length;
      dispatch(setUnreadCount(unreadFromList));
      setHasBackendCountMismatch(false);
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
  }

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
    const notificationText = String(item?.Message || item?.message || item?.Title || item?.title || '').toLowerCase();
    const isJobCardTransferNotification = notificationText.includes('transfer')
      || notificationText.includes('transferred')
      || ['TRANSFER', 'JOB_CARD_TRANSFER', 'JOBCARDTRANSFER', 'JT', 'JCT'].includes(type)
      || Boolean(item?.TransferJobCard || item?.TransferStatus || item?.ToSupervisorCode || item?.TrnSupCode);
    const requiresSupervisorVerification = notificationText.includes('work entry') && (
      notificationText.includes('supervisor inspection')
      || notificationText.includes('inspection is required')
    );
    const isBreakdownNotification = () => {
      const scanValues = (value, results = []) => {
        if (!value || typeof value === 'function') return results;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          results.push(String(value));
          return results;
        }
        if (Array.isArray(value)) {
          value.forEach((entry) => scanValues(entry, results));
          return results;
        }
        if (typeof value === 'object') {
          Object.keys(value).forEach((key) => {
            const lowerKey = String(key || '').toLowerCase();
            if (['formtype', 'complainttype', 'jobtype', 'jobcardtype', 'type', 'title', 'message', 'description', 'reason', 'fault', 'faultname'].includes(lowerKey)) {
              results.push(String(value[key] ?? ''));
            }
            scanValues(value[key], results);
          });
        }
        return results;
      };

      const allValues = scanValues(item).filter(Boolean);
      const combined = allValues.join(' ').toUpperCase();
      const normalized = String(combined || '').trim();
      return (
        normalized.includes('BREAKDOWN')
        || normalized.includes('LINE BREAKDOWN')
        || normalized.includes('BREAKDOWN ALERT')
        || normalized.includes('BREAKDOWN ASSIGNED')
        || normalized === 'B'
        || normalized === 'JB'
        || type === 'JCT'
        || type === 'JCA'
        || String(item?.FormType || item?.formType || item?.ComplaintType || item?.complaintType || item?.JobType || item?.jobType || '').trim().toUpperCase() === 'B'
        || ['B', 'JB', 'JCT', 'JCA'].includes(String(item?.Type || item?.type || '').trim().toUpperCase())
      );
    };

    const shouldOpenBreakdownWorkEntryForMechanic =
      (isMechanicUser(user) || isFieldStaffUser(user)) && (
        isBreakdownNotification()
        || type === 'J'
        || type === 'B'
        || type === 'JB'
        || type === 'JCT'
        || type === 'JCA'
        || Boolean(item?.JobCardDocEntry || item?.jobCardDocEntry || item?.ComplaintNo || item?.complaintNo || item?.BreakdownNo || item?.BreakdownDocEntry || item?.BreakdownId)
      );

    if (supervisorUser && isJobCardTransferNotification) {
      navigation.navigate('JobCardDetail', {
        jobCardNo: item?.JobCardNo || item?.jobCardNo || '',
        docEntry: item?.JobCardDocEntry || item?.jobCardDocEntry || item?.DocEntry || item?.docEntry || docEntry || '',
        complaintNo: item?.ComplaintNo || item?.complaintNo || '',
        complaintType: item?.ComplaintType || item?.complaintType || 'Breakdown',
        dbName: dbName || 'MUTSPL_TEST',
        focusTransfer: true,
      });
      return;
    }

    if (supervisorUser && requiresSupervisorVerification) {
      navigation.navigate('ReviewWorkEntries', {
        focusWorkEntryDocEntry: item?.WorkEntryDocEntry || docEntry,
        focusJobCardDocEntry: item?.JobCardDocEntry || item?.jobCardDocEntry || item?.JobCardNo || '',
      });
      return;
    }

    if ((isMechanicUser(user) || isFieldStaffUser(user)) && type === 'JCA') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if (shouldOpenBreakdownWorkEntryForMechanic) {
      const breakdownComplaintNo = String(
        item?.ComplaintNo
        || item?.complaintNo
        || item?.BreakdownNo
        || item?.BreakdownDocEntry
        || item?.BreakdownId
        || item?.IncidentNo
        || item?.incidentNo
        || docEntry
        || resolveIncidentDocEntryFromNotification(item)
        || ''
      ).trim();

      navigation.navigate('FaultWork', {
        docEntry: Number(item?.JobCardDocEntry || item?.jobCardDocEntry || item?.DocEntry || item?.docEntry || docEntry || 0) || 0,
        dbName: dbName || 'MUTSPL_TEST',
        jobCardNo: item?.JobCardNo || item?.jobCardNo || item?.DocEntry || item?.docEntry || docEntry || '',
        complaintType: item?.ComplaintType || item?.complaintType || 'Breakdown',
        complaintNo: breakdownComplaintNo || String(docEntry || ''),
        fault: item,
        faultLine: Number(item?.FaultLine || item?.faultLine || 1) || 1,
        depot: item?.Depot || item?.depot || item?.BranchNm || item?.Branch || '',
      });
      return;
    }

    // Route team tasks straight to the same focused Team Approvals item.
    if ((type === 'T' || (isTeamLeaderUser(user) && type === 'J')) && docEntry) {
      navigation.navigate('TeamApprovals', { focusDocEntry: docEntry });
      return;
    }

    if (type === 'D' || type === 'B') {
      const incidentDocEntry = resolveIncidentDocEntryFromNotification(item);
      if (incidentDocEntry) {
        const navigatedToIncident = await navigateToIncidentDetail(item, incidentDocEntry);
        if (navigatedToIncident) {
          return;
        }
      }

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

    if (item?.workflowDerived && type === 'P') {
      navigation.navigate('PartsApproval');
      return;
    }

    if (item?.workflowDerived && type === 'V') {
      const workEntryTarget = String(item?.workEntryDocEntry || item?.DocEntry || item?.docEntry || item?.detailDocEntry || '').trim();
      const jobCardTarget = item?.jobCardDocEntry || item?.jobCardNo || docEntry;
      navigation.navigate('ReviewWorkEntries', {
        focusJobCardDocEntry: jobCardTarget,
        focusWorkEntryDocEntry: workEntryTarget,
      });
      return;
    }

    if (type === 'V') {
      const workEntryTarget = String(item?.workEntryDocEntry || item?.DocEntry || item?.docEntry || item?.detailDocEntry || '').trim();
      const jobCardTarget = item?.jobCardDocEntry || item?.jobCardNo || docEntry;
      navigation.navigate('ReviewWorkEntries', {
        focusJobCardDocEntry: jobCardTarget,
        focusWorkEntryDocEntry: workEntryTarget,
      });
      return;
    }

    if (type === 'J' || type === 'JB' || type === 'JCT' || type === 'JCA') {
      navigation.navigate('JobCardDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: ['JCT', 'JCA'].includes(type) ? 'Breakdown' : undefined,
      });
      return;
    }

    if (type === 'W') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if (docEntry) {
      navigation.navigate('JobCardDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
      });
    }
  };

  const getNotificationIcon = (type, item = {}) => {
    const rawType = String(type || '').trim().toUpperCase();
    const notificationText = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toUpperCase();
    if (['W', 'WE', 'WORK', 'WORKENTRY', 'WORK ENTRY'].includes(rawType) || notificationText.includes('WORK ENTRY')) {
      return 'build';
    }
    switch (type) {
      case 'D':
        return 'report-problem';
      case 'B':
      case 'JCT':
      case 'JCA':
        return 'warning';
      case 'J':
        return 'assignment';
      case 'T':
        return 'fact-check';
      case 'P':
        return 'inventory';
      case 'V':
        return 'check-circle';
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
      case 'T':
        return '#0EA5E9'; // Team approval blue
      case 'W':
        return '#00689E'; // SAP Teal
      case 'P':
        return '#EA580C'; // Parts request orange
      case 'V':
        return '#6D28D9'; // Verification purple
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
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <View style={[styles.inlineIcon, { backgroundColor: getNotificationColor(item.type || item.Type) + '20' }]}>
              <MaterialIcons name={getNotificationIcon(item.type || item.Type, item)} size={14} color={getNotificationColor(item.type || item.Type)} />
            </View>
            <Text style={[styles.title, { color: colors.dark, fontWeight: item.read ? 'normal' : 'bold' }]} numberOfLines={1}>
              {item.title || 'Notification'}
            </Text>
          </View>
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
        keyExtractor={(item, index) => item._listKey || item.id?.toString() || item.code?.toString() || index.toString()}
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
    marginBottom: SPACING.sm,
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  inlineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  title: {
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 3,
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
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 6,
  },
  quickActionBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6D28D915',
  },
  quickActionText: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
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
