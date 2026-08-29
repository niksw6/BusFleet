import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput as RNTextInput, Modal as RNModal, Image } from 'react-native';
import { Text, TextInput, Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { mechanicService, storeService, masterService, jobCardService, workEntryService, lineBreakdownService } from '../../../api/services';

/**
 * FaultWorkScreen — Mechanic/Electrician's step-by-step work flow for ONE fault line.
 *
 * Confirmed live endpoints used here:
 *   POST StartWork          { CompanyDB, DocEntry, FaultLine, UserCode }
 *   POST CreateWorkEntry    { CompanyDB, JobCardDocEntry, FaultLine, UserCode, FinalRemarks, Details:[] }
 *   POST UpdateWorkEntry    { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks, Details:[] }
 *   POST CompleteWork       { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks }
 *   POST RequestWorkEntryParts { CompanyDB, WorkEntryDocEntry, UserCode, Parts:[] }
 *   POST RequestSpecialTool { CompanyDB, WorkEntryDocEntry, MechanicCode, Tools:[] }
 *   GET  GetApprovedJobCardParts?CompanyDB=...&UserCode=...
 *   POST ReceiveWorkEntryParts { CompanyDB, WorkEntryDocEntry, Parts:[{LineId,ReceivedQty}] }
 *
 * Note: the API set does not expose a "get my open work entry for this fault" lookup,
 * so once a Work Entry is created its WorkEntryDocEntry is kept in this screen's
 * local state (and passed back via navigation params) for the rest of the session.
 */

const STEP = {
  START: 'START',       // fault accepted, not yet started
  WORKING: 'WORKING',    // work entry in progress
  DONE: 'DONE',
};

const isAwaitingVerificationStatus = (value) => {
  const status = String(value || '').trim().toUpperCase();
  return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION', 'V', 'VERIFY'].includes(status);
};

const isApiSuccess = (response) => {
  if (!response || typeof response !== 'object') return false;
  const hasExplicitFlag = Object.prototype.hasOwnProperty.call(response, 'Success') || Object.prototype.hasOwnProperty.call(response, 'Status');
  if (!hasExplicitFlag) return true;
  return response?.Success === true || response?.Status === true;
};

const MAX_IMAGES_PER_FAULT = 4;
const MIN_IMAGES_PER_FAULT = 1;
const MAX_IMAGES_PER_PHASE = 2;

const extractImageFileName = (record) => String(
  record?.FileName
  || record?.ImgPath
  || record?.ImagePath
  || record?.ImageName
  || record?.Name
  || ''
).trim();

const normalizeSpecialToolRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row, index) => ({
      ...row,
      ToolCode: String(row?.ToolCode || row?.Code || '').trim(),
      ToolName: String(row?.ToolName || row?.Name || row?.Description || row?.ToolCode || row?.Code || '').trim(),
      Status: String(row?.Status || row?.ApprovalStatus || 'RQ').trim().toUpperCase(),
      Remarks: String(row?.Remarks || row?.MechanicRemarks || '').trim(),
      LineId: row?.LineId ?? row?.Line ?? row?.LineNum ?? index + 1,
    }))
    .filter((row) => row.ToolCode || row.ToolName);
};

const extractSpecialToolsForFault = (workEntry, faultItem) => {
  const directRows = [
    ...(Array.isArray(workEntry?.SpecialTools) ? workEntry.SpecialTools : []),
    ...(Array.isArray(workEntry?.Tools) ? workEntry.Tools : []),
  ];
  if (directRows.length > 0) return directRows;

  const nestedRows = (Array.isArray(faultItem?.WorkEntries) ? faultItem.WorkEntries : [])
    .flatMap((entry) => [
      ...(Array.isArray(entry?.SpecialTools) ? entry.SpecialTools : []),
      ...(Array.isArray(entry?.Tools) ? entry.Tools : []),
    ]);

  return nestedRows;
};

const FaultWorkScreen = ({ route, navigation }) => {
  const { docEntry, faultLine, fault, dbName: routeDbName, workEntryDocEntry: routeWorkEntryDocEntry, existingWorkEntry, isWorkStarted, complaintType: routeComplaintType = '', jobCardNo, complaintNo, depot: routeDepot = '' } = route.params || {};
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.User || user?.user || user?.name || '';
  const createDetailId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const getInitialSavedImages = () => {
    const imageRows = [
      ...(Array.isArray(existingWorkEntry?.Images) ? existingWorkEntry.Images : []),
      ...(Array.isArray(existingWorkEntry?.WorkEntryImages) ? existingWorkEntry.WorkEntryImages : []),
      ...(Array.isArray(existingWorkEntry?.ImageList) ? existingWorkEntry.ImageList : []),
      ...(Array.isArray(fault?.Images) ? fault.Images : []),
    ];

    return imageRows
      .map((row, index) => {
        const fileName = extractImageFileName(row);
        if (!fileName) return null;
        const imgNo = Number(row?.ImgNo) || index + 1;
        const imgType = String(row?.ImgType || (imgNo === 1 ? 'BF' : 'AF')).trim().toUpperCase();
        return {
          id: `${fileName}-${imgNo}`,
          fileName,
          imgType,
          imgNo,
          displayName: `${imgNo === 1 ? 'Before image' : 'After image'}: ${fileName}`,
          localUri: String(row?.LocalUri || row?.uri || '').trim(),
        };
      })
      .filter(Boolean)
      .slice(0, MAX_IMAGES_PER_FAULT);
  };

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(() => (
    isWorkStarted || routeWorkEntryDocEntry || existingWorkEntry?.DocEntry ? STEP.WORKING : STEP.START
  ));
  const [workEntryDocEntry, setWorkEntryDocEntry] = useState(routeWorkEntryDocEntry || null);

  const [workList, setWorkList] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [approvedParts, setApprovedParts] = useState([]);
  const [resolvedFaultCode, setResolvedFaultCode] = useState('');
  const isBreakdownJob = String(routeComplaintType || '').toLowerCase().includes('breakdown');
  const [repairType, setRepairType] = useState('P');
  const [canRepairOnSite, setCanRepairOnSite] = useState(true);
  const [selectedTowDepot, setSelectedTowDepot] = useState(routeDepot || '');
  const [depotsList, setDepotsList] = useState([]);
  const [showDepotsModal, setShowDepotsModal] = useState(false);

  // Work entry form
  const [finalRemarks, setFinalRemarks] = useState(existingWorkEntry?.FinalRemarks || '');
  const [details, setDetails] = useState(() => (Array.isArray(existingWorkEntry?.Details)
    ? existingWorkEntry.Details.map(detail => ({
        id: createDetailId(),
        WorkCode: detail?.WorkCode || 'OTHER',
        WorkDone: detail?.WorkDone || '',
        OtherDescription: detail?.OtherDescription || '',
        Remarks: detail?.Remarks || '',
        locked: true,
      }))
    : [])); // [{ WorkCode, WorkDone, OtherDescription, Remarks }]
  const [showWorkListModal, setShowWorkListModal] = useState(false);

  // Parts request form
  const [partsDraft, setPartsDraft] = useState([]); // [{ ItemCode, ItemName, ReqQty, Warehouse, Remarks }]
  const [toolsDraft, setToolsDraft] = useState([]); // [{ ToolCode, ToolName, Remarks }]
  const [existingSpecialTools, setExistingSpecialTools] = useState(() => normalizeSpecialToolRows(extractSpecialToolsForFault(existingWorkEntry, fault)));
  const [availableTools, setAvailableTools] = useState([]);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [specialToolRemarks, setSpecialToolRemarks] = useState('');
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehouseTargetCode, setWarehouseTargetCode] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receivedQty, setReceivedQty] = useState('');
  // Return parts
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnDraft, setReturnDraft] = useState([]); // [{ part, LineId, ReturnQty, ReturnReason, Remarks }]
  const [beforeImageDrafts, setBeforeImageDrafts] = useState([]);
  const [afterImageDrafts, setAfterImageDrafts] = useState([]);
  const [savedImages, setSavedImages] = useState(getInitialSavedImages);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(
    isAwaitingVerificationStatus(existingWorkEntry?.Status)
    || isAwaitingVerificationStatus(existingWorkEntry?.WorkStatus)
    || isAwaitingVerificationStatus(existingWorkEntry?.FaultStatus)
    || isAwaitingVerificationStatus(fault?.Status)
    || isAwaitingVerificationStatus(fault?.WorkStatus)
    || isAwaitingVerificationStatus(fault?.FaultStatus)
  );
  const workEntryLocked = awaitingVerification || step === STEP.DONE;

  const extractRows = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).find(Array.isArray) || [];
  };

  const normalizeWorkItems = (rows) => rows.map((row) => ({
    ...row,
    Code: String(row?.Code || row?.WorkCode || row?.WorkListCode || row?.Solution || row?.WorkId || row?.ID || '').trim(),
    Name: String(row?.Name || row?.WorkName || row?.WorkDone || row?.ActivityName || row?.Description || row?.Dscription || row?.Code || row?.WorkCode || '').trim(),
  })).filter(row => row.Code || row.Name);

  const normalizeParts = (rows) => rows.map((row) => ({
    ...row,
    ItemCode: String(row?.ItemCode || row?.Code || '').trim(),
    ItemName: String(row?.ItemName || row?.Name || row?.Dscription || row?.Description || row?.ItemCode || row?.Code || '').trim(),
  })).filter(row => row.ItemCode || row.ItemName);

  const getPartQty = (part) => {
    const values = [part?.ApprovedQty, part?.AprQty, part?.Qty, part?.ReqQty, part?.RequestedQty];
    const positive = values.find(value => Number(value) > 0);
    return positive ?? values.find(value => value !== undefined && value !== null && value !== '') ?? 1;
  };

  const getPartStatus = (part) => String(part?.Status ?? part?.ApprovalStatus ?? '').trim().toUpperCase();
  const getIssuedQty = (part) => Number(part?.IssQty ?? part?.IssuedQty ?? part?.IssueQty ?? 0) || 0;
  const getReceivedQty = (part) => Number(part?.RecQty ?? part?.ReceivedQty ?? 0) || 0;
  const getApprovedQty = (part) => Number(getPartQty(part)) || 0;

  const isPartFullyReceived = (part) => {
    const approvedQty = getApprovedQty(part);
    const receivedQty = getReceivedQty(part);
    const status = getPartStatus(part);
    return status === 'RC' || (approvedQty > 0 && receivedQty >= approvedQty);
  };

  const isPartApproved = (part) => {
    // Parts embedded with an assigned fault were selected by the Supervisor
    // while creating the Job Card. They are pre-approved by business rule;
    // only extra parts raised by a mechanic go through approval.
    if (part?.SupervisorProvided) return true;
    const status = getPartStatus(part);
    return Number(part?.AprQty ?? part?.ApprovedQty ?? 0) > 0
      || ['A', 'AP', 'PS', 'IS', 'PR', 'RC', 'APPROVED', 'READY', 'READY TO COLLECT'].includes(status);
  };

  // Strict check for return eligibility — ignores SupervisorProvided shortcut,
  // requires the backend to have confirmed an approval status explicitly.
  const isPartReturnEligible = (part) => {
    const status = getPartStatus(part);
    return ['AP', 'A', 'IS', 'PR', 'PS', 'RC', 'APPROVED'].includes(status)
      || Number(part?.AprQty ?? part?.ApprovedQty ?? 0) > 0;
  };

  // Receipt is a backend line operation, never a UI-list-index operation.
  // ReceiveWorkEntryParts uses LineId (fallback: PartLine/FaultLine variants).
  const getReceiveLineId = (part) => {
    const rawLine = part?.LineId
      ?? part?.PartLine
      ?? part?.FaultLine
      ?? part?.FaultLineNo
      ?? part?.Line
      ?? part?.LineNum;
    if (rawLine === undefined || rawLine === null || String(rawLine).trim() === '') return null;
    const line = Number(rawLine);
    if (!Number.isFinite(line) || line < 0) return null;
    return line === 0 ? 1 : line;
  };

  const faultReference = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || fault?.Code || '').trim();
  const partIdentityCandidates = [...new Set([
    userCode,
    user?.EmpCode,
    user?.EmployeeCode,
    user?.EmpID,
    user?.EmployeeID,
    user?.username,
    user?.Name,
    user?.name,
  ].map(value => String(value || '').trim()).filter(Boolean))];

  const loadData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [faultDetailsResult, sparePartsResult, warehousesResult, approvedResults, jobCardResult] = await Promise.all([
        Promise.allSettled([
        masterService.getFaultDetails(companyDb),
        masterService.getSpareParts(companyDb),
        masterService.getWarehouses(companyDb),
        ]),
        Promise.allSettled(partIdentityCandidates.map(identity => storeService.getApprovedJobCardParts(companyDb, identity))),
        Promise.allSettled([
        jobCardService.getJobCardDetail(companyDb, docEntry),
        ]),
      ]).then(([masterResults, partResults, jobCardResults]) => [...masterResults, partResults, jobCardResults]);
      const faultMasters = faultDetailsResult.status === 'fulfilled' ? extractRows(faultDetailsResult.value) : [];
      const normalizedReference = faultReference.toLowerCase();
      const matchingFault = faultMasters.find((row) => [row?.FaultCode, row?.Fault, row?.Description]
        .some(value => String(value || '').trim().toLowerCase() === normalizedReference));
      const resolvedFaultCode = String(matchingFault?.FaultCode || faultReference).trim();
      setResolvedFaultCode(resolvedFaultCode);
      let faultWorkItems = [];
      if (resolvedFaultCode) {
        try {
          const faultResponse = await masterService.getFaultByCode(companyDb, resolvedFaultCode);
          faultWorkItems = normalizeWorkItems(extractRows(faultResponse));
        } catch (faultLookupError) {
          // General work list below remains the safe fallback.
        }
      }
      const workItems = faultWorkItems;
      const partItems = sparePartsResult.status === 'fulfilled' ? normalizeParts(extractRows(sparePartsResult.value)) : [];
      const warehouseRows = warehousesResult.status === 'fulfilled' ? extractRows(warehousesResult.value) : [];
      setWarehouses(warehouseRows.map((row) => ({
        ...row,
        WarehouseCode: String(row?.WarehouseCode || row?.WhsCode || row?.Code || '').trim(),
        WarehouseName: String(row?.WarehouseName || row?.WhsName || row?.Name || row?.WarehouseCode || row?.WhsCode || '').trim(),
      })).filter(row => row.WarehouseCode || row.WarehouseName));
      setWorkList([...workItems, { Code: 'OTHER', Name: 'Other work (enter manually)' }]);
      setSpareParts([...partItems, { ItemCode: 'OTHER', ItemName: 'Other part (enter manually)' }]);

      if (isBreakdownJob) {
        try {
          const depotResponse = await masterService.getDepots(companyDb);
          const depotRows = extractRows(depotResponse);
          setDepotsList(depotRows);
          if (!selectedTowDepot && depotRows.length > 0) {
            setSelectedTowDepot(depotRows[0]?.Depot || depotRows[0]?.Name || depotRows[0]?.DepotName || '');
          }
        } catch (depotError) {
          console.warn('GetDepots failed:', depotError?.message || depotError);
        }
      }

      const approvedFromQueue = approvedResults.flatMap(result => (
        result.status === 'fulfilled' ? extractRows(result.value) : []
      ));
      const detail = jobCardResult.status === 'fulfilled' ? (jobCardResult.value?.Data ?? jobCardResult.value) : {};
      const detailParts = [
        ...(Array.isArray(detail?.Parts) ? detail.Parts : []),
        ...(Array.isArray(detail?.Faults) ? detail.Faults.flatMap((row, index) => (
          Array.isArray(row?.Parts)
            ? row.Parts.map(part => ({
                ...part,
                FaultLine: part?.FaultLine ?? part?.FaultLineNo ?? row?.FaultLine ?? row?.LineNum ?? index,
              }))
            : []
        )) : []),
      ];
      const getPartFaultLine = (part) => {
        return part?.FaultLine ?? part?.FaultLineNo ?? part?.JCLine ?? part?.Line ?? part?.LineNum;
      };
      const selectPartsForFault = (parts) => {
        const unscoped = parts.filter(part => getPartFaultLine(part) === undefined || getPartFaultLine(part) === null);
        const exact = parts.filter(part => String(getPartFaultLine(part)) === String(faultLine));
        if (exact.length > 0) return [...exact, ...unscoped];

        // Existing Job Cards created before the updated API contract used
        // one-based lines. Use that only when no exact current-format match exists.
        const legacy = parts.filter(part => Number(getPartFaultLine(part)) === Number(faultLine) + 1);
        return [...legacy, ...unscoped];
      };
      const belongsToThisJobCard = (part) => {
        const partJobCard = part?.JobCardDocEntry ?? part?.JobCardNo ?? part?.DocEntry;
        return String(partJobCard ?? '') === String(docEntry);
      };
      const belongsToFault = (part) => {
        const partFaultLine = part?.FaultLine ?? part?.FaultLineNo ?? part?.JCLine ?? part?.Line ?? part?.LineNum;
        return partFaultLine === undefined || partFaultLine === null || String(partFaultLine) === String(faultLine);
      };
      const approved = [
        ...selectPartsForFault(approvedFromQueue.filter(belongsToThisJobCard)),
        ...selectPartsForFault(detailParts).map(p => ({ ...p, SupervisorProvided: true })),
        // GetMechanicDashboard is the authoritative assigned-fault response.
        // Its Parts collection must travel with the mechanic into Fault Work.
        ...(Array.isArray(fault?.Parts) ? fault.Parts.map(part => ({
          ...part,
          FaultLine: part?.FaultLine ?? faultLine,
          SupervisorProvided: true,
        })) : []),
        // Mechanic-requested parts are returned inside the active WorkEntry.
        // Status AP marks them as approved by the Supervisor and ready to use.
        ...(Array.isArray(existingWorkEntry?.Parts) ? existingWorkEntry.Parts.map(part => ({
          ...part,
          FaultLine: part?.FaultLine ?? faultLine,
          WorkEntryDocEntry: existingWorkEntry?.DocEntry ?? workEntryDocEntry,
        })) : []),
      ];
      const uniqueParts = new Map();
      approved.forEach((part, index) => uniqueParts.set(
        `${part?.ItemCode || part?.Code || ''}-${part?.FaultLine ?? part?.PartLine ?? part?.LineId ?? index}`,
        part,
      ));
      setApprovedParts(Array.from(uniqueParts.values()));

      // Fetch available special tools for this depot
      try {
        const depot = fault?.Depot || fault?.depot || user?.Depot || user?.depot || '';
        const toolsResponse = await storeService.getSpecialTools(companyDb, depot);
        const toolRows = Array.isArray(toolsResponse?.Data) ? toolsResponse.Data
          : Array.isArray(toolsResponse?.data) ? toolsResponse.data
          : Array.isArray(toolsResponse) ? toolsResponse : [];
        setAvailableTools(toolRows.map(t => ({
          ...t,
          ToolCode: String(t?.ToolCode || t?.Code || '').trim(),
          ToolName: String(t?.ToolName || t?.Name || t?.Description || '').trim(),
        })).filter(t => t.ToolCode));
      } catch (_) {
        // Non-critical; mechanic can still proceed
      }
    } finally {
      setLoading(false);
    }
  }, [dbName, userCode, docEntry, faultReference, faultLine, workEntryDocEntry, existingWorkEntry, partIdentityCandidates.join('|'), isBreakdownJob, selectedTowDepot]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setExistingSpecialTools(normalizeSpecialToolRows(extractSpecialToolsForFault(existingWorkEntry, fault)));
  }, [existingWorkEntry, fault]);

  useEffect(() => {
    if (workEntryDocEntry) {
      setStep(STEP.WORKING);
    }
  }, [workEntryDocEntry]);

  const faultName = fault?.Fault || fault?.FaultName || fault?.Description || 'Fault';
  const busNo = fault?.BusNo || '';
  const approvedForCollection = approvedParts.filter(isPartApproved);
  const pendingSupervisorParts = approvedParts.filter(part => !isPartApproved(part));
  const savedBeforeImages = savedImages.filter((image) => String(image.imgType || '').toUpperCase() === 'BF');
  const savedAfterImages = savedImages.filter((image) => String(image.imgType || '').toUpperCase() === 'AF');
  const hasSavedBeforeImage = savedBeforeImages.length > 0;

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
          if (['Base64', 'ImageBase64', 'FileBase64', 'Content', 'Data', 'Result', 'ImageData', 'ImgData', 'Photo', 'Binary'].includes(key) && typeof value === 'string' && value.trim()) {
            return value.trim();
          }
          queue.push(value);
        }
      }
    }

    return '';
  };

  const validateImageRules = (phase, draftImages, isFirstSave = false) => {
    const count = draftImages.length;
    if (count < MIN_IMAGES_PER_FAULT) {
      Toast.show({
        type: 'error',
        text1: 'Image required',
        text2: phase === 'BF'
          ? 'Add the before image before saving the first work entry.'
          : 'Add the after image before completing the work.',
      });
      return false;
    }
    if (count > MAX_IMAGES_PER_PHASE) {
      Toast.show({ type: 'error', text1: 'Maximum images reached', text2: `Only ${MAX_IMAGES_PER_PHASE} images can be added in this section.` });
      return false;
    }
    if (isFirstSave && hasSavedBeforeImage) {
      Toast.show({ type: 'error', text1: 'Already saved', text2: 'The before image was already uploaded for this work entry.' });
      return false;
    }
    return true;
  };

  const pickWorkEntryImages = async (phase) => {
    let ImagePicker = null;
    try {
      ImagePicker = require('expo-image-picker');
    } catch (moduleError) {
      Toast.show({
        type: 'error',
        text1: 'Image picker unavailable',
        text2: 'Rebuild the Android app after installing native modules.',
      });
      return;
    }

    const draftImages = phase === 'BF' ? beforeImageDrafts : afterImageDrafts;
    const savedPhaseCount = phase === 'BF' ? savedBeforeImages.length : savedAfterImages.length;
    const remainingSlots = Math.max(MAX_IMAGES_PER_PHASE - (savedPhaseCount + draftImages.length), 0);
    if (remainingSlots <= 0) {
      Toast.show({ type: 'info', text1: 'Image limit reached', text2: `Only ${MAX_IMAGES_PER_PHASE} images can be selected in this section.` });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission?.granted) {
      Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Media library permission is required to select images.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 0.7,
      base64: false,
    });

    if (result?.canceled) return;

    const selected = (result?.assets || [])
      .slice(0, 1)
      .map((asset, index) => ({
        id: `${Date.now()}-${index}-${asset?.uri || ''}`,
        uri: asset?.uri,
        name: asset?.fileName || `work-entry-${Date.now()}-${index + 1}.jpg`,
        mimeType: asset?.mimeType || 'image/jpeg',
      }))
      .filter((asset) => asset.uri);

    if (selected.length === 0) return;

    const updater = phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((prev) => {
      const existingUris = new Set(prev.map((item) => item.uri));
      const uniqueSelected = selected.filter((item) => !existingUris.has(item.uri));
      return [...prev, ...uniqueSelected].slice(0, remainingSlots + prev.length);
    });
  };

  const captureWorkEntryImage = async (phase) => {
    let ImagePicker = null;
    try {
      ImagePicker = require('expo-image-picker');
    } catch (moduleError) {
      Toast.show({
        type: 'error',
        text1: 'Camera unavailable',
        text2: 'Rebuild the Android app after installing native modules.',
      });
      return;
    }

    const draftImages = phase === 'BF' ? beforeImageDrafts : afterImageDrafts;
    const savedPhaseCount = phase === 'BF' ? savedBeforeImages.length : savedAfterImages.length;
    const remainingSlots = Math.max(MAX_IMAGES_PER_PHASE - (savedPhaseCount + draftImages.length), 0);
    if (remainingSlots <= 0) {
      Toast.show({ type: 'info', text1: 'Image limit reached', text2: `Only ${MAX_IMAGES_PER_PHASE} images can be selected in this section.` });
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission?.granted) {
      Toast.show({ type: 'error', text1: 'Permission denied', text2: 'Camera permission is required to capture images.' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
      base64: false,
    });

    if (result?.canceled) return;

    const selected = (result?.assets || [])
      .slice(0, 1)
      .map((asset, index) => ({
        id: `${Date.now()}-${index}-${asset?.uri || ''}`,
        uri: asset?.uri,
        name: asset?.fileName || `work-entry-camera-${Date.now()}-${index + 1}.jpg`,
        mimeType: asset?.mimeType || 'image/jpeg',
      }))
      .filter((asset) => asset.uri);

    if (selected.length === 0) return;

    const updater = phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((prev) => {
      const existingUris = new Set(prev.map((item) => item.uri));
      const uniqueSelected = selected.filter((item) => !existingUris.has(item.uri));
      return [...prev, ...uniqueSelected].slice(0, remainingSlots + prev.length);
    });
  };

  const removeImageDraft = (phase, id) => {
    const updater = phase === 'BF' ? setBeforeImageDrafts : setAfterImageDrafts;
    updater((prev) => prev.filter((img) => img.id !== id));
  };

  const persistSelectedImages = async (phase, draftImages, targetWorkEntryDocEntry) => {
    if (!targetWorkEntryDocEntry || draftImages.length === 0) {
      return { uploadedCount: 0 };
    }

    const savedPhaseCount = savedImages.filter((image) => String(image?.imgType || '').toUpperCase() === String(phase || '').toUpperCase()).length;
    const remainingSlots = Math.max(MAX_IMAGES_PER_PHASE - savedPhaseCount, 0);
    if (remainingSlots <= 0) {
      throw new Error(`Only ${MAX_IMAGES_PER_PHASE} images are allowed in this section.`);
    }

    const uploadResponse = await workEntryService.uploadImages(draftImages);
    const uploadedFileNames = Array.isArray(uploadResponse?.FileNames)
      ? uploadResponse.FileNames
      : String(uploadResponse?.FileName || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

    if (uploadedFileNames.length === 0) {
      throw new Error(uploadResponse?.Message || 'Upload succeeded but no filenames were returned.');
    }

    const allowedCount = Math.max(Math.min(MAX_IMAGES_PER_PHASE, remainingSlots), 0);
    const filesToSave = uploadedFileNames.slice(0, allowedCount);
    if (filesToSave.length === 0) {
      throw new Error(`Only ${MAX_IMAGES_PER_PHASE} images are allowed in this section.`);
    }

    const companyDb = dbName || 'MUTSPL_TEST';
    const createdRecords = [];
    const existingPhaseCount = savedImages.filter((image) => String(image?.imgType || '').toUpperCase() === String(phase || '').toUpperCase()).length;
    for (let i = 0; i < filesToSave.length; i += 1) {
      const fileName = filesToSave[i];
      const imgType = phase;
      const imgNo = existingPhaseCount + i + 1;
      const payload = {
        CompanyDB: companyDb,
        WorkEntryDocEntry: Number(targetWorkEntryDocEntry) || targetWorkEntryDocEntry,
        FaultLine: Number(faultLine) || 0,
        ImgType: imgType,
        ImgNo: imgNo,
        ImgPath: fileName,
        Remarks: finalRemarks || '',
      };
      const saveResponse = await workEntryService.saveWorkEntryImage(payload);
      if (!isApiSuccess(saveResponse)) {
        throw new Error(saveResponse?.Message || `Failed to save image metadata for ${fileName}`);
      }
      const sourceImage = draftImages[i];
      createdRecords.push({
        id: `${fileName}-${imgType}-${imgNo}`,
        fileName,
        imgType,
        imgNo,
        displayName: `${imgType === 'BF' ? 'Before image' : 'After image'}: ${fileName}`,
        localUri: sourceImage?.uri || '',
      });
    }

    setSavedImages((prev) => [...prev, ...createdRecords]);
    return { uploadedCount: createdRecords.length };
  };

  const openImagePreview = async (imageRecord) => {
    const fileName = imageRecord?.fileName;
    if (!fileName) return;

    try {
      setPreviewZoom(1);
      setPreviewLoading(true);
      setPreviewImage({ ...imageRecord, uri: imageRecord?.localUri || '' });
      const response = await workEntryService.getWorkEntryImageBase64(fileName);
      const rawBase64 = extractBase64Content(response);
      if (!rawBase64 && !imageRecord?.localUri) {
        const serverMessage = response?.Message || response?.Data?.Message || response?.data?.Message;
        throw new Error(serverMessage || 'Image data was not returned by the server.');
      }
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
        const contentType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(rawBase64)?.[1] || 'image/jpeg';
        setPreviewImage({ ...imageRecord, uri: `data:${contentType};base64,${cleanBase64}` });
      }
    } catch (error) {
      if (!imageRecord?.localUri) {
        setPreviewImage(null);
        Toast.show({ type: 'error', text1: 'Preview failed', text2: error?.message || 'Unable to load image preview.' });
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStartWork = async () => {
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await mechanicService.startWork(companyDb, docEntry, faultLine, userCode);
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Work started', text2: 'Log what you do below.' });
        setStep(STEP.WORKING);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not start work' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to start work' });
    } finally {
      setSubmitting(false);
    }
  };

  const addDetailLine = (workItem) => {
    const workCode = String(workItem?.Code || workItem?.WorkCode || workItem?.WorkListCode || workItem?.Solution || workItem?.WorkId || 'OTHER').trim();
    const workName = String(workItem?.Name || workItem?.WorkName || workItem?.WorkDone || workItem?.ActivityName || workItem?.Description || workItem?.Dscription || workCode).trim();
    setDetails(prev => [...prev, {
      id: createDetailId(),
      WorkCode: workCode,
      WorkDone: workCode === 'OTHER' ? '' : workName,
      OtherDescription: '',
      Remarks: '',
      locked: false,
    }]);
    setShowWorkListModal(false);
  };

  const updateDetailField = (idx, field, value) => {
    setDetails(prev => prev.map((d, i) => (i === idx && !d.locked ? { ...d, [field]: value } : d)));
  };

  const removeDetailLine = (idx) => {
    setDetails(prev => prev.filter((_, i) => i !== idx || prev[i]?.locked));
  };

  const handleSaveWorkEntry = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'No further changes are needed.' });
      return;
    }

    const draftDetails = details.filter((detail) => !detail.locked);
    const draftBeforeImages = beforeImageDrafts;
    const hasBeforeDraftImages = draftBeforeImages.length > 0;
    if (draftDetails.length === 0 && !hasBeforeDraftImages) {
      Toast.show({ type: 'error', text1: 'Add work details', text2: 'Log at least one work item before saving.' });
      return;
    }
    const isFirstSave = !workEntryDocEntry;
    // On the first save, a before image is required — show a visible warning instead
    // of silently disabling the button.
    if (isFirstSave && !hasBeforeDraftImages && !hasSavedBeforeImage) {
      Toast.show({
        type: 'info',
        text1: 'Before image required',
        text2: 'Please select a before image before saving the work entry.',
      });
      return;
    }
    if (!workEntryDocEntry && !validateImageRules('BF', draftBeforeImages, true)) {
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const detailsPayload = draftDetails.map(d => ({
        WorkCode: d.WorkCode || 'OTHER',
        WorkDone: d.WorkCode === 'OTHER' ? (d.OtherDescription || d.WorkDone || '') : (d.WorkDone || ''),
        OtherDescription: d.OtherDescription || '',
        Remarks: d.Remarks || '',
      }));

      if (!workEntryDocEntry) {
        const payload = {
          CompanyDB: companyDb,
          // The live work-entry endpoint resolves the assigned fault using the
          // same DocEntry/FaultCode pair returned by GetMechanicDashboard.
          DocEntry: Number(docEntry) || docEntry,
          JobCardDocEntry: Number(docEntry) || docEntry,
          FaultLine: Number(faultLine) || 0,
          FaultCode: resolvedFaultCode || String(fault?.FaultCode || fault?.Fault || '').trim(),
          FaultName: String(fault?.FaultName || fault?.Description || fault?.Fault || '').trim(),
          UserCode: userCode,
          FinalRemarks: finalRemarks,
          Details: detailsPayload,
        };
        const response = isBreakdownJob
          ? await lineBreakdownService.createLineBreakdownWorkEntry({
              ...payload,
              RepairType: repairType,
            })
          : await mechanicService.createWorkEntry(payload);
        if (isApiSuccess(response)) {
          const newDocEntry = response?.Data?.WorkEntryDocEntry || response?.Data?.DocEntry || response?.WorkEntryDocEntry;
          if (!newDocEntry) {
            throw new Error(response?.Message || 'Work entry was not created: WorkEntryDocEntry not returned.');
          }
          setWorkEntryDocEntry(newDocEntry || null);
          navigation.setParams({ workEntryDocEntry: newDocEntry || null });
          const imageResult = await persistSelectedImages('BF', draftBeforeImages, newDocEntry);
          setBeforeImageDrafts([]);
          setDetails(prev => prev.map((detail) => ({ ...detail, locked: true })));
          Toast.show({
            type: 'success',
            text1: 'Work entry saved',
            text2: imageResult.uploadedCount > 0 ? `${imageResult.uploadedCount} image(s) uploaded.` : undefined,
          });
        } else {
          Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not save work entry' });
        }
      } else {
        let updated = false;
        let uploadedBeforeCount = 0;

        if (hasBeforeDraftImages) {
          if (!validateImageRules('BF', draftBeforeImages, false)) {
            return;
          }
          const imageResult = await persistSelectedImages('BF', draftBeforeImages, workEntryDocEntry);
          uploadedBeforeCount = imageResult.uploadedCount || 0;
          setBeforeImageDrafts([]);
        }

        if (draftDetails.length > 0) {
          const payload = {
            CompanyDB: companyDb,
            WorkEntryDocEntry: workEntryDocEntry,
            UserCode: userCode,
            FinalRemarks: finalRemarks,
            Details: detailsPayload,
          };
          const response = await mechanicService.updateWorkEntry(payload);
          if (!isApiSuccess(response)) {
            Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not update work entry' });
            return;
          }
          setDetails(prev => prev.map((detail) => ({ ...detail, locked: true })));
          updated = true;
        }

        if (updated || uploadedBeforeCount > 0) {
          Toast.show({
            type: 'success',
            text1: updated ? 'Work entry updated' : 'Before image uploaded',
            text2: uploadedBeforeCount > 0 ? `${uploadedBeforeCount} image(s) uploaded.` : undefined,
          });
        }
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to save work entry' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestTow = async () => {
    if (workEntryLocked) return;
    if (!selectedTowDepot) {
      Toast.show({ type: 'error', text1: 'Select a tow depot first' });
      return;
    }

    try {
      setSubmitting(true);
      const response = await lineBreakdownService.createLineBreakdownWorkEntry({
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(docEntry) || docEntry,
        FaultLine: Number(faultLine) || 1,
        UserCode: userCode,
        RepairType: repairType,
        FinalRemarks: finalRemarks || 'Tow requested',
        Details: [{
          WorkCode: 'TOW_REQUEST',
          WorkDone: 'Tow requested - vehicle to be moved to depot',
          OtherDescription: '',
          Remarks: finalRemarks || '',
        }],
        TowRequested: true,
        TowDepot: selectedTowDepot,
        CanRepairOnSite: false,
      });
      if (!isApiSuccess(response)) throw new Error(response?.Message || 'Could not request tow.');

      const created = response?.Data || response;
      const createdEntry = created?.WorkEntryDocEntry || created?.DocEntry || response?.WorkEntryDocEntry;
      if (createdEntry) {
        await lineBreakdownService.completeLineBreakdownWorkEntry({
          CompanyDB: dbName || 'MUTSPL_TEST',
          WorkEntryDocEntry: Number(createdEntry) || createdEntry,
          FinalRemarks: 'Tow requested and vehicle moved',
        });
        setWorkEntryDocEntry(createdEntry);
      }
      setAwaitingVerification(true);
      setStep(STEP.DONE);
      Toast.show({ type: 'success', text1: 'Tow requested', text2: 'Supervisor verification is now pending.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Tow request failed', text2: error?.message || 'Unable to request tow.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteWork = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Completion action is no longer available.' });
      return;
    }
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Log and save your work before completing.' });
      return;
    }
    if (!String(finalRemarks || '').trim()) {
      Toast.show({ type: 'error', text1: 'Final remarks required', text2: 'Add final remarks before completing the work.' });
      return;
    }
    if (afterImageDrafts.length < MIN_IMAGES_PER_FAULT) {
      Toast.show({ type: 'error', text1: 'After image required', text2: 'Upload the after image before completing the work.' });
      return;
    }
    if (!hasSavedBeforeImage) {
      Toast.show({ type: 'error', text1: 'Before image required', text2: 'Save the before image first, then complete the work later.' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      await persistSelectedImages('AF', afterImageDrafts, workEntryDocEntry);
      setAfterImageDrafts([]);
      const response = isBreakdownJob
        ? await lineBreakdownService.completeLineBreakdownWorkEntry({
            CompanyDB: companyDb,
            WorkEntryDocEntry: workEntryDocEntry,
            FinalRemarks: finalRemarks,
          })
        : await mechanicService.completeWork({
            CompanyDB: companyDb,
            WorkEntryDocEntry: workEntryDocEntry,
            UserCode: userCode,
            FinalRemarks: finalRemarks,
          });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Work completed!', text2: 'Supervisor has been notified to inspect.' });
        setAwaitingVerification(true);
        setStep(STEP.DONE);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not complete work' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to complete work' });
    } finally {
      setSubmitting(false);
    }
  };

  const addPartToDraft = (item) => {
    const key = item.ItemCode || item.Code;
    if (partsDraft.some(p => (p.ItemCode || p.Code) === key)) {
      setShowPartsModal(false);
      return;
    }
    setPartsDraft(prev => [...prev, {
      ItemCode: item.ItemCode || item.Code || '',
      ItemName: item.ItemName || item.Name || '',
      ReqQty: '1',
      Warehouse: '',
      Remarks: '',
    }]);
    setShowPartsModal(false);
  };

  const updatePartDraftField = (itemCode, field, value) => {
    setPartsDraft(prev => prev.map(p => ((p.ItemCode || p.Code) === itemCode ? { ...p, [field]: value } : p)));
  };

  const removePartDraft = (itemCode) => {
    setPartsDraft(prev => prev.filter(p => (p.ItemCode || p.Code) !== itemCode));
  };

  const handleRequestParts = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Parts requests are no longer needed.' });
      return;
    }
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Parts requests are tied to your work entry.' });
      return;
    }
    if (partsDraft.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one part' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.requestWorkEntryParts({
        CompanyDB: companyDb,
        WorkEntryDocEntry: workEntryDocEntry,
        UserCode: userCode,
        Parts: partsDraft.map(p => ({
          ItemCode: p.ItemCode,
          ItemName: p.ItemName,
          ReqQty: parseFloat(p.ReqQty) || 1,
          Warehouse: p.Warehouse || '',
          Remarks: p.Remarks || '',
        })),
      });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Parts requested', text2: 'Awaiting Supervisor approval.' });
        setPartsDraft([]);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not request parts' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to request parts' });
    } finally {
      setSubmitting(false);
    }
  };

  const addToolToDraft = (item) => {
    const toolCode = String(item?.ToolCode || item?.Code || '').trim();
    const toolName = String(item?.ToolName || item?.Name || '').trim();
    if (!toolCode) return;
    if (toolsDraft.some((tool) => String(tool.ToolCode || '').trim().toLowerCase() === toolCode.toLowerCase())) {
      Toast.show({ type: 'info', text1: 'Tool already added' });
      setShowToolsModal(false);
      return;
    }
    setToolsDraft((prev) => [...prev, {
      ToolCode: toolCode,
      ToolName: toolName,
      Remarks: '',
    }]);
    setShowToolsModal(false);
  };

  const removeToolDraft = (toolCode) => {
    setToolsDraft((prev) => prev.filter((tool) => String(tool.ToolCode || '').trim() !== String(toolCode || '').trim()));
  };

  const updateToolDraftField = (toolCode, field, value) => {
    setToolsDraft((prev) => prev.map((tool) => (
      String(tool.ToolCode || '').trim() === String(toolCode || '').trim()
        ? { ...tool, [field]: value }
        : tool
    )));
  };

  const handleRequestSpecialTools = async () => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already completed', text2: 'Special tool requests are no longer needed.' });
      return;
    }
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Special tool requests are tied to your work entry.' });
      return;
    }
    if (toolsDraft.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one tool' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.requestSpecialTool({
        CompanyDB: companyDb,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        MechanicCode: String(userCode || '').trim(),
        Tools: toolsDraft.map((tool) => ({
          ToolCode: String(tool.ToolCode || '').trim(),
          ToolName: String(tool.ToolName || '').trim(),
          Remarks: String(tool.Remarks || '').trim(),
        })),
      });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Special tools requested', text2: 'Awaiting Supervisor approval.' });
        const pendingTools = toolsDraft.map((tool) => ({
          ...tool,
          Status: 'RQ',
          Remarks: String(tool.Remarks || '').trim(),
        }));
        setExistingSpecialTools((prev) => [...pendingTools, ...prev]);
        setToolsDraft([]);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not request special tools' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to request special tools' });
    } finally {
      setSubmitting(false);
    }
  };

  const resolveToolLineId = (tool) => Number(
    tool?.LineId ?? tool?.Line ?? tool?.LineNum ?? tool?.LineNo ?? tool?.SerialNo ?? 0
  ) || 0;

  const getToolIdentity = (tool) => {
    const lineId = resolveToolLineId(tool);
    const code = String(tool?.ToolCode || tool?.Code || '').trim().toLowerCase();
    return `${lineId}::${code}`;
  };

  const handleReceiveSpecialTool = async (tool) => {
    const toolCode = String(tool?.ToolCode || tool?.Code || '').trim();
    const lineId = resolveToolLineId(tool);
    if (!toolCode) {
      Toast.show({ type: 'error', text1: 'Tool unavailable', text2: 'Unable to identify the selected special tool.' });
      return;
    }
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Tool receipt is tied to your active work entry.' });
      return;
    }
    const rawStatus = String(tool?.Status || '').trim().toUpperCase();
    const isApproved = ['AP', 'A', 'APPROVED'].includes(rawStatus);
    if (!isApproved) {
      Toast.show({ type: 'info', text1: 'Tool not approved yet', text2: 'Only approved special tools can be received.' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.receiveSpecialTool({
        CompanyDB: companyDb,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        MechanicCode: String(userCode || '').trim(),
        Tools: [{ LineId: lineId, ToolCode: toolCode }],
      });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Special tool received', text2: 'Tool marked as received.' });
        setExistingSpecialTools((prev) => prev.map((entry) => (
          getToolIdentity(entry) === getToolIdentity(tool) ? { ...entry, Status: 'RC' } : entry
        )));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not receive special tool' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to receive special tool' });
    } finally {
      setSubmitting(false);
    }
  };

  const openReceivePart = (part) => {
    const lineId = getReceiveLineId(part);
    if (!lineId) {
      Toast.show({ type: 'error', text1: 'Part line unavailable', text2: 'This part has no PartLine or FaultLine from the backend.' });
      return;
    }
    const approvedQty = getApprovedQty(part);
    const alreadyReceived = getReceivedQty(part);
    const remainingQty = Math.max(approvedQty - alreadyReceived, 0);
    if (remainingQty <= 0) {
      Toast.show({ type: 'info', text1: 'Already fully received' });
      return;
    }
    setReceiveTarget({
      part,
      lineId,
      workEntryDocEntry: part?.WorkEntryDocEntry ?? existingWorkEntry?.DocEntry ?? workEntryDocEntry,
    });
    setReceivedQty(String(remainingQty));
  };

  const handleReceivePart = async () => {
    if (!receiveTarget) return;
    const { part, lineId, workEntryDocEntry: targetWorkEntryDocEntry } = receiveTarget;
    if (!targetWorkEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Work entry unavailable', text2: 'Unable to resolve WorkEntryDocEntry for receipt.' });
      return;
    }
    const approvedQty = Number(getPartQty(part));
    const alreadyReceived = getReceivedQty(part);
    const remainingQty = Math.max(approvedQty - alreadyReceived, 0);
    const enteredQty = Number(receivedQty);
    if (!enteredQty || enteredQty <= 0 || enteredQty > remainingQty) {
      Toast.show({ type: 'error', text1: 'Enter a valid quantity', text2: `Received quantity must be between 1 and ${remainingQty}.` });
      return;
    }
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.receiveWorkEntryParts({
        CompanyDB: companyDb,
        WorkEntryDocEntry: Number(targetWorkEntryDocEntry) || targetWorkEntryDocEntry,
        Parts: [{
          LineId: lineId,
          ReceivedQty: enteredQty,
        }],
      });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Part marked as received' });
        setApprovedParts(prev => prev.map(p => (
          getReceiveLineId(p) === lineId
          && String(p?.ItemCode || p?.Code || '') === String(part?.ItemCode || part?.Code || '')
            ? (() => {
                const nextReceived = Math.max(0, getReceivedQty(p) + enteredQty);
                const nextStatus = nextReceived >= getApprovedQty(p) ? 'RC' : 'PR';
                return { ...p, Received: nextReceived >= getApprovedQty(p), ReceivedQty: nextReceived, RecQty: nextReceived, Status: nextStatus };
              })()
            : p
        )));
        setReceiveTarget(null);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not mark received' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed' });
    }
  };

  const openReturnParts = () => {
    // Only parts where backend has explicitly set an approved status (ignores SupervisorProvided shortcut)
    const returnable = approvedParts.filter(p => isPartReturnEligible(p) && getReceiveLineId(p) !== null);
    if (returnable.length === 0) {
      Toast.show({ type: 'info', text1: 'No returnable parts', text2: 'No supervisor-approved parts found for this work entry.' });
      return;
    }
    setReturnDraft(returnable.map(p => {
      const issued = getIssuedQty(p);
      const received = getReceivedQty(p);
      const defaultQty = Math.max(issued - received, 1);
      return {
        part: p,
        LineId: getReceiveLineId(p),
        ReturnQty: String(defaultQty),
        ReturnReason: 'Unused Parts',
        Remarks: '',
      };
    }));
    setShowReturnModal(true);
  };

  const handleRequestPartReturn = async () => {
    if (returnDraft.length === 0) return;
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Work entry not saved', text2: 'Save your work entry first.' });
      return;
    }
    const companyDb = dbName || 'MUTSPL_TEST';
    const mechCode = user?.Code || user?.UserCode || user?.MechanicCode || userCode;
    const jobCardDocEntry = docEntry;
    setSubmitting(true);
    try {
      const response = await storeService.requestPartReturn({
        CompanyDB: companyDb,
        JobCardDocEntry: Number(jobCardDocEntry) || jobCardDocEntry,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        MechanicCode: mechCode,
        Parts: returnDraft
          .filter(d => Number(d.ReturnQty) > 0)
          .map(d => ({
            LineId: d.LineId,
            ReturnQty: Number(d.ReturnQty),
            ReturnReason: d.ReturnReason || 'Unused Parts',
            Remarks: d.Remarks || '',
          })),
      });
      if (isApiSuccess(response)) {
        Toast.show({ type: 'success', text1: 'Return request submitted', text2: 'Awaiting Supervisor approval.' });
        setShowReturnModal(false);
        setReturnDraft([]);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not submit return request' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to submit return request' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader visible />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Fault header */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.faultHeaderRow}>
            <MaterialIcons name="warning" size={20} color="#E65100" />
            <Text style={[styles.faultTitle, { color: colors.dark }]}>{faultName}</Text>
          </View>
          <Text style={{ color: colors.gray, fontSize: 13, marginTop: 4 }}>
            Job Card #{docEntry} {busNo ? `• ${busNo}` : ''}
          </Text>
          {awaitingVerification && (
            <View style={[styles.awaitingStatusPill, { backgroundColor: '#6D28D915' }]}>
              <MaterialIcons name="assignment-turned-in" size={14} color="#6D28D9" />
              <Text style={{ color: '#6D28D9', fontWeight: '700', fontSize: 12 }}>
                Awaiting Verification
              </Text>
            </View>
          )}
        </View>

        {/* Supervisor-selected parts must be visible before work starts too. */}
        {approvedParts.length > 0 && step === STEP.START && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts selected for this fault</Text>
            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 6 }}>
              These parts were selected by the Supervisor. Approved parts can be collected after work starts.
            </Text>
            {approvedParts.map((part, index) => (
              <Text key={`${part?.ItemCode || part?.Code || 'part'}-${index}`} style={{ color: colors.dark, fontSize: 13, marginTop: 5 }}>
                • {part?.ItemName || part?.Name || part?.Dscription || part?.ItemCode || part?.Code} — Qty: {getPartQty(part)}{isPartApproved(part) ? ' · Approved' : ' · Awaiting approval'}
              </Text>
            ))}
          </View>
        )}

        {step === STEP.START && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 10 }}>
              You've accepted this fault. Tap below when you're ready to begin work
              (this notifies the Supervisor).
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleStartWork}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <MaterialIcons name="play-arrow" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>{submitting ? 'Starting…' : 'Start Work'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === STEP.WORKING && (
          <>
            {/* Work Entry */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Entry</Text>

              {details.map((d, idx) => (
                <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>
                      {d.WorkCode === 'OTHER' ? 'Other' : d.WorkDone}
                    </Text>
                    {d.locked ? (
                      <Text style={{ color: colors.gray, fontSize: 12, marginTop: 4 }}>
                        {d.WorkCode === 'OTHER' ? d.OtherDescription : d.WorkDone}
                        {d.Remarks ? ` • ${d.Remarks}` : ''}
                      </Text>
                    ) : (
                      <>
                        {d.WorkCode === 'OTHER' && (
                          <RNTextInput
                            value={d.OtherDescription}
                            onChangeText={(v) => updateDetailField(idx, 'OtherDescription', v)}
                            placeholder="Describe the work done"
                            placeholderTextColor={colors.gray}
                            style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                          />
                        )}
                        <RNTextInput
                          value={d.Remarks}
                          onChangeText={(v) => updateDetailField(idx, 'Remarks', v)}
                          placeholder="Remarks (optional)"
                          placeholderTextColor={colors.gray}
                          style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC', marginTop: 4 }]}
                        />
                      </>
                    )}
                  </View>
                  {!d.locked && (
                    <TouchableOpacity onPress={() => removeDetailLine(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="close" size={18} color="#BB0000" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : colors.primary }]}
                onPress={() => {
                  if (workEntryLocked) return;
                  setShowWorkListModal(true);
                }}
                activeOpacity={0.7}
                disabled={workEntryLocked}
              >
                <MaterialIcons name="add" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', marginLeft: 4 }}>Add Work Item</Text>
              </TouchableOpacity>

              <View style={[styles.imageBox, { borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.imageHeaderRow}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13 }}>Before Image</Text>
                  <Text style={{ color: colors.gray, fontSize: 12 }}>
                    {savedBeforeImages.length + beforeImageDrafts.length}/{MAX_IMAGES_PER_PHASE}
                  </Text>
                </View>
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8 }}>
                  Required on the first save.
                </Text>

                <TouchableOpacity
                  style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#00689E', marginTop: 0 }]}
                  onPress={() => {
                    if (workEntryLocked) return;
                    pickWorkEntryImages('BF');
                  }}
                  activeOpacity={0.7}
                  disabled={workEntryLocked}
                >
                  <MaterialIcons name="photo-library" size={16} color="#00689E" />
                  <Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload Image</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#007A5A', marginTop: 8 }]}
                  onPress={() => {
                    if (workEntryLocked) return;
                    captureWorkEntryImage('BF');
                  }}
                  activeOpacity={0.7}
                  disabled={workEntryLocked}
                >
                  <MaterialIcons name="photo-camera" size={16} color="#007A5A" />
                  <Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture Image</Text>
                </TouchableOpacity>

                {beforeImageDrafts.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 12 }}>Selected (not saved yet)</Text>
                    {beforeImageDrafts.map((image, index) => (
                      <View key={image.id} style={[styles.imageRow, { borderColor: colors.border || '#E0E0E0' }]}>
                        <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>
                          {index + 1}. {image.name}
                        </Text>
                        <TouchableOpacity onPress={() => removeImageDraft('BF', image.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name="close" size={18} color="#BB0000" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {savedBeforeImages.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 12 }}>Saved before images</Text>
                    {savedBeforeImages.map((image) => (
                      <TouchableOpacity
                        key={`${image.fileName}-${image.imgNo}`}
                        onPress={() => openImagePreview(image)}
                        style={[styles.imageRow, { borderColor: colors.border || '#E0E0E0' }]}
                      >
                        <Text numberOfLines={1} style={{ color: colors.primary, flex: 1, fontSize: 12, textDecorationLine: 'underline' }}>
                          {image.displayName}
                        </Text>
                        <MaterialIcons name="zoom-in" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: workEntryLocked ? '#94A3B8' : colors.primary, marginTop: SPACING.sm }]}
                onPress={handleSaveWorkEntry}
                activeOpacity={0.8}
                disabled={submitting || workEntryLocked}
              >
                <MaterialIcons name="save" size={18} color="#FFF" />
                <Text style={styles.primaryBtnText}>
                  {submitting ? 'Saving…' : workEntryLocked ? 'Completed' : workEntryDocEntry ? 'Update Work Entry' : 'Save Work Entry'}
                </Text>
              </TouchableOpacity>
            </View>

            {isBreakdownJob && (
              <View style={[styles.card, styles.breakdownCard, { backgroundColor: colors.white, borderColor: '#FDBA74' }]}> 
                <View style={styles.faultHeaderRow}>
                  <MaterialIcons name="build" size={18} color="#F97316" />
                  <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>Breakdown Repair</Text>
                </View>
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8 }}>Choose how this breakdown will be handled.</Text>
                <Text style={[styles.breakdownLabel, { color: colors.dark }]}>Repair Type</Text>
                <View style={styles.breakdownToggleRow}>
                  <TouchableOpacity
                    style={[styles.breakdownToggle, repairType === 'P' && { backgroundColor: colors.primary }]}
                    onPress={() => setRepairType('P')}
                  >
                    <Text style={{ color: repairType === 'P' ? '#FFF' : colors.primary, fontSize: 12 }}>Permanent Repair</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.breakdownToggle, repairType === 'T' && { backgroundColor: colors.primary }]}
                    onPress={() => setRepairType('T')}
                  >
                    <Text style={{ color: repairType === 'T' ? '#FFF' : colors.primary, fontSize: 12 }}>Temporary Repair</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.breakdownLabel, { color: colors.dark, marginTop: 8 }]}>Field Decision</Text>
                <View style={styles.breakdownToggleRow}>
                  <TouchableOpacity
                    style={[styles.breakdownToggle, canRepairOnSite && { backgroundColor: colors.primary }]}
                    onPress={() => setCanRepairOnSite(true)}
                  >
                    <Text style={{ color: canRepairOnSite ? '#FFF' : colors.primary, fontSize: 12 }}>Repair on Site</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.breakdownToggle, !canRepairOnSite && { backgroundColor: colors.primary }]}
                    onPress={() => setCanRepairOnSite(false)}
                  >
                    <Text style={{ color: !canRepairOnSite ? '#FFF' : colors.primary, fontSize: 12 }}>Tow to Depot</Text>
                  </TouchableOpacity>
                </View>
                {!canRepairOnSite && (
                  <>
                    <TouchableOpacity
                      style={[styles.towDepotSelector, { borderColor: '#FDBA74', backgroundColor: colors.white }]}
                      onPress={() => setShowDepotsModal(true)}
                    >
                      <Text style={{ color: selectedTowDepot ? colors.dark : colors.gray, fontSize: 13 }} numberOfLines={1}>
                        {selectedTowDepot || 'Select depot for tow'}
                      </Text>
                      <MaterialIcons name="expand-more" size={20} color={colors.gray} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={handleRequestTow}
                      disabled={submitting}
                    >
                      <MaterialIcons name="local-shipping" size={18} color="#FFF" />
                      <Text style={styles.primaryBtnText}>{submitting ? 'Requesting...' : 'Request Tow'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Parts */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Request Parts</Text>
              {pendingSupervisorParts.length > 0 && (
                <View style={[styles.approvedBox, { borderColor: '#2B7D2B40' }]}>
                  <Text style={{ color: '#9A6700', fontWeight: '700', fontSize: 13 }}>Supervisor-selected parts — awaiting approval</Text>
                  <Text style={{ color: colors.gray, fontSize: 12, marginTop: 3 }}>These parts are linked to this fault. They become ready to collect when the approved quantity is returned by the server.</Text>
                  {pendingSupervisorParts.map((part, index) => <Text key={`${part?.ItemCode || part?.Code || 'part'}-${index}`} style={{ color: colors.dark, fontSize: 13, marginTop: 5 }}>• {part?.ItemName || part?.Name || part?.Dscription || part?.ItemCode || part?.Code} — Requested: {getPartQty(part)}</Text>)}
                </View>
              )}
              {!workEntryDocEntry && (
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8, fontStyle: 'italic' }}>
                  Save your Work Entry first to request parts against it.
                </Text>
              )}

              {partsDraft.map((p, i) => (
                <View key={i} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.ItemName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                      <RNTextInput
                        value={String(p.ReqQty)}
                        onChangeText={(v) => updatePartDraftField(p.ItemCode, 'ReqQty', v)}
                        keyboardType="numeric"
                        style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                      <TouchableOpacity onPress={() => { setWarehouseTargetCode(p.ItemCode); setShowWarehouseModal(true); }} style={[styles.warehousePicker, { borderColor: colors.border || '#CCC' }]}>
                        <Text numberOfLines={1} style={{ color: p.Warehouse ? colors.dark : colors.gray, fontSize: 13 }}>{p.Warehouse || 'Select warehouse'}</Text>
                        <MaterialIcons name="arrow-drop-down" size={18} color={colors.gray} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removePartDraft(p.ItemCode)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#2B7D2B' }]}
                onPress={() => {
                  if (workEntryLocked) return;
                  setShowPartsModal(true);
                }}
                activeOpacity={0.7}
                disabled={workEntryLocked}
              >
                <MaterialIcons name="add" size={16} color="#2B7D2B" />
                <Text style={{ color: '#2B7D2B', fontWeight: '600', marginLeft: 4 }}>Add Part</Text>
              </TouchableOpacity>

              {partsDraft.length > 0 && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: workEntryLocked ? '#94A3B8' : '#2B7D2B', marginTop: SPACING.sm }]}
                  onPress={handleRequestParts}
                  activeOpacity={0.8}
                  disabled={submitting || workEntryLocked}
                >
                  <MaterialIcons name="send" size={18} color="#FFF" />
                  <Text style={styles.primaryBtnText}>Request Parts</Text>
                </TouchableOpacity>
              )}

              {approvedForCollection.length > 0 && (
                <View style={{ marginTop: SPACING.md }}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>Approved — Ready to collect</Text>
                  {approvedForCollection.map((p, idx) => (
                    <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.ItemName}</Text>
                        <Text style={{ color: colors.gray, fontSize: 12 }}>
                          Approved: {getPartQty(p)}
                          {getIssuedQty(p) > 0 ? ` • Issued: ${getIssuedQty(p)}` : ''}
                          {getReceivedQty(p) > 0 ? ` • Received: ${getReceivedQty(p)}` : ''}
                        </Text>
                      </View>
                      {isPartFullyReceived(p) ? (
                        <Chip mode="flat" style={{ backgroundColor: '#2B7D2B20' }} textStyle={{ color: '#2B7D2B', fontSize: 11 }}>
                          Received
                        </Chip>
                      ) : (
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: '#2B7D2B' }]}
                          onPress={() => openReceivePart(p)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.smallBtnText}>{getReceivedQty(p) > 0 ? 'Receive More' : 'Mark Received'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Return Unused Parts — shown whenever there are any approved parts and work is active */}
              {approvedParts.length > 0 && !workEntryLocked && (
                <TouchableOpacity
                  style={[styles.addLineBtn, { borderColor: '#B45309', marginTop: SPACING.sm }]}
                  onPress={openReturnParts}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="undo" size={16} color="#B45309" />
                  <Text style={{ color: '#B45309', fontWeight: '600', marginLeft: 4 }}>Return Unused Parts</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Request Special Tool</Text>
              {!workEntryDocEntry && (
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8, fontStyle: 'italic' }}>
                  Save your Work Entry first to request special tools.
                </Text>
              )}

              {existingSpecialTools.length > 0 && (
                <View style={[styles.approvedBox, { borderColor: '#7C3AED40', backgroundColor: '#7C3AED0D', marginBottom: SPACING.sm }]}> 
                  <Text style={{ color: '#5B21B6', fontWeight: '700', fontSize: 13 }}>Current special tool requests</Text>
                  {existingSpecialTools.map((tool, index) => {
                    const rawStatus = String(tool?.Status || '').trim().toUpperCase();
                    const statusLabel = rawStatus === 'AP' || rawStatus === 'APPROVED' || rawStatus === 'A'
                      ? 'Approved'
                      : rawStatus === 'RJ' || rawStatus === 'REJECTED' || rawStatus === 'R'
                        ? 'Rejected'
                        : rawStatus === 'RC' || rawStatus === 'RECEIVED'
                          ? 'Received'
                          : 'Awaiting approval';
                    const isApproved = ['AP', 'A', 'APPROVED'].includes(rawStatus);
                    const isReceived = ['RC', 'RECEIVED'].includes(rawStatus);
                    return (
                      <View key={`${tool.ToolCode || tool.Code || 'tool'}-${tool.LineId || index}`} style={{ marginTop: 6 }}>
                        <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>
                          • {tool.ToolName || tool.ToolCode || 'Tool'}{tool.ToolCode ? ` (${tool.ToolCode})` : ''}
                        </Text>
                        <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                          Status: {statusLabel}{tool.Remarks ? ` • ${tool.Remarks}` : ''}
                        </Text>
                        {isApproved && !isReceived && (
                          <TouchableOpacity
                            style={[styles.smallBtn, { backgroundColor: '#7C3AED', marginTop: 6, alignSelf: 'flex-start' }]}
                            onPress={() => handleReceiveSpecialTool(tool)}
                            activeOpacity={0.8}
                            disabled={submitting || workEntryLocked}
                          >
                            <Text style={styles.smallBtnText}>Receive Tool</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#7C3AED' }]}
                onPress={() => {
                  if (workEntryLocked) return;
                  setShowToolsModal(true);
                }}
                activeOpacity={0.7}
                disabled={workEntryLocked}
              >
                <MaterialIcons name="build" size={16} color="#7C3AED" />
                <Text style={{ color: '#7C3AED', fontWeight: '600', marginLeft: 4 }}>
                  {availableTools.length > 0 ? 'Select Tool from List' : 'Select Tool'}
                </Text>
              </TouchableOpacity>

              {toolsDraft.map((tool, index) => (
                <View key={`${tool.ToolCode}-${index}`} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>
                      {tool.ToolCode} - {tool.ToolName}
                    </Text>
                    <RNTextInput
                      value={tool.Remarks}
                      onChangeText={(value) => updateToolDraftField(tool.ToolCode, 'Remarks', value)}
                      placeholder="Remarks"
                      placeholderTextColor={colors.gray}
                      style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC', marginTop: 6 }]}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeToolDraft(tool.ToolCode)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              {toolsDraft.length > 0 && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: workEntryLocked ? '#94A3B8' : '#7C3AED', marginTop: SPACING.sm }]}
                  onPress={handleRequestSpecialTools}
                  activeOpacity={0.8}
                  disabled={submitting || workEntryLocked}
                >
                  <MaterialIcons name="send" size={18} color="#FFF" />
                  <Text style={styles.primaryBtnText}>Request Special Tool</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Complete */}
            <View style={[styles.card, { backgroundColor: colors.white, marginBottom: SPACING.lg, marginHorizontal: SPACING.md }] }>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Complete Work</Text>

              <TextInput
                label="Final Remarks"
                mode="outlined"
                value={finalRemarks}
                onChangeText={setFinalRemarks}
                multiline
                numberOfLines={3}
              />

              <View style={[styles.imageBox, { borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.imageHeaderRow}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13 }}>After Image</Text>
                  <Text style={{ color: colors.gray, fontSize: 12 }}>
                    {savedAfterImages.length + afterImageDrafts.length}/{MAX_IMAGES_PER_PHASE}
                  </Text>
                </View>
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8 }}>
                  Required before completing the work.
                </Text>

                <TouchableOpacity
                  style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#00689E', marginTop: 0 }]}
                  onPress={() => {
                    if (workEntryLocked) return;
                    pickWorkEntryImages('AF');
                  }}
                  activeOpacity={0.7}
                  disabled={workEntryLocked}
                >
                  <MaterialIcons name="photo-library" size={16} color="#00689E" />
                  <Text style={{ color: '#00689E', fontWeight: '600', marginLeft: 4 }}>Upload Image</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addLineBtn, { borderColor: workEntryLocked ? '#94A3B8' : '#007A5A', marginTop: 8 }]}
                  onPress={() => {
                    if (workEntryLocked) return;
                    captureWorkEntryImage('AF');
                  }}
                  activeOpacity={0.7}
                  disabled={workEntryLocked}
                >
                  <MaterialIcons name="photo-camera" size={16} color="#007A5A" />
                  <Text style={{ color: '#007A5A', fontWeight: '600', marginLeft: 4 }}>Capture Image</Text>
                </TouchableOpacity>

                {afterImageDrafts.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 12 }}>Selected (not saved yet)</Text>
                    {afterImageDrafts.map((image, index) => (
                      <View key={image.id} style={[styles.imageRow, { borderColor: colors.border || '#E0E0E0' }]}>
                        <Text numberOfLines={1} style={{ color: colors.dark, flex: 1, fontSize: 12 }}>
                          {index + 1}. {image.name}
                        </Text>
                        <TouchableOpacity onPress={() => removeImageDraft('AF', image.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name="close" size={18} color="#BB0000" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {savedAfterImages.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 12 }}>Saved after images</Text>
                    {savedAfterImages.map((image) => (
                      <TouchableOpacity
                        key={`${image.fileName}-${image.imgNo}`}
                        onPress={() => openImagePreview(image)}
                        style={[styles.imageRow, { borderColor: colors.border || '#E0E0E0' }]}
                      >
                        <Text numberOfLines={1} style={{ color: colors.primary, flex: 1, fontSize: 12, textDecorationLine: 'underline' }}>
                          {image.displayName}
                        </Text>
                        <MaterialIcons name="zoom-in" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: workEntryLocked ? '#64748B' : colors.success, marginTop: SPACING.sm }]}
                onPress={handleCompleteWork}
                activeOpacity={0.8}
                disabled={submitting || workEntryLocked}
              >
                <MaterialIcons name="done-all" size={18} color="#FFF" />
                <Text style={styles.primaryBtnText}>{workEntryLocked ? 'Completed' : submitting ? 'Completing…' : 'Complete Work'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <ModalSelector
        visible={showWorkListModal}
        onClose={() => setShowWorkListModal(false)}
        onSelect={(value, item) => addDetailLine(item)}
        title="Select Work Item"
        data={workList}
        loading={false}
        searchPlaceholder="Search work items..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
      />

      <ModalSelector
        visible={showDepotsModal}
        onClose={() => setShowDepotsModal(false)}
        onSelect={(value, item) => {
          setSelectedTowDepot(item?.Depot || item?.Name || item?.DepotName || value);
          setShowDepotsModal(false);
        }}
        title="Select Depot"
        data={depotsList}
        loading={false}
        searchPlaceholder="Search depots..."
        displayKey="Depot"
        valueKey="Depot"
        searchKeys={['Depot', 'Name', 'DepotName']}
        renderItem={(item) => (
          <Text style={{ color: colors.dark, fontSize: 15, fontWeight: '600' }}>
            {item?.Depot || item?.Name || item?.DepotName || '-'}
          </Text>
        )}
      />

      <RNModal visible={Boolean(receiveTarget)} transparent animationType="fade" onRequestClose={() => setReceiveTarget(null)}>
        <View style={styles.receiveOverlay}>
          <View style={[styles.receiveBox, { backgroundColor: colors.white }]}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Confirm received quantity</Text>
            <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 10 }}>
              Approved quantity: {receiveTarget ? getPartQty(receiveTarget.part) : 0}
              {receiveTarget ? ` • Already received: ${getReceivedQty(receiveTarget.part)}` : ''}
            </Text>
            <RNTextInput value={receivedQty} onChangeText={setReceivedQty} keyboardType="numeric" placeholder="Received quantity" placeholderTextColor={colors.gray} style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]} />
            <View style={styles.receiveActions}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.gray }]} onPress={() => setReceiveTarget(null)}><Text style={styles.smallBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2B7D2B' }]} onPress={handleReceivePart}><Text style={styles.smallBtnText}>Confirm</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Return Parts Modal */}
      <RNModal visible={showReturnModal} transparent animationType="slide" onRequestClose={() => setShowReturnModal(false)}>
        <View style={styles.receiveOverlay}>
          <View style={[styles.receiveBox, { backgroundColor: colors.white, maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
              <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: 0 }]}>Return Unused Parts</Text>
              <TouchableOpacity onPress={() => setShowReturnModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: SPACING.sm }}>
              Enter quantity to return for each part. Only parts that have been issued can be returned.
            </Text>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {returnDraft.map((d, idx) => (
                <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0', flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
                  <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>
                    {d.part?.ItemName || d.part?.ItemCode || 'Part'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    <Text style={{ color: '#2B7D2B', fontSize: 12, fontWeight: '600' }}>
                      Approved: {getApprovedQty(d.part)}
                    </Text>
                    <Text style={{ color: getIssuedQty(d.part) > 0 ? '#1565C0' : colors.gray, fontSize: 12, fontWeight: '600' }}>
                      Issued: {getIssuedQty(d.part)}
                    </Text>
                    <Text style={{ color: getReceivedQty(d.part) > 0 ? '#6D28D9' : colors.gray, fontSize: 12, fontWeight: '600' }}>
                      Received: {getReceivedQty(d.part)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={{ color: colors.gray, fontSize: 11, marginBottom: 2 }}>Return Qty</Text>
                      <RNTextInput
                        value={String(d.ReturnQty)}
                        onChangeText={v => setReturnDraft(prev => prev.map((item, i) => i === idx ? { ...item, ReturnQty: v } : item))}
                        keyboardType="numeric"
                        placeholder="Qty"
                        placeholderTextColor={colors.gray}
                        style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC', width: 70 }]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.gray, fontSize: 11, marginBottom: 2 }}>Reason</Text>
                      <TouchableOpacity
                        style={[styles.warehousePicker, { borderColor: colors.border || '#CCC' }]}
                        onPress={() => {
                          const reasons = ['Unused Parts', 'Wrong Issue', 'Excess Quantity', 'Defective Part'];
                          const next = reasons[(reasons.indexOf(d.ReturnReason) + 1) % reasons.length];
                          setReturnDraft(prev => prev.map((item, i) => i === idx ? { ...item, ReturnReason: next } : item));
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: colors.dark, fontSize: 12 }}>{d.ReturnReason}</Text>
                        <MaterialIcons name="arrow-drop-down" size={18} color={colors.gray} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <RNTextInput
                    value={d.Remarks}
                    onChangeText={v => setReturnDraft(prev => prev.map((item, i) => i === idx ? { ...item, Remarks: v } : item))}
                    placeholder="Remarks (optional)"
                    placeholderTextColor={colors.gray}
                    style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={[styles.receiveActions, { marginTop: SPACING.sm }]}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.gray }]} onPress={() => setShowReturnModal(false)}>
                <Text style={styles.smallBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: '#B45309' }]}
                onPress={handleRequestPartReturn}
                disabled={submitting}
              >
                <Text style={styles.smallBtnText}>{submitting ? 'Submitting…' : 'Submit Return'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      <RNModal visible={Boolean(previewImage)} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewBox, { backgroundColor: colors.white }]}>
            <View style={styles.previewHeader}>
              <Text numberOfLines={1} style={{ color: colors.dark, fontWeight: '700', flex: 1, marginRight: 8 }}>
                {previewImage?.displayName || 'Image preview'}
              </Text>
              <TouchableOpacity onPress={() => setPreviewImage(null)}>
                <MaterialIcons name="close" size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>

            {previewLoading ? (
              <View style={styles.previewLoadingBox}>
                <Text style={{ color: colors.gray }}>Loading image...</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.previewImageContainer}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
              >
                {previewImage?.uri ? (
                  <Image
                    source={{ uri: previewImage.uri }}
                    style={{ width: 260 * previewZoom, height: 220 * previewZoom, resizeMode: 'contain' }}
                  />
                ) : (
                  <Text style={{ color: colors.gray }}>Image not available.</Text>
                )}
              </ScrollView>
            )}

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: '#00689E' }]}
                onPress={() => setPreviewZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                disabled={previewLoading}
              >
                <Text style={styles.smallBtnText}>- Zoom</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: '#00689E' }]}
                onPress={() => setPreviewZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
                disabled={previewLoading}
              >
                <Text style={styles.smallBtnText}>+ Zoom</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => addPartToDraft(item)}
        title="Select Part"
        data={spareParts}
        loading={false}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode']}
      />

      <ModalSelector
        visible={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        onSelect={(value, item) => addToolToDraft(item)}
        title="Select Special Tool"
        data={availableTools}
        loading={false}
        searchPlaceholder="Search tools..."
        displayKey="ToolName"
        valueKey="ToolCode"
        searchKeys={['ToolName', 'ToolCode']}
      />

      <ModalSelector
        visible={showWarehouseModal}
        onClose={() => { setShowWarehouseModal(false); setWarehouseTargetCode(null); }}
        onSelect={(value, item) => {
          if (warehouseTargetCode !== null) updatePartDraftField(warehouseTargetCode, 'Warehouse', item?.WarehouseCode || value);
          setShowWarehouseModal(false);
          setWarehouseTargetCode(null);
        }}
        title="Select Warehouse"
        data={warehouses}
        loading={false}
        searchPlaceholder="Search warehouses..."
        displayKey="WarehouseName"
        valueKey="WarehouseCode"
        searchKeys={['WarehouseName', 'WarehouseCode']}
      />

      <Loader visible={submitting} text="Please wait..." />
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
  faultHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownCard: { borderWidth: 1, padding: SPACING.md },
  breakdownLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  breakdownToggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  breakdownToggle: { borderWidth: 1, borderColor: '#64748B', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  towDepotSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 12, marginTop: 8 },
  faultTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 8,
  },
  inlineInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
  },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 13,
    width: 50,
    textAlign: 'center',
  },
  warehousePicker: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 10,
    marginTop: 4,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  smallBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  approvedBox: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: '#2B7D2B0D' },
  receiveOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.lg },
  receiveBox: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  receiveActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: SPACING.md },
  awaitingStatusPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  imageBox: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, marginTop: SPACING.sm, padding: SPACING.sm },
  imageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
    gap: 8,
  },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: SPACING.md },
  previewBox: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, maxHeight: '85%' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  previewLoadingBox: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  previewImageContainer: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  previewActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 },
});

export default FaultWorkScreen;
