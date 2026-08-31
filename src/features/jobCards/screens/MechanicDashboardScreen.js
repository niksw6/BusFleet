import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../shared/components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { dashboardService, mechanicService, repairService } from '../../../api/services';
import { getUserRole } from '../../../utils/roleAccess';

/**
 * MechanicDashboardScreen — Mechanic / Electrician's "My Work" queue.
 *
 * Loads the mechanic queue from the deployed mechanic dashboard endpoint.
 *
 * Flow: once a Team Leader accepts a Job Card, its faults become visible here
 * for the team's Mechanics/Electricians to accept, then
 * Start Work / log Work Entries / request parts / Complete Work — all handled
 * on FaultWorkScreen.
 */

const BUCKET = {
  TO_ACCEPT: 'TO_ACCEPT',
  REPAIR: 'REPAIR',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

const TABS = [
  { key: BUCKET.TO_ACCEPT, label: 'New', icon: 'new-releases' },
  { key: BUCKET.IN_PROGRESS, label: 'In Progress', icon: 'engineering' },
  { key: BUCKET.COMPLETED, label: 'Completed', icon: 'check-circle' },
  { key: BUCKET.REPAIR, label: 'Repair', icon: 'build-circle' },
];

const getEffectiveStatus = (item) => {
  const workEntries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
  const submittedEntry = workEntries.find((entry) => entry?.Status || entry?.WorkStatus);
  return String(
    submittedEntry?.Status
    || submittedEntry?.WorkStatus
    || item?.Status
    || item?.FaultStatus
    || item?.WorkStatus
    || ''
  ).trim().toUpperCase();
};

const deriveBucket = (item) => {
  const raw = getEffectiveStatus(item);
  if (['COMPLETED', 'COMPLETE', 'C', 'CM', 'SV', 'CL', 'SUPERVISOR VERIFIED', 'CLOSED'].includes(raw)) return BUCKET.COMPLETED;
  // WC is the backend's mechanic-complete state: work is finished but must
  // remain in progress until the Supervisor verifies/closes the job card.
  if (['ACCEPTED', 'A', 'IN PROGRESS', 'INPROGRESS', 'STARTED', 'I', 'IP', 'WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(raw)) return BUCKET.IN_PROGRESS;
  return BUCKET.TO_ACCEPT; // covers 'PENDING', '', 'P', 'NEW'
};

const isAwaitingVerification = (item) => ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(
  getEffectiveStatus(item)
);

const normalizeJobType = (item) => {
  const raw = String(item?.JobType ?? item?.FormType ?? item?.ComplaintType ?? item?.IncidentType ?? item?.Type ?? '').trim();
  if (!raw) {
    const hasBreakdownRef = Boolean(item?.BreakdownNo || item?.BreakdownId || item?.ComplaintNo || item?.CmplaintNo || item?.BreakdownDocEntry);
    return hasBreakdownRef ? 'Breakdown' : 'Driver Complaint';
  }

  const normalized = raw.toLowerCase();
  if (normalized.includes('breakdown') || normalized === 'b' || normalized === 'jca' || normalized === 'jct') return 'Breakdown';
  if (normalized.includes('driver') || normalized.includes('complaint') || normalized === 'd') return 'Driver Complaint';
  return raw;
};

const getMechanicStatusLabel = (item, bucket, awaitingVerification) => {
  const raw = getEffectiveStatus(item);

  if (bucket === BUCKET.COMPLETED) {
    if (raw === 'SV' || raw === 'SUPERVISOR VERIFIED') return 'Supervisor Verified';
    if (raw === 'CL' || raw === 'CLOSED') return 'Closed';
    return 'Completed';
  }

  if (awaitingVerification) return 'Awaiting Verification';
  if (raw === 'PR' || raw === 'PARTS RECEIVED') return 'Parts Received';
  if (raw === 'PI' || raw === 'PARTS ISSUED') return 'Parts Issued';
  if (raw === 'PP' || raw === 'PART APPROVAL PENDING') return 'Part Approval Pending';
  if (raw === 'IP' || raw === 'IN PROGRESS' || raw === 'INPROGRESS') return 'In Progress';
  if (raw === 'A' || raw === 'ACCEPTED') return 'Accepted';
  return bucket === BUCKET.IN_PROGRESS ? 'In Progress' : 'New';
};

const extractItems = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const candidateKeys = ['Faults', 'Jobs', 'List', 'Items', 'Data'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const getDocEntry = (item) => item?.JobCardEntry
  ?? item?.JobCardDocEntry
  ?? item?.JobCardNo
  ?? item?.DocEntry
  ?? item?.ReferenceDocEntry
  ?? '';
const getNotificationType = (item) => String(
  item?.Type
  ?? item?.type
  ?? item?.NotificationType
  ?? item?.notificationType
  ?? '',
).trim().toUpperCase();
const getFaultLine = (item) => item?.FaultLine ?? item?.Line ?? item?.LineNum ?? 0;
const getBreakdownComplaintNo = (item) => String(
  item?.ComplaintNo
  ?? item?.CmplaintNo
  ?? item?.BreakdownNo
  ?? item?.BreakdownDocEntry
  ?? item?.BreakdownId
  ?? item?.DocEntry
  ?? item?.JobCardDocEntry
  ?? ''
).trim();
const getBreakdownJobCardDocEntry = (item) => Number(
  item?.JobCardDocEntry
  ?? item?.DocEntry
  ?? item?.JobCardNo
  ?? 0
) || 0;
const itemKey = (item) => `${getDocEntry(item)}-${getFaultLine(item)}`;
const isBreakdownAssignment = (item) => {
  const jobType = normalizeJobType(item);
  if (jobType === 'Breakdown') return true;

  const complaintTypes = [item?.ComplaintType, item?.IncidentType, item?.FormType, item?.Type, item?.JobType]
    .map(value => String(value || '').trim().toUpperCase());
  const description = String(item?.Description ?? item?.Fault ?? item?.FaultName ?? '').trim().toLowerCase();
  return complaintTypes.some(type => type.includes('BREAKDOWN') || ['B', 'JCA', 'JCT'].includes(type))
    || description.includes('breakdown')
    || Boolean(item?.BreakdownDocEntry || item?.BreakdownNo || item?.BreakdownId || item?.ComplaintNo || item?.CmplaintNo);
};
const isRepairAssignment = (item) => ['JR', 'RJ', 'RJC', 'RJA', 'RJT'].includes(
  getNotificationType(item),
);
const isRepairAccepted = (item) => [
  item?.AssignmentStatus,
  item?.MechanicStatus,
  item?.RepairStatus,
  item?.Status,
  ...(Array.isArray(item?.WorkEntries) ? item.WorkEntries.flatMap(entry => [entry?.Status, entry?.WorkStatus, entry?.AssignmentStatus]) : []),
].some(value => ['A', 'I', 'W', 'C', 'CM', 'ACCEPTED', 'IN PROGRESS', 'WORKING', 'COMPLETED', 'COMPLETE'].includes(
  String(value || '').trim().toUpperCase(),
));
const hasRepairWorkEntry = (item) => Boolean(
  item?.HasRepairWorkEntry
  || (Array.isArray(item?.WorkEntries) && item.WorkEntries.some(entry => (
    entry?.DocEntry || entry?.WorkEntryDocEntry || entry?.WorkEntryEntry
  ))),
);
const getActiveWorkEntry = (item) => {
  const entries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
  return entries.find(entry => !['C', 'CM', 'SV', 'CL', 'COMPLETED', 'COMPLETE', 'SUPERVISOR VERIFIED', 'CLOSED'].includes(String(entry?.Status || entry?.WorkStatus || '').trim().toUpperCase()))
    || entries[0]
    || null;
};
const hasStartedWork = (item) => {
  const status = String(item?.Status ?? item?.FaultStatus ?? item?.WorkStatus ?? '').trim().toUpperCase();
  return ['STARTED', 'IN PROGRESS', 'INPROGRESS', 'IP'].includes(status)
    || Boolean(String(item?.StartDate || '').trim())
    || Boolean(String(item?.StartTime || '').trim());
};
const getBusLabel = (item) => (
  String(
    item?.BusNo
    || item?.Vehicle
    || item?.BusCode
    || item?.BusRegistrationNo
    || item?.RegNo
    || ''
  ).trim() || 'Bus -'
);
const getCardDateTime = (item) => {
  const date = item?.NotificationDate
    || item?.notificationDate
    || item?.Date
    || item?.date
    || item?.CreatedDate
    || item?.RegDate
    || '';
  const time = item?.NotificationTime
    || item?.notificationTime
    || item?.Time
    || item?.time
    || item?.CreatedTime
    || item?.RegTime
    || '';
  const timestamp = item?.timestamp || item?.Timestamp || item?.DateTime || item?.CreatedAt || '';
  const notificationDateTime = item?.NotificationDateTime
    || item?.notificationDateTime
    || item?.CreatedOn
    || item?.CreatedAt
    || item?.NotificationOn
    || '';
  if (date && time) return `${date} ${time}`;
  return String(date || timestamp || notificationDateTime || time || '').trim();
};
const getRepairAssemblyCode = (item) => String(
  item?.AssemblyCode
  || item?.assemblyCode
  || item?.Assembly
  || item?.AssemblyNo
  || item?.AssemblyCodeName
  || item?.RepairAssemblyCode
  || item?.RepairAssembly
  || item?.assembly?.Code
  || item?.AssemblyDetails?.AssemblyCode
  || item?.Repair?.AssemblyCode
  || ''
).trim();
const getRepairAssemblyName = (item) => String(
  item?.AssemblyName
  || item?.assemblyName
  || item?.AssemblyDescription
  || item?.assembly?.Name
  || item?.AssemblyDetails?.AssemblyName
  || item?.Repair?.AssemblyName
  || 'Assembly'
).trim();

const getNotificationQueueItems = (notifications) => {
  const notificationList = Array.isArray(notifications)
    ? notifications
    : extractItems(notifications);

  return notificationList
  .filter((notification) => ['JCA', 'JR'].includes(getNotificationType(notification)))
  .map((notification) => ({
    ...notification,
    Type: getNotificationType(notification),
    Status: notification?.Status || notification?.AssignmentStatus || 'P',
    DocEntry: notification?.JobCardEntry
      || notification?.jobCardEntry
      || notification?.JobCardDocEntry
      || notification?.jobCardDocEntry
      || notification?.DocEntry
      || notification?.docEntry
      || notification?.ReferenceDocEntry,
    JobCardEntry: notification?.JobCardEntry
      || notification?.jobCardEntry
      || notification?.JobCardDocEntry
      || notification?.jobCardDocEntry
      || notification?.DocEntry
      || notification?.docEntry
      || notification?.ReferenceDocEntry,
    JobCardDocEntry: notification?.JobCardEntry
      || notification?.jobCardEntry
      || notification?.JobCardDocEntry
      || notification?.jobCardDocEntry
      || notification?.DocEntry
      || notification?.docEntry,
    JobCardNo: notification?.JobCardEntry
      || notification?.jobCardEntry
      || notification?.JobCardNo
      || notification?.jobCardNo
      || notification?.DocEntry
      || notification?.docEntry,
    FaultLine: notification?.FaultLine || notification?.faultLine || 1,
    ComplaintType: getNotificationType(notification) === 'JR'
      ? 'Repair Incident'
      : 'Breakdown',
    FaultCode: notification?.FaultCode || notification?.faultCode || '',
    FaultName: notification?.FaultName || notification?.faultName || notification?.Description || 'Line Breakdown',
    ComplaintNo: notification?.ComplaintNo || notification?.complaintNo || notification?.BreakdownNo || notification?.IncidentNo,
    NotificationDate: notification?.NotificationDate || notification?.notificationDate || notification?.Date || notification?.date,
    NotificationTime: notification?.NotificationTime || notification?.notificationTime || notification?.Time || notification?.time,
    NotificationDateTime: notification?.NotificationDateTime || notification?.notificationDateTime || notification?.DateTime || notification?.CreatedAt,
  }))
  .filter((item) => getDocEntry(item));
};

const getRepairWorkQueueItems = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  const workEntries = Array.isArray(data)
    ? data
    : (Array.isArray(data?.WorkEntries) ? data.WorkEntries : []);
  return workEntries.map((entry) => {
    const jobCardEntry = entry?.JobCardEntry || entry?.JobCard || entry?.JobCardNo || entry?.JobCardDocEntry || '';
    return {
      ...entry,
      Type: 'JR',
      JobType: 'Repair',
      ComplaintType: 'Repair Incident',
      DocEntry: jobCardEntry,
      JobCardEntry: jobCardEntry,
      JobCardDocEntry: jobCardEntry,
      JobCardNo: jobCardEntry,
      WorkEntries: [entry],
      HasRepairWorkEntry: true,
      FaultName: 'Assembly',
      Fault: 'Assembly',
      Status: entry?.Status || entry?.WorkStatus || 'W',
    };
  }).filter((item) => getDocEntry(item));
};

const mergeQueueItems = (apiItems, notificationItems) => {
  const merged = Array.isArray(apiItems) ? [...apiItems] : [];
  const existingKeys = new Set(merged.map(item => itemKey(item)));
  notificationItems.forEach((item) => {
    const key = itemKey(item);
    const matchingIndex = merged.findIndex((existingItem) => (
      String(getDocEntry(existingItem)).trim() === String(getDocEntry(item)).trim()
      && getNotificationType(item) === 'JR'
    ));
    if (matchingIndex >= 0) {
      // A dashboard row may exist before the JR notification is read. Keep
      // its details, but let the assignment notification control its queue.
      const existingItem = merged[matchingIndex];
      const preservedStatus = isRepairAccepted(existingItem)
        ? (existingItem.Status || existingItem.AssignmentStatus || existingItem.MechanicStatus)
        : 'P';
      merged[matchingIndex] = {
        ...existingItem,
        ...item,
        Type: 'JR',
        JobType: 'Repair',
        ComplaintType: 'Repair Incident',
        FaultName: 'Assembly',
        Fault: 'Assembly',
        Status: preservedStatus,
      };
      return;
    }
    if (!existingKeys.has(key)) {
      merged.push(item);
      existingKeys.add(key);
    }
  });
  return merged;
};

const MechanicDashboardScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.UserCode || user?.EmpCode || user?.User || user?.user || user?.name || '';
  const assigneeName = user?.FirstName || user?.Name || user?.name || userCode || 'You';
  const roleLabel = getUserRole(user) === 'Electrician' ? 'Electrician' : 'Mechanic';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(BUCKET.TO_ACCEPT);
  const [submittingKey, setSubmittingKey] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [dashboardResult, repairWorkResult] = await Promise.allSettled([
        mechanicService.getMechanicDashboard(companyDb, userCode),
        repairService.getMyRepairWorkDashboard(companyDb, userCode),
      ]);
      if (dashboardResult.status === 'rejected') throw dashboardResult.reason;
      const apiItems = extractItems(dashboardResult.value?.Data ?? dashboardResult.value);
      const repairWorkItems = repairWorkResult.status === 'fulfilled'
        ? getRepairWorkQueueItems(repairWorkResult.value)
        : [];
      let notificationItems = [];
      try {
        const notificationUser = String(
          user?.User || user?.username || user?.user || userCode || '',
        ).trim();
        const notificationResponse = await dashboardService.getNotifications(companyDb, notificationUser);
        const notificationData = notificationResponse?.Data ?? notificationResponse?.data ?? notificationResponse;
        notificationItems = getNotificationQueueItems(notificationData);
      } catch (notificationError) {
        console.warn('Unable to load repair/job notifications for work queue:', notificationError?.message || notificationError);
      }
      const queueWithRepairWork = mergeQueueItems(apiItems, repairWorkItems);
      const repairWorkJobCards = new Set(repairWorkItems.map(item => String(getDocEntry(item)).trim()));
      const pendingNotifications = notificationItems.filter(item => !(
        isRepairAssignment(item) && repairWorkJobCards.has(String(getDocEntry(item)).trim())
      ));
      const queueItems = mergeQueueItems(queueWithRepairWork, pendingNotifications);
      setItems(queueItems);
    } catch (error) {
      console.error('❌ Error loading Mechanic Dashboard:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to load your work queue' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, userCode]);

  // Refresh when returning from Fault Work so started faults and newly-created
  // WorkEntries are not shown using the stale dashboard item.
  useFocusEffect(useCallback(() => {
    fetchData();
  }, [fetchData]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const grouped = {
    [BUCKET.TO_ACCEPT]: items.filter(i => !isRepairAssignment(i) && deriveBucket(i) === BUCKET.TO_ACCEPT),
    [BUCKET.REPAIR]: items.filter(i => isRepairAssignment(i)),
    [BUCKET.IN_PROGRESS]: items.filter(i => !isRepairAssignment(i) && deriveBucket(i) === BUCKET.IN_PROGRESS),
    [BUCKET.COMPLETED]: items.filter(i => !isRepairAssignment(i) && deriveBucket(i) === BUCKET.COMPLETED),
  };

  const handleAccept = async (item) => {
    const key = itemKey(item);
    try {
      setSubmittingKey(key);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await mechanicService.acceptFault(
        companyDb,
        getDocEntry(item),
        getFaultLine(item),
        userCode,
      );
      if (response?.Success !== false) {
        const breakdownAssignment = isBreakdownAssignment(item);
        const responseData = response?.Data ?? response?.data ?? response;
        const acceptedEntry = Array.isArray(responseData)
          ? responseData[0] || {}
          : responseData?.WorkEntry
            || responseData?.WorkEntryDetails
            || responseData
            || {};
        const acceptedWorkEntryDocEntry = acceptedEntry?.WorkEntryDocEntry
          || acceptedEntry?.WorkEntryNo
          || acceptedEntry?.DocEntry
          || response?.WorkEntryDocEntry
          || response?.WorkEntryNo
          || null;

        setItems(prev => prev.map(i => (itemKey(i) === key ? { ...i, Status: 'A' } : i)));
        if (breakdownAssignment) {
          Toast.show({ type: 'success', text1: 'Breakdown accepted', text2: 'Opening work entry.' });
          openBreakdownWorkEntry(item, acceptedWorkEntryDocEntry, acceptedEntry);
        } else {
          Toast.show({ type: 'success', text1: 'Fault accepted', text2: 'Head to "In Progress" to start work.' });
          setActiveTab(BUCKET.IN_PROGRESS);
        }
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not accept fault' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to accept fault' });
    } finally {
      setSubmittingKey(null);
    }
  };

  const openFault = (item) => {
    const activeWorkEntry = getActiveWorkEntry(item);
    navigation.navigate('FaultWork', {
      docEntry: getDocEntry(item),
      faultLine: getFaultLine(item),
      fault: item,
      workEntryDocEntry: activeWorkEntry?.DocEntry || activeWorkEntry?.WorkEntryDocEntry || null,
      existingWorkEntry: activeWorkEntry,
      isWorkStarted: hasStartedWork(item),
      isAwaitingVerification: isAwaitingVerification(item),
      dbName: dbName || 'MUTSPL_TEST',
    });
  };

  const openBreakdownWorkEntry = (item, acceptedWorkEntryDocEntry = null, acceptedWorkEntry = null) => {
    const jobCardDocEntry = getBreakdownJobCardDocEntry(item);
    navigation.navigate('FaultWork', {
      docEntry: jobCardDocEntry,
      dbName: dbName || 'MUTSPL_TEST',
      jobCardNo: item?.JobCardNo || item?.DocNum || jobCardDocEntry,
      complaintType: 'Breakdown',
      complaintNo: getBreakdownComplaintNo(item),
      fault: item,
      faultLine: getFaultLine(item) || 1,
      workEntryDocEntry: acceptedWorkEntryDocEntry || getActiveWorkEntry(item)?.WorkEntryDocEntry || getActiveWorkEntry(item)?.DocEntry || null,
      existingWorkEntry: acceptedWorkEntry || getActiveWorkEntry(item) || null,
      busNo: getBusLabel(item),
      depot: item?.Depot || item?.BranchNm || item?.Branch || item?.Location || '',
    });
  };

  const openRepairWork = (item) => {
    const activeWorkEntry = getActiveWorkEntry(item);
    navigation.navigate('RepairWork', {
      jobCardEntry: getDocEntry(item),
      dbName: dbName || 'MUTSPL_TEST',
      incidentEntry: item?.IncidentEntry || item?.IncidentDocEntry || '',
      storePersonID: item?.StorePersonID || item?.StorePerson || item?.StoreCode || '',
      assemblyCode: getRepairAssemblyCode(item),
      assemblyName: getRepairAssemblyName(item),
      workEntryDocEntry: activeWorkEntry?.WorkEntryDocEntry || activeWorkEntry?.WorkEntryEntry || activeWorkEntry?.DocEntry || null,
    });
  };

  const openRepairAssignment = (item) => {
    navigation.navigate('RepairJobCardAssignment', {
      jobCardEntry: getDocEntry(item),
      dbName: dbName || 'MUTSPL_TEST',
    });
  };

  const renderItem = (item) => {
    const key = itemKey(item);
    const breakdownAssignment = isBreakdownAssignment(item);
    const repairAssignment = isRepairAssignment(item);
    const bucket = repairAssignment ? BUCKET.REPAIR : deriveBucket(item);
    const itemJobType = repairAssignment ? 'Repair' : normalizeJobType(item);
    const faultName = repairAssignment ? 'Assembly' : item?.Fault || item?.FaultName || item?.Description || (breakdownAssignment ? 'Line Breakdown' : 'Fault');
    const busNo = getBusLabel(item);
    const displayNo = item?.JobCardNo || item?.DocNum || getDocEntry(item);
    const assignedName = item?.AssignedMechanic?.UserName || item?.MechanicName || item?.AssignedToName || item?.EmployeeName || item?.EmpName || assigneeName;
    const cardDateTime = getCardDateTime(item);

    const statusColor =
      bucket === BUCKET.COMPLETED ? colors.statusCompleted
      : bucket === BUCKET.IN_PROGRESS ? colors.statusInProgress
      : colors.primary;
    const awaitingVerification = isAwaitingVerification(item);
    const statusLabel = repairAssignment
      ? ''
      : getMechanicStatusLabel(item, bucket, awaitingVerification);

    return (
      <TouchableOpacity
        key={key}
        style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}
        activeOpacity={0.7}
        onPress={() => {
          if (repairAssignment) {
            if (hasRepairWorkEntry(item) || isRepairAccepted(item)) {
              openRepairWork(item);
            } else {
              openRepairAssignment(item);
            }
            return;
          }
          if (breakdownAssignment) {
            if (bucket === BUCKET.TO_ACCEPT) return;
            openBreakdownWorkEntry(item);
            return;
          }
          if (bucket === BUCKET.TO_ACCEPT) {
            return;
          }
          openFault(item);
        }}
      >
        {cardDateTime ? (
          <Text style={[styles.cardDateTime, { color: colors.gray }]}>Date & time: {cardDateTime}</Text>
        ) : null}
        <View style={styles.cardTop}>
          <View style={[styles.faultIcon, { backgroundColor: `${statusColor}20` }]}>
            <MaterialIcons name="build" size={18} color={statusColor} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.faultName, { color: colors.dark }]}>{faultName}</Text>
            <Text style={[styles.assigneeText, { color: colors.primary }]}>Assigned to: {assignedName}</Text>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              {repairAssignment ? `Assembly • Repair Job Card #${displayNo} • ${item?.Priority || 'Medium'}` : `${itemJobType} • Job Card #${displayNo} • ${busNo} • ${item?.Priority || 'Medium'}`}
            </Text>
          </View>
        </View>

        {repairAssignment ? (
          <View style={styles.rowBetween}>
            <View />
            <View style={[styles.repairButton, { backgroundColor: colors.primary }]}> 
              <MaterialIcons name="build" size={15} color="#FFF" />
              <Text style={styles.repairButtonText}>Repair</Text>
            </View>
          </View>
        ) : breakdownAssignment && bucket === BUCKET.TO_ACCEPT ? (
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleAccept(item)}
            activeOpacity={0.8}
            disabled={submittingKey === key}
          >
            <MaterialIcons name="check" size={16} color="#FFF" />
            <Text style={styles.acceptBtnText}>{submittingKey === key ? 'Accepting...' : 'Accept Fault'}</Text>
          </TouchableOpacity>
        ) : breakdownAssignment ? (
          <View style={styles.rowBetween}>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}> 
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <Text style={[styles.openLabel, { color: colors.primary }]}>Open work entry</Text>
          </View>
        ) : bucket === BUCKET.TO_ACCEPT ? (
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleAccept(item)}
            activeOpacity={0.8}
            disabled={submittingKey === key}
          >
            <MaterialIcons name="check" size={16} color="#FFF" />
            <Text style={styles.acceptBtnText}>{submittingKey === key ? 'Accepting…' : 'Accept Fault'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rowBetween}>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.gray} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const currentList = grouped[activeTab] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="My Work"
        subtitle={roleLabel}
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={true}
        useGradient={false}
      />

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const count = grouped[tab.key]?.length || 0;
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={tab.icon} size={16} color={active ? colors.primary : colors.gray} />
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.gray }]}>
                {tab.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <Loader visible={true} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="inbox" size={48} color={colors.gray} />
              <Text style={{ color: colors.gray, marginTop: 8 }}>Nothing here yet.</Text>
            </View>
          ) : (
            currentList.map(renderItem)
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    justifyContent: 'center',
    gap: 4,
  },
  tabText: { fontSize: 11, fontWeight: '600' },
  scrollContent: { padding: SPACING.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardDateTime: { position: 'absolute', top: 8, right: 12, fontSize: 10 },
  faultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faultName: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  assigneeText: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  acceptBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  repairButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: BORDER_RADIUS.md },
  repairButtonText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  statusPill: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
});

export default MechanicDashboardScreen;
