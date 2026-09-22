/**
 * WorkEntryScreen
 *
 * Mechanic-facing screen to:
 *  1. Add work entries (from Work List dropdown or manual "Other")
 *  2. Request parts per work entry
 *  3. See part request statuses (Pending → Approved → Issued by Store → Received)
 *  4. Mark parts as received after store issues them
 *  5. Click "Complete Work" to notify Supervisor for inspection
 *
 * Route params: { workOrderDocEntry, dbName, jobCardNo }
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  RefreshControl,
  TextInput as RNTextInput,
  Alert,
} from 'react-native';
import { Text, Button, Chip, TextInput, Divider, ActivityIndicator } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import ModalSelector from '../../../shared/components/ModalSelector';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { API_BASE_URL } from '../../../constants/config';
import { mechanicService, masterService, storeService, lineBreakdownService, workEntryService, jobCardService } from '../../../api/services';
import {
  setWorkEntries,
  addWorkEntry as addWorkEntryAction,
  setPartsRequests,
  addPartRequest,
  updatePartRequestStatus,
} from '../../../store/slices/workEntrySlice';
import { PART_REQUEST_STATUS } from '../../../constants/config';
import { formatDateTime, getDateTimeTimestamp } from '../../../utils/helpers';

const isApiSuccess = (res) => {
  if (Array.isArray(res) || !res || typeof res !== 'object') return Array.isArray(res);
  const hasStatus = Object.prototype.hasOwnProperty.call(res, 'Success') || Object.prototype.hasOwnProperty.call(res, 'Status');
  return !hasStatus || res?.Success === true || res?.Status === true;
};
const EMPTY_LIST = [];
const MAX_IMAGES_PER_PHASE = 2;

const isAwaitingVerificationStatus = (value) => {
  const status = String(value || '').trim().toUpperCase();
  return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION', 'V', 'VERIFY'].includes(status);
};

const isFalseFlag = (value) => value === false || value === 0 || ['N', 'NO', 'FALSE', '0'].includes(String(value || '').trim().toUpperCase());

const getBreakdownRepairInfo = (...sources) => {
  for (const source of sources) {
    const candidates = [
      ...(Array.isArray(source) ? source : [source]),
      ...(Array.isArray(source?.WorkEntries) ? source.WorkEntries : []),
    ];
    for (const candidate of candidates) {
      const repairs = Array.isArray(candidate?.BreakDownRepair)
        ? candidate.BreakDownRepair
        : candidate?.BreakDownRepair
          ? [candidate.BreakDownRepair]
          : [];
      if (repairs.length > 0) return repairs[0];
    }
  }
  return null;
};

const extractApiRows = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.Data)) return res.Data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.Data?.Parts)) return res.Data.Parts;
  if (Array.isArray(res?.Data?.Requests)) return res.Data.Requests;
  if (Array.isArray(res?.Data?.Items)) return res.Data.Items;
  if (res?.Data && typeof res.Data === 'object') {
    const rows = Object.values(res.Data).filter((item) => item && typeof item === 'object');
    if (rows.length > 0) return rows.flatMap((item) => Array.isArray(item?.Parts)
      ? item.Parts.map((part) => ({ ...item, ...part }))
      : [item]);
  }
  return [];
};

const normalizeApprovedItems = (rows = [], jobCardDocEntry) => {
  const list = Array.isArray(rows) ? rows : [];
  const target = String(jobCardDocEntry || '').trim();

  return list
    .map((item) => ({
      JobCardDocEntry: item?.JobCardDocEntry ?? item?.JCDocEnt ?? item?.DocEntry ?? '',
      WorkEntryDocEntry: item?.WorkEntryDocEntry ?? item?.WorkEntryDocEntryNo ?? item?.WorkEntry ?? item?.DocEntry ?? '',
      PartLine: Number(item?.PartLine ?? item?.Line ?? item?.LineNum ?? 0) || 0,
      ItemCode: String(item?.ItemCode || '').trim(),
      ItemName: String(item?.ItemName || item?.Dscription || item?.ItemCode || '').trim(),
      ReqQty: Number(item?.ReqQty ?? item?.Qty ?? 0) || 0,
      ApprovedQty: Number(item?.ApprovedQty ?? 0) || 0,
      IssuedQty: Number(item?.IssuedQty ?? item?.IssueQty ?? 0) || 0,
      ReceivedQty: Number(item?.ReceivedQty ?? 0) || 0,
      Status: String(item?.Status || '').trim().toUpperCase(),
    }))
    .filter((item) => {
      if (!target) return true;
      return String(item.JobCardDocEntry).trim() === target;
    });
};

const groupPartRequestsByWorkEntry = (rawItems = [], jobCardDocEntry) => {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const target = String(jobCardDocEntry || '').trim();
  const filtered = target
    ? list.filter((item) => {
      const itemJobCard = item?.JobCardDocEntry ?? item?.JCDocEnt ?? item?.JobCardNo ?? item?.JobCardEntry;
      return itemJobCard === undefined || itemJobCard === null || String(itemJobCard).trim() === target;
    })
    : list;

  const grouped = new Map();
  filtered.forEach((item, idx) => {
    const workEntryKey = String(item?.WorkEntryDocEntry ?? item?.WorkEntryDocEntryNo ?? item?.WorkEntry ?? item?.DocEntry ?? `UNKNOWN-${idx}`);
    const existing = grouped.get(workEntryKey) || {
      RequestCode: workEntryKey,
      WorkEntryDocEntry: item?.WorkEntryDocEntry ?? item?.WorkEntryDocEntryNo ?? item?.WorkEntry ?? item?.DocEntry ?? null,
      JobCardDocEntry: item?.JobCardDocEntry ?? item?.JCDocEnt ?? jobCardDocEntry,
      RequestedBy: item?.MechanicName || item?.MechanicCode || item?.UserCode || '',
      Status: item?.Status || 'P',
      Parts: [],
    };

    existing.Status = item?.Status || existing.Status;
    existing.Parts.push({
      PartLine: Number(item?.PartLine ?? item?.LineId ?? existing.Parts.length) || 0,
      ItemCode: item?.ItemCode || '',
      ItemName: item?.ItemName || item?.Dscription || '',
      ReqQty: Number(item?.ReqQty ?? item?.Qty ?? 0) || 0,
      ApprovedQty: Number(item?.ApprovedQty ?? 0) || 0,
      IssuedQty: Number(item?.IssuedQty ?? item?.IssueQty ?? 0) || 0,
      ReceivedQty: Number(item?.ReceivedQty ?? 0) || 0,
      Warehouse: item?.Warehouse || item?.StoreWarehouse || '',
      Status: String(item?.Status || existing.Status || '').trim().toUpperCase(),
      Remarks: item?.Remarks || '',
    });
    grouped.set(workEntryKey, existing);
  });

  return Array.from(grouped.values());
};

const WorkEntryScreen = ({ route, navigation }) => {
  const { workOrderDocEntry, dbName: routeDbName, jobCardNo, jobCardDocEntry, workEntryDocEntry: routeWorkEntryDocEntry, existingWorkEntry, breakdownRepair: routeBreakdownRepair = null, towRequested: routeTowRequested = false, canRepairOnSite: routeCanRepairOnSite, fault: routeFault = null, faultLine: routeFaultLine = 0, complaintType: routeComplaintType = '', complaintNo: routeComplaintNo = '', depot: routeDepot = '' } = route.params || {};
  const breakdownRepair = getBreakdownRepairInfo(routeBreakdownRepair, existingWorkEntry);
  const routeRepairMode = String(breakdownRepair?.RepairMode || '').trim().toUpperCase();
  const routeRepairOnSite = String(breakdownRepair?.RepairOnSite || '').trim().toUpperCase();
  const routeIndicatesRepairOnSite = routeRepairMode === 'R';
  const routeIndicatesTow = routeRepairMode === 'T' || Boolean(routeTowRequested) || isFalseFlag(routeCanRepairOnSite);
  const dispatch = useDispatch();

  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const storeEntries = useSelector(state => state.workEntry.workEntries[String(workOrderDocEntry)] || EMPTY_LIST);
  const storePartsRequests = useSelector(state => state.workEntry.partsRequests[String(workOrderDocEntry)] || EMPTY_LIST);

  const mechanicCode = user?.UserCode || user?.EmpCode || user?.Code || user?.code || user?.User || user?.user || user?.name || '';
  const mechanicName = user?.FirstName || user?.Name || user?.name || '';

  // ─── Local state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workList, setWorkList] = useState([]);
  const [faultWorkLoading, setFaultWorkLoading] = useState(false);
  const [resolvedFaultCode, setResolvedFaultCode] = useState('');

  // Work Entry Form
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showWorkListModal, setShowWorkListModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState(null);   // { Code, Name }
  const [incidentFault, setIncidentFault] = useState(routeFault);
  const [customDescription, setCustomDescription] = useState('');
  const [entryRemarks, setEntryRemarks] = useState('');
  const [repairType, setRepairType] = useState(routeRepairOnSite === 'T' ? 'T' : 'P');
  const isBreakdownJob = String(routeComplaintType || '').toLowerCase().includes('breakdown');
  const initialRepairOnSite = routeRepairMode === 'T' ? false : (routeRepairMode === 'R' ? true : !routeIndicatesTow);
  const [canRepairOnSite, setCanRepairOnSite] = useState(initialRepairOnSite);
  const towWorkflowLocked = routeRepairMode === 'T' || Boolean(routeTowRequested) || towRequestEntryId; 

  // Parts Form (per work entry)
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showSparePartsSelector, setShowSparePartsSelector] = useState(false);
  const [pendingEntryCode, setPendingEntryCode] = useState(null);
  const [spareParts, setSpareParts] = useState([]);
  const [partsDraft, setPartsDraft] = useState([]);

  // Inline parts added directly on the work entry (recorded alongside work done)
  const [entryParts, setEntryParts] = useState([]);
  const [showEntryPartsSelector, setShowEntryPartsSelector] = useState(false);
  const [beforeImageDrafts, setBeforeImageDrafts] = useState([]);
  const [towBeforeImageDrafts, setTowBeforeImageDrafts] = useState([]);
  const [afterImageDrafts, setAfterImageDrafts] = useState([]);
  const [savedAfterImages, setSavedAfterImages] = useState([]);
  const [savedImages, setSavedImages] = useState([]);
  const [imagePreview, setImagePreview] = useState({ visible: false, title: '', uri: '', loading: false });

  // Line Breakdown specific states
  const [towDepotMode, setTowDepotMode] = useState(routeRepairMode === 'T' ? 'default' : 'default'); // 'default' or 'other'
  const [selectedTowDepot, setSelectedTowDepot] = useState(routeDepot || '');
  const [depotsList, setDepotsList] = useState([]);
  const [showDepotsModal, setShowDepotsModal] = useState(false);
  // Created by Add Work Entry (or supplied when reopening an existing
  // breakdown entry). RequestTow must reuse this document rather than create
  // a second line-breakdown work entry.
  const [lineBreakdownWorkEntryId, setLineBreakdownWorkEntryId] = useState(routeWorkEntryDocEntry || null);
  const [towRequestEntryId, setTowRequestEntryId] = useState(routeIndicatesTow ? routeWorkEntryDocEntry || null : null);

  // Issued Items (from SAP Store)
  const [issuedItems, setIssuedItems] = useState([]);

  // Complete Work confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeRemarks, setCompleteRemarks] = useState('');
  const [completionParts, setCompletionParts] = useState([]);
  const [showCompletionPartsSelector, setShowCompletionPartsSelector] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const workEntryLocked = awaitingVerification || (Array.isArray(storeEntries) ? storeEntries.some(entry => isAwaitingVerificationStatus(entry?.Status || entry?.WorkStatus || entry?.FaultStatus)) : false);

  const resolvedJobCardDocEntry = Number(jobCardDocEntry || workOrderDocEntry) || workOrderDocEntry;

  const faultReference = String(
    routeFault?.FaultCode
    || routeFault?.Fault
    || routeFault?.FaultName
    || routeFault?.Description
    || routeFault?.Code
    || ''
  ).trim();

  const getWorkEntryRecord = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data[0] || null;
    if (!data || typeof data !== 'object') return null;
    return data?.WorkEntry || data?.WorkEntryDetails || data?.Record || data;
  };

  const getWorkEntryDetails = (...sources) => {
    const rows = sources.flatMap((source) => {
      if (Array.isArray(source)) return source.flatMap((item) => getWorkEntryDetails(item));
      if (!source || typeof source !== 'object') return [];
      if (Array.isArray(source.Details)) return source.Details;
      if (Array.isArray(source.WorkDone)) return source.WorkDone;
      if (Array.isArray(source.WorkEntries)) return source.WorkEntries.flatMap((item) => getWorkEntryDetails(item));
      return [];
    });
    const seen = new Set();
    return rows.filter((detail, index) => {
      const key = [
        detail?.LineId,
        detail?.WorkCode,
        detail?.WorkDone,
        detail?.OtherDescription,
        detail?.Remarks,
        detail?.EntryDate,
        detail?.EntryTime,
      ].map((value) => String(value ?? '').trim()).join('|') || `detail-${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getSavedBeforeImages = (entry) => {
    const imageSources = [
      entry?.BeforeImages,
      entry?.BFImages,
      entry?.WorkEntryImages,
      entry?.Images,
      entry?.Attachments,
    ].find(Array.isArray) || [];

    return imageSources
      .filter((image) => {
        const phase = String(image?.Phase || image?.ImageType || image?.ImagePhase || image?.Type || '').trim().toUpperCase();
        return !phase || phase === 'BF' || phase === 'BEFORE' || phase === 'BEFOREIMAGE';
      })
      .map((image, index) => {
        const fileName = image?.FileName
          || image?.fileName
          || image?.ImgPath
          || image?.ImagePath
          || image?.File
          || image?.Path
          || '';
        return {
          id: image?.id || image?.Id || fileName || image?.Name || `saved-before-${index}`,
          name: fileName || image?.ImageName || image?.Name || 'Before image',
          fileName: String(fileName || '').trim(),
          uri: image?.uri || image?.Uri || image?.ImageUrl || image?.Url || image?.Base64 || image?.ImageBase64 || '',
        };
      });
  };

  const getSavedTowImages = (entry) => {
    const breakdownRepair = getBreakdownRepairInfo(entry);
    const repairImages = breakdownRepair
      ? [breakdownRepair.TowImage1, breakdownRepair.TowImage2].filter(Boolean).map((fileName, index) => ({
          id: `breakdown-tow-${index}-${fileName}`,
          name: fileName,
          fileName: String(fileName).trim(),
          uri: '',
        }))
      : [];
    if (repairImages.length > 0) return repairImages;
    const imageSources = [entry?.TowBeforeImages, entry?.TowImages, entry?.TowPhotos, entry?.TowPhoto, entry?.BreakdownPhoto, entry?.BreakdownImages];
    const source = imageSources.find((image) => image !== undefined && image !== null);
    const images = Array.isArray(source) ? source : source ? [source] : [];
    return images.map((image, index) => {
      const fileName = typeof image === 'string'
        ? image
        : image?.FileName || image?.fileName || image?.ImgPath || image?.ImagePath || image?.File || image?.Path || '';
      return {
        id: image?.id || image?.Id || fileName || `saved-tow-${index}`,
        name: fileName || image?.ImageName || image?.Name || 'Tow photo',
        fileName: String(fileName || '').trim(),
        uri: image?.uri || image?.Uri || image?.ImageUrl || image?.Url || image?.Base64 || image?.ImageBase64 || '',
      };
    });
  };

  const getSavedAfterImages = (entry) => {
    const imageSources = [entry?.AfterImages, entry?.AFImages, entry?.WorkEntryImages, entry?.Images, entry?.Attachments];
    const images = imageSources.find(Array.isArray) || [];
    return images
      .filter((image) => ['AF', 'AFTER', 'AFTERIMAGE'].includes(String(image?.Phase || image?.ImageType || image?.ImagePhase || image?.ImgType || image?.Type || '').trim().toUpperCase()))
      .map((image, index) => {
        const fileName = image?.FileName || image?.fileName || image?.ImgPath || image?.ImagePath || image?.File || image?.Path || '';
        return {
          id: image?.id || image?.Id || fileName || `saved-after-${index}`,
          name: fileName || image?.ImageName || image?.Name || 'After image',
          fileName: String(fileName || '').trim(),
          uri: image?.uri || image?.Uri || image?.ImageUrl || image?.Url || image?.Base64 || image?.ImageBase64 || '',
        };
      });
  };

  const normalizeFaultWorkItems = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    // GetFaultByCode returns one fault with its selectable work items in
    // Data.Solutions, e.g. { Solution: 'SLTN_4', Name: 'Change the Break shoe' }.
    const rows = Array.isArray(data?.Solutions) ? data.Solutions : extractApiRows(response);
    return rows.map((row) => ({
      ...row,
      Code: String(row?.Solution || row?.WorkCode || row?.Code || row?.WorkListCode || '').trim(),
      Name: String(row?.Name || row?.WorkName || row?.WorkDone || row?.Description || row?.Dscription || row?.Code || '').trim(),
    })).filter((row) => row.Code || row.Name);
  };

  const loadFaultWorkList = useCallback(async (faultCode) => {
    const code = String(faultCode || '').trim();
    if (!code) return [];
    const companyDb = dbName || 'MUTSPL_TEST';
    const requestUrl = `${API_BASE_URL}GetFaultByCode?CompanyDB=${encodeURIComponent(companyDb)}&FaultCode=${encodeURIComponent(code)}`;
    setFaultWorkLoading(true);
    try {
      // Keep an explicit screen-level log: it makes the work-list API and its
      // fault code immediately visible in the device log viewer.
      console.log('[WorkEntry] GET fault work list:', requestUrl);
      const response = await masterService.getFaultByCode(companyDb, code);
      const items = normalizeFaultWorkItems(response);
      console.log('[WorkEntry] GetFaultByCode result:', JSON.stringify({
        faultCode: code,
        success: response?.Success ?? response?.Status,
        solutionCount: items.length,
      }));
      setWorkList([...items, { Code: 'OTHER', Name: 'Other Work' }]);
      return items;
    } catch (error) {
      console.warn('[WorkEntry] GetFaultByCode failed:', requestUrl, error?.message || error);
      return [];
    } finally {
      setFaultWorkLoading(false);
    }
  }, [dbName]);

  // ─── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      console.log('[WorkEntry] Loading screen data:', JSON.stringify({
        jobCardDocEntry: resolvedJobCardDocEntry,
        faultLine: routeFaultLine,
        routeFaultCode: routeFault?.FaultCode || '',
      }));
      const [faultDetailsResult, sparePartsResult, approvedResult, requestsResult, depotsResult, workEntryResult, jobCardResult, mechanicDashboardResult] = await Promise.allSettled([
        masterService.getFaultDetails(companyDb),
        masterService.getSpareParts(companyDb),
        storeService.getApprovedJobCardParts(companyDb, mechanicCode),
        storeService.getMechanicPartRequests(companyDb),
        masterService.getDepots(companyDb),
        routeWorkEntryDocEntry
          ? workEntryService.getWorkEntry(companyDb, routeWorkEntryDocEntry)
          : Promise.resolve(null),
        resolvedJobCardDocEntry
          ? jobCardService.getJobCardDetail(companyDb, resolvedJobCardDocEntry)
          : Promise.resolve(null),
        mechanicCode
          ? mechanicService.getMechanicDashboard(companyDb, mechanicCode)
          : Promise.resolve(null),
      ]);

      if (workEntryResult.status === 'fulfilled' && routeWorkEntryDocEntry) {
        const acceptedEntry = getWorkEntryRecord(workEntryResult.value);
        if (acceptedEntry && typeof acceptedEntry === 'object') {
          const persistedEntry = { ...(existingWorkEntry || {}), ...acceptedEntry };
          const persistedBreakdownRepair = getBreakdownRepairInfo(
            routeBreakdownRepair,
            existingWorkEntry,
            acceptedEntry,
            persistedEntry,
            storeEntries,
          );
          const persistedRepairMode = String(persistedBreakdownRepair?.RepairMode || '').trim().toUpperCase();
          const loadedWorkEntryDocEntry = acceptedEntry?.WorkEntryDocEntry
            || acceptedEntry?.WorkEntryNo
            || acceptedEntry?.WorkEntryEntry
            || acceptedEntry?.DocEntry
            || routeWorkEntryDocEntry;
          const details = Array.isArray(persistedEntry?.Details) ? persistedEntry.Details : [];
          const towRequested = Boolean(
            routeTowRequested
            || persistedEntry?.TowRequested
            || persistedEntry?.TowRequestEntryId
            || persistedEntry?.TowRequestDocEntry
            || persistedRepairMode === 'T'
            || ['REQUESTED', 'IN PROGRESS', 'PENDING PICKUP', 'PICKUP REQUESTED'].includes(String(persistedEntry?.TowStatus || '').trim().toUpperCase())
            || details.some((detail) => String(detail?.WorkCode || '').trim().toUpperCase() === 'TOW_REQUEST'),
          );
          if (loadedWorkEntryDocEntry) setLineBreakdownWorkEntryId(loadedWorkEntryDocEntry);
          if (persistedBreakdownRepair) {
            const repairMode = String(persistedBreakdownRepair.RepairMode || '').trim().toUpperCase();
            const repairOnSite = String(persistedBreakdownRepair.RepairOnSite || '').trim().toUpperCase();
            setCanRepairOnSite(repairMode === 'R');
            setRepairType(repairOnSite === 'T' ? 'T' : 'P');
            const depotType = String(persistedBreakdownRepair.Depot || persistedBreakdownRepair.DepotName || '').trim().toUpperCase();
            if (depotType === 'OTHER') setTowDepotMode('other');
            if (depotType === 'DEFAULT') setTowDepotMode('default');
            if (persistedBreakdownRepair.DepotName) setSelectedTowDepot(persistedBreakdownRepair.DepotName);
            else if (persistedBreakdownRepair.Depot) setSelectedTowDepot(persistedBreakdownRepair.Depot);
          }
          if (towRequested || isFalseFlag(routeCanRepairOnSite) || isFalseFlag(persistedEntry?.CanRepairOnSite)) {
            setCanRepairOnSite(false);
          }
          if (towRequested) setTowRequestEntryId(loadedWorkEntryDocEntry);
          const savedBeforeImages = getSavedBeforeImages(persistedEntry);
          if (savedBeforeImages.length > 0) setBeforeImageDrafts(savedBeforeImages);
          const savedAfterImages = getSavedAfterImages(persistedEntry);
          if (savedAfterImages.length > 0) setSavedAfterImages(savedAfterImages);
          if (persistedEntry?.FinalRemarks) setCompleteRemarks(String(persistedEntry.FinalRemarks));
          const savedTowImages = getSavedTowImages(persistedEntry);
          if (savedTowImages.length > 0) setTowBeforeImageDrafts(savedTowImages);
          dispatch(setWorkEntries({
            docEntry: workOrderDocEntry,
            entries: [{
              ...acceptedEntry,
              ...(existingWorkEntry || {}),
              WorkEntryDocEntry: loadedWorkEntryDocEntry,
            }],
          }));
        }
      } else if (workEntryResult.status === 'rejected') {
        console.warn('GetWorkEntry failed:', workEntryResult.reason);
      }

      const rows = faultDetailsResult.status === 'fulfilled' ? extractApiRows(faultDetailsResult.value) : [];
      const jobCard = jobCardResult.status === 'fulfilled'
        ? (jobCardResult.value?.Data ?? jobCardResult.value)
        : null;
      const mechanicDashboardRows = mechanicDashboardResult.status === 'fulfilled'
        ? extractApiRows(mechanicDashboardResult.value)
        : [];
      const targetJobCardEntry = String(resolvedJobCardDocEntry || '').trim();
      const targetFaultLine = String(routeFaultLine ?? '').trim();
      const dashboardJobRows = mechanicDashboardRows.filter((row) => {
        const jobEntries = [row?.DocEntry, row?.JobCardDocEntry, row?.JCDocEnt, row?.JobCardEntry, row?.JobCardId]
          .map((value) => String(value ?? '').trim());
        const jobNumbers = [row?.JobCardNo, row?.JCDocNum, row?.DocNum, row?.JobCardNum]
          .map((value) => String(value ?? '').trim());
        return jobEntries.includes(targetJobCardEntry) || jobNumbers.includes(String(jobCardNo || '').trim());
      });
      const dashboardFaultRow = dashboardJobRows.find((row) => {
        const line = String(row?.FaultLine ?? row?.FaultLineNo ?? row?.Line ?? row?.LineNum ?? '').trim();
        return line === targetFaultLine || Number(line) === Number(routeFaultLine) + 1;
      }) || dashboardJobRows[0] || null;
      const dashboardBreakdownRepair = getBreakdownRepairInfo(dashboardFaultRow);
      const dashboardPartSources = dashboardFaultRow ? [dashboardFaultRow] : dashboardJobRows;
      const dashboardCompletionParts = dashboardPartSources
        .flatMap((row) => [
          ...(Array.isArray(row?.Parts) ? row.Parts : []),
          ...(Array.isArray(row?.WorkEntries) ? row.WorkEntries.flatMap((entry) => (
            Array.isArray(entry?.Parts) ? entry.Parts : []
          )) : []),
          ...(Array.isArray(row?.WorkEntry?.Parts) ? row.WorkEntry.Parts : []),
        ])
        .map((part) => ({
          ...part,
          ItemCode: part?.ItemCode || part?.Code || '',
          ItemName: part?.ItemName || part?.Name || part?.Dscription || part?.ItemCode || part?.Code || '',
          Qty: String(part?.ReqQty ?? part?.RequiredQty ?? part?.Qty ?? 1),
        }))
        .filter((part, index, parts) => part.ItemCode && parts.findIndex((candidate) => (
          String(candidate.ItemCode) === String(part.ItemCode)
        )) === index);
      if (dashboardCompletionParts.length > 0) {
        setCompletionParts((current) => current.length > 0 ? current : dashboardCompletionParts);
      }
      const jobCardFaults = Array.isArray(jobCard?.Faults) ? jobCard.Faults : [];
      const jobCardWorkEntries = Array.isArray(jobCard?.WorkEntries) ? jobCard.WorkEntries : [];
      const jobCardWorkEntry = jobCardWorkEntries.find((entry) => String(entry?.WorkEntryDocEntry || entry?.DocEntry || '') === String(routeWorkEntryDocEntry || lineBreakdownWorkEntryId || '')) || jobCardWorkEntries[0];
      const jobCardAfterImages = getSavedAfterImages(jobCardWorkEntry);
      if (jobCardAfterImages.length > 0) setSavedAfterImages(jobCardAfterImages);
      if (jobCardWorkEntry?.FinalRemarks && !completeRemarks) setCompleteRemarks(String(jobCardWorkEntry.FinalRemarks));
      const existingEntry = storeEntries.find((entry) => String(
        entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code || '',
      ) === String(routeWorkEntryDocEntry || lineBreakdownWorkEntryId || ''))
        || storeEntries[0]
        || existingWorkEntry
        || jobCardWorkEntries[0]
        || null;
      const workEntryDetails = getWorkEntryDetails(
        jobCardWorkEntries,
        routeFault,
        existingWorkEntry,
        storeEntries,
      );
      if (workEntryDetails.length > 0) {
        const workEntryId = routeWorkEntryDocEntry
          || lineBreakdownWorkEntryId
          || existingEntry?.WorkEntryDocEntry
          || existingEntry?.DocEntry
          || jobCardWorkEntries[0]?.WorkEntryDocEntry
          || jobCardWorkEntries[0]?.DocEntry
          || null;
        const mergedEntry = {
          ...(existingEntry || {}),
          ...(jobCardWorkEntries.find((entry) => String(entry?.WorkEntryDocEntry || entry?.DocEntry || '') === String(workEntryId || '')) || {}),
          WorkEntryDocEntry: workEntryId || existingEntry?.WorkEntryDocEntry || existingEntry?.DocEntry,
          Details: workEntryDetails,
          WorkDone: workEntryDetails,
        };
        const otherEntries = storeEntries.filter((entry) => String(
          entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code || '',
        ) !== String(workEntryId || ''));
        dispatch(setWorkEntries({ docEntry: workOrderDocEntry, entries: [mergedEntry, ...otherEntries] }));
      }
      const jobCardFault = jobCardFaults.find((fault) => String(
        fault?.FaultLine ?? fault?.FaultLineNo ?? fault?.Line ?? fault?.LineNum ?? ''
      ) === String(routeFaultLine)) || jobCardFaults.find((fault) => (
        Number(fault?.FaultLine ?? fault?.FaultLineNo ?? fault?.Line ?? fault?.LineNum) === Number(routeFaultLine) + 1
      )) || (jobCardFaults.length === 1 ? jobCardFaults[0] : null);

      const liveBreakdownRepair = dashboardBreakdownRepair || getBreakdownRepairInfo(
        routeBreakdownRepair,
        existingWorkEntry,
        storeEntries,
      );
      if (liveBreakdownRepair) {
        const repairMode = String(liveBreakdownRepair.RepairMode || '').trim().toUpperCase();
        const repairOnSite = String(liveBreakdownRepair.RepairOnSite || '').trim().toUpperCase();
        setCanRepairOnSite(repairMode === 'R');
        setRepairType(repairOnSite === 'T' ? 'T' : 'P');
        if (repairMode === 'T') setCanRepairOnSite(false);
        const depotType = String(liveBreakdownRepair.Depot || liveBreakdownRepair.DepotName || '').trim().toUpperCase();
        if (depotType === 'OTHER') setTowDepotMode('other');
        if (depotType === 'DEFAULT') setTowDepotMode('default');
        if (liveBreakdownRepair.DepotName) setSelectedTowDepot(liveBreakdownRepair.DepotName);
        else if (liveBreakdownRepair.Depot) setSelectedTowDepot(liveBreakdownRepair.Depot);
        const savedTowImages = getSavedTowImages({ WorkEntries: storeEntries, ...liveBreakdownRepair });
        if (savedTowImages.length > 0) setTowBeforeImageDrafts(savedTowImages);
      }

      if (faultDetailsResult.status === 'fulfilled') {
        // Job-card detail can contain only Fault/Dscption (without FaultCode).
        // Use it to resolve FLT5 from the master list, but never display the
        // master list itself as selectable work items.
        const faultReferences = [
          jobCardFault?.FaultCode,
          jobCardFault?.Fault,
          jobCardFault?.FaultName,
          jobCardFault?.Description,
          jobCardFault?.Dscption,
          faultReference,
        ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
        const matchingFault = rows.find((row) => [row?.FaultCode, row?.Fault, row?.FaultName, row?.Description, row?.Code, row?.Name]
          .some(value => faultReferences.includes(String(value || '').trim().toLowerCase())));
        const resolvedFault = jobCardFault || matchingFault || routeFault;
        if (resolvedFault) {
          setIncidentFault({ ...routeFault, ...resolvedFault });
        }
        const faultCode = String(
          matchingFault?.FaultCode
          || matchingFault?.Code
          || jobCardFault?.FaultCode
          || routeFault?.FaultCode
          || '',
        ).trim();
        console.log('[WorkEntry] Resolved fault for work list:', JSON.stringify({
          faultCode,
          source: jobCardFault?.FaultCode ? 'JobCardDetail.Faults' : routeFault?.FaultCode ? 'route fault' : 'fault master',
        }));
        setResolvedFaultCode(faultCode);
        let workItems = faultCode ? await loadFaultWorkList(faultCode) : [];
        if (workItems.length === 0) {
          console.warn('[WorkEntry] No fault-specific solutions returned; not showing generic fault-master rows.');
        }
        setWorkList([...workItems, { Code: 'OTHER', Name: 'Other Work' }]);
      } else {
        console.warn('GetFaultDetails failed:', faultDetailsResult.reason);
        const faultCode = String(jobCardFault?.FaultCode || routeFault?.FaultCode || '').trim();
        setResolvedFaultCode(faultCode);
        const workItems = faultCode ? await loadFaultWorkList(faultCode) : [];
        if (workItems.length === 0) setWorkList([{ Code: 'OTHER', Name: 'Other Work' }]);
      }

      if (sparePartsResult.status === 'fulfilled') {
        setSpareParts(extractApiRows(sparePartsResult.value));
      } else {
        console.warn('GetSpareParts failed:', sparePartsResult.reason);
        setSpareParts([]);
      }

      if (approvedResult.status === 'fulfilled' && isApiSuccess(approvedResult.value)) {
        const approvedRows = extractApiRows(approvedResult.value);
        setIssuedItems(normalizeApprovedItems(approvedRows, resolvedJobCardDocEntry));
      }

      if (requestsResult.status === 'fulfilled' && isApiSuccess(requestsResult.value)) {
        const requestRows = extractApiRows(requestsResult.value);
        const groupedRequests = groupPartRequestsByWorkEntry(requestRows, resolvedJobCardDocEntry);
        dispatch(setPartsRequests({ docEntry: workOrderDocEntry, requests: groupedRequests }));
      }

      if (depotsResult.status === 'fulfilled' && isApiSuccess(depotsResult.value)) {
        const depotRows = extractApiRows(depotsResult.value);
        setDepotsList(depotRows || []);
        if (!selectedTowDepot && (routeDepot || (Array.isArray(depotRows) && depotRows.length > 0))) {
          const first = depotRows[0];
          const candidate = routeDepot || first?.Depot || first?.Name || first?.DepotName || '';
          setSelectedTowDepot(candidate);
        }
      } else {
        setDepotsList([]);
      }
    } catch (err) {
      console.error('WorkEntryScreen loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, workOrderDocEntry, dispatch, mechanicCode, resolvedJobCardDocEntry, routeDepot, selectedTowDepot, routeWorkEntryDocEntry, existingWorkEntry, routeFault, routeFaultLine, faultReference, loadFaultWorkList]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const resolveWorkDescription = () => {
    if (!selectedWork) return '';
    if (selectedWork.Code === 'OTHER') return customDescription.trim();
    return selectedWork.Name || '';
  };

  const handleOpenWorkList = () => {
    setShowWorkListModal(true);
    // Refresh when the mechanic opens the list so it always reflects the
    // latest GetFaultByCode response for this particular fault.
    if (resolvedFaultCode) loadFaultWorkList(resolvedFaultCode);
  };

  const resetEntryForm = () => {
    setSelectedWork(null);
    setCustomDescription('');
    setEntryRemarks('');
    setEntryParts([]);
    setShowAddEntry(false);
  };

  const canUploadTowBreakdownPhoto = Boolean(
    lineBreakdownWorkEntryId
    || routeWorkEntryDocEntry
    || storeEntries.some((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code)
  );

  const pickWorkEntryImage = async (phase, useCamera = false) => {
    if (phase === 'TOW_BF' && !canUploadTowBreakdownPhoto) {
      Toast.show({ type: 'info', text1: 'Create work entry first', text2: 'Add the breakdown work entry before uploading the tow photo.' });
      return;
    }

    let ImagePicker;
    try {
      ImagePicker = require('expo-image-picker');
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Image picker unavailable', text2: 'Rebuild the Android app after installing native modules.' });
      return;
    }

    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission?.granted) {
      Toast.show({ type: 'error', text1: 'Permission denied', text2: `${useCamera ? 'Camera' : 'Media library'} permission is required.` });
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, selectionLimit: 1, quality: 0.7 });
    if (result?.canceled) return;

    const selected = (result?.assets || []).slice(0, 1).filter((asset) => asset?.uri).map((asset) => ({
      id: `${Date.now()}-${asset.uri}`,
      uri: asset.uri,
      name: asset.fileName || `work-entry-${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
    }));
    const updater = phase === 'TOW_BF'
      ? setTowBeforeImageDrafts
      : phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((previous) => [...previous, ...selected].slice(0, MAX_IMAGES_PER_PHASE));
  };

  const removeImageDraft = (phase, id) => {
    const updater = phase === 'TOW_BF'
      ? setTowBeforeImageDrafts
      : phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((previous) => previous.filter((image) => image.id !== id));
  };

  const extractImageBase64 = (response) => {
    const queue = [response?.Data ?? response];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (typeof current === 'string') {
        const value = current.trim();
        const xmlMatch = value.match(/<(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>([\s\S]*?)<\/(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>/i);
        if (xmlMatch?.[1]?.trim()) return xmlMatch[1].trim();
        if (value.startsWith('data:image/')) return value;
        if (value.length > 100) return value;
        continue;
      }
      if (Array.isArray(current)) {
        current.forEach((item) => queue.push(item));
        continue;
      }
      if (typeof current === 'object') Object.values(current).forEach((value) => queue.push(value));
    }
    return '';
  };

  const openWorkEntryImage = async (image, title = 'Work Entry Image') => {
    const localUri = String(image?.uri || image?.Uri || image?.ImageUrl || image?.Url || image?.Base64 || image?.ImageBase64 || '').trim();
    const fileName = String(image?.fileName || image?.FileName || image?.ImgPath || image?.ImagePath || image?.name || '').trim();
    if (!localUri && !fileName) return;
    if (localUri.startsWith('data:image/') || localUri.startsWith('file:') || localUri.startsWith('content:') || localUri.startsWith('http')) {
      setImagePreview({ visible: true, title, uri: localUri, loading: false });
      return;
    }
    setImagePreview({ visible: true, title, uri: '', loading: true });
    try {
      const response = await workEntryService.getWorkEntryImageBase64(fileName);
      const rawBase64 = extractImageBase64(response);
      if (!rawBase64) throw new Error('Image data was not returned by the server.');
      const contentType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(rawBase64)?.[1] || 'image/jpeg';
      const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      setImagePreview({ visible: true, title, uri: `data:${contentType};base64,${cleanBase64}`, loading: false });
    } catch (error) {
      setImagePreview({ visible: false, title: '', uri: '', loading: false });
      Toast.show({ type: 'error', text1: 'Image preview failed', text2: error?.message || 'Unable to load image.' });
    }
  };

  const closeImagePreview = () => setImagePreview({ visible: false, title: '', uri: '', loading: false });

  const persistWorkEntryImages = async (phase, drafts, workEntryDocEntry, recordPhase = phase) => {
    if (!workEntryDocEntry || drafts.length === 0) return;
    const uploadResponse = await workEntryService.uploadImages(drafts);
    const fileNames = Array.isArray(uploadResponse?.FileNames)
      ? uploadResponse.FileNames
      : String(uploadResponse?.FileName || '').split(',').map((name) => name.trim()).filter(Boolean);
    if (fileNames.length === 0) throw new Error(uploadResponse?.Message || 'No uploaded image filename returned.');

    const existingCount = savedImages.filter((image) => image.phase === phase).length;
    const records = [];
    for (let index = 0; index < Math.min(fileNames.length, MAX_IMAGES_PER_PHASE - existingCount); index += 1) {
      const fileName = fileNames[index];
      const response = recordPhase === 'TOW_BF'
        ? await jobCardService.saveJobCardImage({
            CompanyDB: dbName || 'MUTSPL_TEST',
            JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
            ImgNo: 1,
            ImgPath: fileName,
            Remarks: entryRemarks || completeRemarks || 'Bus received at depot.',
          })
        : await workEntryService.saveWorkEntryImage({
            CompanyDB: dbName || 'MUTSPL_TEST',
            WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
            FaultLine: Number(routeFaultLine) || 0,
            ImgType: phase,
            ImgNo: existingCount + index + 1,
            ImgPath: fileName,
            Remarks: entryRemarks || completeRemarks || '',
          });
      if (!isApiSuccess(response)) throw new Error(response?.Message || `Failed to save ${phase === 'BF' ? 'before' : 'after'} image.`);
      records.push({ fileName, phase: recordPhase, uri: drafts[index]?.uri || '', workEntryDocEntry });
    }
    setSavedImages((previous) => [...previous, ...records]);
  };

  const updateExistingWorkEntry = async (payload, detail) => {
    try {
      const response = await mechanicService.updateWorkEntry(payload);
      if (response && typeof response === 'object') return response;
    } catch (error) {
      const confirmedResponse = await workEntryService.getWorkEntry(
        dbName || 'MUTSPL_TEST',
        payload.WorkEntryDocEntry,
      );
      const confirmedEntry = getWorkEntryRecord(confirmedResponse);
      const confirmedDetails = getWorkEntryDetails(confirmedEntry);
      const wasPersisted = confirmedDetails.some((savedDetail) => (
        String(savedDetail?.WorkCode || '').trim() === String(detail?.WorkCode || '').trim()
        && String(savedDetail?.WorkDone || '').trim() === String(detail?.WorkDone || '').trim()
        && String(savedDetail?.Remarks || '').trim() === String(detail?.Remarks || '').trim()
      ));
      if (wasPersisted) {
        return { Success: true, Data: confirmedEntry };
      }
      throw error;
    }

    const confirmedResponse = await workEntryService.getWorkEntry(
      dbName || 'MUTSPL_TEST',
      payload.WorkEntryDocEntry,
    );
    const confirmedEntry = getWorkEntryRecord(confirmedResponse);
    const confirmedDetails = getWorkEntryDetails(confirmedEntry);
    const wasPersisted = confirmedDetails.some((savedDetail) => (
      String(savedDetail?.WorkCode || '').trim() === String(detail?.WorkCode || '').trim()
      && String(savedDetail?.WorkDone || '').trim() === String(detail?.WorkDone || '').trim()
      && String(savedDetail?.Remarks || '').trim() === String(detail?.Remarks || '').trim()
    ));
    return wasPersisted ? { Success: true, Data: confirmedEntry } : { Success: false, Message: 'UpdateWorkEntry returned no response.' };
  };

  // ─── Submit work entry ────────────────────────────────────────────────────────
  const handleAddWorkEntry = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'No further work entries can be added.' });
      return;
    }

    const description = resolveWorkDescription();
    if (!description) {
      Toast.show({ type: 'error', text1: 'Please select or enter a work description' });
      return;
    }
    const hasExistingWorkEntryBeforeImage = storeEntries.some((entry) => getSavedBeforeImages(entry).length > 0)
      || savedImages.some((image) => image.phase === 'BF');
    if (isBreakdownJob && beforeImageDrafts.length === 0 && !hasExistingWorkEntryBeforeImage) {
      Toast.show({ type: 'error', text1: 'Before image required', text2: 'Upload a before image before saving breakdown work.' });
      return;
    }

    let updateSucceeded = false;
    try {
      setSubmitting(true);
      const existingWorkEntryId = lineBreakdownWorkEntryId
        || routeWorkEntryDocEntry
        || storeEntries.find((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code)?.WorkEntryDocEntry
        || storeEntries.find((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code)?.DocEntry
        || storeEntries.find((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code)?.Code
        || null;
      const detail = {
        WorkCode: selectedWork?.Code || 'OTHER',
        WorkDone: selectedWork?.Code === 'OTHER' ? description : (selectedWork?.Name || description),
        OtherDescription: selectedWork?.Code === 'OTHER' ? description : '',
        Remarks: entryRemarks || '',
      };
      const updateLocalWorkEntry = (responseData, fallbackEntry) => {
        const responseEntry = responseData?.WorkEntry || responseData?.WorkEntryDetails || responseData;
        const responseDetails = Array.isArray(responseEntry?.Details)
          ? responseEntry.Details
          : (Array.isArray(responseEntry?.WorkEntries)
            ? responseEntry.WorkEntries.flatMap((workEntry) => Array.isArray(workEntry?.Details) ? workEntry.Details : [])
            : []);
        const currentEntry = storeEntries.find((entry) => String(
          entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code || '',
        ) === String(existingWorkEntryId || '')) || {};
        dispatch(setWorkEntries({
          docEntry: workOrderDocEntry,
          entries: [
            ...storeEntries.filter((entry) => String(
              entry?.WorkEntryDocEntry || entry?.DocEntry || entry?.Code || '',
            ) !== String(existingWorkEntryId || '')),
            {
              ...currentEntry,
              ...(responseEntry && typeof responseEntry === 'object' ? responseEntry : {}),
              ...(fallbackEntry || {}),
              WorkEntryDocEntry: existingWorkEntryId,
              Details: responseDetails.length > 0
                ? responseDetails
                : [
                    ...(Array.isArray(currentEntry.Details) ? currentEntry.Details : []),
                    detail,
                  ],
            },
          ],
        }));
      };
      if (isBreakdownJob) {
        const breakdownPayload = {
          CompanyDB: dbName || 'MUTSPL_TEST',
          JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
          FaultLine: Number(routeFaultLine) || 1,
          UserCode: mechanicCode,
          CanRepairOnSite: canRepairOnSite,
          FinalRemarks: entryRemarks || '',
          Details: [detail],
        };

        const breakdownRes = existingWorkEntryId
          ? await updateExistingWorkEntry({
              CompanyDB: dbName || 'MUTSPL_TEST',
              WorkEntryDocEntry: Number(existingWorkEntryId) || existingWorkEntryId,
              UserCode: mechanicCode,
              FinalRemarks: entryRemarks || '',
              Details: [detail],
            }, detail)
          : await lineBreakdownService.createLineBreakdownWorkEntry(breakdownPayload);
        if (!breakdownRes?.Success && !breakdownRes?.Status) {
          throw new Error(breakdownRes?.Message || `Failed to ${existingWorkEntryId ? 'update' : 'create'} breakdown work entry`);
        }
        updateSucceeded = Boolean(existingWorkEntryId);

        const responseData = breakdownRes?.Data ?? breakdownRes;
        const createdEntry = responseData?.WorkEntry
          || responseData?.WorkEntryDetails
          || (responseData && typeof responseData === 'object' && !Array.isArray(responseData) ? responseData : {});
        const createdEntryId = createdEntry?.WorkEntryDocEntry
          || createdEntry?.WorkEntryNo
          || createdEntry?.WorkEntryEntry
          || createdEntry?.DocEntry
          || createdEntry?.Code
          || existingWorkEntryId
          || (typeof responseData === 'number' || typeof responseData === 'string' ? responseData : null);

        // GetWorkEntry is the authoritative record used by the Driver
        // Complaint flow. Fetch it here too, so Breakdown rows use the same
        // server-provided description, status, parts, and document entry.
        let savedEntry = createdEntry;
        if (createdEntryId) {
          try {
            console.log('[WorkEntry] GET created breakdown work entry:', JSON.stringify({ WorkEntryDocEntry: createdEntryId }));
            const getWorkEntryResponse = await workEntryService.getWorkEntry(
              dbName || 'MUTSPL_TEST',
              createdEntryId,
            );
            const fetchedEntry = getWorkEntryRecord(getWorkEntryResponse);
            if (fetchedEntry && typeof fetchedEntry === 'object' && !Array.isArray(fetchedEntry)) {
              savedEntry = { ...createdEntry, ...fetchedEntry };
            }
          } catch (getWorkEntryError) {
            console.warn('[WorkEntry] GetWorkEntry after breakdown create failed:', getWorkEntryError?.message || getWorkEntryError);
          }
        }

        if (createdEntryId && entryParts.length > 0) {
          await storeService.requestWorkEntryParts({
            CompanyDB: dbName || 'MUTSPL_TEST',
            WorkEntryDocEntry: Number(createdEntryId) || createdEntryId,
            UserCode: mechanicCode,
            Parts: entryParts.map((p) => ({
              ItemCode: p.ItemCode || p.Code || '',
              ItemName: p.ItemName || p.Name || '',
              ReqQty: parseFloat(p.Qty) || 1,
              Remarks: p.Remarks || '',
            })),
          });
        }

        if (createdEntryId && beforeImageDrafts.length > 0) {
          await persistWorkEntryImages('BF', beforeImageDrafts, createdEntryId);
        }
        // Always reflect a successful save immediately.  The breakdown API may
        // return only a numeric Data value, so use the submitted detail for the
        // visible row while retaining any returned document-entry identifier.
        const visibleEntry = {
          ...breakdownPayload,
          ...savedEntry,
          WorkEntryDocEntry: savedEntry?.WorkEntryDocEntry || savedEntry?.DocEntry || createdEntryId || null,
          Description: savedEntry?.Description || savedEntry?.WorkListName || selectedWork?.Name || description,
          Remarks: savedEntry?.Remarks ?? entryRemarks ?? '',
          Details: savedEntry?.Details
            || savedEntry?.WorkEntries?.[0]?.Details
            || breakdownPayload.Details,
          EntryDate: savedEntry?.EntryDate || savedEntry?.CreatedDate || new Date().toISOString(),
          BeforeImages: beforeImageDrafts.map((image) => ({
            FileName: image.name,
            fileName: image.name,
            uri: image.uri || '',
            Phase: 'BF',
          })),
        };
        if (existingWorkEntryId) {
          updateLocalWorkEntry(savedEntry, visibleEntry);
        } else {
          dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: visibleEntry }));
        }
        setBeforeImageDrafts([]);
        if (createdEntryId) setLineBreakdownWorkEntryId(createdEntryId);
        if (!createdEntryId) {
          console.warn('[WorkEntry] Breakdown work entry saved but no WorkEntryDocEntry was returned:', JSON.stringify(breakdownRes));
        }

        Toast.show({
          type: 'success',
          text1: existingWorkEntryId ? 'Breakdown work entry updated' : 'Breakdown work entry created',
        });
        resetEntryForm();
        if (existingWorkEntryId) loadData();
        return;
      }

      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        FaultLine: Number(routeFaultLine) || 0,
        UserCode: mechanicCode,
        FinalRemarks: entryRemarks,
        Details: [detail],
        Parts: entryParts.map((p) => ({
          ItemCode: p.ItemCode || p.Code || '',
          ItemName: p.ItemName || p.Name || '',
          ReqQty: parseFloat(p.Qty) || 1,
          Warehouse: p.Warehouse || '',
          Remarks: p.Remarks || '',
        })),
        ComplaintType: (String(routeComplaintType || '')).includes('Breakdown') || (String(routeComplaintType || '').toLowerCase().includes('breakdown')) ? 'Breakdown' : undefined,
      };

      const res = existingWorkEntryId
        ? await updateExistingWorkEntry({
            CompanyDB: dbName || 'MUTSPL_TEST',
            WorkEntryDocEntry: Number(existingWorkEntryId) || existingWorkEntryId,
            UserCode: mechanicCode,
            FinalRemarks: entryRemarks || '',
            Details: [detail],
          }, detail)
        : await mechanicService.createWorkEntry(payload);
      if (isApiSuccess(res)) {
        updateSucceeded = Boolean(existingWorkEntryId);
        if (existingWorkEntryId) {
          updateLocalWorkEntry(res?.Data, payload);
        } else {
          dispatch(addWorkEntryAction({
            docEntry: workOrderDocEntry,
            entry: {
              ...(res.Data || payload),
              WorkEntryDocEntry: res?.Data?.WorkEntryDocEntry || res?.Data?.DocEntry,
              Details: [detail],
            },
          }));
        }
        Toast.show({ type: 'success', text1: existingWorkEntryId ? 'Work entry updated' : 'Work entry added' });
        resetEntryForm();
        if (existingWorkEntryId) loadData();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to add work entry' });
      }
    } catch (err) {
      if (updateSucceeded) {
        resetEntryForm();
        loadData();
        return;
      }
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle tow request when on-site repair is not possible
  const handleRequestTow = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Action not available.' });
      return;
    }
    if (!selectedTowDepot) {
      Toast.show({ type: 'error', text1: 'Please select a depot for the tow' });
      return;
    }
    if (towBeforeImageDrafts.length === 0) {
      Toast.show({ type: 'error', text1: 'Breakdown photo required', text2: 'Upload a photo before requesting a tow vehicle.' });
      return;
    }

    try {
      setSubmitting(true);
      const breakdownPayload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        FaultLine: Number(routeFaultLine) || 1,
        UserCode: mechanicCode,
        RepairType: repairType,
        FinalRemarks: entryRemarks || 'Tow requested',
        Details: [
          {
            WorkCode: 'TOW_REQUEST',
            WorkDone: 'Tow requested - vehicle to be moved to depot',
            OtherDescription: '',
            Remarks: entryRemarks || '',
          },
        ],
        CanRepairOnSite: false,
      };

      // Reuse the line-breakdown entry already created by Add Work Entry.
      // Only create one here when the tow is requested before an entry exists.
      let workEntryDocEntry = lineBreakdownWorkEntryId;
      let created = null;
      if (!workEntryDocEntry) {
        const res = await lineBreakdownService.createLineBreakdownWorkEntry(breakdownPayload);
        if (!res?.Success && !res?.Status) {
          throw new Error(res?.Message || 'Failed to create breakdown work entry');
        }
        const responseData = res?.Data ?? res;
        created = responseData?.WorkEntry
          || responseData?.WorkEntryDetails
          || (responseData && typeof responseData === 'object' && !Array.isArray(responseData) ? responseData : {});
        workEntryDocEntry = created?.WorkEntryDocEntry
          || created?.WorkEntryNo
          || created?.WorkEntryEntry
          || created?.DocEntry
          || created?.Code
          || (typeof responseData === 'number' || typeof responseData === 'string' ? responseData : null);
        if (!workEntryDocEntry) {
          throw new Error('Breakdown work entry was created without a work-entry number.');
        }
        setLineBreakdownWorkEntryId(workEntryDocEntry);
      }

      const towResponse = await mechanicService.requestTow({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: mechanicCode,
        TowDestinationType: towDepotMode === 'other' ? 'OTHER' : 'DEFAULT',
        TowDepot: towDepotMode === 'other' ? selectedTowDepot : '',
        Remarks: entryRemarks || 'Bus cannot be repaired at breakdown location.',
      });
      if (towResponse?.Success === false) {
        throw new Error(towResponse?.Message || 'Failed to request tow');
      }
      await persistWorkEntryImages('BF', towBeforeImageDrafts, workEntryDocEntry, 'TOW_BF');
      if (created) {
        dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: { ...created, WorkEntryDocEntry: workEntryDocEntry, TowRequested: true } }));
      }
      setTowRequestEntryId(workEntryDocEntry);
      Toast.show({ type: 'success', text1: 'Tow requested', text2: 'Tap Complete Tow once the bus has been picked up.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Submit parts request ─────────────────────────────────────────────────────
  const handleRequestParts = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Parts requests are no longer needed.' });
      return;
    }
    if (partsDraft.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one part' });
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(pendingEntryCode) || pendingEntryCode,
        UserCode: mechanicCode,
        Parts: partsDraft.map(p => ({
          ItemCode: p.ItemCode || p.Code,
          ItemName: p.ItemName || p.Name || '',
          ReqQty: parseFloat(p.ReqQty) || 1,
          Remarks: p.Remarks || '',
        })),
      };

      const res = await storeService.requestWorkEntryParts(payload);
      if (res?.Success) {
        dispatch(addPartRequest({ docEntry: workOrderDocEntry, request: res.Data || payload }));
        Toast.show({ type: 'success', text1: 'Parts requested — awaiting supervisor approval' });
        setPartsDraft([]);
        setShowPartsModal(false);
        setPendingEntryCode(null);
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to request parts' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Mark part received ───────────────────────────────────────────────────────
  const handleMarkReceived = async (request) => {
    // Approval only authorizes Store to issue the part. It does not mean the
    // mechanic has received it. Send receipt lines only for quantities that
    // Store has actually issued and which have not already been received.
    const receivableParts = (Array.isArray(request?.Parts) ? request.Parts : [])
      .map((part) => {
        const issuedQty = Number(part?.IssuedQty ?? part?.IssueQty ?? 0) || 0;
        const receivedQty = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
        return {
          PartLine: Number(part?.PartLine ?? part?.LineId ?? part?.Line ?? part?.LineNum) || 0,
          ReceivedQty: Math.max(issuedQty - receivedQty, 0),
        };
      })
      .filter((part) => part.ReceivedQty > 0);

    if (receivableParts.length === 0) {
      Toast.show({
        type: 'info',
        text1: 'Parts not issued yet',
        text2: 'Parts can be received only after the Store issues them.',
      });
      return;
    }

    try {
      const res = await storeService.receiveJobCardParts({
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        UserCode: mechanicCode,
        Parts: receivableParts,
      });
      if (res?.Success) {
        const requestCode = request?.RequestCode || request?.WorkEntryDocEntry || '';
        dispatch(updatePartRequestStatus({ docEntry: workOrderDocEntry, requestCode, status: 'RC' }));
        Toast.show({ type: 'success', text1: 'Part marked as received' });
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    }
  };

  // ─── Complete work ─────────────────────────────────────────────────────────────
  const handleCompleteWork = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Completion action is no longer available.' });
      return;
    }

    try {
      setSubmitting(true);
      setShowCompleteConfirm(false);
      // addWorkEntry prepends the latest saved entry.
      const latestEntry = storeEntries[0];
      const workEntryDocEntry = latestEntry?.WorkEntryDocEntry || latestEntry?.DocEntry || latestEntry?.Code;
      if (!workEntryDocEntry) {
        throw new Error('No work entry found. Create and save a work entry first.');
      }

      if (isBreakdownJob) {
        if (afterImageDrafts.length + savedAfterImages.length === 0) {
          throw new Error('Upload an after image before completing the breakdown work.');
        }
        await persistWorkEntryImages('AF', afterImageDrafts, workEntryDocEntry);
        const res = await lineBreakdownService.completeLineBreakdownWorkEntry({
          CompanyDB: dbName || 'MUTSPL_TEST',
          WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
          UserCode: mechanicCode,
          // P/T is the selected permanent/temporary repair type; RepairMode
          // represents the repair location (on site or tow).
          RepairType: repairType,
          RepairMode: canRepairOnSite ? 'R' : 'T',
          FinalRemarks: completeRemarks || '',
          Parts: completionParts.map((part) => ({
            ItemCode: part.ItemCode || part.Code || '',
            ItemName: part.ItemName || part.Name || '',
            ReqQty: parseFloat(part.Qty) || 1,
            Remarks: part.Remarks || '',
          })),
        });

        if (!res?.Success && !res?.Status) {
          throw new Error(res?.Message || 'Failed to complete breakdown work entry');
        }

        Toast.show({
          type: 'success',
          text1: 'Breakdown work completed',
          text2: 'Supervisor verification is now pending.',
          visibilityTime: 5000,
        });
        setAwaitingVerification(true);
        setAfterImageDrafts([]);
        return;
      }

      const res = await mechanicService.completeWork({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: mechanicCode,
        FinalRemarks: completeRemarks || '',
        Parts: completionParts.map((part) => ({
          ItemCode: part.ItemCode || part.Code || '',
          ItemName: part.ItemName || part.Name || '',
          ReqQty: parseFloat(part.Qty) || 1,
          Remarks: part.Remarks || '',
        })),
      });
      if (res?.Success) {
        Toast.show({
          type: 'success',
          text1: 'Work completed!',
          text2: 'Supervisor has been notified to inspect and close the incident.',
          visibilityTime: 5000,
        });
        setAwaitingVerification(true);
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to complete work' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Part status badge ────────────────────────────────────────────────────────
  const getPartStatusConfig = (status) => {
    switch (String(status || '').toUpperCase()) {
      case 'AP':
      case 'A':
        return { label: 'Approved', color: '#2B7D2B', bg: '#2B7D2B15' };
      case 'PS':
        return { label: 'Partially Issued', color: '#0C63E7', bg: '#0C63E715' };
      case 'IS':
      case 'I':
        return { label: 'Fully Issued', color: '#0070F2', bg: '#0070F215' };
      case 'PR':
        return { label: 'Partial Received', color: '#2F7A34', bg: '#2F7A3415' };
      case 'RC':
      case 'R':
        return { label: 'Fully Received', color: '#388E3C', bg: '#388E3C15' };
      case 'RJ':
      case 'X':
        return { label: 'Rejected', color: '#BB0000', bg: '#BB000015' };
      default:  return { label: 'Pending Approval', color: '#FF8F00', bg: '#FF8F0015' };
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return <Loader />;
  }

  const faultCode = String(incidentFault?.FaultCode || incidentFault?.Fault || '').trim();
  const faultName = String(
    incidentFault?.FaultName
    || incidentFault?.Description
    || incidentFault?.Dscption
    || incidentFault?.Fault
    || faultCode
    || 'Fault'
  ).trim();
  const displayedJobCardNo = jobCardNo || resolvedJobCardDocEntry || workOrderDocEntry;
  const displayedWorkEntryNo = lineBreakdownWorkEntryId
    || routeWorkEntryDocEntry
    || storeEntries.find((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry)?.WorkEntryDocEntry
    || storeEntries.find((entry) => entry?.WorkEntryDocEntry || entry?.DocEntry)?.DocEntry
    || null;
  const workEntryBeforeImages = [
    ...storeEntries.flatMap((entry) => getSavedBeforeImages(entry)),
    ...savedImages
      .filter((image) => image.phase === 'BF')
      .map((image) => ({ id: image.fileName, name: image.fileName, uri: image.uri || '' })),
    ...beforeImageDrafts,
  ].filter((image, index, images) => image?.name && images.findIndex((candidate) => candidate.name === image.name) === index);
  const workEntriesWithDate = storeEntries.filter((entry) => {
    const entryDetails = getWorkEntryDetails(entry);
    return Boolean(
      entry?.EntryDate
      || entry?.CreatedDate
      || entry?.CreateDate
      || entry?.RegDate
      || entry?.DateTime
      || entry?.CreatedAt
      || entryDetails.some((detail) => detail?.EntryDate || detail?.CreatedDate || detail?.Date),
    );
  });

  const renderWorkEntryBeforeImageSection = () => isBreakdownJob ? (
    <View style={[styles.card, { backgroundColor: colors.white }]}>
      <View style={styles.imageHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.dark, marginLeft: 0 }]}>Before Image for Work Entry</Text>
        <Text style={{ color: colors.gray, fontSize: 12 }}>{beforeImageDrafts.length}/{MAX_IMAGES_PER_PHASE}</Text>
      </View>
      <Text style={[styles.completeHint, { color: colors.gray }]}>Upload the image before adding the breakdown work entry.</Text>
      <View style={styles.imageActions}>
        <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#00689E', flex: 1 }]} onPress={() => pickWorkEntryImage('BF')}>
          <MaterialIcons name="photo-library" size={16} color="#00689E" />
          <Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload Image</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#007A5A', flex: 1, marginLeft: 8 }]} onPress={() => pickWorkEntryImage('BF', true)}>
          <MaterialIcons name="photo-camera" size={16} color="#007A5A" />
          <Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture</Text>
        </TouchableOpacity>
      </View>
      {beforeImageDrafts.map((image) => (
        <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'Before Image')} activeOpacity={0.75}>
          <MaterialIcons name="image" size={16} color="#00689E" />
          <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
          <TouchableOpacity onPress={() => removeImageDraft('BF', image.id)}>
            <MaterialIcons name="close" size={18} color="#BB0000" />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      {workEntryBeforeImages
        .filter((image) => !beforeImageDrafts.some((draft) => draft.name === image.name))
        .map((image) => (
          <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'Before Image')} activeOpacity={0.75}>
            <MaterialIcons name="image" size={16} color="#00689E" />
            <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
            <MaterialIcons name="open-in-new" size={16} color="#00689E" />
          </TouchableOpacity>
        ))}
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />
        }
      >
        {/* Header Card */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="warning" size={20} color="#E65100" />
            <Text style={[styles.cardTitle, { color: colors.dark, marginLeft: 8 }]}>{faultName}</Text>
          </View>
          {faultCode && faultCode !== faultName ? (
            <Text style={[styles.cardSubtitle, { color: colors.gray }]}>{faultCode}</Text>
          ) : null}
          <Text style={[styles.cardSubtitle, { color: colors.gray }]}>
            Job Card #: {displayedJobCardNo || '-'}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.gray }]}>
            Work Entry #: {displayedWorkEntryNo || 'Not created'}
          </Text>
          {(awaitingVerification || storeEntries.some(entry => isAwaitingVerificationStatus(entry?.Status || entry?.WorkStatus || entry?.FaultStatus))) && (
            <View style={styles.awaitingPill}>
              <MaterialIcons name="check-circle" size={14} color="#6D28D9" />
              <Text style={styles.awaitingPillText}>Awaiting Verification</Text>
            </View>
          )}
        </View>

        {/* Work Entries */}
        {renderWorkEntryBeforeImageSection()}
        <View
          style={[styles.card, { backgroundColor: colors.white }]}
        >
          <View style={styles.sectionHeader}>
            <MaterialIcons name="assignment" size={18} color="#0070F2" />
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Entries</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: workEntryLocked || (isBreakdownJob && !canRepairOnSite) ? '#94A3B8' : '#0070F2' }]}
              onPress={() => {
                if (workEntryLocked || (isBreakdownJob && !canRepairOnSite)) return;
                setShowAddEntry(true);
              }}
              activeOpacity={0.7}
              disabled={workEntryLocked || (isBreakdownJob && !canRepairOnSite)}
            >
              <MaterialIcons name="add" size={16} color="#FFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {[...workEntriesWithDate].sort((a, b) => getDateTimeTimestamp(
            b?.EntryDate || b?.CreatedDate || b?.CreateDate || b?.RegDate || b?.DateTime || b?.CreatedAt,
            b?.EntryTime || b?.CreatedTime || b?.RegTime || b?.Time,
          ) - getDateTimeTimestamp(
            a?.EntryDate || a?.CreatedDate || a?.CreateDate || a?.RegDate || a?.DateTime || a?.CreatedAt,
            a?.EntryTime || a?.CreatedTime || a?.RegTime || a?.Time,
          )).length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.gray }]}>No work entries yet. Tap Add to begin.</Text>
          ) : (
            [...workEntriesWithDate].sort((a, b) => getDateTimeTimestamp(
              b?.EntryDate || b?.CreatedDate || b?.CreateDate || b?.RegDate || b?.DateTime || b?.CreatedAt,
              b?.EntryTime || b?.CreatedTime || b?.RegTime || b?.Time,
            ) - getDateTimeTimestamp(
              a?.EntryDate || a?.CreatedDate || a?.CreateDate || a?.RegDate || a?.DateTime || a?.CreatedAt,
              a?.EntryTime || a?.CreatedTime || a?.RegTime || a?.Time,
            )).map((entry, i) => {
              const entryDetails = getWorkEntryDetails(entry);
              const entryDescription = entry.Description
                || entry.WorkListName
                || entry.WorkDone
                || entryDetails[0]?.WorkDone
                || entry.OtherDescription
                || entry?.Details?.[0]?.WorkDone
                || entry?.Details?.[0]?.OtherDescription
                || '—';
              const entryDate = entry.EntryDate
                || entry.CreatedDate
                || entry.CreateDate
                || entry.RegDate
                || entry.DateTime
                || entry.CreatedAt
                || '';
              const entryTime = entry.EntryTime || entry.CreatedTime || entry.RegTime || entry.Time || '';
              const entryDateTime = entryDate && entryTime && !String(entryDate).includes('T')
                ? `${entryDate} ${entryTime}`
                : entryDate || entryTime;

              return (
                <View key={i} style={[styles.entryRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={styles.entryLeft}>
                    <MaterialIcons name="build" size={16} color="#0070F2" />
                    <View style={styles.entryText}>
                      {entryDetails.length > 0 ? entryDetails.map((detail, detailIndex) => (
                        <View key={`entry-${entry?.WorkEntryDocEntry || entry?.DocEntry || i}-detail-${detailIndex}`} style={detailIndex > 0 ? styles.entryDetailDivider : undefined}>
                          <View style={styles.entryDetailHeader}>
                            <Text style={[styles.entryDesc, { color: colors.dark, flex: 1 }]}>{detail?.WorkDone || detail?.OtherDescription || entryDescription}</Text>
                            {detail?.WorkCode ? (
                              <View style={[styles.workCodeBadge, { backgroundColor: '#0070F215' }]}>
                                <Text style={[styles.workCodeBadgeText, { color: '#0070F2' }]}>{detail.WorkCode}</Text>
                              </View>
                            ) : null}
                          </View>
                          {detail?.OtherDescription && detail.OtherDescription !== detail?.WorkDone ? (
                            <Text style={[styles.entryRemarks, { color: colors.gray }]}>{detail.OtherDescription}</Text>
                          ) : null}
                          {detail?.Remarks ? (
                            <Text style={[styles.entryRemarks, { color: colors.gray }]}>Remarks: {detail.Remarks}</Text>
                          ) : null}
                          {(detail?.EntryDate || detail?.EntryTime) ? (
                            <Text style={[styles.entryDate, { color: colors.gray }]}>Added: {formatDateTime(detail.EntryDate, detail.EntryTime) || `${detail.EntryDate || ''} ${detail.EntryTime || ''}`}</Text>
                          ) : null}
                        </View>
                      )) : (
                        <>
                          <Text style={[styles.entryDesc, { color: colors.dark }]}>{entryDescription}</Text>
                          {entry.Remarks ? <Text style={[styles.entryRemarks, { color: colors.gray }]}>{entry.Remarks}</Text> : null}
                          {entryDateTime ? <Text style={[styles.entryDate, { color: colors.gray }]}>Added: {formatDateTime(entryDate, entryTime) || entryDateTime}</Text> : null}
                        </>
                      )}
                    </View>
                  </View>
                  {!isBreakdownJob && (
                    <TouchableOpacity
                      style={[styles.partsBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#2B7D2B' }]}
                      onPress={() => {
                        if (workEntryLocked) return;
                        setPendingEntryCode(entry.WorkEntryDocEntry || entry.DocEntry || entry.Code || String(i));
                        setPartsDraft([]);
                        setShowPartsModal(true);
                      }}
                      activeOpacity={0.7}
                      disabled={workEntryLocked}
                    >
                      <MaterialIcons name="settings" size={13} color="#2B7D2B" />
                      <Text style={[styles.partsBtnText, { color: '#2B7D2B' }]}>Parts</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Breakdown repair type section */}
        {isBreakdownJob && (
          <View style={[styles.card, { backgroundColor: colors.white, borderWidth: 1, borderColor: '#FDBA74' }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="build" size={18} color="#F97316" />
              <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>Breakdown Repair</Text>
            </View>
            <Text style={[styles.completeHint, { color: colors.gray, marginBottom: 10 }]}>Choose how this breakdown will be handled.</Text>
            <View style={styles.breakdownSection}>
              <Text style={[styles.sectionTitle, { color: colors.dark, marginLeft: 0, marginBottom: 6 }]}>Can Repair on Site?</Text>
              <View style={styles.breakdownToggleRow}>
                <Button mode={canRepairOnSite ? 'contained' : 'outlined'} onPress={() => { if (!towWorkflowLocked) setCanRepairOnSite(true); }} icon="build" buttonColor={canRepairOnSite ? '#167A45' : undefined} style={[styles.breakdownToggleButton, styles.decisionButton]} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent} disabled={towWorkflowLocked}>
                  Repair on Site
                </Button>
                <Button mode={!canRepairOnSite ? 'contained' : 'outlined'} onPress={() => setCanRepairOnSite(false)} icon="local-shipping" buttonColor={!canRepairOnSite ? '#C2410C' : undefined} style={[styles.breakdownToggleButton, styles.decisionButton]} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent}>
                  Tow to Depot
                </Button>
              </View>
              {canRepairOnSite && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.dark, marginLeft: 0, marginTop: 10, marginBottom: 6 }]}>Permanent or Temporary Repair?</Text>
                  <View style={styles.breakdownToggleRow}>
                    <Button mode={repairType === 'P' ? 'contained' : 'outlined'} onPress={() => setRepairType('P')} buttonColor={repairType === 'P' ? '#167A45' : undefined} style={styles.breakdownToggleButton} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent}>Permanent Repair</Button>
                    <Button mode={repairType === 'T' ? 'contained' : 'outlined'} onPress={() => setRepairType('T')} buttonColor={repairType === 'T' ? '#EA580C' : undefined} style={styles.breakdownToggleButton} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent}>Temporary Repair</Button>
                  </View>
                  <Text style={[styles.flowHint, { color: repairType === 'P' ? '#166534' : '#9A3412' }]}>
                    {repairType === 'P' ? 'Before photo → repair on site → after photo → close work entry → supervisor inspection.' : 'Before photo → temporary repair → after photo → close work entry → bus returns to depot for depot-team assignment.'}
                  </Text>
                </>
              )}
              {!canRepairOnSite && (
                <View style={[styles.breakdownTowBox, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}>
                  <Text style={{ color: '#9A4A00', fontWeight: '700', marginBottom: 5 }}>Tow Vehicle Request</Text>
                  <Text style={{ color: '#9A4A00', fontSize: 12, marginBottom: 8 }}>Upload a breakdown photo, request the tow, then record the bus and towing van at depot arrival.</Text>
                  <View style={styles.breakdownToggleRow}>
                    <Button mode={towDepotMode === 'default' ? 'contained' : 'outlined'} onPress={() => { setTowDepotMode('default'); setSelectedTowDepot(routeDepot || selectedTowDepot); }} buttonColor={towDepotMode === 'default' ? '#C2410C' : undefined} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent} style={styles.breakdownToggleButton}>Default depot</Button>
                    <Button mode={towDepotMode === 'other' ? 'contained' : 'outlined'} onPress={() => setTowDepotMode('other')} buttonColor={towDepotMode === 'other' ? '#C2410C' : undefined} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent} style={styles.breakdownToggleButton}>Other depot</Button>
                  </View>
                  {towDepotMode === 'other' && (
                    <TouchableOpacity style={[styles.selectorBtn, { marginTop: 8, borderColor: '#FDBA74', backgroundColor: colors.white }]} onPress={() => setShowDepotsModal(true)}>
                      <Text style={[styles.selectorBtnText, { color: selectedTowDepot ? colors.dark : colors.gray }]} numberOfLines={1}>{selectedTowDepot || 'Select depot'}</Text>
                      <MaterialIcons name="expand-more" size={20} color={colors.gray} />
                    </TouchableOpacity>
                  )}
                  {!towRequestEntryId ? (
                    <>
                      <View style={[styles.imageBox, { borderColor: '#FDBA74', backgroundColor: colors.white }]}>
                        <Text style={{ color: '#9A4A00', fontWeight: '700', fontSize: 13 }}>Breakdown Photo *</Text>
                        <View style={styles.imageActions}>
                          <TouchableOpacity
                            style={[styles.addLineBtn, { borderColor: canUploadTowBreakdownPhoto ? '#00689E' : '#CBD5E1', flex: 1 }, canUploadTowBreakdownPhoto ? null : { opacity: 0.5 }]}
                            onPress={() => pickWorkEntryImage('TOW_BF')}
                            disabled={!canUploadTowBreakdownPhoto}
                          >
                            <MaterialIcons name="photo-library" size={16} color={canUploadTowBreakdownPhoto ? '#00689E' : '#94A3B8'} />
                            <Text style={{ color: canUploadTowBreakdownPhoto ? '#00689E' : '#94A3B8', fontWeight: '600', marginLeft: 4 }}>Upload</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.addLineBtn, { borderColor: canUploadTowBreakdownPhoto ? '#007A5A' : '#CBD5E1', flex: 1, marginLeft: 8 }, canUploadTowBreakdownPhoto ? null : { opacity: 0.5 }]}
                            onPress={() => pickWorkEntryImage('TOW_BF', true)}
                            disabled={!canUploadTowBreakdownPhoto}
                          >
                            <MaterialIcons name="photo-camera" size={16} color={canUploadTowBreakdownPhoto ? '#007A5A' : '#94A3B8'} />
                            <Text style={{ color: canUploadTowBreakdownPhoto ? '#007A5A' : '#94A3B8', fontWeight: '600', marginLeft: 4 }}>Capture</Text>
                          </TouchableOpacity>
                        </View>
                        {towBeforeImageDrafts.map((image) => (
                          <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'Tow Image')} activeOpacity={0.75}>
                            <MaterialIcons name="image" size={16} color="#C2410C" />
                            <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                            <TouchableOpacity onPress={() => removeImageDraft('TOW_BF', image.id)}>
                              <MaterialIcons name="close" size={18} color="#BB0000" />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Button mode="contained" icon="local-shipping" buttonColor="#C2410C" onPress={handleRequestTow} loading={submitting} disabled={submitting} style={styles.towActionButton} contentStyle={styles.towActionContent} labelStyle={styles.towActionLabel}>Request Tow & Notify Supervisor</Button>
                    </>
                  ) : (
                    <>
                      {towBeforeImageDrafts.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {towBeforeImageDrafts.map((image) => (
                            <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'Tow Image')} activeOpacity={0.75}>
                              <MaterialIcons name="image" size={16} color="#C2410C" />
                              <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                              <MaterialIcons name="open-in-new" size={16} color="#C2410C" />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <Text style={[styles.flowHint, { color: '#9A4A00' }]}>Tow request is already submitted. Supervisor will complete the tow once the bus is at depot.</Text>
                      <Button mode="contained" icon="local-shipping" buttonColor="#C2410C" disabled={true} style={styles.towActionButton} contentStyle={styles.towActionContent} labelStyle={styles.towActionLabel}>Tow Requested</Button>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Parts Requests ── */}
        {canRepairOnSite && storePartsRequests.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="inventory" size={18} color="#2B7D2B" />
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Requests</Text>
            </View>

            {storePartsRequests.map((req, i) => {
              const cfg = getPartStatusConfig(req.Status);
              const status = String(req.Status || '').toUpperCase();
              const isIssued = ['I', 'IS', 'PS', 'PR'].includes(status);
              const isReceived = ['R', 'RC'].includes(status);
              const isApproved = ['A', 'AP'].includes(status);
              const hasReceivableIssuedPart = (Array.isArray(req.Parts) ? req.Parts : []).some((part) => {
                const issuedQty = Number(part?.IssuedQty ?? part?.IssueQty ?? 0) || 0;
                const receivedQty = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
                return issuedQty > receivedQty;
              });
              const requestCode = req.RequestCode || req.Code || String(i);

              return (
                <View key={i} style={[styles.partReqRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={styles.partReqTop}>
                    <Text style={[styles.partReqTitle, { color: colors.dark }]}>
                      Request #{requestCode}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {Array.isArray(req.Parts) && req.Parts.map((p, pi) => (
                    <Text key={pi} style={[styles.partItem, { color: colors.gray }]}>
                      • {p.ItemName || p.ItemCode}  Req:{p.ReqQty}
                      {Number(p.ApprovedQty || 0) > 0 ? `  App:${p.ApprovedQty}` : ''}
                      {Number(p.IssuedQty || 0) > 0 ? `  Iss:${p.IssuedQty}` : ''}
                      {Number(p.ReceivedQty || 0) > 0 ? `  Rec:${p.ReceivedQty}` : ''}
                    </Text>
                  ))}

                  {(isIssued || isApproved) && !isReceived && (
                    <TouchableOpacity
                      style={[styles.receiveBtn, { backgroundColor: hasReceivableIssuedPart ? '#0070F2' : '#94A3B8' }]}
                      onPress={() => handleMarkReceived(req)}
                      activeOpacity={0.7}
                      disabled={!hasReceivableIssuedPart}
                    >
                      <MaterialIcons name="check-circle" size={16} color="#FFF" />
                      <Text style={styles.receiveBtnText}>{hasReceivableIssuedPart ? 'Part Received' : 'Mark Received'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Issued Items from Store ── */}
        {issuedItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="inventory" size={18} color="#7B3FE4" />
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Issued Items (from Store)</Text>
            </View>
            <Text style={[styles.completeHint, { color: colors.gray, marginBottom: 8 }]}>
              These parts have been approved and issued by the SAP Store for this job card.
            </Text>

            {issuedItems.map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.issuedItemRow,
                  { borderColor: colors.border || '#E0E0E0', backgroundColor: '#F9F4FF' },
                ]}
              >
                <View style={styles.issuedItemLeft}>
                  <MaterialIcons name="package" size={16} color="#7B3FE4" />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.entryDesc, { color: colors.dark }]}>
                      {item.ItemName || item.ItemCode}
                    </Text>
                    <Text style={[styles.entryRemarks, { color: colors.gray }]}>
                      Code: {item.ItemCode}  ·  Req: {item.ReqQty}
                      {item.ApprovedQty > 0 ? `  ·  App: ${item.ApprovedQty}` : ''}
                      {item.IssuedQty > 0 ? `  ·  Iss: ${item.IssuedQty}` : ''}
                      {item.ReceivedQty > 0 ? `  ·  Rec: ${item.ReceivedQty}` : ''}
                      {item.Warehouse ? `  ·  WH: ${item.Warehouse}` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.addToFaultBtn, { borderColor: '#7B3FE4' }]}
                  onPress={() =>
                    Alert.alert(
                      'Add to Fault',
                      `Assign "${item.ItemName || item.ItemCode}" (Qty: ${item.IssuedQty}) to a fault?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Confirm',
                          onPress: () =>
                            Toast.show({
                              type: 'success',
                              text1: 'Item assigned',
                              text2: `${item.ItemName || item.ItemCode} added to fault record.`,
                            }),
                        },
                      ]
                    )
                  }
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add-link" size={14} color="#7B3FE4" />
                  <Text style={[styles.addToFaultBtnText, { color: '#7B3FE4' }]}>Add to Fault</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="inventory" size={18} color="#2B7D2B" />
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Used on Completion</Text>
          </View>
          <TouchableOpacity
            style={[styles.selectorBtn, { borderColor: colors.border || '#CCC' }]}
            onPress={() => setShowCompletionPartsSelector(true)}
            disabled={workEntryLocked}
          >
            <Text style={[styles.selectorBtnText, { color: colors.gray }]}>Select part</Text>
            <MaterialIcons name="expand-more" size={20} color={colors.gray} />
          </TouchableOpacity>
          {completionParts.map((part, index) => (
            <View key={`${part.ItemCode || part.Code}-${index}`} style={[styles.partDraftRow, { borderColor: colors.border || '#E0E0E0' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.partName, { color: colors.dark }]}>{part.ItemName || part.Name || part.ItemCode || part.Code}</Text>
                <Text style={{ color: colors.gray, fontSize: 11 }}>{part.ItemCode || part.Code}</Text>
              </View>
              <RNTextInput
                value={String(part.Qty || '1')}
                onChangeText={(value) => setCompletionParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, Qty: value } : item))}
                keyboardType="numeric"
                style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
              />
              <Text style={{ color: colors.gray, fontSize: 11, marginHorizontal: 4 }}>Qty</Text>
              <TouchableOpacity onPress={() => setCompletionParts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <MaterialIcons name="close" size={18} color="#BB0000" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ── Complete Work ── */}
        {canRepairOnSite && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Finish Work</Text>
          <Text style={[styles.completeHint, { color: colors.gray }]}>
            Once all work entries are complete, click below. Supervisor will be notified to inspect and close the incident.
          </Text>
          <TextInput
            label="Completion Remarks (optional)"
            mode="outlined"
            value={completeRemarks}
            onChangeText={setCompleteRemarks}
            multiline
            numberOfLines={3}
            style={styles.remarksInput}
          />
          {isBreakdownJob && (
            <View style={[styles.imageBox, { borderColor: colors.border || '#E0E0E0' }]}>
              <View style={styles.imageHeaderRow}>
                <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13 }}>After Image</Text>
                <Text style={{ color: colors.gray, fontSize: 12 }}>{afterImageDrafts.length + savedAfterImages.length}/{MAX_IMAGES_PER_PHASE}</Text>
              </View>
              <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8 }}>Required before completing breakdown work.</Text>
              <View style={styles.imageActions}>
                <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#00689E', flex: 1 }]} onPress={() => pickWorkEntryImage('AF')}>
                  <MaterialIcons name="photo-library" size={16} color="#00689E" />
                  <Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload Image</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#007A5A', flex: 1, marginLeft: 8 }]} onPress={() => pickWorkEntryImage('AF', true)}>
                  <MaterialIcons name="photo-camera" size={16} color="#007A5A" />
                  <Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture</Text>
                </TouchableOpacity>
              </View>
              {afterImageDrafts.map((image) => (
                <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'After Image')} activeOpacity={0.75}>
                  <MaterialIcons name="image" size={16} color="#007A5A" />
                  <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                  <TouchableOpacity onPress={() => removeImageDraft('AF', image.id)}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              {savedAfterImages
                .filter((image) => !afterImageDrafts.some((draft) => draft.name === image.name))
                .map((image) => (
                  <TouchableOpacity key={image.id} style={styles.imageRow} onPress={() => openWorkEntryImage(image, 'After Image')} activeOpacity={0.75}>
                    <MaterialIcons name="image" size={16} color="#007A5A" />
                    <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                    <MaterialIcons name="open-in-new" size={16} color="#007A5A" />
                  </TouchableOpacity>
                ))}
            </View>
          )}
          <Button
            mode="contained"
            onPress={() => {
              if (!workEntryLocked) {
                setShowCompleteConfirm(true);
              }
            }}
            icon="check-circle"
            style={[styles.completeBtn, { backgroundColor: workEntryLocked ? '#64748B' : '#2B7D2B' }]}
            disabled={submitting || workEntryLocked || (isBreakdownJob && !canRepairOnSite)}
            contentStyle={{ paddingVertical: 6 }}
          >
            {workEntryLocked ? 'Completed' : submitting ? 'Completing…' : (isBreakdownJob && !canRepairOnSite) ? 'Use Tow Workflow Above' : 'Complete Work'}
          </Button>
        </View>
        )}
      </ScrollView>

      {/* ── Add Work Entry Modal ── */}
      <Modal visible={showAddEntry} animationType="slide" transparent onRequestClose={resetEntryForm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            <Text style={[styles.modalTitle, { color: colors.dark }]}>Add Work Entry</Text>

            {/* Work List Selector */}
            <TouchableOpacity
              style={[styles.selectorBtn, { borderColor: colors.border || '#CCC' }]}
              onPress={handleOpenWorkList}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectorBtnText, { color: selectedWork ? colors.dark : colors.gray }]}>
                {selectedWork ? selectedWork.Name : 'Select Work from List *'}
              </Text>
              <MaterialIcons name="expand-more" size={20} color={colors.gray} />
            </TouchableOpacity>

            {/* Manual description when "Other" selected */}
            {selectedWork?.Code === 'OTHER' && (
              <TextInput
                label="Description *"
                mode="outlined"
                value={customDescription}
                onChangeText={setCustomDescription}
                style={styles.modalInput}
                placeholder="Describe the work done"
              />
            )}

            <TextInput
              label="Remarks"
              mode="outlined"
              value={entryRemarks}
              onChangeText={setEntryRemarks}
              multiline
              numberOfLines={2}
              style={styles.modalInput}
            />

            {!isBreakdownJob && (
              <>
                {/* ── Parts used in this work entry ── */}
                <View style={{ marginTop: 8, marginBottom: 4 }}>
                  <Text style={[styles.partsSectionLabel, { color: colors.dark }]}>Parts Used</Text>

                  {entryParts.map((p, i) => (
                    <View key={i} style={[styles.partDraftRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.partName, { color: colors.dark }]}>
                          {p.ItemName || p.Name || p.ItemCode}
                        </Text>
                        <Text style={{ color: colors.gray, fontSize: 11 }}>{p.ItemCode}</Text>
                      </View>
                      <RNTextInput
                        value={String(p.Qty)}
                        onChangeText={(v) => {
                          const updated = [...entryParts];
                          updated[i] = { ...updated[i], Qty: v };
                          setEntryParts(updated);
                        }}
                        keyboardType="numeric"
                        style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                      <Text style={{ color: colors.gray, fontSize: 11, marginHorizontal: 4 }}>{p.UoM || 'Nos'}</Text>
                      <TouchableOpacity onPress={() => setEntryParts(entryParts.filter((_, j) => j !== i))}>
                        <MaterialIcons name="close" size={18} color="#BB0000" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={[styles.addPartBtn, { borderColor: '#0070F2' }]}
                    onPress={() => setShowEntryPartsSelector(true)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="add" size={16} color="#0070F2" />
                    <Text style={[styles.addPartBtnText, { color: '#0070F2' }]}>Add Part</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={resetEntryForm} style={{ flex: 1, marginRight: 8 }}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleAddWorkEntry}
                loading={submitting}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                Add Entry
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Entry Parts Selector ── */}
      <ModalSelector
        visible={showEntryPartsSelector}
        onClose={() => setShowEntryPartsSelector(false)}
        onSelect={(value, item) => {
          const already = entryParts.find(p => (p.ItemCode || p.Code) === (item.ItemCode || item.Code));
          if (!already) {
            setEntryParts(prev => [...prev, { ...item, Qty: '1' }]);
          }
          setShowEntryPartsSelector(false);
        }}
        title="Select Part"
        data={spareParts}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.ItemName || item.Name || item.Dscription || 'Part'}{(item.ItemCode || item.Code) ? ` (${item.ItemCode || item.Code})` : ''}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showCompletionPartsSelector}
        onClose={() => setShowCompletionPartsSelector(false)}
        onSelect={(value, item) => {
          const key = item.ItemCode || item.Code;
          if (!completionParts.some((part) => (part.ItemCode || part.Code) === key)) {
            setCompletionParts((current) => [...current, { ...item, Qty: '1' }]);
          }
          setShowCompletionPartsSelector(false);
        }}
        title="Select Part for Completion"
        data={spareParts}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode', 'Code', 'Name', 'Dscription']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.ItemName || item.Name || item.Dscription || 'Part'}{(item.ItemCode || item.Code) ? ` (${item.ItemCode || item.Code})` : ''}
            </Text>
          </View>
        )}
      />

      {/* ── Parts Request Modal ── */}
      <Modal visible={showPartsModal} animationType="slide" transparent onRequestClose={() => setShowPartsModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
              <Text style={[styles.modalTitle, { color: colors.dark }]}>Request Parts</Text>

              {/* Added parts draft */}
              {partsDraft.map((p, i) => (
                <View key={i} style={[styles.partDraftRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partName, { color: colors.dark }]}>
                      {p.ItemName || p.Name || p.ItemCode}
                    </Text>
                    <Text style={[{ color: colors.gray, fontSize: 11 }]}>{p.ItemCode}</Text>
                  </View>
                  <RNTextInput
                    value={String(p.ReqQty)}
                    onChangeText={(v) => {
                      const updated = [...partsDraft];
                      updated[i] = { ...updated[i], ReqQty: v };
                      setPartsDraft(updated);
                    }}
                    keyboardType="numeric"
                    style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                  <Text style={[{ color: colors.gray, fontSize: 11, marginHorizontal: 4 }]}>Qty</Text>
                  <TouchableOpacity onPress={() => setPartsDraft(partsDraft.filter((_, j) => j !== i))}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addPartBtn, { borderColor: '#2B7D2B' }]}
                onPress={() => setShowSparePartsSelector(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={16} color="#2B7D2B" />
                <Text style={[styles.addPartBtnText, { color: '#2B7D2B' }]}>Add Part</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => { setShowPartsModal(false); setPartsDraft([]); }} style={{ flex: 1, marginRight: 8 }}>
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleRequestParts}
                  loading={submitting}
                  disabled={submitting || partsDraft.length === 0}
                  style={{ flex: 1 }}
                >
                  Request ({partsDraft.length})
                </Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Work List Selector */}
      <ModalSelector
        visible={showWorkListModal}
        onClose={() => setShowWorkListModal(false)}
        onSelect={(value, item) => {
          setSelectedWork(item);
          if (item.Code !== 'OTHER') setCustomDescription('');
          setShowWorkListModal(false);
        }}
        title="Select Work"
        data={workList}
        loading={faultWorkLoading}
        searchPlaceholder="Search work list..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
        renderItem={(item) => (
          <Text style={{ fontSize: 15, color: '#000' }}>{item.Name}</Text>
        )}
      />

      {/* Spare Parts Selector */}
      <ModalSelector
        visible={showSparePartsSelector}
        onClose={() => setShowSparePartsSelector(false)}
        onSelect={(value, item) => {
          const key = item.ItemCode || item.Code;
          const alreadyAdded = partsDraft.some(p => (p.ItemCode || p.Code) === key);
          if (!alreadyAdded) {
            setPartsDraft(prev => [
              ...prev,
              {
                ItemCode: item.ItemCode || item.Code || '',
                ItemName: item.ItemName || item.Name || item.Dscription || '',
                ReqQty: '1',
                Remarks: '',
              },
            ]);
          }
          setShowSparePartsSelector(false);
        }}
        title="Select Part"
        data={spareParts}
        loading={false}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode', 'Code', 'Name', 'Dscription']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.ItemName || item.Name || item.Dscription || 'Part'}{(item.ItemCode || item.Code) ? ` (${item.ItemCode || item.Code})` : ''}
              {item.UoM || item.InvntryUom ? ` · ${item.UoM || item.InvntryUom}` : ''}
            </Text>
          </View>
        )}
      />

      {/* Depot selector for tow requests (Line Breakdown flow) */}
      <ModalSelector
        visible={showDepotsModal}
        onClose={() => setShowDepotsModal(false)}
        onSelect={(value, item) => { setSelectedTowDepot(item?.Depot || item?.Name || item?.DepotName || value); setShowDepotsModal(false); }}
        title="Select Depot"
        data={depotsList}
        loading={false}
        searchPlaceholder="Search depots..."
        displayKey={depotsList && depotsList.length && Object.prototype.hasOwnProperty.call(depotsList[0], 'Depot') ? 'Depot' : 'Name'}
        valueKey={depotsList && depotsList.length && Object.prototype.hasOwnProperty.call(depotsList[0], 'Depot') ? 'Depot' : 'Name'}
        searchKeys={[ 'Depot', 'Name', 'DepotName' ]}
        renderItem={(item) => (
          <Text style={{ color: colors.dark, fontSize: 15, fontWeight: '600' }}>
            {item?.Depot || item?.Name || item?.DepotName || '-'}
          </Text>
        )}
      />

      <Modal
        visible={imagePreview.visible}
        transparent
        animationType="fade"
        onRequestClose={closeImagePreview}
      >
        <View style={styles.imagePreviewOverlay}>
          <View style={[styles.imagePreviewCard, { backgroundColor: colors.white }]}>
            <View style={styles.imagePreviewHeader}>
              <Text style={[styles.modalTitle, { color: colors.dark, flex: 1 }]} numberOfLines={1}>{imagePreview.title}</Text>
              <TouchableOpacity onPress={closeImagePreview} accessibilityRole="button" accessibilityLabel="Close image preview">
                <MaterialIcons name="close" size={22} color={colors.dark} />
              </TouchableOpacity>
            </View>
            <View style={styles.imagePreviewContent}>
              {imagePreview.loading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : imagePreview.uri ? (
                <Image source={{ uri: imagePreview.uri }} style={styles.imagePreviewImage} resizeMode="contain" />
              ) : (
                <Text style={{ color: colors.gray }}>Unable to load image.</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Work confirmation */}
      <ConfirmationModal
        visible={showCompleteConfirm}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={handleCompleteWork}
        title="Complete Work?"
        message="This will notify the Supervisor to inspect the work and close the incident. You cannot add more work entries after this."
      />

      <Loader visible={submitting} text="Processing..." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.md },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', flex: 1, marginLeft: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 3 },
  emptyText: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.sm },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  entryLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  entryText: { flex: 1, marginLeft: 8 },
  entryDesc: { fontSize: 13, fontWeight: '600' },
  entryRemarks: { fontSize: 11, marginTop: 2 },
  entryDate: { fontSize: 10, marginTop: 2 },
  entryDetailDivider: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  entryDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  workCodeBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: SPACING.xs,
  },
  workCodeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  partsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    flexShrink: 0,
  },
  partsBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 3 },
  partReqRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  partReqTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  partReqTitle: { fontSize: 13, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  partItem: { fontSize: 12, marginTop: 2 },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  receiveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 6 },
  completeHint: { fontSize: 12, marginBottom: SPACING.sm, lineHeight: 18 },
  remarksInput: { marginBottom: SPACING.sm },
  completeBtn: { borderRadius: BORDER_RADIUS.md },
  breakdownToggleRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  breakdownToggleButton: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  breakdownButtonLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  decisionButton: { minHeight: 48 },
  decisionButtonContent: { minHeight: 44 },
  decisionButtonLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  breakdownTowBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  flowHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  towActionButton: { marginTop: 14, borderRadius: BORDER_RADIUS.md },
  towActionContent: { minHeight: 50 },
  towActionLabel: { fontSize: 13, fontWeight: '800' },
  imageBox: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
  },
  imageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imageActions: { flexDirection: 'row', alignItems: 'center' },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  imagePreviewCard: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  imagePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  imagePreviewContent: {
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  imagePreviewImage: {
    width: '100%',
    height: 420,
  },
  awaitingPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6D28D915',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  awaitingPillText: {
    marginLeft: 6,
    color: '#6D28D9',
    fontWeight: '700',
    fontSize: 12,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000060',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: 40,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: SPACING.md },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
  },
  selectorBtnText: { fontSize: 15, flex: 1 },
  modalInput: { marginBottom: SPACING.sm },
  modalActions: { flexDirection: 'row', marginTop: SPACING.md },
  partDraftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  partName: { fontSize: 13, fontWeight: '600' },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 13,
    width: 44,
    textAlign: 'center',
    marginHorizontal: 6,
  },
  addPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  addPartBtnText: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  partsSectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  // Issued items
  issuedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 8,
  },
  issuedItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 8,
  },
  addToFaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addToFaultBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 3 },
});

export default WorkEntryScreen;
