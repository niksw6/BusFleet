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
  RefreshControl,
  TextInput as RNTextInput,
  Alert,
  Image,
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
import { formatDateTime } from '../../../utils/helpers';

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
  const { workOrderDocEntry, dbName: routeDbName, jobCardNo, jobCardDocEntry, workEntryDocEntry: routeWorkEntryDocEntry, existingWorkEntry, fault: routeFault = null, faultLine: routeFaultLine = 0, complaintType: routeComplaintType = '', complaintNo: routeComplaintNo = '', depot: routeDepot = '' } = route.params || {};
  const dispatch = useDispatch();

  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const storeEntries = useSelector(state => state.workEntry.workEntries[String(workOrderDocEntry)] || EMPTY_LIST);
  const storePartsRequests = useSelector(state => state.workEntry.partsRequests[String(workOrderDocEntry)] || EMPTY_LIST);

  const mechanicCode = user?.Code || user?.code || user?.UserCode || user?.EmpCode || user?.User || user?.user || user?.name || '';
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
  const [repairType, setRepairType] = useState('P');
  const isBreakdownJob = String(routeComplaintType || '').toLowerCase().includes('breakdown');

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
  const [afterImageDrafts, setAfterImageDrafts] = useState([]);
  const [savedImages, setSavedImages] = useState([]);

  // Line Breakdown specific states
  const [canRepairOnSite, setCanRepairOnSite] = useState(true);
  const [towDepotMode, setTowDepotMode] = useState('default'); // 'default' or 'other'
  const [selectedTowDepot, setSelectedTowDepot] = useState(routeDepot || '');
  const [depotsList, setDepotsList] = useState([]);
  const [showDepotsModal, setShowDepotsModal] = useState(false);
  const [towRequestEntryId, setTowRequestEntryId] = useState(null);

  // Issued Items (from SAP Store)
  const [issuedItems, setIssuedItems] = useState([]);

  // Complete Work confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeRemarks, setCompleteRemarks] = useState('');
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
      const [faultDetailsResult, sparePartsResult, approvedResult, requestsResult, depotsResult, workEntryResult, jobCardResult] = await Promise.allSettled([
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
      ]);

      if (workEntryResult.status === 'fulfilled' && routeWorkEntryDocEntry) {
        const acceptedEntry = getWorkEntryRecord(workEntryResult.value);
        if (acceptedEntry && typeof acceptedEntry === 'object') {
          dispatch(setWorkEntries({
            docEntry: workOrderDocEntry,
            entries: [{
              ...acceptedEntry,
              ...(existingWorkEntry || {}),
              WorkEntryDocEntry: acceptedEntry?.WorkEntryDocEntry
                || acceptedEntry?.DocEntry
                || routeWorkEntryDocEntry,
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
      const jobCardFaults = Array.isArray(jobCard?.Faults) ? jobCard.Faults : [];
      const jobCardFault = jobCardFaults.find((fault) => String(
        fault?.FaultLine ?? fault?.FaultLineNo ?? fault?.Line ?? fault?.LineNum ?? ''
      ) === String(routeFaultLine)) || jobCardFaults.find((fault) => (
        Number(fault?.FaultLine ?? fault?.FaultLineNo ?? fault?.Line ?? fault?.LineNum) === Number(routeFaultLine) + 1
      )) || (jobCardFaults.length === 1 ? jobCardFaults[0] : null);

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
        const matchingFault = rows.find((row) => [row?.FaultCode, row?.Fault, row?.Description]
          .some(value => faultReferences.includes(String(value || '').trim().toLowerCase())));
        const resolvedFault = jobCardFault || matchingFault || routeFault;
        if (resolvedFault) {
          setIncidentFault({ ...routeFault, ...resolvedFault });
        }
        const faultCode = String(jobCardFault?.FaultCode || routeFault?.FaultCode || matchingFault?.FaultCode || '').trim();
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
    setBeforeImageDrafts([]);
    setShowAddEntry(false);
  };

  const pickWorkEntryImage = async (phase, useCamera = false) => {
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
    const updater = phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((previous) => [...previous, ...selected].slice(0, MAX_IMAGES_PER_PHASE));
  };

  const removeImageDraft = (phase, id) => {
    const updater = phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((previous) => previous.filter((image) => image.id !== id));
  };

  const persistWorkEntryImages = async (phase, drafts, workEntryDocEntry) => {
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
      const response = await workEntryService.saveWorkEntryImage({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        FaultLine: Number(routeFaultLine) || 0,
        ImgType: phase,
        ImgNo: existingCount + index + 1,
        ImgPath: fileName,
        Remarks: entryRemarks || completeRemarks || '',
      });
      if (!isApiSuccess(response)) throw new Error(response?.Message || `Failed to save ${phase === 'BF' ? 'before' : 'after'} image.`);
      records.push({ fileName, phase, uri: drafts[index]?.uri || '' });
    }
    setSavedImages((previous) => [...previous, ...records]);
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
    if (isBreakdownJob && beforeImageDrafts.length === 0) {
      Toast.show({ type: 'error', text1: 'Before image required', text2: 'Upload a before image before saving breakdown work.' });
      return;
    }

    try {
      setSubmitting(true);
      if (isBreakdownJob) {
        const breakdownPayload = {
          CompanyDB: dbName || 'MUTSPL_TEST',
          JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
          FaultLine: Number(routeFaultLine) || 1,
          UserCode: mechanicCode,
          RepairType: repairType,
          CanRepairOnSite: true,
          FinalRemarks: entryRemarks || '',
          Details: [
            {
              WorkCode: selectedWork?.Code || 'OTHER',
              WorkDone: selectedWork?.Code === 'OTHER' ? description : (selectedWork?.Name || description),
              OtherDescription: selectedWork?.Code === 'OTHER' ? description : '',
              Remarks: entryRemarks || '',
            },
          ],
        };

        const breakdownRes = await lineBreakdownService.createLineBreakdownWorkEntry(breakdownPayload);
        if (!breakdownRes?.Success && !breakdownRes?.Status) {
          throw new Error(breakdownRes?.Message || 'Failed to create breakdown work entry');
        }

        const responseData = breakdownRes?.Data ?? breakdownRes;
        const createdEntry = responseData?.WorkEntry
          || responseData?.WorkEntryDetails
          || (responseData && typeof responseData === 'object' && !Array.isArray(responseData) ? responseData : {});
        const createdEntryId = createdEntry?.WorkEntryDocEntry
          || createdEntry?.WorkEntryNo
          || createdEntry?.WorkEntryEntry
          || createdEntry?.DocEntry
          || createdEntry?.Code
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
          Details: savedEntry?.Details || breakdownPayload.Details,
        };
        dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: visibleEntry }));
        if (!createdEntryId) {
          console.warn('[WorkEntry] Breakdown work entry saved but no WorkEntryDocEntry was returned:', JSON.stringify(breakdownRes));
        }

        Toast.show({
          type: 'success',
          text1: 'Breakdown work entry created',
          text2: `Repair selected: ${repairType === 'P' ? 'Permanent' : 'Temporary'}`,
        });
        resetEntryForm();
        return;
      }

      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        FaultLine: Number(routeFaultLine) || 0,
        UserCode: mechanicCode,
        FinalRemarks: entryRemarks,
        Details: [
          {
            WorkCode: selectedWork?.Code || 'OTHER',
            WorkDone: selectedWork?.Code === 'OTHER' ? description : (selectedWork?.Name || description),
            OtherDescription: selectedWork?.Code === 'OTHER' ? description : '',
            Remarks: entryRemarks || '',
          },
        ],
        Parts: entryParts.map((p) => ({
          ItemCode: p.ItemCode || p.Code || '',
          ItemName: p.ItemName || p.Name || '',
          ReqQty: parseFloat(p.Qty) || 1,
          Warehouse: p.Warehouse || '',
          Remarks: p.Remarks || '',
        })),
        ComplaintType: (String(routeComplaintType || '')).includes('Breakdown') || (String(routeComplaintType || '').toLowerCase().includes('breakdown')) ? 'Breakdown' : undefined,
      };

      const res = await mechanicService.createWorkEntry(payload);
      if (res?.Success) {
        dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: res.Data || payload }));
        Toast.show({ type: 'success', text1: 'Work entry added' });
        resetEntryForm();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to add work entry' });
      }
    } catch (err) {
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
    if (beforeImageDrafts.length === 0) {
      Toast.show({ type: 'error', text1: 'Breakdown photo required', text2: 'Upload a photo before requesting a tow vehicle.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        FaultLine: Number(routeFaultLine) || 0,
        UserCode: mechanicCode,
        FinalRemarks: entryRemarks || 'Tow requested',
        Details: [
          {
            WorkCode: 'TOW_REQUEST',
            WorkDone: 'Tow requested - vehicle to be moved to depot',
            OtherDescription: '',
            Remarks: entryRemarks || '',
          },
        ],
        TowRequested: true,
        TowDepot: selectedTowDepot,
        CanRepairOnSite: false,
        ComplaintType: (String(routeComplaintType || '')).toLowerCase().includes('breakdown') ? 'Breakdown' : undefined,
      };

      const res = await mechanicService.createWorkEntry(payload);
      if (res?.Success) {
        const created = res.Data || {};
        const workEntryDocEntry = created?.WorkEntryDocEntry || created?.DocEntry || created?.Code || null;
        if (workEntryDocEntry) {
          await persistWorkEntryImages('BF', beforeImageDrafts, workEntryDocEntry);
          // Do not call AssignBreakdownTeam here. That API performs a real team
          // assignment and rejects this stage because no team is selected. The
          // saved TowRequested work entry is the event the supervisor queue uses.
          console.log('[WorkEntry] Tow requested; awaiting supervisor depot-team assignment:', JSON.stringify({
            breakdownNo: routeComplaintNo || '',
            jobCardDocEntry: resolvedJobCardDocEntry,
            depot: selectedTowDepot,
          }));
          dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: { ...created, WorkEntryDocEntry: workEntryDocEntry, TowRequested: true } }));
          setTowRequestEntryId(workEntryDocEntry);
          setBeforeImageDrafts([]);
          Toast.show({ type: 'success', text1: 'Tow requested', text2: 'Add the depot-arrival photo when the bus arrives.' });
          return;
        }

        dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: res.Data || payload }));
        Toast.show({ type: 'success', text1: 'Tow requested' });
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to request tow' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTowArrival = async () => {
    if (!towRequestEntryId) return;
    if (afterImageDrafts.length === 0) {
      Toast.show({ type: 'error', text1: 'Arrival photo required', text2: 'Upload a photo of the bus with the towing van at the depot.' });
      return;
    }
    try {
      setSubmitting(true);
      await persistWorkEntryImages('AF', afterImageDrafts, towRequestEntryId);
      const res = await mechanicService.completeWork({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(towRequestEntryId) || towRequestEntryId,
        UserCode: mechanicCode,
        FinalRemarks: 'Bus and towing van arrived at depot. Supervisor to assign depot maintenance team.',
      });
      if (!res?.Success) throw new Error(res?.Message || 'Failed to close tow work entry');
      Toast.show({ type: 'success', text1: 'Depot arrival recorded', text2: 'Supervisor can now assign the depot maintenance team and notify its leader.' });
      setAwaitingVerification(true);
      setAfterImageDrafts([]);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error recording depot arrival' });
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
    try {
      const res = await storeService.receiveJobCardParts({
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        UserCode: mechanicCode,
        Parts: (request?.Parts || []).map((part) => ({
          PartLine: Number(part?.PartLine ?? part?.LineId ?? part?.Line ?? part?.LineNum) || 0,
          ReceivedQty: Number(part?.IssuedQty ?? part?.ApprovedQty ?? part?.ReqQty ?? 0) || 0,
        })),
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
        if (afterImageDrafts.length === 0) {
          throw new Error('Upload an after image before completing the breakdown work.');
        }
        await persistWorkEntryImages('AF', afterImageDrafts, workEntryDocEntry);
        const res = await lineBreakdownService.completeLineBreakdownWorkEntry({
          CompanyDB: dbName || 'MUTSPL_TEST',
          WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
          FinalRemarks: completeRemarks || '',
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
            WO #{workOrderDocEntry}{jobCardNo ? `  ·  JC #${jobCardNo}` : ''}
          </Text>
          {(awaitingVerification || storeEntries.some(entry => isAwaitingVerificationStatus(entry?.Status || entry?.WorkStatus || entry?.FaultStatus))) && (
            <View style={styles.awaitingPill}>
              <MaterialIcons name="check-circle" size={14} color="#6D28D9" />
              <Text style={styles.awaitingPillText}>Awaiting Verification</Text>
            </View>
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
                <Button
                  mode={canRepairOnSite ? 'contained' : 'outlined'}
                  onPress={() => setCanRepairOnSite(true)}
                  icon="build"
                  buttonColor={canRepairOnSite ? '#167A45' : undefined}
                  style={[styles.breakdownToggleButton, styles.decisionButton]}
                  labelStyle={styles.decisionButtonLabel}
                  contentStyle={styles.decisionButtonContent}
                >
                  Repair on Site
                </Button>
                <Button
                  mode={!canRepairOnSite ? 'contained' : 'outlined'}
                  onPress={() => setCanRepairOnSite(false)}
                  icon="local-shipping"
                  buttonColor={!canRepairOnSite ? '#C2410C' : undefined}
                  style={[styles.breakdownToggleButton, styles.decisionButton]}
                  labelStyle={styles.decisionButtonLabel}
                  contentStyle={styles.decisionButtonContent}
                >
                  Tow to Depot
                </Button>
              </View>

              {canRepairOnSite && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.dark, marginLeft: 0, marginTop: 10, marginBottom: 6 }]}>Permanent or Temporary Repair?</Text>
                  <View style={styles.breakdownToggleRow}>
                    <Button mode={repairType === 'P' ? 'contained' : 'outlined'} onPress={() => setRepairType('P')} buttonColor={repairType === 'P' ? '#167A45' : undefined} style={styles.breakdownToggleButton} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent}>
                      Permanent Repair
                    </Button>
                    <Button mode={repairType === 'T' ? 'contained' : 'outlined'} onPress={() => setRepairType('T')} buttonColor={repairType === 'T' ? '#EA580C' : undefined} style={styles.breakdownToggleButton} labelStyle={styles.decisionButtonLabel} contentStyle={styles.decisionButtonContent}>
                      Temporary Repair
                    </Button>
                  </View>
                  <Text style={[styles.flowHint, { color: repairType === 'P' ? '#166534' : '#9A3412' }]}>
                    {repairType === 'P'
                      ? 'Before photo → repair on site → after photo → close work entry → supervisor inspection.'
                      : 'Before photo → temporary repair → after photo → close work entry → bus returns to depot for depot-team assignment.'}
                  </Text>
                </>
              )}

              {!canRepairOnSite && (
                <View style={[styles.breakdownTowBox, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}> 
                  <Text style={{ color: '#9A4A00', fontWeight: '700', marginBottom: 5 }}>Tow Vehicle Request</Text>
                  <Text style={{ color: '#9A4A00', fontSize: 12, marginBottom: 8 }}>Upload a breakdown photo, request the tow, then record the bus and towing van at depot arrival.</Text>
                  <View style={styles.breakdownToggleRow}>
                    <Button
                      mode={towDepotMode === 'default' ? 'contained' : 'outlined'}
                      onPress={() => {
                        setTowDepotMode('default');
                        setSelectedTowDepot(routeDepot || selectedTowDepot);
                      }}
                      buttonColor={towDepotMode === 'default' ? '#C2410C' : undefined}
                      labelStyle={styles.decisionButtonLabel}
                      contentStyle={styles.decisionButtonContent}
                      style={styles.breakdownToggleButton}
                    >
                      Default depot
                    </Button>
                    <Button
                      mode={towDepotMode === 'other' ? 'contained' : 'outlined'}
                      onPress={() => setTowDepotMode('other')}
                      buttonColor={towDepotMode === 'other' ? '#C2410C' : undefined}
                      labelStyle={styles.decisionButtonLabel}
                      contentStyle={styles.decisionButtonContent}
                      style={styles.breakdownToggleButton}
                    >
                      Other depot
                    </Button>
                  </View>

                  {towDepotMode === 'other' && (
                    <TouchableOpacity style={[styles.selectorBtn, { marginTop: 8, borderColor: '#FDBA74', backgroundColor: colors.white }]} onPress={() => setShowDepotsModal(true)}>
                      <Text style={[styles.selectorBtnText, { color: selectedTowDepot ? colors.dark : colors.gray }]} numberOfLines={1}>
                        {selectedTowDepot || 'Select depot'}
                      </Text>
                      <MaterialIcons name="expand-more" size={20} color={colors.gray} />
                    </TouchableOpacity>
                  )}

                  {!towRequestEntryId ? (
                    <>
                      <View style={[styles.imageBox, { borderColor: '#FDBA74', backgroundColor: colors.white }]}>
                        <Text style={{ color: '#9A4A00', fontWeight: '700', fontSize: 13 }}>Breakdown Photo *</Text>
                        <View style={styles.imageActions}>
                          <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#00689E', flex: 1 }]} onPress={() => pickWorkEntryImage('BF')}>
                            <MaterialIcons name="photo-library" size={16} color="#00689E" /><Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#007A5A', flex: 1, marginLeft: 8 }]} onPress={() => pickWorkEntryImage('BF', true)}>
                            <MaterialIcons name="photo-camera" size={16} color="#007A5A" /><Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Button mode="contained" icon="local-shipping" buttonColor="#C2410C" onPress={handleRequestTow} loading={submitting} disabled={submitting} style={styles.towActionButton} contentStyle={styles.towActionContent} labelStyle={styles.towActionLabel}>
                        Request Tow & Notify Supervisor
                      </Button>
                    </>
                  ) : (
                    <>
                      <View style={[styles.imageBox, { borderColor: '#FDBA74', backgroundColor: colors.white }]}>
                        <Text style={{ color: '#9A4A00', fontWeight: '700', fontSize: 13 }}>Bus + Towing Van at Depot *</Text>
                        <View style={styles.imageActions}>
                          <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#00689E', flex: 1 }]} onPress={() => pickWorkEntryImage('AF')}>
                            <MaterialIcons name="photo-library" size={16} color="#00689E" /><Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.addLineBtn, { borderColor: '#007A5A', flex: 1, marginLeft: 8 }]} onPress={() => pickWorkEntryImage('AF', true)}>
                            <MaterialIcons name="photo-camera" size={16} color="#007A5A" /><Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Button mode="contained" icon="location-on" buttonColor="#C2410C" onPress={handleConfirmTowArrival} loading={submitting} disabled={submitting} style={styles.towActionButton} contentStyle={styles.towActionContent} labelStyle={styles.towActionLabel}>
                        Record Depot Arrival & Close Work Entry
                      </Button>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Work Entries */}
        <View style={[styles.card, { backgroundColor: colors.white }]}> 
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

          {storeEntries.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.gray }]}>No work entries yet. Tap Add to begin.</Text>
          ) : (
            storeEntries.map((entry, i) => (
              <View key={i} style={[styles.entryRow, { borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.entryLeft}>
                  <MaterialIcons name="build" size={16} color="#0070F2" />
                  <View style={styles.entryText}>
                    <Text style={[styles.entryDesc, { color: colors.dark }]}>
                      {entry.Description || entry.WorkListName || entry?.Details?.[0]?.WorkDone || '—'}
                    </Text>
                    {entry.Remarks ? (
                      <Text style={[styles.entryRemarks, { color: colors.gray }]}>{entry.Remarks}</Text>
                    ) : null}
                    {entry.EntryDate ? (
                      <Text style={[styles.entryDate, { color: colors.gray }]}>
                        {formatDateTime(entry.EntryDate)}
                      </Text>
                    ) : null}
                  </View>
                </View>
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
              </View>
            ))
          )}
        </View>

        {/* ── Parts Requests ── */}
        {storePartsRequests.length > 0 && (
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

                  {isIssued && !isReceived && (
                    <TouchableOpacity
                      style={[styles.receiveBtn, { backgroundColor: '#0070F2' }]}
                      onPress={() => handleMarkReceived(req)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="check-circle" size={16} color="#FFF" />
                      <Text style={styles.receiveBtnText}>Part Received</Text>
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

        {/* ── Complete Work ── */}
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
                <Text style={{ color: colors.gray, fontSize: 12 }}>{afterImageDrafts.length}/{MAX_IMAGES_PER_PHASE}</Text>
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
                <View key={image.id} style={styles.imageRow}>
                  <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                  <TouchableOpacity onPress={() => removeImageDraft('AF', image.id)}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
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

            {isBreakdownJob && (
              <View style={[styles.imageBox, { borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.imageHeaderRow}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13 }}>Before Image</Text>
                  <Text style={{ color: colors.gray, fontSize: 12 }}>{beforeImageDrafts.length}/{MAX_IMAGES_PER_PHASE}</Text>
                </View>
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8 }}>Required before saving breakdown work.</Text>
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
                  <View key={image.id} style={styles.imageRow}>
                    <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>{image.name}</Text>
                    <TouchableOpacity onPress={() => removeImageDraft('BF', image.id)}>
                      <MaterialIcons name="close" size={18} color="#BB0000" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

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
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>{item.ItemName || item.Name}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{item.ItemCode}</Text>
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
              {item.ItemName || item.Name || item.Dscription}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>
              {item.ItemCode || item.Code}
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
