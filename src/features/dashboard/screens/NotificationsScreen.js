import React, { useState, useCallback, useEffect } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '../../../shared/components/AppIcon.js';
import Toast from 'react-native-toast-message';
import { getLogs, clearLogs } from '../../../utils/logger';

import { setNotifications, setUnreadCount, markAsRead, markAllAsRead } from '../../../store/slices/notificationSlice';
import { dashboardService, complaintService, workEntryService, jobCardService, mechanicService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';
import { isTeamLeaderUser, isMechanicUser, isFieldStaffUser, isSupervisorUser, isStoreUser } from '../../../utils/roleAccess';
import { normalizeNotificationItem, ensureUniqueNotificationKeys } from '../../../utils/notificationUtils';

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
  const [towNotificationModal, setTowNotificationModal] = useState(null);
  const [towImageDrafts, setTowImageDrafts] = useState([]);
  const [towSubmitting, setTowSubmitting] = useState(false);

  const openLogs = () => {
    setLogEntries(getLogs());
    setShowLogs(true);
  };

  useEffect(() => {
    if (!showLogs) return undefined;
    const refreshLogs = setInterval(() => setLogEntries(getLogs()), 1000);
    return () => clearInterval(refreshLogs);
  }, [showLogs]);

  const copyLogs = () => {
    Clipboard.setString(logEntries.join('\n'));
    Toast.show({ type: 'success', text1: 'Logs copied to clipboard' });
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [dbName, user?.User, user?.user, user?.username, user?.Code, user?.code])
  );

  const resolveUserIdCandidates = () => {
    const candidates = [
      user?.User,
      user?.username,
      user?.user,
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
    if (typeCode === 'JCA') return 'D';
    if (typeCode === 'M') return 'M';
    if (typeCode === 'D') return 'D';
    if (typeCode === 'R' || typeCode === 'RI' || typeCode === 'A' || typeCode === 'ASSEMBLY') return 'A';

    const text = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'B';
    if (text.includes('preventive')) return 'M';
    if (text.includes('repair') || text.includes('assembly')) return 'A';
    return 'D';
  };

  const resolveIncidentDocEntryFromNotification = (item) => {
    const typeCode = String(item?.Type || item?.type || '').trim().toUpperCase();
    const complaintSpecificCandidates = [
      item?.Incident,
      item?.incident,
      item?.IncidentNo,
      item?.incidentNo,
      item?.ComplaintNo,
      item?.complaintNo,
      item?.IncidentDocEntry,
      item?.incidentDocEntry,
    ];

    const genericCandidates = [
      item?.ReferenceDocEntry,
      item?.RefDocEntry,
      item?.detailDocEntry,
      item?.docEntry,
      item?.DocEntry,
    ];

    const candidateList = typeCode === 'D'
      ? complaintSpecificCandidates.concat(genericCandidates.filter((value) => !['DocEntry', 'docEntry'].includes(String(value || '').trim()) && !String(value || '').includes('job'))) // defensive: keep complaint fields first
      : complaintSpecificCandidates.concat(genericCandidates);

    const direct = candidateList
      .map((value) => String(value || '').trim())
      .find((value) => value && !/^job[-_ ]?card/i.test(value) && !/^jc\d+/i.test(value) && !/^jc$/i.test(value));
    if (direct) return direct;

    const text = `${item?.title || ''} ${item?.message || ''}`;
    const match = text.match(/incident\s*#\s*(\d+)/i);
    return match?.[1] || null;
  };

  const resolveJobCardReferenceFromNotification = (item) => {
    const explicitReference = [
      item?.JobCard,
      item?.jobCard,
      item?.JobCardDocEntry,
      item?.jobCardDocEntry,
      item?.JobCardEntry,
      item?.jobCardEntry,
      item?.JobCardNo,
      item?.jobCardNo,
      item?.JobcardNo,
    ].map(value => String(value || '').trim()).find(Boolean);
    if (explicitReference) return explicitReference;

    const text = `${item?.Message || item?.message || ''} ${item?.Title || item?.title || ''}`;
    const match = text.match(/job\s*card\s*(?:no\.?|number|#|:|-)?\s*([A-Za-z0-9-]+)/i);
    if (match?.[1]) return match[1];

    return '';
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

  const mapNotificationItem = (item, index = 0) => normalizeNotificationItem(item, index);

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


  const inferComplaintTypeFromNotification = (item) => {
    const explicit = String(item?.ComplaintType || item?.complaintType || '').trim();
    if (explicit) return explicit;

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'Breakdown';
    if (typeCode === 'JB') return 'Breakdown';
    if (typeCode === 'JCT') return 'Breakdown';
    if (typeCode === 'JCA') return 'Driver Complaint';
    if (typeCode === 'R' || typeCode === 'RI') return 'Repair Incident';
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

      let mappedNotifications = notificationData.map((item, index) => mapNotificationItem(item, index));

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

    const explicitType = String(item?.Type || item?.type || '').trim().toUpperCase();
    const resolvedComplaintType = explicitType === 'D'
      ? 'Driver Complaint'
      : (String(item?.ComplaintType || item?.complaintType || '').trim() || inferComplaintTypeFromNotification(item));

    let matchedIncident = null;
    try {
      const incidentsResponse = await complaintService.getIncidents(companyDb, null, null, user?.Depot || user?.depot || '');
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
      complaintType: explicitType === 'D'
        ? 'Driver Complaint'
        : matchedIncident?.ComplaintType || resolvedComplaintType,
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

    const rawNotificationType = String(item.Type || '').trim().toUpperCase();
    const type = String(item.type || item.Type || '').trim().toUpperCase();
    const docEntry = item.detailDocEntry || item.docEntry || item.DocEntry;
    const jobCardReference = resolveJobCardReferenceFromNotification(item);
    const notificationText = String(item?.Message || item?.message || item?.Title || item?.title || '').toLowerCase();
    const isRepairJobCardAssignment = ['JR', 'RJ', 'RJC', 'RJA', 'RJT'].includes(type)
      || (notificationText.includes('repair') && (notificationText.includes('job card') || notificationText.includes('assignment')));
    const isRepairAssemblyIssue = type === 'IRA';
    const isJobCardTransferNotification = notificationText.includes('transfer')
      || notificationText.includes('transferred')
      || ['TRANSFER', 'JOB_CARD_TRANSFER', 'JOBCARDTRANSFER', 'JT', 'JCT'].includes(type)
      || Boolean(item?.TransferJobCard || item?.TransferStatus || item?.ToSupervisorCode || item?.TrnSupCode);
    const requiresSupervisorVerification = ['WE', 'WER', 'LBWE', 'TOW'].includes(rawNotificationType) || ['WE', 'WER', 'LBWE', 'TOW'].includes(type) || (notificationText.includes('work entry') && (
      notificationText.includes('supervisor inspection')
      || notificationText.includes('inspection is required')
    ));
    const isWorkEntryRequest = rawNotificationType === 'WERQ' || type === 'WERQ';
    const isTowNotification = rawNotificationType === 'TOW' || type === 'TOW';

    if (supervisorUser && isWorkEntryRequest) {
      const isToolRequest = notificationText.includes('special tool') || notificationText.includes('tool request');
      navigation.navigate('PartsApproval', {
        initialSection: isToolRequest ? 'tools' : 'parts',
        focusJobCardDocEntry: jobCardReference,
        focusWorkEntryDocEntry: item?.workEntryDocEntry || item?.WorkEntryDocEntry || item?.WorkEntryNo || item?.ReferenceDocEntry || '',
      });
      return;
    }
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
        || String(item?.FormType || item?.formType || item?.ComplaintType || item?.complaintType || item?.JobType || item?.jobType || '').trim().toUpperCase() === 'B'
        || ['B', 'JB', 'JCT'].includes(String(item?.Type || item?.type || '').trim().toUpperCase())
      );
    };

    const shouldOpenBreakdownWorkEntryForMechanic =
      (isMechanicUser(user) || isFieldStaffUser(user)) && (
        isBreakdownNotification()
        || type === 'J'
        || type === 'B'
        || type === 'JB'
        || type === 'JCT'
        || Boolean(item?.JobCardDocEntry || item?.jobCardDocEntry || item?.ComplaintNo || item?.complaintNo || item?.BreakdownNo || item?.BreakdownDocEntry || item?.BreakdownId)
      );

    // JB/JCA/WER are mechanic work-queue notifications. Handle them before the
    // message-text repair-assignment heuristic below, which may contain the
    // words "repair" and "job card" but is not an Assembly assignment.
    if ((isMechanicUser(user) || isFieldStaffUser(user)) && ['JB', 'JCA', 'WER'].includes(type)) {
      navigation.navigate('MechanicDashboard', { initialTab: 'TO_ACCEPT' });
      return;
    }

    if ((isMechanicUser(user) || isFieldStaffUser(user)) && isRepairJobCardAssignment) {
      const repairJobCardEntry = String(
        item?.JobCardEntry
        || item?.JobCardDocEntry
        || item?.JobCardNo
        || item?.DocEntry
        || docEntry
        || '',
      ).trim();
      if (repairJobCardEntry) {
        navigation.navigate('RepairJobCardAssignment', {
          jobCardEntry: repairJobCardEntry,
          dbName: dbName || 'MUTSPL_TEST',
        });
        return;
      }
    }

    if ((isMechanicUser(user) || isFieldStaffUser(user)) && isRepairAssemblyIssue) {
      navigation.navigate('RepairWork', {
        jobCardEntry: item?.JobCardEntry || item?.JobCardDocEntry || item?.DocEntry || docEntry || '',
        dbName: dbName || 'MUTSPL_TEST',
        assemblyCode: item?.AssemblyCode || item?.assemblyCode || item?.Assembly || item?.AssemblyNo || item?.RepairAssemblyCode || item?.RepairAssembly || '',
        assemblyName: item?.AssemblyName || item?.assemblyName || item?.AssemblyDescription || item?.Assembly || 'Assembly',
      });
      return;
    }

    if (isStoreUser(user) && isRepairAssemblyIssue) {
      navigation.navigate('RepairAssemblyIssue', {
        jobCardEntry: item?.JobCardEntry || item?.JobCardDocEntry || item?.DocEntry || docEntry || '',
        dbName: dbName || 'MUTSPL_TEST',
      });
      return;
    }

    if (supervisorUser && (type === 'R' || type === 'RI' || type === 'REPAIR_INCIDENT')) {
      const repairDocEntry = String(
        item?.DocEntry
        || item?.ReferenceDocEntry
        || item?.detailDocEntry
        || docEntry
        || '',
      ).trim();
      if (repairDocEntry) {
        navigation.navigate('RepairIncidentReview', {
          docEntry: repairDocEntry,
          jobCardEntry: item?.JobCardEntry || item?.jobCardEntry || item?.JobCardDocEntry || item?.jobCardDocEntry || item?.RepairJobCardEntry || item?.repairJobCardEntry || '',
          dbName: dbName || 'MUTSPL_TEST',
        });
        return;
      }
    }

    if (supervisorUser && isJobCardTransferNotification) {
      navigation.navigate('JobCardDetail', {
        jobCardNo: jobCardReference,
        docEntry: jobCardReference,
        complaintNo: item?.ComplaintNo || item?.complaintNo || '',
        complaintType: item?.ComplaintType || item?.complaintType || 'Breakdown',
        dbName: dbName || 'MUTSPL_TEST',
        focusTransfer: true,
      });
      return;
    }

    if (supervisorUser && type === 'JCR') {
      const jobCardEntry = String(item?.JobCardDocEntry || item?.jobCardDocEntry || item?.JobCardNo || item?.jobCardNo || docEntry || '').trim();
      navigation.navigate('ReviewWorkEntries', {
        teamRejection: {
          jobCardEntry,
          depot: item?.Depot || item?.depot || item?.Branch || item?.BranchCode || user?.Depot || user?.depot || '',
          excludedTeamCode: item?.TeamCode || item?.teamCode || item?.Team || '',
          reason: item?.Remarks || item?.RejectReason || item?.Message || '',
          notificationKey: `${notificationCode || jobCardEntry}-${Date.now()}`,
        },
      });
      return;
    }

    if (supervisorUser && isTowNotification) {
      const towWorkEntryDocEntry = String(
        item?.WorkEntryDocEntry
        || item?.workEntryDocEntry
        || item?.WorkEntryNo
        || item?.workEntryNo
        || item?.ReferenceDocEntry
        || item?.RefDocEntry
        || item?.detailDocEntry
        || item?.docEntry
        || docEntry
        || ''
      ).trim();
      const towJobCardDocEntry = String(
        item?.JobCardDocEntry
        || item?.jobCardDocEntry
        || item?.JobCardEntry
        || item?.jobCardEntry
        || item?.JobCardNo
        || item?.jobCardNo
        || jobCardReference
        || item?.DocEntry
        || item?.docEntry
        || ''
      ).trim();
      setTowImageDrafts([]);
      setTowNotificationModal({
        item,
        workEntryDocEntry: towWorkEntryDocEntry,
        jobCardDocEntry: towJobCardDocEntry,
      });
      return;
    }

    if (supervisorUser && requiresSupervisorVerification) {
      navigation.navigate('ReviewWorkEntries', {
        focusWorkEntryDocEntry: item?.WorkEntryDocEntry || docEntry,
        focusJobCardDocEntry: item?.JobCardDocEntry || item?.jobCardDocEntry || item?.JobCardNo || '',
        repair: rawNotificationType === 'WER' || type === 'WER',
        createDriverComplaintAfterApproval: rawNotificationType === 'LBWE' || type === 'LBWE',
      });
      return;
    }

    if (type === 'D') {
      const complaintSpecificValue = [
        item?.Incident,
        item?.incident,
        item?.IncidentNo,
        item?.incidentNo,
        item?.ComplaintNo,
        item?.complaintNo,
        item?.IncidentDocEntry,
        item?.incidentDocEntry,
      ]
        .map((value) => String(value || '').trim())
        .find((value) => Boolean(value));

      const incidentDocEntry = complaintSpecificValue || resolveIncidentDocEntryFromNotification(item) || '';

      if (incidentDocEntry) {
        const navigatedToIncident = await navigateToIncidentDetail(item, incidentDocEntry);
        if (navigatedToIncident) {
          return;
        }
      }

      navigation.navigate('ComplaintDetail', {
        complaintNo: incidentDocEntry,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: 'Driver Complaint',
        source: 'incident',
      });
      return;
    }

    if (shouldOpenBreakdownWorkEntryForMechanic) {
      const breakdownJobCardDocEntry = Number(item?.JobCardDocEntry || item?.jobCardDocEntry || item?.DocEntry || item?.docEntry || docEntry || 0) || 0;
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

      navigation.navigate(type === 'JB' ? 'WorkEntry' : 'FaultWork', {
        ...(type === 'JB' ? { workOrderDocEntry: breakdownJobCardDocEntry, jobCardDocEntry: breakdownJobCardDocEntry } : { docEntry: breakdownJobCardDocEntry }),
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

    if (supervisorUser && item?.workflowDerived && type === 'P') {
      navigation.navigate('PartsApproval');
      return;
    }

    if (supervisorUser && item?.workflowDerived && type === 'V') {
      const workEntryTarget = String(item?.workEntryDocEntry || item?.DocEntry || item?.docEntry || item?.detailDocEntry || '').trim();
      const jobCardTarget = item?.jobCardDocEntry || item?.jobCardNo || docEntry;
      navigation.navigate('ReviewWorkEntries', {
        focusJobCardDocEntry: jobCardTarget,
        focusWorkEntryDocEntry: workEntryTarget,
      });
      return;
    }

    if (supervisorUser && type === 'V') {
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
        docEntry: jobCardReference,
        jobCardNo: jobCardReference,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: type === 'JCT' ? 'Breakdown' : type === 'JCA' ? 'Driver Complaint' : undefined,
      });
      return;
    }

    if (type === 'W') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if (docEntry) {
      navigation.navigate('JobCardDetail', {
        docEntry: jobCardReference,
        jobCardNo: jobCardReference,
        dbName: dbName || 'MUTSPL_TEST',
      });
    }
  };

  const getNotificationIcon = (type, item = {}) => {
    const rawType = String(type || '').trim().toUpperCase();
    const notificationText = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toUpperCase();
    if (['W', 'WE', 'WERQ', 'LBWE', 'WORK', 'WORKENTRY', 'WORK ENTRY'].includes(rawType) || notificationText.includes('WORK ENTRY')) {
      return 'build';
    }
    switch (type) {
      case 'D':
        return 'report-problem';
      case 'B':
      case 'JCT':
        return 'warning';
      case 'JCA':
        return 'report-problem';
      case 'J':
        return 'assignment';
      case 'T':
        return 'fact-check';
      case 'P':
        return 'inventory';
      case 'R':
      case 'RI':
        return 'build';
      case 'RI':
        return 'build';
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
      case 'R':
      case 'RI':
        return '#9333EA'; // Repair incident
      case 'RI':
        return '#9333EA'; // Repair incident
      case 'V':
        return '#6D28D9'; // Verification purple
      case 'WERQ':
        return '#EA580C'; // Work-entry request approval
      default:
        return '#0070F2'; // SAP Blue
    }
  };

  const applyPickedTowImage = (result) => {
    const asset = (result?.assets || [])[0];
    if (!asset?.uri) return;

    const newImage = {
      id: `${Date.now()}-${asset.uri}`,
      uri: asset.uri,
      name: asset.fileName || `tow-${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
    };
    setTowImageDrafts([newImage]);
  };

  const pickTowImageFromCamera = async () => {
    try {
      let ImagePicker;
      try {
        ImagePicker = require('expo-image-picker');
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Image picker unavailable' });
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Camera access is required to capture the tow image.' });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });
      if (result?.canceled) return;

      applyPickedTowImage(result);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Camera capture failed', text2: error?.message || 'Unable to capture the image.' });
    }
  };

  const pickTowImageFromLibrary = async () => {
    try {
      let ImagePicker;
      try {
        ImagePicker = require('expo-image-picker');
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Image picker unavailable' });
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Media access is required to upload the tow image.' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.7,
      });
      if (result?.canceled) return;

      applyPickedTowImage(result);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Image selection failed', text2: error?.message || 'Unable to pick the image.' });
    }
  };

  const handleCompleteTowFromNotification = async () => {
    const modalData = towNotificationModal || {};
    const workEntryDocEntry = String(modalData.workEntryDocEntry || '').trim();
    const jobCardDocEntry = String(modalData.jobCardDocEntry || '').trim();
    if (!workEntryDocEntry || !jobCardDocEntry || towImageDrafts.length === 0) {
      Toast.show({ type: 'error', text1: 'Tow image required', text2: 'Select and upload an image before completing the tow.' });
      return;
    }

    try {
      setTowSubmitting(true);
      const uploadResponse = await workEntryService.uploadImages(towImageDrafts);
      const fileNames = Array.isArray(uploadResponse?.FileNames)
        ? uploadResponse.FileNames
        : String(uploadResponse?.FileName || '').split(',').map(value => value.trim()).filter(Boolean);
      if (fileNames.length === 0) throw new Error('No uploaded image filename returned.');

      const imageSaveResponse = await jobCardService.saveJobCardImage({
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(jobCardDocEntry) || jobCardDocEntry,
        ImgNo: 2,
        ImgPath: fileNames[0],
        Remarks: 'Bus received at depot.',
      });

      if (imageSaveResponse?.Success === false || imageSaveResponse?.Status === false) {
        throw new Error(imageSaveResponse?.Message || 'Failed to save tow image.');
      }

      const towResponse = await mechanicService.completeTow({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: user?.User || user?.user || user?.username || user?.Code || user?.code || '',
        Remarks: 'Tow completed by supervisor after image capture.',
      });

      if (towResponse?.Success === false || towResponse?.Status === false) {
        throw new Error(towResponse?.Message || 'Unable to complete tow.');
      }

      Toast.show({ type: 'success', text1: 'Tow completed', text2: 'Supervisor tow workflow is now complete.' });
      setTowNotificationModal(null);
      setTowImageDrafts([]);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Tow completion failed', text2: error?.message || 'Unable to complete tow.' });
    } finally {
      setTowSubmitting(false);
    }
  };

  const getPriorityBadge = (priorityValue) => {
    const normalized = String(priorityValue || '').trim().toUpperCase();
    if (normalized === 'H' || normalized === 'HIGH') return { label: 'High', color: '#B91C1C' };
    if (normalized === 'M' || normalized === 'MEDIUM') return { label: 'Medium', color: '#B45309' };
    if (normalized === 'L' || normalized === 'LOW') return { label: 'Low', color: '#047857' };
    return null;
  };

  const getNotificationTypeBadge = (typeValue) => {
    const normalized = String(typeValue || '').trim().toUpperCase();
    const labels = {
      D: 'Driver Complaint',
      B: 'Breakdown',
      BTA: 'Breakdown Team Assign',
      BTR: 'Breakdown Team Reject',
      TOW: 'TOW',
      J: 'Job Card',
      JCA: 'Complaint Assignment',
      JCT: 'Breakdown Transfer',
      JB: 'Job Breakdown',
      T: 'Team',
      P: 'Parts',
      W: 'Work Entry',
      WE: 'Work Entry',
      WER: 'Work Entry Review',
      WERQ: 'Work Entry Request',
      LBWE: 'Line Breakdown Work Entry',
      R: 'Repair',
      RI: 'Repair Incident',
      V: 'Verification',
    };

    const shortCode = normalized || 'N';
    const label = labels[normalized] || normalized || 'Notification';
    return { shortCode, label, color: getNotificationColor(normalized) };
  };

  const formatNotificationDate = (dateValue, timeValue) => {
    const dateText = String(dateValue || '').trim();
    const timeText = String(timeValue || '').trim();
    if (!dateText && !timeText) return '';

    const normalizeSlashDate = (value) => {
      const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
      if (!slashMatch) return null;

      const [, monthPart, dayPart, yearPart, hourPart = '0', minutePart = '0', secondPart = '0', ampm = ''] = slashMatch;
      const month = Number(monthPart);
      const day = Number(dayPart);
      const year = Number(yearPart);
      let hours = Number(hourPart);
      if (ampm && ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (ampm && ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

      return { year, month, day, hours, minutes: Number(minutePart), seconds: Number(secondPart) };
    };

    const parseDateLike = (value) => {
      const slashValue = normalizeSlashDate(value);
      if (slashValue) return slashValue;

      const fullSource = value && !/\d{1,2}:\d{2}/.test(value) && timeText ? `${value} ${timeText}` : value;
      const date = new Date(fullSource);
      if (Number.isNaN(date.getTime())) return null;

      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: date.getSeconds(),
      };
    };

    const parsed = parseDateLike(dateText || timeText);
    if (!parsed) return dateText || timeText;

    const day = String(parsed.day).padStart(2, '0');
    const month = String(parsed.month).padStart(2, '0');
    const year = parsed.year;
    const hours24 = parsed.hours;
    const minutes = String(parsed.minutes).padStart(2, '0');
    const seconds = String(parsed.seconds).padStart(2, '0');
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 >= 12 ? 'pm' : 'am';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisDate = new Date(year, month - 1, day);

    if (thisDate.getTime() === today.getTime()) {
      return `Today ${String(hours12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    }
    if (thisDate.getTime() === yesterday.getTime()) {
      return `Yesterday ${String(hours12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    }

    return `${day}/${month}/${year} ${String(hours12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  };

  const renderNotificationItem = ({ item }) => {
    const rawText = item?.Message || item?.message || item?.Title || item?.title || 'Notification';
    const detailValues = [
      item?.Incident,
      item?.JobCard,
      item?.WorkEntry,
      item?.incident,
      item?.jobCard,
      item?.workEntry,
    ].map(value => String(value ?? '').trim()).filter(value => value !== '' && value !== '0');

    const referenceBadges = [
      detailValues.includes(String(item?.Incident ?? '').trim()) && item?.Incident !== '' && item?.Incident !== 0 ? { label: 'Incident', value: String(item.Incident) } : null,
      detailValues.includes(String(item?.JobCard ?? '').trim()) && item?.JobCard !== '' && item?.JobCard !== 0 ? { label: 'JobCard', value: String(item.JobCard) } : null,
      detailValues.includes(String(item?.WorkEntry ?? '').trim()) && item?.WorkEntry !== '' && item?.WorkEntry !== 0 ? { label: 'WorkEntry', value: String(item.WorkEntry) } : null,
    ].filter(Boolean);

    const typeValue = item?.Type || item?.type || '';
    const dateText = formatNotificationDate(item?.Date, item?.Time);
    const priorityBadge = getPriorityBadge(item?.Priority || item?.priority || item?.Severity || item?.severity || '');
    const typeBadge = getNotificationTypeBadge(typeValue);

    return (
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
              <Text style={[styles.title, { color: colors.dark, fontWeight: item.read ? 'normal' : 'bold' }]} numberOfLines={2}>
                {rawText}
              </Text>
            </View>

            {referenceBadges.length > 0 && (
              <View style={styles.referenceBadgeRow}>
                {referenceBadges.map((badge) => (
                  <View key={`${badge.label}-${badge.value}`} style={[styles.referenceBadge, { backgroundColor: colors.light, borderColor: colors.border }]}>
                    <Text style={[styles.referenceBadgeLabel, { color: colors.gray }]}>{badge.label}</Text>
                    <Text style={[styles.referenceBadgeValue, { color: colors.dark }]}>{badge.value}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.bottomRow}>
              <View style={styles.bottomLeft}>
                {!!typeValue && (
                  <View style={[styles.typeBadge, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }]}>
                    <Text style={[styles.typeBadgeShort, { color: colors.dark }]}>{typeBadge.shortCode}</Text>
                    <Text style={[styles.typeBadgeLabel, { color: colors.dark }]}>{typeBadge.label}</Text>
                  </View>
                )}
              </View>

              <View style={styles.bottomRight}>
                {!!priorityBadge && (
                  <View style={[styles.priorityBadge, { backgroundColor: priorityBadge.color }]}>
                    <Text style={styles.priorityBadgeText}>{priorityBadge.label}</Text>
                  </View>
                )}
                {!!dateText && (
                  <View style={[styles.dateBadge, { backgroundColor: colors.light }]}>
                    <Text style={[styles.dateBadgeText, { color: colors.dark }]}>{dateText}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {!item.read && (
            <View style={[styles.unreadIndicator, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

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

      <Modal visible={Boolean(towNotificationModal)} transparent animationType="slide" onRequestClose={() => {
        setTowNotificationModal(null);
        setTowImageDrafts([]);
      }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.towModal, { backgroundColor: colors.white }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.dark }]}>Tow Completion</Text>
              <TouchableOpacity onPress={() => {
                setTowNotificationModal(null);
                setTowImageDrafts([]);
              }}>
                <MaterialIcons name="close" size={22} color={colors.dark} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalText, { color: colors.gray }]}>Capture or upload the tow image, then complete the tow for this work entry.</Text>

            {towImageDrafts.length > 0 ? (
              <View style={[styles.imagePreviewBox, { borderColor: colors.border }]}>
                {towImageDrafts.map((image) => (
                  <View key={image.id} style={styles.previewRow}>
                    <Text numberOfLines={1} style={{ color: colors.dark, flex: 1 }}>{image.name}</Text>
                    <TouchableOpacity onPress={() => setTowImageDrafts([])}>
                      <MaterialIcons name="close" size={18} color="#BB0000" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.towModalActions}>
              <View style={styles.towActionRow}>
                <TouchableOpacity onPress={pickTowImageFromCamera} style={[styles.towActionButton, { backgroundColor: '#0F5A88' }]}>
                  <MaterialIcons name="camera-alt" size={16} color="#fff" />
                  <Text style={styles.towActionText}>Capture</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickTowImageFromLibrary} style={[styles.towActionButton, { backgroundColor: '#00689E' }]}>
                  <MaterialIcons name="photo-library" size={16} color="#fff" />
                  <Text style={styles.towActionText}>Upload</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleCompleteTowFromNotification}
                disabled={towSubmitting || towImageDrafts.length === 0}
                style={[
                  styles.towActionButton,
                  {
                    backgroundColor: towImageDrafts.length === 0 ? '#94A3B8' : '#C2410C',
                    minHeight: 52,
                  },
                ]}
              >
                <MaterialIcons name="local-shipping" size={18} color="#FFFFFF" />
                <Text style={[styles.towActionText, { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }]}>{towSubmitting ? 'Completing...' : 'Complete Tow'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 14,
    lineHeight: 18,
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    flexShrink: 1,
  },
  referenceBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  referenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  referenceBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  referenceBadgeValue: {
    fontSize: 10,
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
    gap: 8,
  },
  bottomLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  bottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
  },
  typeBadgeShort: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  typeBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  dateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  towModal: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'flex-start',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  imagePreviewBox: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  towModalActions: {
    gap: 12,
    marginTop: SPACING.md,
    paddingBottom: 4,
  },
  towActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  towActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.md,
    gap: 8,
  },
  towActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
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
