import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Image,
  Animated,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import { PanGestureHandler, PinchGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { dashboardService, jobCardService, masterService, mechanicService, repairService, storeService, teamService, workEntryService } from '../../../api/services';
import { formatDate, formatTime } from '../../../utils/helpers';

const isAwaitingVerificationStatus = (value) => {
  const status = String(value || '').trim().toUpperCase();
  return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION', 'V', 'VERIFY'].includes(status);
};

const isWorkEntryCompleted = (entry) => {
  const status = String(entry?.Status || entry?.WorkStatus || '').trim().toUpperCase();
  if (['C', 'CM', 'COMPLETE', 'COMPLETED', 'WC', 'WORK COMPLETED', 'AWAITING VERIFICATION', 'V', 'VERIFY'].includes(status)) {
    return true;
  }
  return Boolean(String(entry?.CompleteDate || entry?.CompletedDate || '').trim());
};

const extractRows = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).find(Array.isArray) || [];
};

const extractSingleRecord = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data[0] || null;
  if (!data || typeof data !== 'object') return null;
  return data;
};

const toCleanString = (value) => String(value ?? '').trim();
const isValidWorkEntryId = (value) => /^\d+$/.test(toCleanString(value));

const resolveWorkEntryIdentifier = (entry) => toCleanString(
  entry?.WorkEntryDocEntry
  ?? entry?.WorkEntryNo
  ?? entry?.WorkEntry
  ?? entry?.DocEntry
  ?? entry?.Code
  ?? entry?.EntryNo
  ?? ''
);

const resolveFaultIdentifier = (entry, fallbackItem) => toCleanString(
  entry?.FaultLine
  ?? entry?.LineId
  ?? entry?.LineNum
  ?? entry?.FaultLn
  ?? entry?.FaultCode
  ?? entry?.Fault
  ?? entry?.FaultName
  ?? fallbackItem?.FaultLine
  ?? fallbackItem?.LineId
  ?? fallbackItem?.FaultCode
  ?? fallbackItem?.Fault
  ?? fallbackItem?.FaultName
  ?? ''
).toUpperCase();

const extractImageFileName = (record) => String(
  record?.FileName
  || record?.ImgPath
  || record?.ImagePath
  || record?.ImageName
  || record?.Name
  || ''
).trim();

const extractImageRecords = (entry) => {
  const rawRows = [
    ...(Array.isArray(entry?.Images) ? entry.Images : []),
    ...(Array.isArray(entry?.WorkEntryImages) ? entry.WorkEntryImages : []),
    ...(Array.isArray(entry?.ImageList) ? entry.ImageList : []),
  ];

  const seen = new Set();
  const records = rawRows
    .map((row, index) => {
      const fileName = extractImageFileName(row);
      if (!fileName) return null;
      const imgNo = Number(row?.ImgNo) || index + 1;
      const imgType = String(row?.ImgType || (imgNo === 1 ? 'BF' : 'AF')).trim().toUpperCase();
      const key = `${fileName}-${imgType}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: key,
        fileName,
        imgNo,
        imgType,
        captureDate: String(row?.CaptureDate || '').trim(),
        captureTime: String(row?.CaptureTime || '').trim(),
        remarks: String(row?.Remarks || '').trim(),
        userCode: String(row?.UserCode || '').trim(),
      };
    })
    .filter(Boolean);

  return records;
};

const extractWorkDetailsRecords = (entry) => {
  const rows = [
    ...(Array.isArray(entry?.WorkDetails) ? entry.WorkDetails : []),
    ...(Array.isArray(entry?.Details) ? entry.Details : []),
  ];

  return rows.map((row, index) => ({
    id: `${entry?.DocEntry || entry?.WorkEntryDocEntry || 'work'}-detail-${index}`,
    workCode: String(row?.WorkCode || row?.Code || '').trim(),
    workDone: String(row?.WorkDone || row?.Name || row?.Description || '').trim(),
    otherDescription: String(row?.OtherDescription || row?.OtherDesc || '').trim(),
    remarks: String(row?.Remarks || '').trim(),
    entryDate: String(row?.EntryDate || row?.Date || '').trim(),
    entryTime: String(row?.EntryTime || row?.Time || '').trim(),
  }));
};

const extractBase64Content = (response) => {
  const seen = new Set();
  const queue = [response?.Data ?? response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string') {
      const text = current.trim();
      if (!text) continue;
      const xmlMatch = text.match(/<(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>([\s\S]*?)<\/(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>/i);
      if (xmlMatch?.[1]?.trim()) return xmlMatch[1].trim();
      if (text.startsWith('data:image/')) return text;
      if (text.length > 100) return text;
      continue;
    }

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    if (typeof current === 'object') {
      if (seen.has(current)) continue;
      seen.add(current);
      for (const [key, value] of Object.entries(current)) {
        if (
          ['Base64', 'ImageBase64', 'FileBase64', 'Content', 'Data', 'Result', 'ImageData', 'ImgData', 'Photo', 'Binary'].includes(key)
          && typeof value === 'string'
          && value.trim()
        ) {
          return value.trim();
        }
        queue.push(value);
      }
    }
  }

  return '';
};

const getBusLabel = (item) => String(
  item?.BusNo
  || item?.Vehicle
  || item?.BusCode
  || item?.BusRegistrationNo
  || item?.RegNo
  || ''
).trim() || '-';

const getStatusLabel = (statusValue) => {
  const status = String(statusValue || '').trim().toUpperCase();
  if (!status) return 'Pending';
  if (status === 'O') return 'Open';
  if (status === 'A') return 'Accepted';
  if (status === 'IP') return 'In Progress';
  if (status === 'PP') return 'Part Approval Pending';
  if (status === 'PI') return 'Parts Issued';
  if (status === 'PR') return 'Parts Received';
  if (status === 'WC') return 'Awaiting Verification';
  if (status === 'RW') return 'Rework';
  if (status === 'SV') return 'Supervisor Verified';
  if (status === 'CL') return 'Closed';
  if (status === 'CM') return 'Completed';
  if (status === 'DENIED') return 'Denied';
  return status;
};

const getStatusTone = (statusValue) => {
  const status = String(statusValue || '').trim().toUpperCase();
  if (['SV', 'CL', 'CM', 'C', 'COMPLETE', 'COMPLETED'].includes(status)) {
    return { fg: '#166534', bg: '#DCFCE7' };
  }
  if (['RW', 'DENIED', 'R', 'REJECTED'].includes(status)) {
    return { fg: '#991B1B', bg: '#FEE2E2' };
  }
  return { fg: '#6D28D9', bg: '#EDE9FE' };
};

const formatHourToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{1,2}$/.test(raw)) {
    const hour = Number(raw);
    if (Number.isFinite(hour)) {
      const h = Math.max(0, Math.min(23, hour));
      return `${String(h).padStart(2, '0')}:00`;
    }
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':').map((token) => Number(token));
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, m))).padStart(2, '0')}`;
    }
  }
  return raw;
};

const formatDateToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const formatted = formatDate(raw);
  return String(formatted || '').trim() || raw;
};

const formatDateTimeToken = (dateValue, timeValue) => {
  const dateText = formatDateToken(dateValue);
  const timeText = formatHourToken(timeValue);
  if (dateText === '-' && timeText === '-') return '-';
  if (dateText === '-') return `Time: ${timeText}`;
  if (timeText === '-') return `Date: ${dateText}`;
  return `${dateText} ${timeText}`;
};

const parseDateTimeToken = (dateValue, timeValue) => {
  const dateRaw = String(dateValue || '').trim();
  const timeRaw = String(timeValue || '').trim();
  if (!dateRaw) return null;

  let hours = 0;
  let minutes = 0;
  if (/^\d{1,2}$/.test(timeRaw)) {
    hours = Math.max(0, Math.min(23, Number(timeRaw)));
  } else if (/^\d{1,2}:\d{2}$/.test(timeRaw)) {
    const [h, m] = timeRaw.split(':').map((v) => Number(v));
    if (Number.isFinite(h)) hours = Math.max(0, Math.min(23, h));
    if (Number.isFinite(m)) minutes = Math.max(0, Math.min(59, m));
  }

  const mdy = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    const dt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsed = new Date(`${dateRaw} ${timeRaw || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveLabourHours = (entry) => {
  const direct = Number(entry?.LabourHours);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const start = parseDateTimeToken(entry?.StartDate, entry?.StartTime);
  const end = parseDateTimeToken(entry?.CompleteDate, entry?.CompleteTime);
  if (!start || !end) return null;

  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const hours = diffMs / (1000 * 60 * 60);
  return Number(hours.toFixed(2));
};

const resolveNotificationCandidates = (user) => {
  const values = [
    user?.User,
    user?.user,
    user?.username,
    user?.Code,
    user?.code,
    user?.Name,
    user?.name,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)];
};

const extractPendingWorkEntryIdsFromNotifications = (notifications = []) => {
  const rows = Array.isArray(notifications) ? notifications : [];
  const pendingSet = new Set();

  rows.forEach((item) => {
    const type = String(item?.Type || item?.type || '').trim().toUpperCase();
    const text = `${item?.Message || item?.message || ''} ${item?.Title || item?.title || ''}`.toLowerCase();
    const isWorkEntryVerificationText = text.includes('work entry') && (
      text.includes('verify')
      || text.includes('approve')
      || text.includes('supervisor inspection')
      || text.includes('inspection is required')
    );
    // LBWE (Line Breakdown Work Entry) is verified through the same queue as
    // WE. Keep the raw backend type here because stored notifications retain
    // their original Type even when the UI normalizes it to V.
    const isVerificationItem = ['WE', 'LBWE', 'V'].includes(type) || isWorkEntryVerificationText;
    if (!isVerificationItem) return;

    const candidates = [
      item?.WorkEntryDocEntry,
      item?.DocEntry,
      item?.ReferenceDocEntry,
      item?.RefDocEntry,
      item?.detailDocEntry,
      item?.docEntry,
    ];

    candidates.forEach((value) => {
      const id = String(value || '').trim();
      if (isValidWorkEntryId(id)) pendingSet.add(id);
    });

    const numericFromText = text.match(/work\s*entry\s*#?\s*(\d+)/i);
    if (numericFromText?.[1]) pendingSet.add(String(numericFromText[1]));
  });

  return pendingSet;
};

const extractMechanicCodesFromNotifications = (notifications = []) => {
  const rows = Array.isArray(notifications) ? notifications : [];
  const values = rows.flatMap((item) => [
    item?.MechanicCode,
    item?.UserCode,
    item?.CreatedBy,
    item?.User,
    item?.UserName,
    item?.MechanicName,
  ]);

  return [...new Set(values.map(toCleanString).filter(Boolean))];
};

const extractMechanicDashboardItems = (response) => {
  const data = response?.Data ?? response?.data ?? response;
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

const extractPartRequestItems = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.Data)) return res.Data;
  if (Array.isArray(res?.data)) return res.data;

  const data = res?.Data;
  if (!data || typeof data !== 'object') return [];

  const nestedRows = Object.values(data).filter((value) => value && typeof value === 'object');
  if (nestedRows.length > 0) {
    const flattened = [];
    nestedRows.forEach((row) => {
      const parts = Array.isArray(row?.Parts) ? row.Parts : [];
      if (parts.length === 0) {
        flattened.push(row);
        return;
      }
      parts.forEach((part) => {
        flattened.push({ ...row, ...part });
      });
    });
    if (flattened.length > 0) return flattened;
  }

  return [];
};

const mapPartRowForDisplay = (row, index) => ({
  id: String(row?.PartLine ?? row?.Line ?? row?.LineNum ?? index),
  ItemCode: row?.ItemCode || '',
  ItemName: row?.ItemName || row?.PartName || row?.ItemCode || 'Item',
  Qty: row?.ReqQty ?? row?.Qty ?? row?.Quantity ?? 1,
  IssuedQty: row?.IssuedQty ?? row?.IssueQty ?? 0,
  ReceivedQty: row?.ReceivedQty ?? 0,
  Status: row?.Status || row?.ApprovalStatus || '',
  Remarks: row?.Remarks || '',
  Warehouse: row?.Warehouse || row?.StoreWarehouse || '',
});

const groupPartRequestsByWorkEntry = (items = []) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((row, index) => {
    const workEntryKey = toCleanString(row?.WorkEntryDocEntry ?? row?.WorkEntryNo ?? row?.DocEntry);
    if (!isValidWorkEntryId(workEntryKey)) return;
    if (!map.has(workEntryKey)) map.set(workEntryKey, []);
    map.get(workEntryKey).push(mapPartRowForDisplay(row, index));
  });
  return map;
};

const mergeParts = (entryParts = [], requestParts = []) => {
  const existing = Array.isArray(entryParts) ? entryParts : [];
  const fallback = Array.isArray(requestParts) ? requestParts : [];
  if (existing.length === 0) return fallback;
  if (fallback.length === 0) return existing;

  const seen = new Set();
  const merged = [];
  [...existing, ...fallback].forEach((part, index) => {
    const key = `${String(part?.ItemCode || part?.itemCode || '').trim()}::${String(part?.PartLine ?? part?.Line ?? index)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(part);
  });
  return merged;
};

const buildWorkEntryView = (entry, fallbackItem, keyPrefix = '') => {
  const images = extractImageRecords(entry);
  const workDetails = extractWorkDetailsRecords(entry);
  const resolvedWorkEntryDocEntry = resolveWorkEntryIdentifier(entry);
  const faultKey = resolveFaultIdentifier(entry, fallbackItem);
  const labourHoursValue = resolveLabourHours(entry);

  return {
    key: `${keyPrefix}${resolvedWorkEntryDocEntry || 'unknown'}`,
    workEntryDocEntry: resolvedWorkEntryDocEntry || null,
    faultKey,
    mechanicName: entry?.MechanicName || entry?.MechName || entry?.UserName || entry?.CreatedBy || fallbackItem?.MechanicName || fallbackItem?.AssignedToName || '-',
    faultName: entry?.Fault || entry?.FaultName || entry?.Description || fallbackItem?.Fault || fallbackItem?.FaultName || '-',
    finalRemarks: entry?.FinalRemarks || entry?.Remarks || '-',
    workDetails,
    status: entry?.Status || entry?.WorkStatus || fallbackItem?.Status || fallbackItem?.WorkStatus || '',
    completed: isWorkEntryCompleted(entry),
    date: entry?.CreateDate || entry?.Date || entry?.DocDate || fallbackItem?.UpdateDate || fallbackItem?.AssignDt || '',
    time: entry?.CreateTime || entry?.Time || entry?.DocTime || fallbackItem?.UpdateTime || '',
    images,
    docNum: entry?.DocNum || entry?.WorkEntryNo || '',
    jobCardDocEntry: entry?.JobCardDocEntry || fallbackItem?.JobCardDocEntry || fallbackItem?.DocEntry || '',
    faultLine: entry?.FaultLine || fallbackItem?.FaultLine || '',
    faultCode: entry?.FaultCode || fallbackItem?.FaultCode || '',
    depot: entry?.Depot || fallbackItem?.Depot || '',
    vehicle: entry?.Vehicle || fallbackItem?.Vehicle || fallbackItem?.BusNo || '',
    mechanicCode: entry?.MechanicCode || entry?.UserCode || fallbackItem?.MechanicCode || '',
    labourHours: labourHoursValue,
    labourHoursDisplay: labourHoursValue === null ? '-' : `${labourHoursValue} h`,
    startDate: entry?.StartDate || '',
    startTime: entry?.StartTime || '',
    acceptDate: entry?.AcceptDate || '',
    acceptTime: entry?.AcceptTime || '',
    completeDate: entry?.CompleteDate || '',
    completeTime: entry?.CompleteTime || '',
    verifyBy: entry?.VerifyBy || '',
    verifyDate: entry?.VerifyDate || '',
    verifyTime: entry?.VerifyTime || '',
    verifyRemarks: entry?.VerifyRemarks || '',
    parts: Array.isArray(entry?.Parts) ? entry.Parts : [],
  };
};

const ReviewWorkEntriesScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector((state) => state.theme.isDarkMode);
  const dbName = useSelector((state) => state.auth.dbName);
  const user = useSelector((state) => state.auth.user);
  const storedNotifications = useSelector((state) => state.notification?.notifications || []);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewCards, setReviewCards] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewScale, setPreviewScale] = useState(1);
  const pinchScale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const panTranslate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentBaseScale = useRef(1);
  const combinedScale = Animated.multiply(baseScale, pinchScale);
  const [selectedWorkEntry, setSelectedWorkEntry] = useState(null);
  const [actioningWorkEntry, setActioningWorkEntry] = useState(null);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [reassignmentTarget, setReassignmentTarget] = useState(null);
  const [reassignmentTeams, setReassignmentTeams] = useState([]);
  const [selectedReassignmentTeam, setSelectedReassignmentTeam] = useState(null);
  const [reassignmentRemarks, setReassignmentRemarks] = useState('');
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [pendingDriverComplaint, setPendingDriverComplaint] = useState(null);
  const consumedFocusEntryRef = useRef('');

  const onPanGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: panTranslate.x, translationY: panTranslate.y } }],
    { useNativeDriver: true }
  );

  const onPanStateChange = (event) => {
    if (event?.nativeEvent?.state === GestureState.END || event?.nativeEvent?.state === GestureState.CANCELLED) {
      panTranslate.extractOffset();
      panTranslate.setValue({ x: 0, y: 0 });
    }
  };

  const focusJobCard = String(route?.params?.focusJobCardDocEntry || '').trim();
  const focusWorkEntry = String(route?.params?.focusWorkEntryDocEntry || route?.params?.workEntryDocEntry || '').trim();

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const identityCandidates = resolveNotificationCandidates(user);
      const notificationBucket = new Map();
      let partRequestsByWorkEntry = new Map();

      try {
        const partRequestsResponse = await storeService.getMechanicPartRequests(companyDb);
        partRequestsByWorkEntry = groupPartRequestsByWorkEntry(extractPartRequestItems(partRequestsResponse));
      } catch (partError) {
        // Keep review flow available when parts API is unavailable.
      }

      (Array.isArray(storedNotifications) ? storedNotifications : []).forEach((item) => {
        const key = toCleanString(item?.code || item?.Code || item?.id || `${item?.Type || item?.type || ''}-${item?.DocEntry || item?.docEntry || item?.Message || ''}`);
        if (key) notificationBucket.set(`store-${key}`, item);
      });

      for (const identity of identityCandidates) {
        try {
          const response = await dashboardService.getNotifications(companyDb, identity);
          const rows = extractRows(response);
          rows.forEach((item, index) => {
            const key = toCleanString(item?.Code || item?.code || item?.id || `${identity}-${index}`);
            notificationBucket.set(`${identity}-${key}`, item);
          });
        } catch (error) {
          // Try the next identity candidate.
        }
      }

      const notifications = Array.from(notificationBucket.values());

      const pendingWorkEntryIds = extractPendingWorkEntryIdsFromNotifications(notifications);

      const exactWorkEntryById = new Map();
      if (pendingWorkEntryIds.size > 0) {
        const exactResults = await Promise.allSettled(
          Array.from(pendingWorkEntryIds).map(async (workEntryId) => ({
            workEntryId: toCleanString(workEntryId),
            record: extractSingleRecord(await workEntryService.getWorkEntry(companyDb, workEntryId)),
          }))
        );

        exactResults.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const { workEntryId, record } = result.value || {};
          if (!workEntryId || !record) return;
          exactWorkEntryById.set(workEntryId, record);
        });
      }

      const jobCardsResponse = await jobCardService.getJobCards(companyDb, null);
      const cards = Array.isArray(jobCardsResponse?.Data) ? jobCardsResponse.Data : [];
      const verificationCards = pendingWorkEntryIds.size > 0
        ? cards
        : cards.filter((card) => isAwaitingVerificationStatus(card?.Status || card?.WorkStatus || card?.FaultStatus));

      const unresolvedWorkEntryIds = new Set(pendingWorkEntryIds);

      const workHistoryResults = await Promise.allSettled(
        verificationCards.map(async (card) => {
          const refs = [
            card?.JobCardNo,
            card?.DocEntry,
            card?.JobCardDocEntry,
            card?.JCDocNum,
            card?.JCDocEnt,
          ]
            .map(toCleanString)
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index);

          if (refs.length === 0) {
            return {
              card,
              entries: [],
            };
          }

          let entries = [];
          for (const ref of refs) {
            try {
              const historyResponse = await workEntryService.getWorkHistory(companyDb, ref);
              const rows = extractRows(historyResponse);
              if (rows.length > 0) {
                entries = rows;
                break;
              }
            } catch (error) {
              // Try next reference candidate.
            }
          }

          return {
            card,
            entries,
          };
        })
      );

      const normalized = workHistoryResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
        .map(({ card, entries }) => {
          const allEntries = (Array.isArray(entries) ? entries : []).map((entry, index) => {
            const resolvedEntryId = resolveWorkEntryIdentifier(entry);
            const exactRecord = exactWorkEntryById.get(resolvedEntryId) || entry;
            const viewEntry = buildWorkEntryView(exactRecord, card, `${card?.DocEntry || card?.JobCardNo || 'JC'}-${index}-`);
            if (isValidWorkEntryId(viewEntry.workEntryDocEntry)) {
              unresolvedWorkEntryIds.delete(viewEntry.workEntryDocEntry);
              return viewEntry;
            }
            return null;
          });

          let workEntries = allEntries.filter(Boolean);
          if (pendingWorkEntryIds.size > 0) {
            const seedEntries = allEntries.filter((entry) => pendingWorkEntryIds.has(toCleanString(entry?.workEntryDocEntry)));
            const seedIds = new Set(seedEntries.map((entry) => toCleanString(entry?.workEntryDocEntry)).filter(Boolean));
            const seedFaultKeys = new Set(seedEntries.map((entry) => entry?.faultKey).filter(Boolean));

            workEntries = allEntries.filter((entry) => {
              const workEntryId = toCleanString(entry?.workEntryDocEntry);
              if (seedIds.has(workEntryId)) return true;
              if (seedFaultKeys.size === 0) return false;
              return Boolean(entry?.faultKey) && seedFaultKeys.has(entry.faultKey);
            });
          }

          const allWorkEntriesCompleted = workEntries.length > 0 && workEntries.every((entry) => entry.completed);

          return {
            key: String(card?.DocEntry || card?.JobCardDocEntry || card?.JobCardNo || Math.random()),
            jobCardDocEntry: card?.DocEntry || card?.JobCardDocEntry || card?.JCDocEnt || card?.JobCardNo,
            jobCardNo: card?.JobCardNo || card?.DocNum || card?.DocEntry,
            busNo: getBusLabel(card),
            complaintType: card?.ComplaintType || card?.JobType || card?.FormType || '',
            driverCode: card?.DrvCode || card?.DriverCode || card?.Driver || '',
            driverName: card?.DrvName || card?.DriverName || card?.Driver || '',
            status: card?.Status || card?.WorkStatus || card?.FaultStatus || '',
            complaintNo: card?.ComplaintNo || card?.IncidentNo || '',
            workEntries,
            allWorkEntriesCompleted,
          };
        })
        .filter((item) => item.workEntries.length > 0)
        .sort((a, b) => Number(b?.jobCardDocEntry || 0) - Number(a?.jobCardDocEntry || 0));

      if (unresolvedWorkEntryIds.size > 0) {
        const exactFallbackGroups = new Map();
        Array.from(unresolvedWorkEntryIds).forEach((workEntryId) => {
          const key = toCleanString(workEntryId);
          if (!isValidWorkEntryId(key)) return;
          const exactRecord = exactWorkEntryById.get(key);
          if (!exactRecord) return;

          const viewEntry = buildWorkEntryView(exactRecord, exactRecord, `exact-${key}-`);
          if (!isValidWorkEntryId(viewEntry?.workEntryDocEntry)) return;
          const jobCardRef = toCleanString(
            exactRecord?.JobCardDocEntry
            || exactRecord?.DocEntry
            || exactRecord?.JobCardNo
            || exactRecord?.JCDocEnt
            || exactRecord?.JCDocNum
            || 'NA'
          );
          const faultRef = toCleanString(viewEntry?.faultKey || exactRecord?.FaultLine || exactRecord?.FaultCode || 'NOFAULT');
          const groupKey = `${jobCardRef}::${faultRef}`;

          if (!exactFallbackGroups.has(groupKey)) {
            exactFallbackGroups.set(groupKey, {
              key: `exact-group-${groupKey}`,
              jobCardDocEntry: exactRecord?.JobCardDocEntry || exactRecord?.DocEntry || exactRecord?.JCDocEnt || 'NA',
              jobCardNo: exactRecord?.JobCardNo || exactRecord?.JCDocNum || exactRecord?.JobCardDocEntry || exactRecord?.DocEntry || 'NA',
              busNo: getBusLabel(exactRecord),
              complaintType: exactRecord?.ComplaintType || exactRecord?.JobType || exactRecord?.FormType || '',
              driverCode: exactRecord?.DrvCode || exactRecord?.DriverCode || exactRecord?.Driver || '',
              driverName: exactRecord?.DrvName || exactRecord?.DriverName || exactRecord?.Driver || '',
              status: exactRecord?.Status || exactRecord?.WorkStatus || 'AWAITING VERIFICATION',
              complaintNo: exactRecord?.ComplaintNo || exactRecord?.IncidentNo || '',
              workEntries: [],
            });
          }

          exactFallbackGroups.get(groupKey).workEntries.push(viewEntry);
          unresolvedWorkEntryIds.delete(key);
        });

        const exactFallbackCards = Array.from(exactFallbackGroups.values()).map((item) => ({
          ...item,
          allWorkEntriesCompleted: (Array.isArray(item.workEntries) ? item.workEntries : []).length > 0
            && (Array.isArray(item.workEntries) ? item.workEntries : []).every((entry) => entry.completed),
        }));

        if (exactFallbackCards.length > 0) {
          normalized.unshift(...exactFallbackCards);
        }
      }

      if (unresolvedWorkEntryIds.size > 0) {
        const mechanicCodes = [
          ...extractMechanicCodesFromNotifications(notifications),
          ...identityCandidates,
        ].filter((value, index, list) => list.indexOf(value) === index);

        const mechanicResults = await Promise.allSettled(
          mechanicCodes.map((code) => mechanicService.getMechanicDashboard(companyDb, code))
        );

        const dashboardGroupByKey = new Map();
        const dashboardGroupKeyByWorkEntry = new Map();
        mechanicResults
          .filter((result) => result.status === 'fulfilled')
          .forEach((result) => {
            const dashboardItems = extractMechanicDashboardItems(result.value);
            dashboardItems.forEach((item, itemIndex) => {
              const nestedEntries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
              const candidateEntries = nestedEntries.length > 0 ? nestedEntries : [item];

              candidateEntries.forEach((entry, entryIndex) => {
                const resolvedEntryId = resolveWorkEntryIdentifier(entry);
                const exactRecord = exactWorkEntryById.get(resolvedEntryId) || entry;
                const viewEntry = buildWorkEntryView(exactRecord, item, `md-${itemIndex}-${entryIndex}-`);
                const workEntryKey = toCleanString(viewEntry?.workEntryDocEntry);
                if (!isValidWorkEntryId(workEntryKey)) return;
                const jobCardRef = toCleanString(item?.DocEntry || item?.JobCardDocEntry || item?.JobCardNo || item?.JCDocEnt || item?.JCDocNum || 'NA');
                const faultRef = toCleanString(viewEntry?.faultKey || item?.FaultLine || item?.FaultCode || item?.Fault || `NOFAULT-${itemIndex}`);
                const groupKey = `${jobCardRef}::${faultRef}`;

                if (!dashboardGroupByKey.has(groupKey)) {
                  dashboardGroupByKey.set(groupKey, {
                    key: `dashboard-group-${groupKey}`,
                    jobCardDocEntry: item?.DocEntry || item?.JobCardDocEntry || item?.JCDocEnt || item?.JobCardNo || 'NA',
                    jobCardNo: item?.JobCardNo || item?.DocNum || item?.JCDocNum || item?.DocEntry || 'NA',
                    busNo: getBusLabel(item),
                    complaintType: item?.ComplaintType || item?.JobType || item?.FormType || '',
                    driverCode: item?.DrvCode || item?.DriverCode || item?.Driver || '',
                    driverName: item?.DrvName || item?.DriverName || item?.Driver || '',
                    status: item?.Status || item?.WorkStatus || 'AWAITING VERIFICATION',
                    complaintNo: item?.ComplaintNo || item?.IncidentNo || '',
                    workEntries: [],
                  });
                }
                dashboardGroupByKey.get(groupKey).workEntries.push(viewEntry);
                dashboardGroupKeyByWorkEntry.set(workEntryKey, groupKey);
              });
            });
          });

        const fallbackCardsByGroup = new Map();
        Array.from(unresolvedWorkEntryIds).forEach((workEntryId) => {
          const key = toCleanString(workEntryId);
          if (!isValidWorkEntryId(key)) return;
          const groupKey = dashboardGroupKeyByWorkEntry.get(key);
          if (!groupKey) return;
          const matchedGroup = dashboardGroupByKey.get(groupKey);
          if (!matchedGroup) return;
          fallbackCardsByGroup.set(groupKey, {
            ...matchedGroup,
            allWorkEntriesCompleted: matchedGroup.workEntries.length > 0 && matchedGroup.workEntries.every((entry) => entry.completed),
          });
          unresolvedWorkEntryIds.delete(toCleanString(workEntryId));
        });

        const fallbackCards = Array.from(fallbackCardsByGroup.values());

        if (fallbackCards.length > 0) {
          normalized.unshift(...fallbackCards);
        }
      }

      // Do not render unresolved/blank work entries in the supervisor queue.

      const normalizedWithParts = normalized.map((card) => ({
        ...card,
        workEntries: (Array.isArray(card?.workEntries) ? card.workEntries : []).map((entry) => {
          const workEntryKey = toCleanString(entry?.workEntryDocEntry);
          const fallbackParts = workEntryKey ? (partRequestsByWorkEntry.get(workEntryKey) || []) : [];
          return {
            ...entry,
            parts: mergeParts(entry?.parts, fallbackParts),
          };
        }),
      }));

      if (focusJobCard) {
        normalizedWithParts.sort((a, b) => {
          const aFocus = String(a?.jobCardDocEntry || a?.jobCardNo || '').trim() === focusJobCard ? 1 : 0;
          const bFocus = String(b?.jobCardDocEntry || b?.jobCardNo || '').trim() === focusJobCard ? 1 : 0;
          return bFocus - aFocus;
        });
      }

      if (focusWorkEntry) {
        normalizedWithParts.sort((a, b) => {
          const aHasEntry = (Array.isArray(a?.workEntries) ? a.workEntries : []).some(
            (entry) => toCleanString(entry?.workEntryDocEntry) === focusWorkEntry
          ) ? 1 : 0;
          const bHasEntry = (Array.isArray(b?.workEntries) ? b.workEntries : []).some(
            (entry) => toCleanString(entry?.workEntryDocEntry) === focusWorkEntry
          ) ? 1 : 0;
          return bHasEntry - aHasEntry;
        });
      }

      let focusedSelection = null;
      if (focusWorkEntry && consumedFocusEntryRef.current !== focusWorkEntry) {
        for (const card of normalizedWithParts) {
          const entries = Array.isArray(card?.workEntries) ? card.workEntries : [];
          const match = entries.find((entry) => toCleanString(entry?.workEntryDocEntry) === focusWorkEntry);
          if (match) {
            focusedSelection = { entry: match, parentItem: card };
            break;
          }
        }
      }

      setReviewCards(normalizedWithParts);
      if (focusedSelection) {
        consumedFocusEntryRef.current = focusWorkEntry;
        setSelectedWorkEntry(focusedSelection);
        if (focusWorkEntry || focusJobCard) {
          navigation.setParams({
            focusWorkEntryDocEntry: null,
            focusJobCardDocEntry: null,
            workEntryDocEntry: null,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load review work entries:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Unable to load review queue.' });
      setReviewCards([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, focusJobCard, focusWorkEntry, storedNotifications, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const resolveCurrentUserCode = () => toCleanString(
    user?.User
    || user?.user
    || user?.username
    || user?.Code
    || user?.code
    || user?.Name
    || user?.name
    || ''
  );

  const updateLocalWorkEntryState = useCallback((workEntryDocEntry, updater) => {
    const target = toCleanString(workEntryDocEntry);
    if (!target) return;

    setReviewCards((prev) => {
      const next = (Array.isArray(prev) ? prev : [])
        .map((card) => {
          const entries = (Array.isArray(card?.workEntries) ? card.workEntries : []).map((entry) => {
            const entryId = toCleanString(entry?.workEntryDocEntry);
            if (entryId !== target) return entry;
            return updater(entry, card) || entry;
          });

          const filteredEntries = entries.filter(Boolean);
          if (filteredEntries.length === 0) return null;

          return {
            ...card,
            workEntries: filteredEntries,
            allWorkEntriesCompleted: filteredEntries.length > 0 && filteredEntries.every((entry) => entry.completed),
          };
        })
        .filter(Boolean);

      return next;
    });
  }, []);

  const resetPreviewTransform = useCallback(() => {
    setPreviewScale(1);
    currentBaseScale.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    panTranslate.setOffset({ x: 0, y: 0 });
    panTranslate.setValue({ x: 0, y: 0 });
  }, [baseScale, panTranslate, pinchScale]);

  const openImagePreview = async (imageRecord) => {
    if (!imageRecord?.fileName) return;
    try {
      setPreviewLoading(true);
      const response = await workEntryService.getWorkEntryImageBase64(imageRecord.fileName);
      const rawBase64 = extractBase64Content(response);
      if (!rawBase64) {
        throw new Error('Image data not returned by server.');
      }
      const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      const contentType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(rawBase64)?.[1] || 'image/jpeg';
      setPreviewImage({
        fileName: imageRecord.fileName,
        uri: `data:${contentType};base64,${cleanBase64}`,
      });
      resetPreviewTransform();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Preview failed', text2: error?.message || 'Unable to load image.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleZoomIn = () => {
    setPreviewScale((prev) => {
      const next = Math.min(4, Number((prev + 0.25).toFixed(2)));
      currentBaseScale.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      return next;
    });
  };

  const handleZoomOut = () => {
    setPreviewScale((prev) => {
      const next = Math.max(1, Number((prev - 0.25).toFixed(2)));
      currentBaseScale.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      if (next <= 1) {
        panTranslate.setOffset({ x: 0, y: 0 });
        panTranslate.setValue({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    if (event?.nativeEvent?.oldState === GestureState.ACTIVE) {
      const nextScale = Math.max(1, Math.min(4, currentBaseScale.current * (event?.nativeEvent?.scale || 1)));
      currentBaseScale.current = nextScale;
      baseScale.setValue(nextScale);
      pinchScale.setValue(1);
      setPreviewScale(Number(nextScale.toFixed(2)));
    }
  };

  const handleApproveWorkEntry = async () => {
    const selected = selectedWorkEntry;
    const workEntryDocEntry = toCleanString(selected?.entry?.workEntryDocEntry);
    if (!workEntryDocEntry) {
      Toast.show({
        type: 'error',
        text1: 'Missing work entry',
        text2: 'Unable to identify this work entry for verification.',
      });
      return;
    }

    const remarks = toCleanString(approvalRemarks) || 'Verified Successfully.';

    try {
      setActioningWorkEntry(workEntryDocEntry);
      const reviewPayload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: resolveCurrentUserCode(),
        Status: 'SV',
        Remarks: remarks,
        JobCardEntry: Number(selected?.entry?.jobCardDocEntry) || selected?.entry?.jobCardDocEntry,
      };
      const response = route?.params?.repair
        ? await repairService.reviewRepairJobCard(reviewPayload)
        : await workEntryService.verifyWorkEntry(reviewPayload);
      if (response?.Success === false || response?.Status === false) {
        throw new Error(response?.Message || 'Unable to approve work entry.');
      }

      updateLocalWorkEntryState(workEntryDocEntry, (entry) => ({
        ...entry,
        status: 'SV',
        completed: true,
        verifyBy: resolveCurrentUserCode(),
        verifyRemarks: remarks,
      }));
      setSelectedWorkEntry((prev) => {
        if (!prev) return prev;
        if (toCleanString(prev?.entry?.workEntryDocEntry) !== workEntryDocEntry) return prev;
        return {
          ...prev,
          entry: {
            ...prev.entry,
            status: 'SV',
            completed: true,
            verifyBy: resolveCurrentUserCode(),
            verifyRemarks: remarks,
          },
        };
      });
      setSelectedWorkEntry(null);
      setApprovalRemarks('');
      consumedFocusEntryRef.current = '';
      navigation.setParams({
        focusWorkEntryDocEntry: null,
        focusJobCardDocEntry: null,
        workEntryDocEntry: null,
        repair: null,
      });
      const reviewIncidentType = String(
        selected?.parentItem?.complaintType
        || selected?.entry?.complaintType
        || ''
      ).trim().toLowerCase();
      const isBreakdownReview = reviewIncidentType.includes('breakdown') || reviewIncidentType === 'b';
      const shouldOfferDriverComplaint = Boolean(route?.params?.createDriverComplaintAfterApproval) || isBreakdownReview;
      if (shouldOfferDriverComplaint) {
        const entry = selected?.entry || {};
        const parent = selected?.parentItem || {};
        const workSummary = (Array.isArray(entry?.workDetails) ? entry.workDetails : [])
          .map((detail) => detail?.WorkDone || detail?.OtherDescription || detail?.Description || '')
          .filter(Boolean)
          .join('; ');
        const prefilledIncident = {
          incidentType: 'Driver Complaint',
          vehicleNumber: entry?.vehicle || parent?.busNo || '',
          driverCode: parent?.driverCode || '',
          driverName: parent?.driverName || '',
          routeNo: parent?.routeNo || '',
          routeName: parent?.routeNo || '',
          location: entry?.depot || parent?.depot || '',
          faults: [{
            Fault: entry?.faultName || 'Follow-up repair required',
            Description: [workSummary, entry?.finalRemarks].filter(Boolean).join(' — '),
            Code: entry?.faultCode || '',
          }],
        };
        console.log('[ReviewWorkEntries] Offering Driver Complaint follow-up:', JSON.stringify({
          workEntryDocEntry,
          fromLbweNotification: Boolean(route?.params?.createDriverComplaintAfterApproval),
          isBreakdownReview,
        }));
        setPendingDriverComplaint(prefilledIncident);
      }
      Toast.show({ type: 'success', text1: 'Work entry approved' });
    } catch (error) {
      const message = String(error?.message || 'Unable to approve work entry.');
      Toast.show({
        type: 'error',
        text1: 'Approval failed',
        text2: message.includes('not authorized')
          ? 'Supervisor is not authorized for this action on backend. Please ask backend to allow supervisor verification endpoint.'
          : message,
      });
    } finally {
      setActioningWorkEntry(null);
    }
  };

  const openDenyFlow = () => {
    setApprovalRemarks('');
    setDenyReason('');
    setShowDenyModal(true);
  };

  const isDriverComplaintEntry = (selection) => {
    const type = String(
      selection?.entry?.complaintType
      || selection?.parentItem?.ComplaintType
      || selection?.parentItem?.FormType
      || ''
    ).trim().toLowerCase();
    return type.includes('driver') || type.includes('complaint');
  };

  const openTeamReassignment = async ({ jobCardEntry, depot, reason = '', excludedTeamCode = '' }) => {
    const resolvedJobCardEntry = String(jobCardEntry || '').trim();
    const resolvedDepot = String(depot || '').trim();
    if (!resolvedJobCardEntry) {
      Toast.show({ type: 'error', text1: 'Job card is missing', text2: 'Cannot assign another maintenance team.' });
      return;
    }
    if (!resolvedDepot) {
      Toast.show({ type: 'error', text1: 'Depot is missing', text2: 'Cannot load another maintenance team.' });
      return;
    }
    try {
      const response = await masterService.getTeamByDepot(dbName || 'MUTSPL_TEST', resolvedDepot);
      const teams = extractRows(response).filter(team => (
        String(team?.Active || 'Y').trim().toUpperCase() === 'Y'
        && String(team?.TeamCode || team?.Code || '').trim() !== String(excludedTeamCode).trim()
      ));
      if (teams.length === 0) throw new Error('No active maintenance teams are available for this depot.');
      setReassignmentTarget({ jobCardEntry: resolvedJobCardEntry, reason, depot: resolvedDepot });
      setReassignmentTeams(teams);
      setSelectedReassignmentTeam(null);
      setReassignmentRemarks(reason);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load teams', text2: error?.message || 'Please try again.' });
    }
  };

  const closeTeamReassignment = () => {
    setReassignmentTarget(null);
    setSelectedReassignmentTeam(null);
    setReassignmentRemarks('');
    navigation.setParams({ teamRejection: null });
  };

  const submitTeamReassignment = async () => {
    const jobCardEntry = reassignmentTarget?.jobCardEntry;
    const teamCode = selectedReassignmentTeam?.TeamCode || selectedReassignmentTeam?.Code;
    if (!jobCardEntry || !teamCode) {
      Toast.show({ type: 'error', text1: 'Select a team', text2: 'Choose the maintenance team for this job card.' });
      return;
    }
    try {
      setActioningWorkEntry(String(jobCardEntry));
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await teamService.updateAssignTeam(
        companyDb,
        jobCardEntry,
        teamCode,
        resolveCurrentUserCode(),
        reassignmentRemarks.trim(),
      );
      if (response?.Success === false || response?.Status === false) throw new Error(response?.Message || 'Unable to reassign job card.');
      closeTeamReassignment();
      Toast.show({ type: 'success', text1: 'Job card reassigned', text2: 'The new team leader can now accept and assign the faults.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Reassignment failed', text2: error?.message || 'Please try again.' });
    } finally {
      setActioningWorkEntry(null);
    }
  };

  useEffect(() => {
    const notification = route?.params?.teamRejection;
    if (!notification || reassignmentTarget) return;
    openTeamReassignment(notification);
  }, [route?.params?.teamRejection]);

  const handleDenyWorkEntry = async () => {
    const selected = selectedWorkEntry;
    const workEntryDocEntry = toCleanString(selected?.entry?.workEntryDocEntry);
    const reason = toCleanString(denyReason);

    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Missing work entry', text2: 'Unable to identify this work entry.' });
      return;
    }

    if (!reason) {
      Toast.show({ type: 'error', text1: 'Reason required', text2: 'Enter a reason to deny this work entry.' });
      return;
    }

    try {
      setActioningWorkEntry(workEntryDocEntry);

      const reviewPayload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: resolveCurrentUserCode(),
        Status: 'RW',
        Remarks: reason,
        JobCardEntry: Number(selected?.entry?.jobCardDocEntry) || selected?.entry?.jobCardDocEntry,
      };
      const response = route?.params?.repair
        ? await repairService.reviewRepairJobCard(reviewPayload)
        : await workEntryService.verifyWorkEntry(reviewPayload);

      if (response?.Success === false || response?.Status === false) {
        throw new Error(response?.Message || 'Unable to deny work entry.');
      }

      updateLocalWorkEntryState(workEntryDocEntry, (entry) => ({
        ...entry,
        status: 'RW',
        completed: false,
        verifyBy: resolveCurrentUserCode(),
        verifyRemarks: reason,
      }));

      setSelectedWorkEntry((prev) => {
        if (!prev) return prev;
        if (toCleanString(prev?.entry?.workEntryDocEntry) !== workEntryDocEntry) return prev;
        return {
          ...prev,
          entry: {
            ...prev.entry,
            status: 'RW',
            completed: false,
            verifyBy: resolveCurrentUserCode(),
            verifyRemarks: reason,
          },
        };
      });

      setShowDenyModal(false);
      setDenyReason('');
      navigation.setParams({
        focusWorkEntryDocEntry: null,
        focusJobCardDocEntry: null,
        workEntryDocEntry: null,
        repair: null,
      });
      if (!route?.params?.repair && isDriverComplaintEntry(selected)) {
        openTeamReassignment({
          jobCardEntry: selected?.entry?.jobCardDocEntry,
          depot: selected?.entry?.depot || selected?.parentItem?.Depot || selected?.parentItem?.Branch,
          reason,
        });
      }
      Toast.show({ type: 'success', text1: 'Work entry denied' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Deny failed', text2: error?.message || 'Unable to deny work entry.' });
    } finally {
      setActioningWorkEntry(null);
    }
  };

  const renderWorkEntry = (entry, parentItem) => {
    const statusTone = getStatusTone(entry.status);
    const workDetailsCount = (Array.isArray(entry.workDetails) ? entry.workDetails : []).length;
    const imageCount = (Array.isArray(entry.images) ? entry.images : []).length;

    return (
      <TouchableOpacity
        key={entry.key}
        style={[styles.workEntryCard, { borderColor: colors.border || '#E0E0E0', backgroundColor: colors.light }]}
        onPress={() => setSelectedWorkEntry({ entry, parentItem })}
        activeOpacity={0.85}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.workEntryTitle, { color: colors.dark }]}>Work Entry #{entry.workEntryDocEntry || '-'}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
            <Text style={[styles.statusPillText, { color: statusTone.fg }]}>{getStatusLabel(entry.status)}</Text>
          </View>
        </View>

        <Text style={[styles.metaText, { color: colors.gray }]}>Mechanic: {entry.mechanicName}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>Fault: {entry.faultName}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>Date: {entry.date ? formatDate(entry.date) : '-'} {entry.time ? ` ${formatTime(entry.time)}` : ''}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>Start: {formatDateTimeToken(entry.startDate, entry.startTime)}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>End: {formatDateTimeToken(entry.completeDate, entry.completeTime)}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>Labour: {entry.labourHoursDisplay || '-'}</Text>
        <Text style={[styles.metaText, { color: colors.gray }]}>Remarks: {entry.finalRemarks || '-'}</Text>
        <View style={styles.quickStatsRow}>
          <Text style={[styles.quickStatPill, { color: colors.dark, borderColor: colors.border || '#E0E0E0' }]}>Details: {workDetailsCount}</Text>
          <Text style={[styles.quickStatPill, { color: colors.dark, borderColor: colors.border || '#E0E0E0' }]}>Images: {imageCount}</Text>
        </View>
        <View style={styles.tapHintRow}>
          <Text style={[styles.tapHint, { color: colors.primary }]}>Tap to review and decide</Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCard = (item) => {
    return (
      <View key={item.key} style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.dark }]}>Job Card #{item.jobCardNo || item.jobCardDocEntry}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.gray }]}>Bus #{item.busNo} {item.complaintNo ? `• Incident #${item.complaintNo}` : ''}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: '#6D28D920' }]}>
            <Text style={[styles.statusPillText, { color: '#6D28D9' }]}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>

        <Text style={[styles.summaryText, { color: colors.gray }]}>Work entries: {(Array.isArray(item.workEntries) ? item.workEntries : []).length}</Text>

        {(Array.isArray(item.workEntries) ? item.workEntries : []).length === 0 ? (
          <Text style={[styles.metaText, { color: colors.gray }]}>No work-entry history available for review.</Text>
        ) : (
          (Array.isArray(item.workEntries) ? item.workEntries : []).map((entry) => renderWorkEntry(entry, item))
        )}
        <Text style={[styles.metaText, { color: colors.gray }]}>Open each work entry to Approve or Deny after reviewing details and images.</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: '#F3F6FB' }]}> 
      <ScreenHeader
        title="Review Work Entries"
        subtitle="Supervisor Verification Queue"
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={true}
        useGradient={false}
      />

      {loading ? (
        <Loader visible={true} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {(Array.isArray(reviewCards) ? reviewCards : []).length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="check-circle" size={42} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No work entries are pending verification.</Text>
            </View>
          ) : (
            (Array.isArray(reviewCards) ? reviewCards : []).map(renderCard)
          )}
        </ScrollView>
      )}

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => {
        setPreviewImage(null);
        resetPreviewTransform();
      }}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewContainer, { backgroundColor: colors.white }]}> 
            <View style={styles.previewHeader}>
              <Text style={[styles.previewTitle, { color: colors.dark }]} numberOfLines={1}>Image Preview</Text>
              <View style={styles.previewActions}>
                <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} disabled={previewScale <= 1}>
                  <MaterialIcons name="remove" size={18} color={previewScale <= 1 ? '#9CA3AF' : colors.dark} />
                </TouchableOpacity>
                <Text style={[styles.zoomLabel, { color: colors.gray }]}>{Math.round(previewScale * 100)}%</Text>
                <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomIn} disabled={previewScale >= 4}>
                  <MaterialIcons name="add" size={18} color={previewScale >= 4 ? '#9CA3AF' : colors.dark} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setPreviewImage(null);
                    resetPreviewTransform();
                  }}
                  style={[styles.zoomBtn, { marginLeft: 6 }]}
                > 
                  <MaterialIcons name="close" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>
            </View>
            {previewLoading ? (
              <View style={styles.previewLoaderWrap}>
                <Loader visible={true} text="Loading image..." />
              </View>
            ) : previewImage?.uri ? (
              <View style={styles.previewImageWrap}>
                <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchStateChange}>
                  <Animated.View style={styles.previewImageGestureWrap}>
                    <PanGestureHandler enabled={previewScale > 1} onGestureEvent={onPanGestureEvent} onHandlerStateChange={onPanStateChange}>
                      <Animated.View style={styles.previewImageGestureWrap}>
                        <Animated.Image
                          source={{ uri: previewImage.uri }}
                          style={[styles.previewImage, { transform: [{ scale: combinedScale }, { translateX: panTranslate.x }, { translateY: panTranslate.y }] }]}
                          resizeMode="contain"
                        />
                      </Animated.View>
                    </PanGestureHandler>
                  </Animated.View>
                </PinchGestureHandler>
              </View>
            ) : (
              <Text style={[styles.metaText, { color: colors.gray }]}>Unable to load image.</Text>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!reassignmentTarget} transparent animationType="slide" onRequestClose={closeTeamReassignment}>
        <View style={styles.previewOverlay}>
          <View style={[styles.denyModal, { backgroundColor: colors.white }]}>
            <Text style={[styles.previewTitle, { color: colors.dark }]}>Assign a different team</Text>
            <Text style={[styles.metaText, { color: colors.gray }]}>Select a team at {reassignmentTarget?.depot} to receive the rejected job card.</Text>
            {reassignmentTeams.map((team) => {
              const teamCode = team?.TeamCode || team?.Code;
              const selected = selectedReassignmentTeam === team;
              return <TouchableOpacity key={teamCode} onPress={() => setSelectedReassignmentTeam(team)} style={[styles.teamOption, { borderColor: selected ? colors.primary : colors.border || '#E0E0E0', backgroundColor: selected ? `${colors.primary}12` : 'transparent' }]}>
                <Text style={{ color: colors.dark, fontWeight: '700' }}>{team?.TeamName || teamCode}</Text>
                <Text style={{ color: colors.gray }}>{team?.Leader || 'Team leader'}{teamCode ? ` - ${teamCode}` : ''}</Text>
              </TouchableOpacity>;
            })}
            <TextInput
              label="Remarks"
              mode="outlined"
              value={reassignmentRemarks}
              onChangeText={setReassignmentRemarks}
              multiline
              numberOfLines={3}
              style={{ marginTop: SPACING.sm }}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.gray }]} onPress={closeTeamReassignment}><Text style={styles.actionBtnText}>Later</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={submitTeamReassignment} disabled={!selectedReassignmentTeam || !!actioningWorkEntry}><Text style={styles.actionBtnText}>Assign team</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedWorkEntry} transparent animationType="slide" onRequestClose={() => setSelectedWorkEntry(null)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.detailModal, { backgroundColor: colors.white }]}> 
            <View style={styles.previewHeader}>
              <Text style={[styles.previewTitle, { color: colors.dark }]} numberOfLines={1}>
                Work Entry #{selectedWorkEntry?.entry?.workEntryDocEntry || '-'}
              </Text>
              <TouchableOpacity onPress={() => setSelectedWorkEntry(null)}>
                <MaterialIcons name="close" size={22} color={colors.dark} />
              </TouchableOpacity>
            </View>

            {selectedWorkEntry ? (() => {
              const entry = selectedWorkEntry.entry || {};
              const statusTone = getStatusTone(entry?.status);
              const overviewRows = [
                { label: 'Mechanic', value: entry?.mechanicName || '-' },
                { label: 'Mechanic Code', value: entry?.mechanicCode || '-' },
                { label: 'Vehicle', value: entry?.vehicle || '-' },
                { label: 'Depot', value: entry?.depot || '-' },
                { label: 'Job Card', value: entry?.jobCardDocEntry || '-' },
                { label: 'Work Entry No', value: entry?.docNum || '-' },
              ];

              const faultRows = [
                { label: 'Fault', value: entry?.faultName || '-' },
                { label: 'Fault Code', value: entry?.faultCode || '-' },
                { label: 'Fault Line', value: entry?.faultLine || '-' },
                { label: 'Labour Hours', value: entry?.labourHoursDisplay || '-' },
              ];

              const timelineRows = [
                { label: 'Accepted', value: formatDateTimeToken(entry?.acceptDate, entry?.acceptTime) },
                { label: 'Started', value: formatDateTimeToken(entry?.startDate, entry?.startTime) },
                { label: 'Ended', value: formatDateTimeToken(entry?.completeDate, entry?.completeTime) },
                { label: 'Verified', value: formatDateTimeToken(entry?.verifyDate, entry?.verifyTime) },
                { label: 'Total Labour', value: entry?.labourHoursDisplay || '-' },
              ];

              const verificationRows = [
                { label: 'Status', value: getStatusLabel(entry?.status) },
                { label: 'Verified By', value: entry?.verifyBy || '-' },
                { label: 'Verify Remarks', value: entry?.verifyRemarks || '-' },
                { label: 'Final Remarks', value: entry?.finalRemarks || '-' },
              ];

              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                  <View style={[styles.infoCard, { borderColor: colors.border || '#E5E7EB' }]}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.infoCardTitle, { color: colors.dark }]}>Overview</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
                        <Text style={[styles.statusPillText, { color: statusTone.fg }]}>{getStatusLabel(entry?.status)}</Text>
                      </View>
                    </View>
                    <View style={styles.infoGrid}>
                      {overviewRows.map((row) => (
                        <View key={`overview-${row.label}`} style={[styles.infoCell, { borderColor: colors.border || '#E5E7EB' }]}>
                          <Text style={[styles.infoLabel, { color: colors.gray }]}>{row.label}</Text>
                          <Text style={[styles.infoValue, { color: colors.dark }]}>{row.value || '-'}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.infoCard, { borderColor: colors.border || '#E5E7EB' }]}>
                    <Text style={[styles.infoCardTitle, { color: colors.dark }]}>Fault Details</Text>
                    {faultRows.map((row) => (
                      <View key={`fault-${row.label}`} style={styles.infoRow}>
                        <Text style={[styles.infoRowLabel, { color: colors.gray }]}>{row.label}</Text>
                        <Text style={[styles.infoRowValue, { color: colors.dark }]}>{row.value || '-'}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.infoCard, { borderColor: colors.border || '#E5E7EB' }]}>
                    <Text style={[styles.infoCardTitle, { color: colors.dark }]}>Timeline</Text>
                    {timelineRows.map((row) => (
                      <View key={`timeline-${row.label}`} style={styles.infoRow}>
                        <Text style={[styles.infoRowLabel, { color: colors.gray }]}>{row.label}</Text>
                        <Text style={[styles.infoRowValue, { color: colors.dark }]}>{row.value || '-'}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.infoCard, { borderColor: colors.border || '#E5E7EB' }]}>
                    <Text style={[styles.infoCardTitle, { color: colors.dark }]}>Verification</Text>
                    {verificationRows.map((row) => (
                      <View key={`verification-${row.label}`} style={styles.infoRow}>
                        <Text style={[styles.infoRowLabel, { color: colors.gray }]}>{row.label}</Text>
                        <Text style={[styles.infoRowValue, { color: colors.dark }]}>{row.value || '-'}</Text>
                      </View>
                    ))}
                  </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.imageLabel, { color: colors.dark }]}>Work Details ({(Array.isArray(entry?.workDetails) ? entry.workDetails : []).length})</Text>
                  {(Array.isArray(entry?.workDetails) ? entry.workDetails : []).length === 0 ? (
                    <Text style={[styles.metaText, { color: colors.gray }]}>No work details available.</Text>
                  ) : (
                    (Array.isArray(entry?.workDetails) ? entry.workDetails : []).map((detail) => (
                      <View key={detail.id} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                        <Text style={[styles.detailCode, { color: colors.dark }]}>{detail.workCode || 'WORK'}</Text>
                        <Text style={[styles.metaText, { color: colors.dark }]}>{detail.workDone || '-'}</Text>
                        {detail.otherDescription ? <Text style={[styles.metaText, { color: colors.gray }]}>Other: {detail.otherDescription}</Text> : null}
                        {detail.remarks ? <Text style={[styles.metaText, { color: colors.gray }]}>Remarks: {detail.remarks}</Text> : null}
                        <View style={[styles.entryTimeRow, { borderTopColor: colors.border || '#E5E7EB' }]}>
                          <MaterialIcons name="schedule" size={14} color={colors.gray} />
                          <Text style={[styles.entryTimeText, { color: colors.gray }]}>Logged At: {formatDateTimeToken(detail.entryDate, detail.entryTime)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.imageLabel, { color: colors.dark }]}>Images</Text>
                  {(Array.isArray(entry?.images) ? entry.images : []).length === 0 ? (
                    <Text style={[styles.metaText, { color: colors.gray }]}>No images available.</Text>
                  ) : (
                    (Array.isArray(entry?.images) ? entry.images : []).map((img) => (
                      <TouchableOpacity
                        key={img.id}
                        style={[styles.imageRow, { borderColor: colors.border || '#E0E0E0' }]}
                        onPress={() => openImagePreview(img)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.imageLeft}>
                          <MaterialIcons name="image" size={16} color={colors.primary} />
                          <View>
                            <Text style={[styles.imageName, { color: colors.dark }]}>
                              {img.imgType === 'BF' ? 'Before image' : img.imgType === 'AF' ? 'After image' : 'Work image'}
                            </Text>
                            <Text style={[styles.imageFileName, { color: colors.gray }]} numberOfLines={1}>{img.fileName || '-'}</Text>
                            <Text style={[styles.imageFileName, { color: colors.gray }]}>Captured: {formatDateTimeToken(img.captureDate, img.captureTime)}</Text>
                            <Text style={[styles.imageFileName, { color: colors.gray }]}>Remarks: {img.remarks || '-'}</Text>
                          </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={18} color={colors.gray} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.imageLabel, { color: colors.dark }]}>Parts</Text>
                  {(Array.isArray(entry?.parts) ? entry.parts : []).length === 0 ? (
                    <Text style={[styles.metaText, { color: colors.gray }]}>No parts linked.</Text>
                  ) : (
                    (Array.isArray(entry?.parts) ? entry.parts : []).map((part, idx) => (
                      <View key={`part-${idx}`} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                        <Text style={[styles.metaText, { color: colors.dark }]}>Part: {part?.ItemName || part?.PartName || part?.ItemCode || '-'}</Text>
                        <Text style={[styles.metaText, { color: colors.gray }]}>Qty: {part?.Qty || part?.Quantity || '-'}</Text>
                        <Text style={[styles.metaText, { color: colors.gray }]}>Remarks: {part?.Remarks || '-'}</Text>
                      </View>
                    ))
                  )}
                </View>

                <TextInput
                  mode="outlined"
                  label="Supervisor remarks"
                  value={approvalRemarks}
                  onChangeText={setApprovalRemarks}
                  multiline
                  numberOfLines={3}
                  style={{ marginTop: 12, marginBottom: 10, backgroundColor: colors.white }}
                  outlineColor={colors.border || '#D0D0D0'}
                  activeOutlineColor={colors.primary}
                  placeholder="Enter approval remarks"
                />

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: '#2B7D2B',
                        opacity: actioningWorkEntry && toCleanString(selectedWorkEntry.entry?.workEntryDocEntry) === actioningWorkEntry ? 0.7 : 1,
                      },
                    ]}
                    onPress={handleApproveWorkEntry}
                    disabled={!!actioningWorkEntry || String(selectedWorkEntry?.entry?.status || '').trim().toUpperCase() === 'RW'}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="check-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Approve Work Entry</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: '#B91C1C',
                        opacity: actioningWorkEntry && toCleanString(selectedWorkEntry.entry?.workEntryDocEntry) === actioningWorkEntry ? 0.7 : 1,
                      },
                    ]}
                    onPress={openDenyFlow}
                    disabled={!!actioningWorkEntry || ['SV', 'CL', 'CM'].includes(String(selectedWorkEntry?.entry?.status || '').trim().toUpperCase())}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="cancel" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Deny Work Entry</Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              );
            })() : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pendingDriverComplaint)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDriverComplaint(null)}
      >
        <View style={styles.previewOverlay}>
          <View style={[styles.confirmModal, { backgroundColor: colors.white }]}>
            <MaterialIcons name="help-outline" size={38} color={colors.primary} style={{ alignSelf: 'center' }} />
            <Text style={[styles.previewTitle, { color: colors.dark, textAlign: 'center', marginTop: 10 }]}>Create Driver Complaint Incident?</Text>
            <Text style={[styles.metaText, { color: colors.gray, textAlign: 'center', marginTop: 8 }]}>Do you want to create a Driver Complaint incident using this approved work entry?</Text>
            <View style={[styles.actionsRow, { marginTop: 18 }]}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.gray }]} onPress={() => setPendingDriverComplaint(null)}>
                <Text style={styles.actionBtnText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const prefilledIncident = pendingDriverComplaint;
                  setPendingDriverComplaint(null);
                  navigation.navigate('CreateIncident', { type: 'complaint', prefilledIncident });
                }}
              >
                <Text style={styles.actionBtnText}>Create Incident</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDenyModal} transparent animationType="fade" onRequestClose={() => setShowDenyModal(false)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.denyModal, { backgroundColor: colors.white }]}> 
            <Text style={[styles.previewTitle, { color: colors.dark }]}>Deny Work Entry</Text>
            <Text style={[styles.metaText, { color: colors.gray }]}>Enter reason for denial</Text>
            <TextInput
              mode="outlined"
              value={denyReason}
              onChangeText={setDenyReason}
              multiline
              numberOfLines={4}
              style={styles.denyInput}
              placeholder="Reason"
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#94A3B8' }]}
                onPress={() => setShowDenyModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#B91C1C', opacity: actioningWorkEntry ? 0.7 : 1 }]}
                onPress={handleDenyWorkEntry}
                disabled={!!actioningWorkEntry}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>{actioningWorkEntry ? 'Submitting...' : 'Confirm Deny'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.lg },
  card: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  summaryText: { fontSize: 12, marginBottom: 10, fontWeight: '600' },
  workEntryCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: '#FFFFFF',
  },
  workEntryTitle: { fontSize: 14, fontWeight: '800' },
  metaText: { fontSize: 12, marginTop: 3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  imageLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  imageRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  imageLeft: { flexDirection: 'row', alignItems: 'center' },
  imageName: { marginLeft: 8, fontSize: 12, fontWeight: '600' },
  imageFileName: { marginLeft: 8, fontSize: 11, marginTop: 1, maxWidth: 220 },
  entryTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  entryTimeText: { marginTop: 0, marginLeft: 6, fontSize: 11, fontWeight: '600' },
  quickStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  quickStatPill: {
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
  },
  tapHintRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  tapHint: { fontSize: 12, fontWeight: '700' },
  detailRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: 6,
  },
  detailCode: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: '700', marginLeft: 6, fontSize: 13 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { marginTop: 10, fontSize: 13 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  previewContainer: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    minHeight: 280,
  },
  confirmModal: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  previewTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  previewActions: { flexDirection: 'row', alignItems: 'center' },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    backgroundColor: '#FFFFFF',
  },
  zoomLabel: { marginLeft: 8, fontSize: 12, fontWeight: '700', minWidth: 42, textAlign: 'center' },
  previewLoaderWrap: { minHeight: 220, justifyContent: 'center' },
  previewImageWrap: { width: '100%', height: 340, overflow: 'hidden', backgroundColor: '#00000008' },
  previewImageGestureWrap: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: 340, backgroundColor: '#00000008' },
  detailModal: {
    borderRadius: BORDER_RADIUS.lg,
    maxHeight: '90%',
    overflow: 'hidden',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  modalBody: {
    paddingBottom: 12,
    gap: 10,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: 10,
    backgroundColor: '#FAFAFA',
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  infoCell: {
    width: '50%',
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  infoRowLabel: {
    width: '38%',
    fontSize: 12,
    fontWeight: '600',
  },
  infoRowValue: {
    width: '60%',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  denyModal: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  teamOption: { borderWidth: 1, borderRadius: 6, padding: 10, marginTop: 10 },
  denyInput: {
    marginTop: 10,
    backgroundColor: 'transparent',
  },
});

export default ReviewWorkEntriesScreen;
