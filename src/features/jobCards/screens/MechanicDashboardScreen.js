import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../shared/components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { dashboardService, mechanicService, masterService, repairService } from '../../../api/services';
import { formatDateTime, getDateTimeTimestamp } from '../../../utils/helpers';
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
  // RW is a supervisor/team-leader rework decision. The mechanic must resume
  // the same fault, so it belongs in In Progress rather than New.
  if (['ACCEPTED', 'A', 'IN PROGRESS', 'INPROGRESS', 'STARTED', 'I', 'IP', 'RW', 'REWORK', 'REWORK REQUIRED', 'WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(raw)) return BUCKET.IN_PROGRESS;
  return BUCKET.TO_ACCEPT; // covers 'PENDING', '', 'P', 'NEW'
};

const isAwaitingVerification = (item) => ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(
  getEffectiveStatus(item)
);

const normalizeJobType = (item) => {
  // JB is the backend code for a Breakdown Job Card. Never let a generic
  // fault/job field (such as an Assembly description) override it.
  if (getNotificationType(item) === 'JB') return 'Breakdown';
  // JCA is a Driver Complaint assignment. Its notification text can still
  // mention a breakdown, so the explicit backend type must take precedence.
  if (getNotificationType(item) === 'JCA') return 'Driver Complaint';

  const raw = String(item?.JobType ?? item?.FormType ?? item?.ComplaintType ?? item?.IncidentType ?? item?.Type ?? '').trim();
  if (!raw) {
    const hasBreakdownRef = Boolean(item?.BreakdownNo || item?.BreakdownId || item?.ComplaintNo || item?.CmplaintNo || item?.BreakdownDocEntry);
    return hasBreakdownRef ? 'Breakdown' : 'Driver Complaint';
  }

  const normalized = raw.toLowerCase();
  if (normalized.includes('breakdown') || normalized === 'b' || normalized === 'jct') return 'Breakdown';
  if (normalized === 'jca') return 'Driver Complaint';
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
  if (raw === 'RW' || raw === 'REWORK' || raw === 'REWORK REQUIRED') return 'Rework Required';
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
  ?? item?.jobCardEntry
  ?? item?.JobCardDocEntry
  ?? item?.jobCardDocEntry
  ?? item?.JobCardNo
  ?? item?.jobCardNo
  ?? item?.JobCard
  ?? item?.jobCard
  ?? item?.DocNum
  ?? item?.DocEntry
  ?? item?.ReferenceDocEntry
  ?? '';
const getJobCardReferences = (item) => new Set([
  item?.JobCardEntry,
  item?.jobCardEntry,
  item?.jobCardEntry,
  item?.JobCardDocEntry,
  item?.jobCardDocEntry,
  item?.JobCardNo,
  item?.JobCard,
  item?.jobCard,
  item?.DocNum,
  item?.jobCardNo,
  item?.DocEntry,
  item?.docEntry,
  item?.RefDocEntry,
  item?.ReferenceDocEntry,
].map(value => String(value ?? '').trim()).filter(Boolean));
const hasSameJobCard = (left, right) => {
  const leftReferences = getJobCardReferences(left);
  const rightReferences = getJobCardReferences(right);
  return [...leftReferences].some(reference => rightReferences.has(reference));
};
const getNotificationType = (item) => String(
  item?.Type
  ?? item?.type
  ?? item?.NotificationType
  ?? item?.notificationType
  ?? '',
).trim().toUpperCase();
const getFaultLine = (item) => item?.FaultLine ?? item?.Line ?? item?.LineNum ?? 0;
const getJobCardGroupKey = (item) => {
  const reference = [
    item?.JobCardEntry,
    item?.jobCardEntry,
    item?.JobCardDocEntry,
    item?.jobCardDocEntry,
    item?.JobCardNo,
    item?.jobCardNo,
    item?.JobCard,
    item?.jobCard,
    item?.DocNum,
    item?.DocEntry,
    item?.ReferenceDocEntry,
  ].map(value => String(value ?? '').trim()).find(Boolean);

  return reference || itemKey(item);
};
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
const itemKey = (item) => `${getNotificationType(item) || normalizeJobType(item)}-${getDocEntry(item)}-${getFaultLine(item) || item?.FaultCode || item?.faultCode || item?.FaultName || item?.Fault || item?.Description || 'fault'}`;
const isBreakdownAssignment = (item) => {
  if (getNotificationType(item) === 'JB') return true;
  if (getNotificationType(item) === 'JCA') return false;
  const jobType = normalizeJobType(item);
  if (jobType === 'Breakdown') return true;

  const complaintTypes = [item?.ComplaintType, item?.IncidentType, item?.FormType, item?.Type, item?.JobType]
    .map(value => String(value || '').trim().toUpperCase());
  const description = String(item?.Description ?? item?.Fault ?? item?.FaultName ?? '').trim().toLowerCase();
  return complaintTypes.some(type => type.includes('BREAKDOWN') || ['B', 'JCT'].includes(type))
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
  const dateCandidates = [
    item?.NotificationDate,
    item?.notificationDate,
    item?.Date,
    item?.date,
    item?.CreatedDate,
    item?.createDate,
    item?.RegDate,
    item?.ComplaintDate,
    item?.IncidentDate,
    item?.AssignDate,
    item?.AssignedDate,
    item?.JobCardDate,
    item?.WorkDate,
    item?.StartDate,
    item?.CompleteDate,
    item?.DateTime,
    item?.CreatedOn,
    item?.CreatedAt,
    item?.NotificationDateTime,
    item?.notificationDateTime,
  ];

  const timeCandidates = [
    item?.NotificationTime,
    item?.notificationTime,
    item?.Time,
    item?.time,
    item?.CreatedTime,
    item?.createTime,
    item?.RegTime,
    item?.ComplaintTime,
    item?.IncidentTime,
    item?.AssignTime,
    item?.AssignedTime,
    item?.JobCardTime,
    item?.WorkTime,
    item?.StartTime,
    item?.CompleteTime,
  ];

  const nestedWorkEntries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
  const nestedDate = nestedWorkEntries
    .map((entry) => entry?.CreateDate || entry?.Date || entry?.CompleteDate || entry?.StartDate || '')
    .find(Boolean) || '';
  const nestedTime = nestedWorkEntries
    .map((entry) => entry?.CreateTime || entry?.Time || entry?.CompleteTime || entry?.StartTime || '')
    .find(Boolean) || '';

  const date = dateCandidates.find(Boolean) || nestedDate || item?.timestamp || item?.Timestamp || item?.CreatedAt || '';
  const time = timeCandidates.find(Boolean) || nestedTime || '';

  if (!date && !time) return '';
  return formatDateTime(date, time);
};

const getCardTimestamp = (item) => {
  const candidateDate = [
    item?.NotificationDate,
    item?.notificationDate,
    item?.Date,
    item?.date,
    item?.CreatedDate,
    item?.createDate,
    item?.RegDate,
    item?.ComplaintDate,
    item?.IncidentDate,
    item?.AssignDate,
    item?.AssignedDate,
    item?.JobCardDate,
    item?.WorkDate,
    item?.StartDate,
    item?.CompleteDate,
    item?.DateTime,
    item?.CreatedOn,
    item?.CreatedAt,
    item?.NotificationDateTime,
    item?.notificationDateTime,
  ].find(Boolean) || '';

  const candidateTime = [
    item?.NotificationTime,
    item?.notificationTime,
    item?.Time,
    item?.time,
    item?.CreatedTime,
    item?.createTime,
    item?.RegTime,
    item?.ComplaintTime,
    item?.IncidentTime,
    item?.AssignTime,
    item?.AssignedTime,
    item?.JobCardTime,
    item?.WorkTime,
    item?.StartTime,
    item?.CompleteTime,
  ].find(Boolean) || '';

  const nestedEntries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
  const latestEntry = nestedEntries
    .map((entry) => ({
      date: entry?.CreateDate || entry?.Date || entry?.CompleteDate || entry?.StartDate || '',
      time: entry?.CreateTime || entry?.Time || entry?.CompleteTime || entry?.StartTime || '',
    }))
    .filter((entry) => entry.date || entry.time)
    .sort((a, b) => getDateTimeTimestamp(b.date, b.time) - getDateTimeTimestamp(a.date, a.time))[0];

  const date = candidateDate || latestEntry?.date || '';
  const time = candidateTime || latestEntry?.time || '';

  return getDateTimeTimestamp(date, time);
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
  .filter((notification) => ['JB', 'JCA', 'JR'].includes(getNotificationType(notification)))
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
    BreakdownNo: notification?.BreakdownNo
      || notification?.BreakdownDocEntry
      || notification?.DocEntry
      || notification?.docEntry,
    FaultLine: notification?.FaultLine || notification?.faultLine || 1,
    ComplaintType: getNotificationType(notification) === 'JR'
      ? 'Repair Incident'
      : getNotificationType(notification) === 'JCA'
        ? 'Driver Complaint'
        : 'Breakdown',
    FaultCode: notification?.FaultCode || notification?.faultCode || '',
    FaultName: notification?.FaultName || notification?.faultName || notification?.Description || 'Line Breakdown',
    Vehicle: notification?.Vehicle || notification?.BusNo || notification?.Bus || (() => {
      const message = String(notification?.Message || notification?.message || '');
      return message.match(/\bBus\s+([^\s)]+)/i)?.[1] || '';
    })(),
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
      hasSameJobCard(existingItem, item)
      && (
        (getNotificationType(item) === 'JB' && isBreakdownAssignment(existingItem))
        // A JCA notification is job-card-level metadata. Its matching
        // dashboard fault can include ComplaintNo, which is also used by
        // some Breakdown rows, so do not rely on that classification here.
        || (getNotificationType(item) === 'JCA' && !isRepairAssignment(existingItem))
        || (getNotificationType(item) === 'JR' && isRepairAssignment(existingItem))
      )
    ));
    if (matchingIndex >= 0) {
      // JCA is a job-card-level Driver Complaint notification, not a fault.
      // The dashboard row already carries the actual fault name, so keep it
      // instead of replacing it with the generic "Driver Complaint Incident".
      if (getNotificationType(item) === 'JCA') return;
      // A dashboard row may exist before the JR notification is read. Keep
      // its details, but let the assignment notification control its queue.
      const existingItem = merged[matchingIndex];
      const preservedStatus = ['JB', 'JCA'].includes(getNotificationType(item))
        ? (existingItem.Status || existingItem.AssignmentStatus || existingItem.FaultStatus || 'P')
        : isRepairAccepted(existingItem)
        ? (existingItem.Status || existingItem.AssignmentStatus || existingItem.MechanicStatus)
        : 'P';
      const notificationIsJobCardMetadata = ['JB', 'JCA'].includes(getNotificationType(item));
      merged[matchingIndex] = {
        ...(notificationIsJobCardMetadata ? item : existingItem),
        ...(notificationIsJobCardMetadata ? existingItem : item),
        Type: getNotificationType(item),
        JobType: getNotificationType(item) === 'JB' ? 'Breakdown' : getNotificationType(item) === 'JCA' ? 'Driver Complaint' : 'Repair',
        ComplaintType: getNotificationType(item) === 'JB' ? 'Breakdown' : getNotificationType(item) === 'JCA' ? 'Driver Complaint' : 'Repair Incident',
        ...(getNotificationType(item) === 'JR' ? { FaultName: 'Assembly', Fault: 'Assembly' } : {}),
        Status: preservedStatus,
      };
      return;
    }
    // JCA is job-card-level metadata, not an individual fault. Do not add it
    // as a standalone actionable row when the mechanic API has not returned
    // the corresponding fault yet.
    if (getNotificationType(item) === 'JCA') return;
    if (!existingKeys.has(key)) {
      merged.push(item);
      existingKeys.add(key);
    }
  });
  return merged;
};

const MechanicDashboardScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const storedNotifications = useSelector(state => state.notification?.notifications || []);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.UserCode || user?.EmpCode || user?.Code || user?.code || user?.User || user?.user || user?.name || '';
  const assigneeName = user?.FirstName || user?.Name || user?.name || userCode || 'You';
  const roleLabel = getUserRole(user) === 'Electrician' ? 'Electrician' : 'Mechanic';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(BUCKET.TO_ACCEPT);
  const [submittingKey, setSubmittingKey] = useState(null);

  useEffect(() => {
    const requestedTab = route?.params?.initialTab;
    if (Object.values(BUCKET).includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [route?.params?.initialTab]);

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
      let notificationItems = getNotificationQueueItems(storedNotifications);
      try {
        const notificationUser = String(
          user?.UserCode || user?.EmpCode || user?.Code || user?.code || user?.User || user?.username || user?.user || userCode || '',
        ).trim();
        const notificationResponse = await dashboardService.getNotifications(companyDb, notificationUser);
        const notificationData = notificationResponse?.Data ?? notificationResponse?.data ?? notificationResponse;
        notificationItems = mergeQueueItems(notificationItems, getNotificationQueueItems(notificationData));
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
  }, [dbName, userCode, storedNotifications]);

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
    [BUCKET.IN_PROGRESS]: items.filter(i => !isRepairAssignment(i) && deriveBucket(i) === BUCKET.IN_PROGRESS).sort((a, b) => getCardTimestamp(b) - getCardTimestamp(a)),
    [BUCKET.COMPLETED]: items.filter(i => !isRepairAssignment(i) && deriveBucket(i) === BUCKET.COMPLETED),
  };

  const handleAccept = async (item) => {
    const key = itemKey(item);
    try {
      setSubmittingKey(key);
      const companyDb = dbName || 'MUTSPL_TEST';
      const breakdownAssignment = isBreakdownAssignment(item);
      const response = breakdownAssignment
        ? await masterService.respondBreakdownTeamAssignment(companyDb, {
            AssignmentDocEntry: item?.AssignmentDocEntry
              || item?.assignmentDocEntry
              || item?.DocEntry
              || item?.docEntry
              || getDocEntry(item),
            Action: 'ACCEPT',
            Remarks: 'Team accepted the breakdown.',
          })
        : await mechanicService.acceptFault(
            companyDb,
            getDocEntry(item),
            getFaultLine(item),
            userCode,
          );
      if (response?.Success !== false) {
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

        // Move the accepted card straight to In Progress locally. The queue can
        // retain a pending status briefly after either acceptance endpoint.
        setItems(prev => prev.map(i => (itemKey(i) === key ? {
          ...i,
          Status: 'IP',
          AssignmentStatus: 'IP',
          FaultStatus: 'IP',
          WorkStatus: 'IP',
          WorkEntries: Array.isArray(i.WorkEntries)
            ? i.WorkEntries.map(entry => ({
                ...entry,
                Status: 'IP',
                AssignmentStatus: 'IP',
                WorkStatus: 'IP',
              }))
            : i.WorkEntries,
        } : i)));
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
      complaintType: normalizeJobType(item),
      dbName: dbName || 'MUTSPL_TEST',
    });
  };

  const openBreakdownWorkEntry = (item, acceptedWorkEntryDocEntry = null, acceptedWorkEntry = null) => {
    const jobCardDocEntry = getBreakdownJobCardDocEntry(item);
    const activeWorkEntry = acceptedWorkEntry || getActiveWorkEntry(item) || {};
    const breakdownRepair = activeWorkEntry?.BreakDownRepair?.[0]
      || item?.BreakDownRepair?.[0]
      || activeWorkEntry?.BreakDownRepair
      || item?.BreakDownRepair
      || null;
    const activeDetails = Array.isArray(activeWorkEntry?.Details) ? activeWorkEntry.Details : [];
    const towRequested = Boolean(
      item?.TowRequested
      || item?.TowRequestEntryId
      || item?.TowRequestDocEntry
      || activeWorkEntry?.TowRequested
      || activeWorkEntry?.TowRequestEntryId
      || activeWorkEntry?.TowRequestDocEntry
      || ['REQUESTED', 'IN PROGRESS', 'PENDING PICKUP', 'PICKUP REQUESTED'].includes(String(item?.TowStatus || activeWorkEntry?.TowStatus || '').trim().toUpperCase())
      || activeDetails.some((detail) => String(detail?.WorkCode || '').trim().toUpperCase() === 'TOW_REQUEST'),
    );
    navigation.navigate('WorkEntry', {
      workOrderDocEntry: jobCardDocEntry,
      jobCardDocEntry,
      dbName: dbName || 'MUTSPL_TEST',
      jobCardNo: item?.JobCardNo || item?.DocNum || jobCardDocEntry,
      complaintType: 'Breakdown',
      complaintNo: getBreakdownComplaintNo(item),
      fault: item,
      faultLine: getFaultLine(item) || 1,
      workEntryDocEntry: acceptedWorkEntryDocEntry || getActiveWorkEntry(item)?.WorkEntryDocEntry || getActiveWorkEntry(item)?.DocEntry || null,
      existingWorkEntry: activeWorkEntry || null,
      breakdownRepair,
      towRequested,
      canRepairOnSite: item?.CanRepairOnSite ?? activeWorkEntry?.CanRepairOnSite,
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
    const itemJobType = repairAssignment ? 'Assembly Repair' : normalizeJobType(item);
    const faultName = getNotificationType(item) === 'JCA'
      ? 'Driver Complaint Incident'
      : breakdownAssignment
      ? 'Breakdown Incident'
      : repairAssignment
        ? 'Assembly'
        : item?.Fault || item?.FaultName || item?.Description || 'Driver Complaint';
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
            if (bucket === BUCKET.TO_ACCEPT) {
              handleAccept(item);
              return;
            }
            openBreakdownWorkEntry(item);
            return;
          }
          if (bucket === BUCKET.TO_ACCEPT) {
            return;
          }
          openFault(item);
        }}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
          <View style={[styles.faultIcon, { backgroundColor: `${statusColor}20` }]}>
            <MaterialIcons name={breakdownAssignment ? 'warning' : repairAssignment ? 'settings' : 'report-problem'} size={18} color={statusColor} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.faultName, { color: colors.dark }]}>{faultName}</Text>
            <Text style={[styles.assigneeText, { color: colors.primary }]}>Assigned to: {assignedName}</Text>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              {repairAssignment ? `Assembly • Repair Job Card #${displayNo} • ${item?.Priority || 'Medium'}` : `${itemJobType} • Job Card #${displayNo} • Fault ${getFaultLine(item)} • ${busNo} • ${item?.Priority || 'Medium'}`}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          {repairAssignment ? (
            <View style={styles.statusBadgeTopRight}>
              <View style={[styles.repairButton, { backgroundColor: colors.primary }]}> 
                <MaterialIcons name="build" size={15} color="#FFF" />
                <Text style={styles.repairButtonText}>Repair</Text>
              </View>
            </View>
          ) : breakdownAssignment && bucket === BUCKET.TO_ACCEPT ? (
            <TouchableOpacity
              style={[styles.acceptBtn, styles.statusBadgeTopRight, { backgroundColor: colors.primary }]}
              onPress={() => handleAccept(item)}
              activeOpacity={0.8}
              disabled={submittingKey === key}
            >
              <MaterialIcons name="check" size={16} color="#FFF" />
              <Text style={styles.acceptBtnText}>{submittingKey === key ? 'Accepting...' : 'Accept Breakdown'}</Text>
            </TouchableOpacity>
          ) : breakdownAssignment ? (
            <View style={styles.statusBadgeTopRight}>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}> 
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          ) : bucket === BUCKET.TO_ACCEPT ? (
            <TouchableOpacity
              style={[styles.acceptBtn, styles.statusBadgeTopRight, { backgroundColor: colors.primary }]}
              onPress={() => handleAccept(item)}
              activeOpacity={0.8}
              disabled={submittingKey === key}
            >
              <MaterialIcons name="check" size={16} color="#FFF" />
              <Text style={styles.acceptBtnText}>{submittingKey === key ? 'Accepting…' : 'Accept Fault'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.statusBadgeTopRight}>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          )}

          {cardDateTime ? (
            <View style={[styles.dateBadge, { backgroundColor: `${statusColor}12`, borderColor: `${statusColor}30` }]}> 
              <MaterialIcons name="access-time" size={12} color={statusColor} />
              <Text style={[styles.cardDateTime, { color: statusColor }]}>{cardDateTime}</Text>
            </View>
          ) : null}
        </View>
        </View>
      </TouchableOpacity>
    );
  };

  const currentList = grouped[activeTab] || [];
  const currentGroups = currentList.reduce((groups, item) => {
    const key = getJobCardGroupKey(item);
    const existingGroup = groups.find(group => group.key === key);
    if (existingGroup) {
      existingGroup.items.push(item);
    } else {
      groups.push({ key, items: [item] });
    }
    return groups;
  }, []);

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
            currentGroups.map((group) => {
              const sortedGroupItems = [...group.items].sort((a, b) => getCardTimestamp(b) - getCardTimestamp(a));
              const firstItem = sortedGroupItems[0];
              const displayNo = firstItem?.JobCardNo || firstItem?.DocNum || getDocEntry(firstItem);
              return (
                <View key={`${activeTab}-${group.key}`} style={styles.jobCardGroup}>
                  <View style={styles.jobCardGroupHeader}>
                    <Text style={[styles.jobCardGroupTitle, { color: colors.dark }]}>Job Card #{displayNo}</Text>
                    <Text style={[styles.jobCardGroupCount, { color: colors.gray }]}>
                      {sortedGroupItems.length} {sortedGroupItems.length === 1 ? 'fault' : 'faults'}
                    </Text>
                  </View>
                  {sortedGroupItems.map(renderItem)}
                </View>
              );
            })
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
  jobCardGroup: { marginBottom: SPACING.sm },
  jobCardGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  jobCardGroupTitle: { fontSize: 13, fontWeight: '700' },
  jobCardGroupCount: { fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardContent: { flex: 1, paddingBottom: 30 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardFooter: {
    position: 'relative',
    width: '100%',
    minHeight: 28,
    marginTop: 4,
  },
  statusBadgeTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  dateBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    gap: 4,
  },
  cardDateTime: { fontSize: 10, fontWeight: '700' },
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
    paddingHorizontal: 14,
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
