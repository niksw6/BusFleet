﻿﻿﻿﻿import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Text, Divider, TextInput as PaperTextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { complaintService, jobCardService, masterService, workEntryService, storeService, teamService, mechanicService } from '../../../api/services';
import ModalSelector from '../../../shared/components/ModalSelector';
import { formatDate, getStatusName, formatJobCardDisplayNo, getJobTypeCode } from '../../../utils/helpers';
import { isFieldStaffUser, isSupervisorUser } from '../../../utils/roleAccess';
import { renderTabContent as renderRichTabContent, buildTheme as buildRichTheme } from './WorkOrderRenderers.js';

/**
 * Work Order Detail Screen
 * Mimics HeavyVehicleInspection.com work order detail view
 * Shows Job Card details plus submitted mechanic Work Entries.
 */
const WorkOrderDetailScreen = ({ route, navigation }) => {
  const {
    jobCardNo,
    docEntry,
    jobType,
    complaintType: routeComplaintType,
    complaintNo,
    dbName: routeDbName,
    regTime: routeRegTime,
    complaintTime: routeComplaintTime,
    incidentTime: routeIncidentTime,
    mechanicCode: routeMechanicCode,
    mechanicName: routeMechanicName,
    mechanics: routeMechanics,
  } = route.params;
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const mechanicUser = isFieldStaffUser(user);
  const supervisorUser = isSupervisorUser(user);
  const inputBorderColor = colors.border || COLORS.border;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Mechanics');
  const [workOrder, setWorkOrder] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [parts, setParts] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [selectedPartIndex, setSelectedPartIndex] = useState(null);
  const [faultSelectionTarget, setFaultSelectionTarget] = useState({ type: null, key: null });
  const [loadingPartsData, setLoadingPartsData] = useState(true);
  const [loadingWarehousesData, setLoadingWarehousesData] = useState(true);
  const [workEntry, setWorkEntry] = useState({ description: '', hours: '' });
  const [mechanicWork, setMechanicWork] = useState([]);
  const [selectedMechanics, setSelectedMechanics] = useState([]);
  const [mechanicFaultMap, setMechanicFaultMap] = useState({});
  const [submittingWorkOrder, setSubmittingWorkOrder] = useState(false);
  const [workOrderEntries, setWorkOrderEntries] = useState([]);
  const [loadingWorkOrderEntries, setLoadingWorkOrderEntries] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workOrderExpandedMap, setWorkOrderExpandedMap] = useState({});
  const [mechanicPartRequests, setMechanicPartRequests] = useState([]);
  const [loadingMechanicPartRequests, setLoadingMechanicPartRequests] = useState(false);
  const [verifyingEntryId, setVerifyingEntryId] = useState(null);
  const [closingJobCard, setClosingJobCard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMechanicDetail, setSelectedMechanicDetail] = useState(null);
  const [mechanicDetailVisible, setMechanicDetailVisible] = useState(false);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState(null);
  const [previewImageTitle, setPreviewImageTitle] = useState('');

  const tabs = [
    { key: 'Details',     label: 'Details',      shortLabel: 'Info' },
    { key: 'Mechanics',   label: 'Mechanics',    shortLabel: 'Mechs' },
    { key: 'PartDetails', label: 'Part Details', shortLabel: 'Parts' },
    { key: 'WorkEntry',   label: 'Work Entry',   shortLabel: 'Entries' },
    { key: 'History',     label: 'History',      shortLabel: 'Log' },
  ];

  const getTabConfig = (key) => tabs.find((t) => t.key === key);

  const extractRows = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).find(Array.isArray) || [];
  };

  const extractDashboardItems = (data) => {
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

  const extractSingleRecord = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data[0] || null;
    if (!data || typeof data !== 'object') return null;
    return data;
  };

  const asWorkEntryId = (entry) => (
    entry?.WorkEntryDocEntry
    ?? entry?.WorkEntryNo
    ?? entry?.WorkEntry
    ?? entry?.DocEntry
    ?? null
  );

  const resolveUserCode = () => String(
    user?.Code
    || user?.code
    || user?.User
    || user?.user
    || user?.username
    || user?.name
    || ''
  ).trim();

  const getMechanicIdentityCandidates = (jobCardSnapshot = null) => {
    const source = jobCardSnapshot || workOrder || {};
    const values = [
      routeMechanicCode,
      ...(Array.isArray(source?.Mechanics) ? source.Mechanics.flatMap((mechanic) => [
        mechanic?.MechanicCode,
        mechanic?.MechCode,
        mechanic?.UserCode,
        mechanic?.Code,
      ]) : []),
      ...(Array.isArray(routeMechanics) ? routeMechanics.flatMap((mechanic) => [
        mechanic?.MechanicCode,
        mechanic?.MechCode,
        mechanic?.UserCode,
        mechanic?.Code,
      ]) : []),
      ...(Array.isArray(source?.Faults) ? source.Faults.flatMap((fault) => [
        fault?.MechanicCode,
        fault?.MechCode,
        fault?.UserCode,
        fault?.AssignedTo,
      ]) : []),
    ];

    // A mechanic can open their own Job Card directly. A supervisor must not
    // be used as the GetMechanicDashboard user, because that endpoint is a
    // mechanic-specific queue.
    if (mechanicUser) values.push(resolveUserCode());

    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  };

  const normalizePartRequestRow = (row, index) => ({
    key: `${row?.RequestCode || row?.WorkEntryDocEntry || 'REQ'}-${row?.PartLine || index}`,
    requestCode: String(row?.RequestCode || '').trim(),
    workEntryDocEntry: String(row?.WorkEntryDocEntry || '').trim(),
    jobCardDocEntry: String(row?.JobCardDocEntry || row?.JCDocEnt || '').trim(),
    itemCode: String(row?.ItemCode || '').trim(),
    itemName: String(row?.ItemName || row?.Name || row?.Dscription || row?.ItemCode || '').trim(),
    reqQty: Number(row?.ReqQty ?? row?.RequestedQty ?? row?.Qty ?? 0) || 0,
    approvedQty: Number(row?.ApprovedQty ?? row?.AprQty ?? 0) || 0,
    issuedQty: Number(row?.IssQty ?? row?.IssuedQty ?? 0) || 0,
    receivedQty: Number(row?.RecQty ?? row?.ReceivedQty ?? 0) || 0,
    warehouse: String(row?.Warehouse || row?.StoreWarehouse || row?.WhsCode || '').trim(),
    status: String(row?.Status || row?.ApprovalStatus || '').trim().toUpperCase(),
    remarks: String(row?.Remarks || '').trim(),
  });

  const getDisplayText = (...candidates) => {
    const extract = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) {
        return value.map((item) => extract(item)).filter(Boolean).join(', ');
      }
      if (typeof value === 'object') {
        const preferred = [
          value?.WorkDone,
          value?.WorkName,
          value?.Description,
          value?.Dscription,
          value?.Remarks,
          value?.OtherDescription,
          value?.FaultDesc,
          value?.FaultName,
          value?.ItemName,
          value?.Name,
          value?.WorkCode,
          value?.Code,
        ];
        for (const item of preferred) {
          const text = extract(item);
          if (text) return text;
        }
        return '';
      }
      return '';
    };

    for (const candidate of candidates) {
      const text = extract(candidate);
      if (text) return text;
    }
    return '';
  };

  const mapWorkEntryForView = (entry, index = 0) => ({
    ...entry,
    AssignedMechanics: entry?.MechanicName || entry?.MechName || entry?.UserName || entry?.UserCode || '-',
    MechanicStartDt: entry?.StartDate || entry?.CreateDate || entry?.EntryDate || entry?.DocDate || null,
    MechanicStartTm: entry?.StartTime || entry?.CreateTime || entry?.EntryTime || entry?.DocTime || null,
    MechanicsTotalHrs: entry?.LabourHours ?? entry?.TotalHrs ?? entry?.Hours ?? null,
    WorkDoneDetails: getDisplayText(entry?.WorkDone, entry?.FinalRemarks, entry?.Remarks, entry?.Description),
    DetailedFaults: Array.isArray(entry?.DetailedFaults) && entry.DetailedFaults.length > 0
      ? entry.DetailedFaults
      : (Array.isArray(entry?.Faults) && entry.Faults.length > 0
        ? entry.Faults
        : [{ FaultCode: entry?.FaultCode || entry?.Fault, FaultDesc: getDisplayText(entry?.FaultName, entry?.Description), Status: entry?.Status }]),
    DetailedParts: Array.isArray(entry?.DetailedParts) && entry.DetailedParts.length > 0
      ? entry.DetailedParts
      : (Array.isArray(entry?.Parts) ? entry.Parts : []),
    __fallbackKey: `entry-${asWorkEntryId(entry) || index}`,
  });

  const isApiSuccess = (response) => response?.Success !== false && response?.Status !== false;
  const getEntryStatus = (entry) => {
    const raw = entry?.Status ?? entry?.WorkStatus ?? entry?.FaultStatus ?? '';
    if (raw === null || raw === undefined || typeof raw === 'boolean' || raw === '') return '';
    return String(raw).trim().toUpperCase();
  };
  const isAwaitingSupervisorVerification = (entry) => ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(getEntryStatus(entry));
  const isSupervisorVerified = (entry) => ['SV', 'C', 'CM', 'COMPLETED', 'COMPLETE'].includes(getEntryStatus(entry));

  const setExpandedEntryKeys = (entries = []) => {
    setWorkOrderExpandedMap((prev) => {
      const next = { ...prev };
      entries.forEach((entry, index) => {
        const key = String(entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.DocNum || entry?.__fallbackKey || `entry-${index}`);
        if (next[key] === undefined) {
          next[key] = true;
        }
      });
      return next;
    });
  };

  const buildWorkEntriesByIds = async (companyDb, ids = []) => {
    const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const rows = await Promise.all(uniqueIds.map(async (id) => {
      try {
        const response = await workEntryService.getWorkEntry(companyDb, id);
        const record = extractSingleRecord(response);
        if (!record) return null;
        return { ...record, WorkEntryDocEntry: asWorkEntryId(record) || id };
      } catch (error) {
        console.log('GetWorkEntry fallback failed for id:', id, error?.message || error);
        return null;
      }
    }));

    return rows.filter(Boolean).map((entry, index) => mapWorkEntryForView(entry, index));
  };

  const hydrateFromMechanicDashboard = async (jobCardSnapshot = null) => {
    const companyDb = dbName || 'MUTSPL_TEST';
    const currentUserCode = resolveUserCode();
    let teamMemberRows = [];
    if (currentUserCode) {
      try {
        teamMemberRows = extractRows(await teamService.getMyTeamMembers(companyDb, currentUserCode));
      } catch (error) {
        // A mechanic/supervisor may not have a team-member mapping; their own
        // dashboard remains a valid source for the current Job Card.
      }
    }

    const teamMemberCodes = teamMemberRows.flatMap((member) => [
      member?.UserCode,
      member?.MechanicCode,
      member?.MechCode,
      member?.EmpCode,
      member?.Code,
    ]);
    const findTeamMember = (code) => teamMemberRows.find((member) => (
      String(member?.UserCode || member?.MechanicCode || member?.MechCode || member?.EmpCode || member?.Code || '').trim()
        === String(code || '').trim()
    ));
    const userCodes = [...new Set([
      ...getMechanicIdentityCandidates(jobCardSnapshot),
      ...teamMemberCodes.map((value) => String(value || '').trim()).filter(Boolean),
    ])];
    if (userCodes.length === 0) {
      return { faults: [], mechanics: [], workEntries: [], parts: [], operations: [] };
    }

    const source = jobCardSnapshot || workOrder || {};
    const targetDoc = String(source?.DocEntry || source?.JobCardDocEntry || docEntry || '').trim();
    const targetJobNo = String(source?.JobCardNo || jobCardNo || '').trim();

    const dashboardResults = await Promise.allSettled(
      userCodes.map(async (userCode) => ({
        userCode,
        response: await mechanicService.getMechanicDashboard(companyDb, userCode),
      }))
    );

    const rows = dashboardResults
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => extractDashboardItems(result.value?.response?.Data ?? result.value?.response)
        .map((row) => {
          const member = findTeamMember(result.value?.userCode);
          return {
            ...row,
            MechanicCode: row?.MechanicCode || result.value?.userCode,
            MechanicName: row?.MechanicName || row?.MechName || member?.MechanicName || member?.EmployeeName || member?.Name || routeMechanicName || result.value?.userCode,
          };
        }));

    const relatedRows = rows.filter((row) => {
      const rowDoc = String(row?.DocEntry || row?.JobCardDocEntry || '').trim();
      const rowJob = String(row?.JobCardNo || row?.DocNum || '').trim();
      return (targetDoc && rowDoc === targetDoc) || (targetJobNo && rowJob === targetJobNo);
    });

    const faults = relatedRows.map((row, index) => ({
      FaultCode: String(row?.FaultCode || row?.Fault || `FLT${index + 1}`).trim(),
      FaultDesc: String(row?.FaultName || row?.Description || row?.Fault || row?.FaultCode || '').trim(),
      Status: String(row?.Status || row?.FaultStatus || row?.WorkStatus || '').trim(),
    }));

    const mechanicMap = new Map();
    relatedRows.forEach((row, index) => {
      const name = String(
        row?.AssignedMechanic?.UserName
        || row?.MechanicName
        || row?.EmployeeName
        || row?.EmpName
        || row?.AssignedToName
        || ''
      ).trim();
      if (!name) return;
      const code = String(
        row?.AssignedMechanic?.Code
        || row?.MechanicCode
        || row?.EmpCode
        || row?.Code
        || ''
      ).trim();
      const key = `${name}-${code || index}`;
      if (!mechanicMap.has(key)) {
        mechanicMap.set(key, { MechName: name, MechanicName: name, MechanicCode: code });
      }
    });

    const nestedEntries = relatedRows.flatMap((row) => (
      Array.isArray(row?.WorkEntries)
        ? row.WorkEntries.map((entry) => ({
          ...row,
          ...entry,
          FaultCode: entry?.FaultCode || row?.FaultCode,
          Fault: entry?.Fault || row?.FaultCode || row?.FaultName,
          FaultName: entry?.FaultName || row?.FaultName,
          Vehicle: entry?.Vehicle || row?.Vehicle,
          MechanicCode: entry?.MechanicCode || row?.MechanicCode,
          MechanicName: entry?.MechanicName || row?.MechanicName,
        }))
        : []
    ));
    // A dashboard fault is not itself a work entry. Only its nested WorkEntries
    // belong in the WorkEntry tab; this avoids showing a phantom entry when a
    // mechanic has accepted a fault but has not submitted work yet.
    const sourceEntries = nestedEntries;

    const workEntries = sourceEntries
      .map((entry, index) => ({
        ...entry,
        WorkEntryDocEntry: asWorkEntryId(entry),
        AssignedMechanics: String(entry?.MechanicName || entry?.MechName || entry?.UserName || entry?.UserCode || '-').trim(),
        MechanicStartDt: entry?.StartDate || entry?.CreateDate || entry?.EntryDate || entry?.DocDate || null,
        MechanicStartTm: entry?.StartTime || entry?.CreateTime || entry?.EntryTime || entry?.DocTime || null,
        MechanicsTotalHrs: entry?.LabourHours ?? entry?.TotalHrs ?? entry?.Hours ?? null,
        WorkDoneDetails: getDisplayText(entry?.WorkDone, entry?.FinalRemarks, entry?.Remarks, entry?.Description),
        DetailedFaults: Array.isArray(entry?.Faults) && entry.Faults.length > 0
          ? entry.Faults
          : [{ FaultCode: entry?.FaultCode || entry?.Fault, FaultDesc: getDisplayText(entry?.FaultName, entry?.Description), Status: entry?.Status }],
        DetailedParts: Array.isArray(entry?.Parts) ? entry.Parts : [],
        __fallbackKey: `dash-${asWorkEntryId(entry) || index}`,
      }))
      .filter((entry) => entry?.WorkEntryDocEntry || entry?.WorkDoneDetails || entry?.AssignedMechanics);

    const parts = relatedRows.flatMap((row) => {
      const fault = row?.FaultCode || row?.Fault || row?.FaultName || '';
      const faultLine = row?.FaultLine ?? row?.LineId ?? '';
      const faultParts = Array.isArray(row?.Parts) ? row.Parts : [];
      const workEntryParts = (Array.isArray(row?.WorkEntries) ? row.WorkEntries : [])
        .flatMap((entry) => Array.isArray(entry?.Parts) ? entry.Parts : []);

      return [...faultParts, ...workEntryParts].map((part) => ({
        ...part,
        Fault: part?.Fault || part?.FaultCode || fault,
        FaultLine: part?.FaultLine ?? faultLine,
      }));
    });

    const operations = relatedRows.flatMap((row) => (
      (Array.isArray(row?.WorkEntries) ? row.WorkEntries : []).flatMap((entry) => (
        (Array.isArray(entry?.Details) ? entry.Details : []).map((detail) => ({
          ...detail,
          WorkEntryDocEntry: asWorkEntryId(entry),
          FaultCode: entry?.FaultCode || row?.FaultCode || row?.Fault,
          FaultDesc: getDisplayText(entry?.FaultName, row?.FaultName, row?.Description),
          MechanicName: entry?.MechanicName || row?.MechanicName,
          WorkDone: getDisplayText(detail?.WorkDone, detail?.Description, detail?.Dscription, detail?.WorkCode, detail),
          Remarks: getDisplayText(detail?.Remarks, detail?.OtherDescription),
        }))
      ))
    ));

    return {
      faults,
      mechanics: Array.from(mechanicMap.values()),
      workEntries,
      parts,
      operations,
    };
  };

  const extractDataRecord = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data[0] || null;
    if (!data || typeof data !== 'object') return null;

    const nestedCandidates = [
      data?.JobCard,
      data?.Header,
      data?.JobCardDetail,
      data?.JobCardDetails,
      data?.Record,
    ].filter((value) => value && typeof value === 'object' && !Array.isArray(value));

    const nestedRecord = nestedCandidates.find((value) => value?.DocEntry || value?.JobCardNo) || nestedCandidates[0] || null;
    const merged = nestedRecord ? { ...data, ...nestedRecord } : { ...data };

    if (!Array.isArray(merged.Faults) && Array.isArray(data?.Faults)) merged.Faults = data.Faults;
    if (!Array.isArray(merged.Mechanics) && Array.isArray(data?.Mechanics)) merged.Mechanics = data.Mechanics;
    if (!Array.isArray(merged.Parts) && Array.isArray(data?.Parts)) merged.Parts = data.Parts;
    if (!Array.isArray(merged.Operations) && Array.isArray(data?.Operations)) merged.Operations = data.Operations;
    if (!Array.isArray(merged.WorkEntries) && Array.isArray(data?.WorkEntries)) merged.WorkEntries = data.WorkEntries;

    return merged;
  };

  const findJobCardInList = (rows = [], referenceDocEntry, referenceJobCardNo) => {
    const refDoc = String(referenceDocEntry || '').trim();
    const refJobNo = String(referenceJobCardNo || '').trim();
    return (Array.isArray(rows) ? rows : []).find((row) => {
      const rowDoc = String(row?.DocEntry || row?.JobCardDocEntry || '').trim();
      const rowJob = String(row?.JobCardNo || row?.DocNum || '').trim();
      return (refDoc && rowDoc === refDoc) || (refJobNo && rowJob === refJobNo);
    }) || null;
  };

  const getBusLabel = (entity) => (
    String(
      entity?.BusNo
      || entity?.Vehicle
      || entity?.BusCode
      || entity?.BusRegistrationNo
      || entity?.RegNo
      || ''
    ).trim() || '-'
  );

  const normalizePartRow = (part, fallbackFaultCode = 'FLT001') => ({
    ...part,
    Fault: String(part?.Fault || part?.FaultCode || part?.FaultRef || fallbackFaultCode || '').trim(),
    ItemCode: String(part?.ItemCode || part?.Code || '').trim(),
    ItemName: String(part?.ItemName || part?.Name || '').trim(),
    ReqQty: Number(part?.ReqQty ?? part?.RequiredQty ?? part?.Qty ?? 0) || 0,
    AddQty: Number(part?.AddQty ?? 0) || 0,
    IssQty: Number(part?.IssQty ?? part?.IssuedQty ?? 0) || 0,
    Whs: String(part?.Whs || part?.WhsCode || part?.Warehouse || part?.StoreWarehouse || '').trim(),
    WhsName: String(part?.WhsName || part?.WarehouseName || '').trim(),
    Status: String(part?.Status || 'R').trim(),
  });

  const hasSubmittedWorkOrder = !loadingWorkOrderEntries && workOrderEntries.length > 0;
  // Multiple work orders per job card are allowed
  // Job Cards are the source of truth. Mechanics submit work through Fault Work;
  // this screen is read-only and surfaces those entries.
  const isWorkOrderLocked = true;
  const derivedMechanics = Array.from(new Map(
    (Array.isArray(workOrderEntries) ? workOrderEntries : [])
      .map((entry, index) => {
        const name = String(entry?.AssignedMechanics || entry?.MechanicName || entry?.MechName || '').trim();
        const code = String(entry?.MechanicCode || entry?.MechCode || entry?.UserCode || '').trim();
        if (!name || name === '-') return null;
        return [`${name}-${code || index}`, { MechName: name, MechanicName: name, MechanicCode: code }];
      })
      .filter(Boolean)
  ).values());
  const mechanicsForDisplay = Array.isArray(workOrder?.Mechanics) && workOrder.Mechanics.length > 0
    ? workOrder.Mechanics
    : derivedMechanics;
  const mechanicCount = mechanicsForDisplay.length;
  const partCount = Array.isArray(workOrder?.Parts) ? workOrder.Parts.length : 0;

  useFocusEffect(
    useCallback(() => {
      fetchWorkOrderDetails();
      fetchSpareParts();
      fetchWarehouses();
    }, [docEntry, jobCardNo, dbName])
  );

  const fetchRelatedWorkOrders = async (jobCardSnapshot = null, dashboardEntries = []) => {
    try {
      setLoadingWorkOrderEntries(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const historyRows = Array.isArray(dashboardEntries) ? dashboardEntries : [];
      if (historyRows.length === 0) {
        setWorkOrderEntries([]);
        return [];
      }

      const fullEntries = await Promise.all(
        historyRows.map(async (row) => {
          const workEntryId = asWorkEntryId(row);
          if (!workEntryId) return row;
          try {
            const fullResponse = await workEntryService.getWorkEntry(companyDb, workEntryId);
            const fullRecord = extractSingleRecord(fullResponse);
            return fullRecord ? { ...row, ...fullRecord } : row;
          } catch (entryError) {
          console.log('GetWorkEntry enrichment skipped for entry:', workEntryId, entryError?.message || entryError);
            return row;
          }
        })
      );

      const entries = fullEntries.map((entry, index) => mapWorkEntryForView(entry, index));

      setWorkOrderEntries(entries);
      setExpandedEntryKeys(entries);
      return entries;
    } catch (error) {
      console.error('Error fetching related work orders:', error);
      setWorkOrderEntries([]);
      return [];
    } finally {
      setLoadingWorkOrderEntries(false);
    }
  };

  const fetchMechanicPartRequests = async (jobCardSnapshot = null, workEntriesSnapshot = []) => {
    try {
      setLoadingMechanicPartRequests(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const sourceJobCard = jobCardSnapshot || workOrder || {};

      const jobCardRefs = new Set(
        [
          sourceJobCard?.DocEntry,
          sourceJobCard?.JobCardDocEntry,
          sourceJobCard?.JobCardNo,
          docEntry,
          jobCardNo,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );

      const workEntryRefs = new Set(
        (Array.isArray(workEntriesSnapshot) ? workEntriesSnapshot : [])
          .map((entry) => String(asWorkEntryId(entry) || '').trim())
          .filter(Boolean)
      );

      const response = await storeService.getMechanicPartRequests(companyDb);
      const rows = extractRows(response);

      const related = rows
        .filter((row) => {
          const rowJobCard = String(row?.JobCardDocEntry || row?.JCDocEnt || '').trim();
          const rowWorkEntry = String(row?.WorkEntryDocEntry || '').trim();
          return (rowJobCard && jobCardRefs.has(rowJobCard)) || (rowWorkEntry && workEntryRefs.has(rowWorkEntry));
        })
        .map(normalizePartRequestRow);

      setMechanicPartRequests(related);
      return related;
    } catch (error) {
      console.log('Unable to load mechanic part requests for job card:', error?.message || error);
      setMechanicPartRequests([]);
      return [];
    } finally {
      setLoadingMechanicPartRequests(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      setLoadingWarehousesData(true);
      const response = await masterService.getWarehouses(dbName || 'MUTSPL_TEST');
      if (response?.Success && Array.isArray(response.Data)) {
        setWarehouses(response.Data);
      } else {
        setWarehouses([]);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      setWarehouses([]);
    } finally {
      setLoadingWarehousesData(false);
    }
  };

  const fetchSpareParts = async () => {
    try {
      setLoadingPartsData(true);
      const response = await masterService.getSpareParts(dbName || 'MUTSPL_TEST');
      if (response?.Success && Array.isArray(response.Data)) {
        setSpareParts(response.Data);
      } else {
        setSpareParts([]);
      }
    } catch (error) {
      console.error('Error fetching spare parts:', error);
      setSpareParts([]);
    } finally {
      setLoadingPartsData(false);
    }
  };

  const getSelectedParts = () => workOrder?.Parts || [];

  const updateSelectedParts = (updatedParts) => {
    if (isWorkOrderLocked) return;
    setWorkOrder(prev => ({ ...(prev || {}), Parts: updatedParts }));
    setParts(updatedParts);
  };

  const updatePartField = (index, field, value) => {
    if (isWorkOrderLocked) return;
    const updated = [...getSelectedParts()];
    updated[index] = { ...updated[index], [field]: value };
    updateSelectedParts(updated);
  };

  const updatePartFields = (index, fields) => {
    if (isWorkOrderLocked) return;
    const updated = [...getSelectedParts()];
    updated[index] = { ...updated[index], ...fields };
    updateSelectedParts(updated);
  };

  const getDisplayDate = (job) => {
    if (!job) return '-';
    const dateValue = job.RegDate || job.CreateDate || job.DocDate;
    if (!dateValue) return '-';
    return String(dateValue).includes('T') ? formatDate(dateValue) : dateValue;
  };

  const getDisplayTime = (job) => {
    if (!job && !routeRegTime && !routeComplaintTime && !routeIncidentTime) return '-';

    const rawTime =
      job?.RegTime ||
      job?.ComplaintTime ||
      job?.IncidentTime ||
      job?.CreateTime ||
      job?.DocTime ||
      job?.BrkTime ||
      routeRegTime ||
      routeComplaintTime ||
      routeIncidentTime;

    if (!rawTime) {
      const dateTimeSource = job?.RegDate || job?.CreateDate || job?.DocDate;
      if (dateTimeSource) {
        const isoMatch = String(dateTimeSource).match(/T(\d{2}:\d{2})(:\d{2})?/);
        if (isoMatch?.[1]) return isoMatch[1];

        const parsedDate = new Date(dateTimeSource);
        if (!Number.isNaN(parsedDate.getTime())) {
          return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
        }
      }
      return '-';
    }

    const timeString = String(rawTime).trim();
    if (!timeString || timeString === 'HH12:MI AM') return '-';

    const placeholderPattern = /HH(\d{1,2})?:MI\s*(AM|PM)?/i;
    const placeholderMatch = timeString.match(placeholderPattern);
    if (placeholderMatch) {
      const hours = placeholderMatch[1] ? placeholderMatch[1].padStart(2, '0') : '';
      const amPm = placeholderMatch[2] ? ` ${placeholderMatch[2].toUpperCase()}` : '';
      return hours ? `${hours}:00${amPm}` : '-';
    }

    if (/^\d{3,4}$/.test(timeString)) {
      const normalized = timeString.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }

    const isoMatch = timeString.match(/T(\d{2}:\d{2})(:\d{2})?/);
    if (isoMatch?.[1]) {
      return isoMatch[1];
    }

    const hhMmSsMatch = timeString.match(/^(\d{2}:\d{2}):\d{2}$/);
    if (hhMmSsMatch?.[1]) {
      return hhMmSsMatch[1];
    }

    const parsedDate = new Date(timeString);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
    }

    return timeString;
  };

  const getDisplayComplaintType = (job) => {
    if (routeComplaintType && String(routeComplaintType).trim()) {
      return routeComplaintType;
    }
    return job?.ComplaintType || '-';
  };

  const formatMechanicTime = (raw) => {
    if (!raw && raw !== 0) return '-';
    const value = String(raw).trim();
    if (!value) return '-';
    if (/^\d{3,4}$/.test(value)) {
      const normalized = value.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }
    const hhMmMatch = value.match(/^(\d{2}):(\d{2})/);
    if (hhMmMatch) return `${hhMmMatch[1]}:${hhMmMatch[2]}`;
    return value;
  };

  const getMechanicSummaryFromCurrentWO = () => {
    const mechanics = Array.isArray(workOrder?.Mechanics) ? workOrder.Mechanics : [];
    if (mechanics.length === 0) {
      return {
        startDt: '-',
        startTm: '-',
        totalHrs: '-',
        remarks: '-',
      };
    }

    const firstWithStart = mechanics.find(mech => mech?.StartDt || mech?.StartTm) || mechanics[0];
    const remarks = mechanics
      .map(mech => String(mech?.Remarks || '').trim())
      .filter(Boolean)
      .join(', ');
    const totalHrsValue = mechanics.reduce((sum, mech) => sum + (Number(mech?.TotalHrs) || 0), 0);

    return {
      startDt: firstWithStart?.StartDt ? formatDate(firstWithStart.StartDt) : '-',
      startTm: formatMechanicTime(firstWithStart?.StartTm),
      totalHrs: (workOrder?.TotalHrs ?? totalHrsValue ?? '-') === '' ? '-' : (workOrder?.TotalHrs ?? totalHrsValue ?? '-'),
      remarks: remarks || '-',
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'O': return colors.statusOpen || colors.primary;
      case 'I': return colors.statusInProgress || colors.warning;
      case 'C': return colors.statusCompleted || colors.success;
      case 'CM': return colors.statusCompleted || colors.success;
      case 'D': return colors.statusDeclined || colors.danger;
      default: return colors.statusCancelled || colors.gray;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return colors.priorityHigh || colors.danger;
      case 'Medium':
        return colors.priorityMedium || colors.warning;
      case 'Low':
        return colors.priorityLow || colors.success;
      default:
        return colors.gray;
    }
  };

 const getInitials = (name) => {
    const s = String(name || '').trim();
    if (!s) return '?';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const AVATAR_PALETTE = ['#1D4ED8', '#0E7490', '#7C3AED', '#B45309', '#2B7D2B', '#BE185D', '#A16207', '#0F766E'];
  const getAvatarColor = (name) => {
    const s = String(name || '').trim();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  };
  const getMechanicStats = (mechanicName) => {
    const name = String(mechanicName || '').trim().toLowerCase();
    let entries = 0, verified = 0, awaitingVerification = 0, inProgress = 0, totalHours = 0, partRequests = 0;
    workOrderEntries.forEach((entry) => {
      const assigned = String(entry?.AssignedMechanics || '').trim().toLowerCase();
      if (assigned === name || assigned.includes(name) || name.includes(assigned)) {
        entries++;
        const st = getEntryStatus(entry);
        if (['CM', 'C', 'COMPLETED', 'COMPLETE', 'SV'].includes(st)) verified++;
        if (['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(st)) awaitingVerification++;
        if (['I', 'IN PROGRESS', 'IP'].includes(st)) inProgress++;
        totalHours += (Number(entry?.MechanicsTotalHrs ?? entry?.LabourHours ?? entry?.TotalHrs ?? 0) || 0);
      }
    });
    mechanicPartRequests.forEach((req) => {
      const mech = String(req?.mechanicName || '').trim().toLowerCase();
      if (mech === name || mech.includes(name) || name.includes(mech)) partRequests++;
    });
    return { entries, verified, awaitingVerification, inProgress, totalHours, partRequests };
  };
  const getWorkEntryImages = (entry) => {
    const images = Array.isArray(entry?.Images) ? entry.Images : [];
    return images.map((img, idx) => {
      const rawUrl = img?.ImageUrl || img?.Url || img?.Path || img?.URL || img?.imageUrl || img?.url || img?.path || '';
      const side = String(img?.Side || img?.Type || img?.Label || '').trim().toUpperCase();
      const label = /^(before|after|b\/a|post|pre)$/i.test(side)
        ? side[0].toUpperCase() + side.substring(1).toLowerCase()
        : (idx === 0 ? 'Before' : 'After');
      return { id: `${entry?.WorkEntryDocEntry || idx}-${idx}`, uri: String(rawUrl), label, caption: img?.Caption || img?.Description || '' };
    }).filter((x) => x.uri);
  };
  const getTabCounts = () => {
    const parts = (Array.isArray(workOrder?.Parts) ? workOrder.Parts.length : 0) + mechanicPartRequests.length;
    return { Mechanics: mechanicsForDisplay.length, PartDetails: parts, WorkEntry: workOrderEntries.length, History: historyRows.length, Details: 0 };
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchWorkOrderDetails(); }
    catch (e) { console.log('refresh failed:', e?.message || e); }
    finally { setRefreshing(false); }
  };
  const openImagePreview = (uri, title) => {
    setPreviewImageUri(uri);
    setPreviewImageTitle(title || 'Image');
    setImagePreviewVisible(true);
  };

  const fetchWorkOrderDetails = async () => {
    try {
      setLoading(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const lookupCandidates = [docEntry, jobCardNo].map((value) => String(value || '').trim()).filter(Boolean);
      let sourceData = null;

      for (const candidate of lookupCandidates) {
        try {
          const detailResponse = await jobCardService.getJobCardDetail(companyDb, candidate);
          sourceData = extractDataRecord(detailResponse);
          if (sourceData) break;
        } catch (detailError) {
          console.log('GetJobCardDetail attempt failed:', candidate, detailError?.message || detailError);
        }
      }

      if (!sourceData) {
        const jobCardsResponse = await jobCardService.getJobCards(companyDb, null);
        const listRows = extractRows(jobCardsResponse);
        const matched = findJobCardInList(listRows, docEntry, jobCardNo);
        if (matched?.DocEntry) {
          try {
            const detailResponse = await jobCardService.getJobCardDetail(companyDb, matched.DocEntry);
            sourceData = extractDataRecord(detailResponse) || matched;
          } catch (detailError) {
            sourceData = matched;
          }
        } else {
          sourceData = matched;
        }
      }

      if (!sourceData) {
        throw new Error('Job card details not found.');
      }

      let normalizedFaults = Array.isArray(sourceData?.Faults) ? sourceData.Faults : [];
      const sourceDocEntry = sourceData?.DocEntry || sourceData?.JobCardDocEntry || docEntry;
      if (normalizedFaults.length === 0 && sourceDocEntry) {
        try {
          const faultsResponse = await teamService.getJobCardFaults(companyDb, sourceDocEntry);
          const faultRows = extractRows(faultsResponse);
          if (faultRows.length > 0) {
            normalizedFaults = faultRows;
          }
        } catch (faultError) {
          console.log('GetJobCardFaults failed:', faultError?.message || faultError);
        }
      }

      if (sourceData) {
        const fallbackFaultCode = String(normalizedFaults?.[0]?.FaultCode || normalizedFaults?.[0]?.Fault || 'FLT001');
        const sourceWorkEntries = Array.isArray(sourceData?.WorkEntries) ? sourceData.WorkEntries : [];
        const normalizedParts = Array.isArray(sourceData?.Parts)
          ? sourceData.Parts.map((part) => normalizePartRow(part, fallbackFaultCode))
          : [];

        const dashboardData = await hydrateFromMechanicDashboard(sourceData);
        const dashboardParts = dashboardData.parts.map((part) => normalizePartRow(part, fallbackFaultCode));
        const partMap = new Map();
        [...normalizedParts, ...dashboardParts].forEach((part, index) => {
          const key = [
            part?.ItemCode || `part-${index}`,
            part?.Fault || '',
            part?.FaultLine || '',
            part?.PartLine || '',
            part?.Whs || '',
            part?.ReqQty ?? '',
            part?.IssQty ?? '',
          ].map((value) => String(value || '').trim()).join('|');
          partMap.set(key, { ...(partMap.get(key) || {}), ...part });
        });
        const mergedParts = Array.from(partMap.values());
        const sourceMechanics = Array.isArray(sourceData?.Mechanics) ? sourceData.Mechanics : [];
        const workEntryMechanics = sourceWorkEntries.map((entry) => ({
          MechanicCode: entry?.MechanicCode || entry?.MechCode || entry?.UserCode || '',
          MechanicName: entry?.MechanicName || entry?.MechName || entry?.AssignedMechanics || entry?.UserName || '',
        }));
        const mechanicMap = new Map();
        [...sourceMechanics, ...dashboardData.mechanics, ...workEntryMechanics].forEach((mechanic, index) => {
          const code = String(mechanic?.MechanicCode || mechanic?.MechCode || mechanic?.Code || mechanic?.UserCode || '').trim();
          const name = String(mechanic?.MechanicName || mechanic?.MechName || mechanic?.Name || '').trim();
          const key = `${name || 'mechanic'}-${code || index}`;
          mechanicMap.set(key, { ...mechanic, MechanicCode: code, MechanicName: name || code || '-' });
        });
        const mergedMechanics = Array.from(mechanicMap.values());
        const mergedFaults = [...normalizedFaults, ...dashboardData.faults];
        const mergedOperations = [
          ...(Array.isArray(sourceData?.Operations) ? sourceData.Operations : []),
          ...sourceWorkEntries.flatMap((entry) => (Array.isArray(entry?.Details) ? entry.Details : [])),
          ...dashboardData.operations,
        ];

        setWorkOrder({
          ...sourceData,
          Mechanics: mergedMechanics,
          Parts: mergedParts,
          Faults: mergedFaults.filter((fault, index, arr) => {
            const faultCode = String(fault?.FaultCode || fault?.Fault || '').trim();
            const status = String(fault?.Status || '').trim();
            return arr.findIndex((candidate) => (
              String(candidate?.FaultCode || candidate?.Fault || '').trim() === faultCode
              && String(candidate?.Status || '').trim() === status
            )) === index;
          }),
          Operations: mergedOperations,
        });
        let enrichedWorkEntries = await fetchRelatedWorkOrders({
          ...sourceData,
          Mechanics: mergedMechanics,
          Parts: mergedParts,
          Faults: mergedFaults,
          Operations: mergedOperations,
        }, [...sourceWorkEntries, ...dashboardData.workEntries]);

        if ((!Array.isArray(enrichedWorkEntries) || enrichedWorkEntries.length === 0) && dashboardData.workEntries.length > 0) {
          setWorkOrderEntries(dashboardData.workEntries);
          setExpandedEntryKeys(dashboardData.workEntries);
          enrichedWorkEntries = dashboardData.workEntries;
        }

        const relatedPartRequests = await fetchMechanicPartRequests({
          ...sourceData,
          Mechanics: mergedMechanics,
          Parts: mergedParts,
          Faults: mergedFaults,
          Operations: mergedOperations,
        }, enrichedWorkEntries);

        if ((!Array.isArray(enrichedWorkEntries) || enrichedWorkEntries.length === 0) && Array.isArray(relatedPartRequests) && relatedPartRequests.length > 0) {
          const fallbackIds = relatedPartRequests.map((row) => row.workEntryDocEntry).filter(Boolean);
          const builtEntries = await buildWorkEntriesByIds(companyDb, fallbackIds);
          if (builtEntries.length > 0) {
            setWorkOrderEntries(builtEntries);
            setExpandedEntryKeys(builtEntries);
            enrichedWorkEntries = builtEntries;
          }
        }
        
        // Use API data for tasks/operations and parts if available
        setTasks(mergedOperations);
        
        setParts(mergedParts);
      }
    } catch (error) {
      console.error('Error fetching work order details:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: 'Unable to fetch work order details',
      });
      setWorkOrderEntries([]);
      setMechanicPartRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const closeVerifiedJobCard = async (entries) => {
    const allVerified = entries.length > 0 && entries.every(isSupervisorVerified);
    if (!allVerified) return;

    const companyDb = dbName || 'MUTSPL_TEST';
    const jobCardDocEntry = workOrder?.DocEntry || workOrder?.JobCardDocEntry || docEntry;
    const incidentDocEntry = workOrder?.ComplaintNo || workOrder?.CmplaintNo || complaintNo;
    if (!jobCardDocEntry) return;

    try {
      setClosingJobCard(true);
      const jobCardResponse = await jobCardService.closeJobCard(companyDb, jobCardDocEntry);
      if (!isApiSuccess(jobCardResponse)) {
        throw new Error(jobCardResponse?.Message || 'Could not close the job card.');
      }

      if (incidentDocEntry) {
        const formType = String(routeComplaintType || workOrder?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';
        const incidentResponse = await complaintService.closeIncident(companyDb, incidentDocEntry, formType);
        if (!isApiSuccess(incidentResponse)) {
          throw new Error(incidentResponse?.Message || 'Job card closed, but the incident could not be closed.');
        }
      }

      setWorkOrder((prev) => ({ ...(prev || {}), Status: 'C' }));
      Toast.show({ type: 'success', text1: 'Job card and incident closed' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Closure failed', text2: error?.message || 'Unable to close the job card and incident.' });
    } finally {
      setClosingJobCard(false);
    }
  };

  const handleVerifyWorkEntry = async (entry, status) => {
    const workEntryDocEntry = asWorkEntryId(entry);
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Work entry unavailable' });
      return;
    }
    try {
      setVerifyingEntryId(String(workEntryDocEntry));
      const response = await workEntryService.verifyWorkEntry({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: resolveUserCode(),
        Status: status,
        Remarks: status === 'RW' ? 'Returned to mechanic for rework.' : 'Verified by supervisor.',
      });
      if (!isApiSuccess(response)) {
        throw new Error(response?.Message || 'Unable to verify work entry.');
      }

      const nextEntries = workOrderEntries.map((item) => (
        String(asWorkEntryId(item)) === String(workEntryDocEntry) ? { ...item, Status: status } : item
      ));
      setWorkOrderEntries(nextEntries);
      Toast.show({
        type: 'success',
        text1: status === 'SV' ? 'Work entry verified' : 'Sent back for rework',
        text2: status === 'SV' ? 'The mechanic work is accepted.' : 'The mechanic can update the work entry again.',
      });
      if (status === 'SV') await closeVerifiedJobCard(nextEntries);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Verification failed', text2: error?.message || 'Unable to update work entry.' });
    } finally {
      setVerifyingEntryId(null);
    }
  };

  const getMechanicName = (mechanic) => (
    mechanic?.Mechanic || mechanic?.MechanicName || mechanic?.Name || mechanic?.Mech || '-'
  );

  const getMechanicCode = (mechanic) => String(
    mechanic?.MechanicCode
    || mechanic?.MechCode
    || mechanic?.UserCode
    || mechanic?.Code
    || ''
  ).trim();

  const getFaultLabel = (fault) => {
    const faultCode = String(fault?.FaultCode || fault?.Fault || '').trim();
    const faultDesc = getDisplayText(fault?.FaultDesc, fault?.Dscption, fault?.Description, fault?.FaultName);
    if (faultCode && faultDesc) return `${faultCode} - ${faultDesc}`;
    return faultCode || faultDesc || '-';
  };

  const getMechanicFaultLabels = (mechanic) => {
    const mechanicName = String(getMechanicName(mechanic)).trim().toLowerCase();
    const mechanicCode = String(getMechanicCode(mechanic)).trim().toLowerCase();
    const labels = new Set();

    const matchesMechanic = (value) => {
      const code = String(
        value?.MechanicCode
        || value?.MechCode
        || value?.UserCode
        || value?.Code
        || value?.AssignedTo
        || value?.AssignedMechanic?.Code
        || ''
      ).trim().toLowerCase();
      const name = String(
        value?.MechanicName
        || value?.MechName
        || value?.Name
        || value?.UserName
        || value?.AssignedToName
        || value?.AssignedMechanics
        || value?.AssignedMechanic?.UserName
        || ''
      ).trim().toLowerCase();
      return (mechanicCode && code && mechanicCode === code) || (mechanicName && name && mechanicName === name);
    };

    (Array.isArray(workOrder?.Faults) ? workOrder.Faults : []).forEach((fault) => {
      if (matchesMechanic(fault)) labels.add(getFaultLabel(fault));
    });

    (Array.isArray(workOrderEntries) ? workOrderEntries : []).forEach((entry) => {
      if (!matchesMechanic(entry)) return;
      const entryFaults = Array.isArray(entry?.DetailedFaults) && entry.DetailedFaults.length > 0
        ? entry.DetailedFaults
        : [{ FaultCode: entry?.FaultCode || entry?.Fault, FaultDesc: entry?.FaultDesc || entry?.Description }];
      entryFaults.forEach((fault) => labels.add(getFaultLabel(fault)));
    });

    if (labels.size === 0) {
      getAvailableFaults().forEach((fault) => labels.add(getFaultLabel(fault)));
    }

    return Array.from(labels).filter((label) => label && label !== '-');
  };

  const getAvailableFaults = () => {
    if (workOrder?.Faults && workOrder.Faults.length > 0) {
      return workOrder.Faults.map((fault, index) => ({
        FaultCode: String(fault?.FaultCode || fault?.Fault || `FLT${String(index + 1).padStart(3, '0')}`),
        FaultDesc: fault?.FaultDesc || fault?.Dscption || fault?.Description || fault?.Fault || workEntry.description || '',
      }));
    }

    return [{
      FaultCode: 'FLT001',
      FaultDesc: workEntry.description || 'General Work',
    }];
  };

  const getFaultDisplayLabel = (faultCode) => {
    if (!faultCode) return '';
    const fault = getAvailableFaults().find(f => String(f.FaultCode) === String(faultCode));
    if (!fault) return String(faultCode);
    return fault.FaultDesc ? `${fault.FaultCode} - ${fault.FaultDesc}` : fault.FaultCode;
  };

  const openFaultSelector = (type, key) => {
    if (isWorkOrderLocked) return;
    setFaultSelectionTarget({ type, key });
    setShowFaultModal(true);
  };

  const handleFaultSelected = (value, item) => {
    const selectedFaultCode = String(item?.FaultCode || value || '');
    if (!selectedFaultCode) return;

    if (faultSelectionTarget.type === 'mechanic') {
      setMechanicFaultMap(prev => ({ ...prev, [faultSelectionTarget.key]: selectedFaultCode }));
    }

    if (faultSelectionTarget.type === 'part' && Number.isInteger(faultSelectionTarget.key)) {
      updatePartField(faultSelectionTarget.key, 'Fault', selectedFaultCode);
    }

    setShowFaultModal(false);
    setFaultSelectionTarget({ type: null, key: null });
  };

  const toggleMechanicSelection = (mechanicName) => {
    if (isWorkOrderLocked) return;
    const isAlreadySelected = selectedMechanics.includes(mechanicName);

    if (isAlreadySelected) {
      setSelectedMechanics(prev => prev.filter(name => name !== mechanicName));
      setMechanicFaultMap(prev => {
        const updated = { ...prev };
        delete updated[mechanicName];
        return updated;
      });
      return;
    }

    const defaultFault = getAvailableFaults()[0]?.FaultCode || 'FLT001';
    setSelectedMechanics(prev => [...prev, mechanicName]);
    setMechanicFaultMap(prev => ({ ...prev, [mechanicName]: prev[mechanicName] || defaultFault }));
  };

  const handleCreateWorkOrder = async () => {
    if (isWorkOrderLocked) {
      Toast.show({
        type: 'info',
        text1: 'Single Work Order Policy',
        text2: 'A work order is already submitted for this job card.',
      });
      return;
    }

    if (!workEntry.description.trim() || !workEntry.hours.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please fill in all fields',
      });
      return;
    }

    if (selectedMechanics.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Select Mechanics',
        text2: 'Please select at least one mechanic',
      });
      return;
    }

    try {
      setSubmittingWorkOrder(true);

      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentDateTime = `${currentDate}T00:00:00`;
      const currentTimeHHmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const totalHours = Number.parseFloat(workEntry.hours) || 0;
      const jobCardDocEntry = Number(workOrder?.DocEntry || docEntry || 0);
      const jobCardDocNum = String(workOrder?.JobCardNo || jobCardNo || '').trim();

      if (!jobCardDocEntry) {
        Toast.show({
          type: 'error',
          text1: 'Missing Job Card',
          text2: 'Unable to identify Job Card document entry',
        });
        return;
      }

      if (!jobCardDocNum) {
        Toast.show({
          type: 'error',
          text1: 'Missing Job Card Number',
          text2: 'Unable to identify Job Card number',
        });
        return;
      }

      const normalizedFaults = getAvailableFaults();
      const fallbackFaultCode = normalizedFaults[0]?.FaultCode || 'FLT001';

      const selectedMechanicRows = selectedMechanics.map((name, index) => {
        const source = (workOrder?.Mechanics || []).find(m => getMechanicName(m) === name) || {};
        const faultRef = mechanicFaultMap[name] || normalizedFaults[index % normalizedFaults.length]?.FaultCode || fallbackFaultCode;
        return {
          Fault: faultRef,
          MechCode: source.MechanicCode || source.MechCode || source.Code || source.Mechanic || '',
          MechName: name,
          StartDt: currentDateTime,
          StartTm: currentTimeHHmm,
          EndDt: null,
          EndTm: null,
          TotalHrs: totalHours,
          Status: 'IP',
          Remarks: '',
        };
      });

      const mechanicsWithoutCode = selectedMechanicRows.filter(row => !String(row.MechCode || '').trim());
      if (mechanicsWithoutCode.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Mechanic Code Missing',
          text2: 'Selected mechanics must have MechCode in Job Card details',
        });
        return;
      }

      const selectedParts = getSelectedParts();
      const partRows = selectedParts.map((part, index) => {
        const fallbackFault = normalizedFaults[index % normalizedFaults.length]?.FaultCode || fallbackFaultCode;
        const normalizedPart = normalizePartRow(part, fallbackFault);
        return {
          Fault: normalizedPart.Fault,
          ItemCode: normalizedPart.ItemCode,
          ItemName: normalizedPart.ItemName,
          ReqQty: normalizedPart.ReqQty,
          AddQty: normalizedPart.AddQty,
          IssQty: normalizedPart.IssQty,
          Whs: normalizedPart.Whs,
          DraftEnt: null,
          Status: normalizedPart.Status,
        };
      });

      const partsWithoutWarehouse = partRows.filter(part => !String(part.Whs || '').trim());
      if (partsWithoutWarehouse.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Warehouse Required',
          text2: 'Please select warehouse for all selected parts',
        });
        return;
      }

      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JCDocEnt: jobCardDocEntry,
        JCDocNum: jobCardDocNum,
        Vehicle: String(workOrder?.BusNo || ''),
        Driver: String(workOrder?.Driver || ''),
        Depot: String(workOrder?.Depot || ''),
        Priority: String(workOrder?.Priority || 'Medium'),
        Status: 'O',
        AssignBy: String(user?.Code || user?.code || workOrder?.Supervisr || ''),
        AssignDt: currentDateTime,
        TotalHrs: totalHours,
        Faults: normalizedFaults.map(fault => ({
          FaultCode: fault.FaultCode,
          FaultDesc: fault.FaultDesc,
          Status: 'O',
          TotalHrs: totalHours,
          CompDate: null,
        })),
        Mechanics: selectedMechanicRows,
        Parts: partRows,
      };

      const response = await jobCardService.createWorkOrder(payload);
      if (response?.Success) {
        const timestamp = now.toISOString();
        const newWorkEntries = selectedMechanics.map((mechanicName, index) => ({
          id: Date.now() + index,
          mechanicName,
          description: workEntry.description,
          hours: workEntry.hours,
          timestamp,
        }));

        setMechanicWork(prev => [...newWorkEntries, ...prev]);
        setWorkEntry({ description: '', hours: '' });
        setSelectedMechanics([]);
        await fetchWorkOrderDetails();

        if (complaintNo) {
          const incidentFormType = String(routeComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';
          try {
            const statusSyncResponse = await complaintService.updateComplaintStatus(
              dbName || 'MUTSPL_TEST',
              Number(complaintNo) || complaintNo,
              'I',
              incidentFormType,
            );

            if (!statusSyncResponse?.Success || !statusSyncResponse?.Synced) {
              console.log('[sync] Incident status sync skipped:', statusSyncResponse?.Message || 'UpdateComplaintStatus API not available');
            }
          } catch (incidentStatusError) {
            console.log('[sync] Incident status sync skipped:', incidentStatusError?.message || incidentStatusError);
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Work Order Created',
          text2: response.Message || 'Work order submitted successfully',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Submission Failed',
          text2: response?.Message || 'Unable to create work order',
        });
      }
    } catch (error) {
      console.error('Error creating work order:', error);
      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: error.message || 'Unable to create work order',
      });
    } finally {
      setSubmittingWorkOrder(false);
    }
  };

  const renderWODetails = () => (
    <View style={styles.tabContent}>
      {(() => {
        const mechanicSummary = getMechanicSummaryFromCurrentWO();
        return (
      <View style={styles.detailsGrid}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Job Card No:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{formatJobCardDisplayNo({ ...workOrder, JobType: workOrder?.JobType || jobType || getJobTypeCode(workOrder || {}) })}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Date:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayDate(workOrder)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Time:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayTime(workOrder)}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Vehicle Number:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getBusLabel(workOrder)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Complaint Type:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayComplaintType(workOrder)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Priority:</Text>
          <View
            style={[styles.priorityBadgeInline, { backgroundColor: getPriorityColor(workOrder?.Priority || 'Low') }]}
          >
            <Text style={styles.priorityTextInline}>{workOrder?.Priority || 'Low'}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Status:</Text>
          <View
            style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(workOrder?.Status) }]}
          >
            <Text style={styles.priorityTextInline}>{getStatusName(workOrder?.Status)}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>StartDt:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.startDt}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>StartTm:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.startTm}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>TotalHrs:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.totalHrs}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Work Done:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.remarks}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Driver:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Driver || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Supervisor:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.SprvsrNm || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Depot:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Depot || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Branch:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.BranchNm || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Route No:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.RouteNo?.toString() || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Odometer:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Odometer || '-'} km</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Description:</Text>
          <Text style={[styles.detailValue, { color: colors.dark, marginTop: 4 }]}>{workOrder?.Description || '-'}</Text>
        </View>

        {workOrder?.Faults && workOrder.Faults.length > 0 && (
          <View style={styles.faultsSection}>
            <Text style={[styles.detailLabel, { color: colors.gray, marginBottom: 8 }]}>Faults:</Text>
            {workOrder.Faults.map((fault, index) => (
              <View key={index} style={[styles.faultItem, { backgroundColor: colors.light, padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.xs }]}>
                <Text style={[styles.faultName, { color: colors.dark }]}>
                  > � {fault?.FaultCode || fault?.Fault || '-'}
                </Text>
                <Text style={[styles.faultDesc, { color: colors.gray, marginLeft: SPACING.md }]}>
                  {fault?.FaultDesc || fault?.Dscption || '-'}
                </Text>
                <Text style={[styles.faultMeta, { color: colors.gray, marginLeft: SPACING.md }]}>
                  Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {workOrder?.Operations && workOrder.Operations.length > 0 && (
          <View style={styles.faultsSection}>
            <Text style={[styles.detailLabel, { color: colors.gray, marginBottom: 8 }]}>Work Details:</Text>
            {workOrder.Operations.map((operation, index) => (
              <View key={`${operation?.WorkEntryDocEntry || 'work'}-${operation?.LineId || index}`} style={[styles.faultItem, { backgroundColor: colors.light, padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.xs }]}>
                <Text style={[styles.faultName, { color: colors.dark }]}>
                  > � {getDisplayText(operation?.WorkDone, operation?.Description, operation?.WorkCode, operation) || 'Work update'}
                </Text>
                <Text style={[styles.faultDesc, { color: colors.gray, marginLeft: SPACING.md }]}>
                  Work Entry: {operation?.WorkEntryDocEntry || '-'} | Fault: {operation?.FaultCode || '-'}
                </Text>
                {operation?.Remarks ? (
                  <Text style={[styles.faultMeta, { color: colors.gray, marginLeft: SPACING.md }]}>
                    Remarks: {getDisplayText(operation?.Remarks)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {workOrder?.Parts && workOrder.Parts.length > 0 && (
          <View style={styles.faultsSection}>
            <Text style={[styles.detailLabel, { color: colors.gray, marginBottom: 8 }]}>Parts:</Text>
            {workOrder.Parts.map((part, index) => (
              <View key={index} style={[styles.faultItem, { backgroundColor: colors.light, padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.xs }]}>
                <Text style={[styles.faultName, { color: colors.dark }]}>
                  > � {part?.ItemCode || '-'} - {part?.ItemName || '-'}
                </Text>
                <Text style={[styles.faultDesc, { color: colors.gray, marginLeft: SPACING.md }]}>
                  ReqQty: {part?.ReqQty ?? '-'} | IssQty: {part?.IssQty ?? '-'} | AddQty: {part?.AddQty ?? '-'}
                </Text>
                <Text style={[styles.faultMeta, { color: colors.gray, marginLeft: SPACING.md }]}>
                  Whs: {part?.Whs || '-'} | Fault: {part?.Fault || '-'} | Status: {part?.Status || '-'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
        );
      })()}
    </View>
  );

  const renderPartsDetails = () => (
    <View style={[styles.tabContent, styles.partsTabContent]}>
      <View style={styles.partsHeader}>
        <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Details</Text>
      </View>

      <Text style={[styles.mappingHintText, { color: colors.gray, marginBottom: SPACING.xs }]}>
        For each part, select both Fault and Warehouse code.
      </Text>

      <TouchableOpacity
        onPress={() => {
          if (!isWorkOrderLocked) setShowPartsModal(true);
        }}
        activeOpacity={isWorkOrderLocked ? 1 : 0.7}
      >
        <View pointerEvents="none">
          <PaperTextInput
            label="Select Spare Parts"
            mode="outlined"
            value={getSelectedParts().length > 0 ? `${getSelectedParts().length} part(s) selected` : ''}
            style={styles.selectorInput}
            placeholder="Tap to select parts"
            editable={false}
            outlineColor={colors.border || '#D0D0D0'}
            activeOutlineColor={colors.primary}
            right={<PaperTextInput.Icon icon="package-variant" />}
          />
        </View>
      </TouchableOpacity>

      {getSelectedParts().length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>No parts added in job card</Text>
        </View>
      ) : (
        <View style={styles.partList}>
          {getSelectedParts().map((part, index) => (
            <View key={`${part.ItemCode || 'part'}-${index}`} style={[styles.partListRow, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
              <View style={styles.partHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.partName, { color: colors.dark }]}>{part.ItemName || 'Unknown Part'}</Text>
                  <Text style={[styles.partCode, { color: colors.gray }]}>Code: {part.ItemCode || '-'}</Text>
                </View>
                <TouchableOpacity onPress={() => {
                  if (isWorkOrderLocked) return;
                  const updated = getSelectedParts().filter((_, i) => i !== index);
                  updateSelectedParts(updated);
                }}>
                  <MaterialIcons name="close" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>

              <View style={styles.partFieldRow}>
                <TouchableOpacity
                  style={styles.partFieldFull}
                  onPress={() => {
                    if (!isWorkOrderLocked) openFaultSelector('part', index);
                  }}
                  activeOpacity={isWorkOrderLocked ? 1 : 0.7}
                >
                  <View pointerEvents="none">
                    <PaperTextInput
                      label="Fault Mapping"
                      mode="outlined"
                      value={getFaultDisplayLabel(part.Fault)}
                      style={styles.partFieldInput}
                      placeholder="Tap to select fault"
                      editable={false}
                      right={<PaperTextInput.Icon icon="alert-circle-outline" />}
                    />
                  </View>
                </TouchableOpacity>

                <PaperTextInput
                  label="Required Quantity"
                  mode="outlined"
                  value={String(part.ReqQty || '')}
                  onChangeText={(text) => updatePartField(index, 'ReqQty', parseInt(text, 10) || 0)}
                  keyboardType="numeric"
                  style={[styles.partFieldInput, styles.partFieldHalf]}
                  editable={!isWorkOrderLocked}
                />

                <TouchableOpacity
                  style={styles.partFieldHalf}
                  onPress={() => {
                    if (isWorkOrderLocked) return;
                    setSelectedPartIndex(index);
                    setShowWarehouseModal(true);
                  }}
                  activeOpacity={isWorkOrderLocked ? 1 : 0.7}
                >
                  <View pointerEvents="none">
                    <PaperTextInput
                      label="Warehouse"
                      mode="outlined"
                      value={part.Whs || ''}
                      style={styles.partFieldInput}
                      placeholder="Tap to select warehouse"
                      editable={false}
                      right={<PaperTextInput.Icon icon="store" />}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={[styles.selectedCodeText, { color: colors.gray }]}> 
                Selected Warehouse Code: {part.Whs || '-'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: SPACING.md }}>
        <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.xs }]}>Mechanic Part Requests</Text>
        {loadingMechanicPartRequests ? (
          <Text style={{ color: colors.gray }}>Loading part requests...</Text>
        ) : mechanicPartRequests.length === 0 ? (
          <Text style={{ color: colors.gray }}>No mechanic part requests found for this job card.</Text>
        ) : (
          mechanicPartRequests.map((request) => (
            <View key={request.key} style={[styles.partListRow, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
              <View style={styles.partHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.partName, { color: colors.dark }]}>
                    {request.itemName || request.itemCode || 'Part'}
                  </Text>
                  <Text style={[styles.partCode, { color: colors.gray }]}>Code: {request.itemCode || '-'}</Text>
                </View>
                <View style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(request.status || 'O') }]}>
                  <Text style={styles.priorityTextInline}>{request.status || 'PENDING'}</Text>
                </View>
              </View>

              <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Request: {request.requestCode || '-'}</Text>
              <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Work Entry: {request.workEntryDocEntry || '-'}</Text>
              <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Job Card DocEntry: {request.jobCardDocEntry || '-'}</Text>
              <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Qty - Req: {request.reqQty} | Apr: {request.approvedQty} | Iss: {request.issuedQty} | Rec: {request.receivedQty}</Text>
              <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Warehouse: {request.warehouse || '-'}</Text>
              {request.remarks ? (
                <Text style={[styles.selectedCodeText, { color: colors.gray }]}>Remarks: {request.remarks}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );

  const renderMechanicsDetails = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.xs }]}>Assigned Mechanics</Text>
      {mechanicsForDisplay.length > 0 ? (
        <View style={styles.mechanicsList}>
          {mechanicsForDisplay.map((mechanic, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={isWorkOrderLocked ? 1 : 0.7}
              onPress={() => {
                if (!isWorkOrderLocked) toggleMechanicSelection(getMechanicName(mechanic));
              }}
              style={[
                styles.mechanicCard,
                mechanicsForDisplay.length === 1 && styles.singleMechanicCard,
                { backgroundColor: colors.light, borderColor: colors.border || '#D0D0D0' },
                selectedMechanics.includes(getMechanicName(mechanic)) && styles.selectedMechanicCard,
                selectedMechanics.includes(getMechanicName(mechanic)) && { borderColor: colors.primary }
              ]}
            >
              <MaterialIcons
                name={selectedMechanics.includes(getMechanicName(mechanic)) ? 'check-circle' : 'person'}
                size={22}
                color={selectedMechanics.includes(getMechanicName(mechanic)) ? colors.primary : colors.primary}
              />
              <Text style={[styles.mechanicName, { color: colors.dark }]}>
                {getMechanicName(mechanic)}
              </Text>
            </TouchableOpacity>
          ))} 
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="person-outline" size={48} color={colors.gray} />
          <Text style={[styles.emptyText, { color: colors.gray, marginTop: SPACING.sm }]}>
            No mechanics assigned yet
          </Text>
        </View>
      )}

      <View style={[styles.mappingSection, { backgroundColor: colors.light, borderColor: colors.border || '#E0E0E0' }]}>
        <Text style={[styles.label, { color: colors.dark }]}>Fault Mapping for Mechanics</Text>
        {(selectedMechanics.length > 0
          ? selectedMechanics.map((mechanicName, index) => (
              mechanicsForDisplay.find((mechanic) => getMechanicName(mechanic) === mechanicName)
              || { MechanicName: mechanicName, MechanicCode: mechanicFaultMap[mechanicName] || `selected-${index}` }
            ))
          : mechanicsForDisplay
        ).length > 0 ? (
          (selectedMechanics.length > 0
            ? selectedMechanics.map((mechanicName, index) => (
                mechanicsForDisplay.find((mechanic) => getMechanicName(mechanic) === mechanicName)
                || { MechanicName: mechanicName, MechanicCode: mechanicFaultMap[mechanicName] || `selected-${index}` }
              ))
            : mechanicsForDisplay
          ).map((mechanic, index) => {
            const faultLabels = getMechanicFaultLabels(mechanic);
            return (
              <View key={`${getMechanicName(mechanic)}-${getMechanicCode(mechanic) || index}`} style={styles.mappingRow}>
                <Text style={[styles.mappingMechanicName, { color: colors.dark }]} numberOfLines={1}>
                  {getMechanicName(mechanic)}
                </Text>
                {faultLabels.length > 0 ? (
                  <View style={styles.mappingFaultsWrap}>
                    {faultLabels.map((faultLabel) => (
                      <View key={`${getMechanicName(mechanic)}-${faultLabel}`} style={[styles.mappingFaultChip, { backgroundColor: colors.white, borderColor: colors.border || '#D0D0D0' }]}>
                        <Text style={[styles.mappingFaultChipText, { color: colors.dark }]}>{faultLabel}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.mappingHintText, { color: colors.gray }]}>No faults mapped.</Text>
                )}
              </View>
            );
          })
        ) : (
          <Text style={[styles.mappingHintText, { color: colors.gray }]}>
            No mechanics available for fault mapping.
          </Text>
        )}
      </View>
    </View>
  );

  const renderWorkOrderEntries = () => (
    <View style={styles.tabContent}>
      {loadingWorkOrderEntries ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>Loading work entries...</Text>
        </View>
      ) : workOrderEntries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>No mechanic work entries submitted yet</Text>
        </View>
      ) : (
        <View style={styles.workOrderListContainer}>
          {workOrderEntries.map((entry, index) => {
            const entryKey = String(entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.DocNum || `entry-${index}`);
            const isExpanded = workOrderExpandedMap[entryKey] !== false;

            return (
              <View
                key={`${entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.DocNum || index}`}
                style={[styles.workOrderEntryCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}
              >
                <View style={styles.workOrderEntryHeader}>
                  <View style={styles.workOrderEntryHeaderLeft}>
                    <TouchableOpacity
                      style={[styles.entryCollapseIconButton, { borderColor: colors.border || '#D0D0D0', backgroundColor: colors.light }]}
                      onPress={() => setWorkOrderExpandedMap(prev => ({ ...prev, [entryKey]: !isExpanded }))}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.workOrderEntryNo, { color: colors.dark }]}>Work Entry #{entry?.WorkEntryDocEntry ?? entry?.DocEntry ?? '-'}</Text>
                  </View>
                  <View style={styles.workOrderEntryHeaderRight}>
                    <View style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(entry?.Status || 'O') }]}>
                      <Text style={styles.priorityTextInline}>{getStatusName(entry?.Status || 'O')}</Text>
                    </View>
                  </View>
                </View>

                {isExpanded && (
                  <>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Assigned:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.AssignedMechanics || '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>StartDt:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.MechanicStartDt ? formatDate(entry.MechanicStartDt) : '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>StartTm:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{formatMechanicTime(entry?.MechanicStartTm)}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>TotalHrs:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.MechanicsTotalHrs ?? '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Vehicle:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.Vehicle || '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Work Done:</Text>
                      <Text
                        style={[styles.workOrderEntryValue, { color: colors.dark, flex: 1, textAlign: 'right' }]}
                        numberOfLines={2}
                      >
                        {getDisplayText(entry?.WorkDoneDetails, entry?.WorkDone, entry?.WorkDesc, entry?.Remarks, entry?.Description, entry?.FaultDesc) || '-'}
                      </Text>
                    </View>

                    {Array.isArray(entry?.DetailedFaults) && entry.DetailedFaults.length > 0 && (
                      <View style={styles.entryDetailsSection}>
                        <Text style={[styles.entryDetailsTitle, { color: colors.gray }]}>Faults:</Text>
                        {entry.DetailedFaults.map((fault, faultIndex) => (
                          <View key={`${entry?.DocEntry || index}-fault-${faultIndex}`} style={[styles.entryDetailsCard, { backgroundColor: colors.light }]}> 
                            <Text style={[styles.entryDetailsPrimary, { color: colors.dark }]}>> � {fault?.FaultCode || fault?.Fault || '-'}</Text>
                            <Text style={[styles.entryDetailsSecondary, { color: colors.gray }]}>{getDisplayText(fault?.FaultDesc, fault?.Dscption) || '-'}</Text>
                            <Text style={[styles.entryDetailsMeta, { color: colors.gray }]}>Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {Array.isArray(entry?.DetailedParts) && entry.DetailedParts.length > 0 && (
                      <View style={styles.entryDetailsSection}>
                        <Text style={[styles.entryDetailsTitle, { color: colors.gray }]}>Parts:</Text>
                        {entry.DetailedParts.map((part, partIndex) => (
                          <View key={`${entry?.DocEntry || index}-part-${partIndex}`} style={[styles.entryDetailsCard, { backgroundColor: colors.light }]}> 
                            <Text style={[styles.entryDetailsPrimary, { color: colors.dark }]}>> � {part?.ItemCode || '-'} - {part?.ItemName || '-'}</Text>
                            <Text style={[styles.entryDetailsSecondary, { color: colors.gray }]}>ReqQty: {part?.ReqQty ?? '-'} | IssQty: {part?.IssQty ?? '-'} | AddQty: {part?.AddQty ?? '-'}</Text>
                            <Text style={[styles.entryDetailsMeta, { color: colors.gray }]}>Whs: {part?.Whs || '-'} | Fault: {part?.Fault || '-'} | Status: {part?.Status || '-'}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {supervisorUser && isAwaitingSupervisorVerification(entry) && (
                      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                        <TouchableOpacity
                          style={[styles.smallBtn, { flex: 1, backgroundColor: '#2B7D2B' }]}
                          onPress={() => handleVerifyWorkEntry(entry, 'SV')}
                          disabled={Boolean(verifyingEntryId) || closingJobCard}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.smallBtnText}>{verifyingEntryId === String(asWorkEntryId(entry)) ? 'Verifying...' : 'Verify Work'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallBtn, { flex: 1, backgroundColor: '#B45309' }]}
                          onPress={() => handleVerifyWorkEntry(entry, 'RW')}
                          disabled={Boolean(verifyingEntryId) || closingJobCard}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.smallBtnText}>Send for Rework</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {supervisorUser && isSupervisorVerified(entry) && (
                      <Text style={{ color: '#2B7D2B', fontSize: 12, fontWeight: '700', marginTop: SPACING.sm }}>Verified by supervisor</Text>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderTabContent = () => {
    const richTheme = buildRichTheme(isDarkMode);
    // Mechanics tab uses the local multi-select creation flow, not the rich renderer.
    if (activeTab === 'Mechanics') {
      return renderMechanicsDetails();
    }
    const mechanicsList = (() => {
      const woMechs = Array.isArray(workOrder?.Mechanics) ? workOrder.Mechanics : [];
      const taskMechs = mechanicWork || [];
      return [...woMechs, ...taskMechs];
    })();
    const partsList = (() => {
      const woParts = Array.isArray(workOrder?.Parts) ? workOrder.Parts : [];
      const taskParts = (tasks || []).flatMap((t) => Array.isArray(t?.Parts) ? t.Parts : []);
      return [...woParts, ...taskParts];
    })();
    return renderRichTabContent(activeTab, {
      theme: richTheme,
      workOrder,
      mechanics: mechanicsList,
      parts: partsList,
      mechanicPartRequests,
      workOrderEntries,
      history: historyRows,
      historyLoading,
      onRefreshHistory: () => fetchJobCardHistory(),
    });
  };

  const fetchJobCardHistory = async () => {
    try {
      setHistoryLoading(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const candidates = [workOrder?.JobCardNo, workOrder?.DocEntry, workOrder?.JobCardDocEntry, jobCardNo, docEntry]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      let rows = [];
      for (const cand of candidates) {
        try {
          const resp = await jobCardService.getJobCardHistory(companyDb, cand);
          rows = extractRows(resp);
          if (rows.length > 0) break;
        } catch (e) {
          // try next candidate
        }
      }
      setHistoryRows(rows);
    } catch (e) {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };;

  const renderTabCount = (key) => {
    const counts = getTabCounts();
    const n = counts?.[key] ?? 0;
    return n > 0 ? String(n) : '0';
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}> 
      {/* Header Card - Similar to Incident Detail */}
      <View style={[styles.headerCard, { backgroundColor: colors.white }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.jobCardNo, { color: colors.dark }]}>Job Card #{formatJobCardDisplayNo({ ...workOrder, JobCardNo: workOrder?.JobCardNo || jobCardNo, DocEntry: workOrder?.DocEntry || docEntry, JobType: workOrder?.JobType || jobType || getJobTypeCode(workOrder || {}) })}</Text>
            <Text style={[styles.busNoHeader, { color: colors.primary }]}>
              <MaterialIcons name="directions-bus" size={16} /> Bus {getBusLabel(workOrder)}
            </Text>
          </View>
          <View style={styles.headerRightSection}>
            <View
              style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(workOrder?.Status) }]}
            >
              <Text style={styles.priorityTextInline}>{getStatusName(workOrder?.Status)}</Text>
            </View>
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.infoSection}>
          <View style={styles.infoLeft}>
            <View style={styles.infoRow}>
              <MaterialIcons name="category" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Type:</Text>
              <Text style={[styles.infoValue, { color: colors.dark }]}>{getDisplayComplaintType(workOrder)}</Text>
            </View>

            <View style={styles.infoRow}>
              <MaterialIcons name="flag" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Priority:</Text>
              <View style={[styles.priorityBadgeInline, { backgroundColor: getPriorityColor(workOrder?.Priority || 'Low') }]}>
                <Text style={styles.priorityTextInline}>{workOrder?.Priority || '-'}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <MaterialIcons name="event" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Date & Time:</Text>
              <Text style={[styles.infoValue, { color: colors.dark }]}>
                {`${getDisplayDate(workOrder)} ${getDisplayTime(workOrder)}`.trim()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.summaryStrip, { backgroundColor: colors.white, borderColor: inputBorderColor }]}> 
        <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
          <Text style={[styles.summaryValue, { color: colors.dark }]}>{mechanicCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.gray }]}>Mechanics</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
          <Text style={[styles.summaryValue, { color: colors.dark }]}>{partCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.gray }]}>Parts</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
          <Text style={[styles.summaryValue, { color: colors.dark }]}>{workOrderEntries.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.gray }]}>Work Entries</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
          <Text style={[styles.summaryValue, { color: colors.dark }]}>{mechanicPartRequests.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.gray }]}>Part Requests</Text>
        </View>
      </View>


      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.white, borderBottomColor: inputBorderColor }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = renderTabCount(tab.key);
          const activeColor = colors.primary;
          const inactiveColor = colors.gray;
          const tabColor = isActive ? activeColor : inactiveColor;
          const badgeBg = isActive ? activeColor : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
          const badgeFg = isActive ? '#FFFFFF' : colors.dark;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab, ${count} items`}
              style={[
                styles.tab,
                isActive && styles.activeTab,
                isActive && {
                  borderBottomColor: activeColor,
                  backgroundColor: isDarkMode ? 'rgba(29,78,216,0.10)' : 'rgba(29,78,216,0.06)',
                },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <View style={styles.tabInnerRow}>
                <Text
                  style={[
                    styles.tabText,
                    { color: tabColor },
                    isActive && { color: activeColor, fontWeight: '700' },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: badgeBg, borderColor: isActive ? activeColor : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      { color: badgeFg },
                      isActive && { color: '#FFFFFF' },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      <ScrollView style={styles.contentContainer}>
        {renderTabContent()}
      </ScrollView>


      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => {
          if (isWorkOrderLocked) return;
          const currentParts = getSelectedParts();
          const exists = currentParts.some(p => p.ItemCode === item.ItemCode);
          if (exists) {
            const updated = currentParts.filter(p => p.ItemCode !== item.ItemCode);
            updateSelectedParts(updated);
          } else {
            const defaultFaultCode = getAvailableFaults()[0]?.FaultCode || 'FLT001';
            const newPart = {
              ItemCode: item.ItemCode,
              ItemName: item.ItemName,
              ReqQty: 0,
              Whs: '',
              WhsName: '',
              Fault: defaultFaultCode,
            };
            updateSelectedParts([...currentParts, newPart]);
          }
        }}
        title="Select Spare Parts"
        data={spareParts}
        loading={loadingPartsData}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        multiSelect={true}
        selectedItems={getSelectedParts()}
        searchKeys={['ItemName', 'ItemCode']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
              {item.ItemName || 'Unknown'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              Code: {item.ItemCode}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showWarehouseModal}
        onClose={() => {
          setShowWarehouseModal(false);
          setSelectedPartIndex(null);
        }}
        onSelect={(value, item) => {
          if (isWorkOrderLocked) return;
          const targetIndex = selectedPartIndex;
          if (targetIndex === null || targetIndex === undefined) return;
          const selectedCode = String(item?.WhsCode || value || '').trim();
          const selectedName = String(item?.WhsName || '').trim();
          updatePartFields(targetIndex, {
            Whs: selectedCode,
            WhsName: selectedName,
          });
          setShowWarehouseModal(false);
          setSelectedPartIndex(null);
        }}
        title="Select Warehouse"
        data={warehouses}
        loading={loadingWarehousesData}
        searchPlaceholder="Search warehouse..."
        displayKey="WhsName"
        valueKey="WhsCode"
        searchKeys={['WhsCode', 'WhsName']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
              {item.WhsName || '-'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              Code: {item.WhsCode || '-'}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showFaultModal}
        onClose={() => {
          setShowFaultModal(false);
          setFaultSelectionTarget({ type: null, key: null });
        }}
        onSelect={handleFaultSelected}
        title="Select Fault"
        data={getAvailableFaults()}
        loading={false}
        searchPlaceholder="Search fault..."
        displayKey="FaultDesc"
        valueKey="FaultCode"
        searchKeys={['FaultCode', 'FaultDesc']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
              {item.FaultCode || '-'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              {item.FaultDesc || '-'}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    padding: SPACING.sm,
    marginHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginBottom: SPACING.xs,
  },
  jobCardNo: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  busNoHeader: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    marginBottom: SPACING.xs,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoLeft: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: SPACING.xs,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 70,
  },
  infoValue: {
    fontSize: 12,
    flex: 1,
  },
  priorityBadgeInline: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 12,
  },
  priorityTextInline: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  tabsContainer: {
    flexGrow: 0,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    minHeight: 60,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    borderTopLeftRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  tabIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  contentContainer: {
    flex: 1,
  },
  bottomActionBar: {
    borderTopWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  summaryStrip: {
    marginHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  summaryCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.sm,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  lockBanner: {
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  lockBannerText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  bottomActionButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.md,
  },
  bottomActionButtonContent: {
    minHeight: 48,
  },
  bottomActionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  commonActionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  commonActionButton: {
    flex: 1,
  },
  partList: {
    marginTop: SPACING.sm,
    width: '100%',
  },
  partListRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    width: '100%',
  },
  partHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  partName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: SPACING.sm,
  },
  partCode: {
    fontSize: 12,
  },
  partFieldInput: {
    marginTop: SPACING.xs,
    backgroundColor: 'transparent',
  },
  partFieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  partFieldFull: {
    width: '100%',
  },
  partFieldHalf: {
    flex: 1,
  },
  tabContent: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.lg,
  },
  partsTabContent: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: 0,
  },
  formColumn: {
    flex: 1,
    minWidth: 300,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
  },
  selectorInput: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  picker: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
    justifyContent: 'center',
  },
  selectInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
    justifyContent: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    width: '100%',
  },
  taskButton: {
    flex: 1,
  },
  addButton: {
    minWidth: 100,
  },
  scanButton: {
    flex: 1,
  },
  partsHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    width: '100%',
  },
  tableHeader: {
    borderRadius: BORDER_RADIUS.sm,
  },
  tableRow: {
    borderBottomWidth: 1,
  },
  taskCol: {
    flex: 2,
  },
  statusCol: {
    flex: 1,
  },
  typeCol: {
    flex: 1,
  },
  assignedCol: {
    flex: 1.5,
  },
  noteCol: {
    flex: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    width: '100%',
  },
  emptyText: {
    fontSize: 14,
  },
  attachmentSection: {
    marginTop: SPACING.lg,
    width: '100%',
  },
  attachButton: {
    marginTop: SPACING.sm,
  },
  costCard: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: {
    fontSize: 14,
  },
  costValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  costLabelBold: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  costValueBold: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  costNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    width: '100%',
  },
  noteText: {
    fontSize: 13,
  },
  detailsGrid: {
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    flex: 2,
    textAlign: 'right',
  },
  faultsSection: {
    width: '100%',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  faultItem: {
    width: '100%',
  },
  faultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  faultDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  faultMeta: {
    fontSize: 11,
    marginTop: 3,
  },
  mechanicsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.sm,
  },
  mechanicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    width: '48%',
    borderWidth: 1,
  },
  singleMechanicCard: {
    width: '100%',
  },
  selectedMechanicCard: {
    borderWidth: 1.5,
  },
  mechanicName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  selectedMechanicsText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  mappingSection: {
    width: '100%',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
  },
  mappingRow: {
    width: '100%',
    marginTop: SPACING.xs,
  },
  mappingMechanicName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  mappingFaultSelector: {
    width: '100%',
  },
  mappingFaultsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  mappingFaultChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  mappingFaultChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  mappingHintText: {
    fontSize: 12,
    marginTop: SPACING.xs,
  },
  selectedCodeText: {
    fontSize: 12,
    marginTop: 4,
  },
  workOrderListContainer: {
    width: '100%',
  },
  workOrderEntryCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    width: '100%',
  },
  workOrderEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  workOrderEntryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
    paddingRight: SPACING.xs,
  },
  workOrderEntryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  entryOpenIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCollapseIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workOrderEntryNo: {
    fontSize: 14,
    fontWeight: '700',
  },
  workOrderEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  workOrderEntryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  workOrderEntryValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  entryDetailsSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  entryDetailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  entryDetailsCard: {
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  entryDetailsPrimary: {
    fontSize: 12,
    fontWeight: '600',
  },
  entryDetailsSecondary: {
    fontSize: 11,
    marginTop: 3,
  },
  entryDetailsMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
  },
  workEntryForm: {
    width: '100%',
  },
  workEntryCard: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  workEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  workHours: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  workDescription: {
    fontSize: 14,
    marginBottom: SPACING.xs,
  },
  workTimestamp: {
    fontSize: 11,
  },
});

export default WorkOrderDetailScreen;
