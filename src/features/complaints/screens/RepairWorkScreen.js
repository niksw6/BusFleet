import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { Button, Card, RadioButton, Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';
import Loader from '../../../shared/components/Loader';

import { masterService, repairService, storeService, workEntryService } from '../../../api/services';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';
import { API_BASE_URL } from '../../../constants/config';

const isSuccess = (response) => (
  !Object.prototype.hasOwnProperty.call(response || {}, 'Success')
  && !Object.prototype.hasOwnProperty.call(response || {}, 'Status')
) || response?.Success === true || response?.Status === true;

const getWorkEntryDocEntry = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  // CreateRepairWorkEntry returns the newly-created WorkEntryDocEntry directly
  // in Data (for example: { Success: true, Data: 42 }).
  if (typeof data === 'string' || typeof data === 'number') return data;
  const row = Array.isArray(data) ? data[0] : data;
  const nested = row?.WorkEntry || row?.WorkEntryDetails || row?.Result || row?.Data;
  const nestedRow = Array.isArray(nested) ? nested[0] : nested;
  return row?.WorkEntryDocEntry ?? row?.WorkEntryEntry ?? row?.WorkEntryNo ?? row?.DocEntry
    ?? nestedRow?.WorkEntryDocEntry ?? nestedRow?.WorkEntryEntry ?? nestedRow?.WorkEntryNo ?? nestedRow?.DocEntry
    ?? response?.WorkEntryDocEntry ?? response?.WorkEntryEntry ?? response?.WorkEntryNo ?? null;
};

const extractRows = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['Data', 'data', 'Parts', 'SpareParts', 'Components', 'AssemblyDetails', 'AssemblyComponents', 'ConfiguredComponents', 'Mechanics', 'Items', 'Rows', 'List', 'Result']) {
    if (Array.isArray(data[key])) return data[key];
  }
  const nestedArray = Object.values(data).find(value => Array.isArray(value));
  if (nestedArray) return nestedArray;
  return [];
};

const normalizePart = (part) => ({
  ...part,
  ItemCode: String(part?.ItemCode || part?.Itemcode || part?.ComponentCode || part?.PartCode || part?.Code || part?.Item || part?.ItemNo || ''),
  ItemName: String(part?.ItemName || part?.Itemname || part?.ComponentName || part?.PartName || part?.Name || part?.Dscription || part?.Description || part?.ItemDescription || ''),
  ReceivedQty: Math.max(Number(part?.ReceivedQty ?? 0) || 0, Number(part?.RecQty ?? 0) || 0),
  ReturnedQty: Math.max(Number(part?.ReturnedQty ?? 0) || 0, Number(part?.ReturnQty ?? part?.RetQty ?? 0) || 0),
});

const normalizeWorkImage = (image) => {
  const rawType = String(image?.Phase || image?.ImgType || image?.ImageType || '').trim().toUpperCase();
  const imagePath = String(image?.ImgPath || image?.ImagePath || image?.FileName || image?.fileName || '').trim();
  const imageUri = String(image?.uri || image?.Uri || '').trim();
  const serverRoot = API_BASE_URL.replace(/BMSSystem\/?$/, '');
  const displayUri = imageUri || (imagePath.startsWith('http') || imagePath.startsWith('file:') || imagePath.startsWith('content:')
    ? imagePath
    : imagePath.startsWith('/') ? `${serverRoot}${imagePath}` : `${API_BASE_URL}${imagePath}`);
  return {
    ...image,
    uri: displayUri,
    Phase: rawType.includes('AFTER') || rawType === 'AF' ? 'AF' : 'BF',
    isDraft: false,
  };
};

const isVerifiedRepairStatus = (value) => ['SV', 'CL', 'CM', 'C', 'COMPLETED', 'COMPLETE', 'CLOSED', 'SUPERVISOR VERIFIED']
  .includes(String(value || '').trim().toUpperCase());

const RepairWorkScreen = ({ route }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const jobCardEntry = route.params?.jobCardEntry || route.params?.JobCardEntry || '';
  const jobCardNo = route.params?.jobCardNo || route.params?.JobCardNo || jobCardEntry;
  const assemblyCode = route.params?.assemblyCode || route.params?.AssemblyCode || route.params?.Assembly || '';
  const configuredAssemblyCode = assemblyCode || '100306470';
  const userCode = user?.User || user?.UserCode || user?.Code || user?.code || '';
  const empId = Number(
    user?.EmpID
    || user?.EmployeeID
    || user?.ID
    || user?.id
    || route.params?.empId
    || route.params?.EmpID
    || 0,
  );

  const [workEntryDocEntry, setWorkEntryDocEntry] = useState(route.params?.workEntryDocEntry || null);
  const [displayJobCard, setDisplayJobCard] = useState(String(jobCardEntry || ''));
  const [displayWorkEntry, setDisplayWorkEntry] = useState(String(route.params?.workEntryDocEntry || ''));
  const [displayJobCardStatus, setDisplayJobCardStatus] = useState('');
  const [entryLoading, setEntryLoading] = useState(!route.params?.workEntryDocEntry);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('W');
  const [remarks, setRemarks] = useState('');
  const [workDetails, setWorkDetails] = useState([]);
  const [images, setImages] = useState([]);
  const [beforeImageDrafts, setBeforeImageDrafts] = useState([]);
  const [afterImageDrafts, setAfterImageDrafts] = useState([]);
  const [savedImages, setSavedImages] = useState([]);
  const [imagePhase, setImagePhase] = useState('BF');
  const [parts, setParts] = useState([]);
  const [repairPartStatuses, setRepairPartStatuses] = useState([]);
  const [configuredComponents, setConfiguredComponents] = useState([]);
  const [additionalParts, setAdditionalParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [showComponentsModal, setShowComponentsModal] = useState(false);
  const [showAdditionalPartsModal, setShowAdditionalPartsModal] = useState(false);
  const [partMode, setPartMode] = useState('configured');
  const [activeModal, setActiveModal] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [tools, setTools] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  const [toolDrafts, setToolDrafts] = useState([]);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [returnPartsDraft, setReturnPartsDraft] = useState(null);
  const [showReturnPartsModal, setShowReturnPartsModal] = useState(false);
  const [detailDraft, setDetailDraft] = useState({ LineId: 1, WorkType: 'Inspection', Description: '', Remarks: '' });
  const [componentDraft, setComponentDraft] = useState({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
  const [partDraft, setPartDraft] = useState({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
  const [hasSavedWork, setHasSavedWork] = useState(Boolean(route.params?.workEntryDocEntry));
  const workEntryLocked = isVerifiedRepairStatus(status);
  const MAX_IMAGES_PER_PHASE = 2;
  const hasBeforeImage = images.some(image => image?.Phase === 'BF');
  const hasAfterImage = images.some(image => image?.Phase === 'AF');
  const canCompleteRepair = Boolean(workEntryDocEntry) && Boolean(remarks.trim()) && hasBeforeImage && hasAfterImage;

  const getPartStatus = (part) => String(
    part?.Status || part?.PartStatus || part?.RequestStatus || part?.IssueStatus || '',
  ).trim().toUpperCase();

  const getPartStatusLabel = (part) => {
    const partStatus = getPartStatus(part);
    const receivedQty = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
    const returnedQty = Number(part?.ReturnedQty ?? part?.RetQty ?? part?.ReturnQty ?? 0) || 0;
    if (returnedQty > 0) return receivedQty > 0 && returnedQty >= receivedQty ? 'Returned' : 'Partially returned';
    if (['RC', 'RECEIVED', 'R'].includes(partStatus) || Number(part?.ReceivedQty || part?.RecQty) > 0) return 'Received';
    if (['IS', 'ISSUED', 'I'].includes(partStatus) || Number(part?.IssuedQty || part?.IssQty) > 0) return 'Issued';
    if (['AP', 'APPROVED', 'A'].includes(partStatus) || Number(part?.ApprovedQty || part?.AprQty) > 0) return 'Approved';
    return 'Pending approval';
  };

  useEffect(() => {
    let active = true;
    const loadSpareParts = async () => {
      setPartsLoading(true);
      const [assemblyResult, sparePartsResult] = await Promise.allSettled([
        repairService.getRepairAssemblyDetails(dbName, configuredAssemblyCode),
        masterService.getSpareParts(dbName),
      ]);
      if (!active) return;

      const assemblyParts = assemblyResult.status === 'fulfilled'
        ? extractRows(assemblyResult.value).map(normalizePart).filter(part => part.ItemCode)
        : [];
      const globalParts = sparePartsResult.status === 'fulfilled'
        ? extractRows(sparePartsResult.value).map(normalizePart).filter(part => part.ItemCode)
        : [];
      setConfiguredComponents(assemblyParts);
      setAdditionalParts(globalParts);
      setPartsLoading(false);
      if (assemblyResult.status === 'fulfilled' && assemblyParts.length === 0) {
        Toast.show({ type: 'error', text1: 'No configured components found', text2: `No components returned for ${configuredAssemblyCode}.` });
      }
    };

    loadSpareParts().catch(error => {
      if (active) {
        setPartsLoading(false);
        Toast.show({ type: 'error', text1: 'Unable to load spare parts', text2: error?.message || 'Please try again.' });
      }
    });
    return () => { active = false; };
  }, [assemblyCode, configuredAssemblyCode, dbName]);

  const createWorkEntry = useCallback(async () => {
    console.log('[RepairWork] Create requested', JSON.stringify({ workEntryDocEntry, jobCardEntry, empId, userCode }));
    if (workEntryDocEntry) {
      return workEntryDocEntry;
    }
    if (!jobCardEntry) {
      console.warn('[RepairWork] Create skipped; missing JobCardEntry');
      Toast.show({ type: 'error', text1: 'Cannot create repair work entry', text2: 'Missing JobCardEntry.' });
      return null;
    }
    try {
      const loggedInEmpId = await resolveLoggedInMechanicId();
      if (!loggedInEmpId) {
        console.warn('[RepairWork] Create skipped; logged-in mechanic was not found in GetMechanics', userCode);
        Toast.show({ type: 'error', text1: 'Mechanic employee ID not found', text2: 'Please sign in again or contact an administrator.' });
        return null;
      }
      const payload = {
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        EmpID: loggedInEmpId,
      };
      console.log('[RepairWork] CreateRepairWorkEntry payload:', JSON.stringify(payload));
      const response = await repairService.createRepairWorkEntry(payload);
      console.log('[RepairWork] CreateRepairWorkEntry response:', JSON.stringify(response));
      if (!isSuccess(response)) throw new Error(response?.Message || 'Work entry creation failed.');
      const createdEntry = getWorkEntryDocEntry(response);
      if (!createdEntry) throw new Error('Work entry was created but its ID was not returned.');
      setWorkEntryDocEntry(createdEntry);
      setDisplayWorkEntry(String(createdEntry));
      return createdEntry;
    } catch (error) {
      console.error('[RepairWork] CreateRepairWorkEntry failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Unable to open repair work', text2: error?.message || 'Please try again.' });
      return null;
    } finally {
      setEntryLoading(false);
    }
  }, [dbName, empId, jobCardEntry, userCode, workEntryDocEntry]);

  const handleStartWork = async () => {
    if (workEntryLocked) return;
    setSubmitting(true);
    const entry = await createWorkEntry();
    setSubmitting(false);
    if (entry) Toast.show({ type: 'success', text1: 'Repair work started', text2: 'Add work details and a before image to save progress.' });
  };

  const loadRepairPartStatuses = useCallback(async () => {
    if (!workEntryDocEntry) return;
    const [approvedResult, issuedResult, pendingResult, dashboardResult] = await Promise.allSettled([
      repairService.getApprovedRepairParts(dbName, userCode),
      repairService.getIssuedRepairParts(dbName, jobCardEntry, userCode),
      repairService.getPendingRepairPartRequests(dbName, userCode),
      repairService.getMyRepairWorkDashboard(dbName, userCode),
    ]);
    const rows = [approvedResult, issuedResult, pendingResult].flatMap(result => (
      result.status === 'fulfilled' ? extractRows(result.value) : []
    ));
    const matchingRows = rows.filter(row => {
      const entry = row?.WorkEntryEntry ?? row?.WorkEntryDocEntry;
      const rowJobCard = row?.JobCard ?? row?.JobCardNo ?? row?.JobCardDocNum;
      if (rowJobCard !== undefined && String(rowJobCard) !== String(jobCardNo)) return false;
      return (entry !== undefined && entry !== null && String(entry) === String(workEntryDocEntry))
        || (rowJobCard !== undefined && String(rowJobCard) === String(jobCardNo));
    });
    const uniqueRows = matchingRows.filter((row, index, allRows) => (
      allRows.findIndex(candidate => (
        String(candidate?.LineId ?? candidate?.LineNum ?? candidate?.PartLine ?? '') === String(row?.LineId ?? row?.LineNum ?? row?.PartLine ?? '')
        && String(candidate?.ItemCode ?? candidate?.Code ?? '') === String(row?.ItemCode ?? row?.Code ?? '')
      )) === index
    ));
    const dashboardData = dashboardResult.status === 'fulfilled'
      ? dashboardResult.value?.Data ?? dashboardResult.value?.data ?? dashboardResult.value
      : null;
    const dashboardEntries = Array.isArray(dashboardData?.WorkEntries) ? dashboardData.WorkEntries : [];
    const normalizeReference = value => String(value ?? '').trim().replace(/^0+(?=\d)/, '');
    const cardEntries = dashboardEntries.filter(entry => (
      [entry?.JobCard, entry?.JobCardNo, entry?.JobCardDocNum]
        .some(value => value !== undefined && normalizeReference(value) === normalizeReference(jobCardNo))
    ));
    const dashboardEntry = cardEntries.find(entry => (
      [entry?.WorkEntryDocEntry, entry?.WorkEntryEntry, entry?.DocEntry]
        .some(value => value !== undefined && normalizeReference(value) === normalizeReference(workEntryDocEntry))
    )) || cardEntries.find(entry => !['C', 'CM', 'SV', 'CL', 'COMPLETED', 'CLOSED'].includes(String(entry?.Status || '').toUpperCase()))
      || cardEntries[0];
    const dashboardParts = Array.isArray(dashboardEntry?.Parts)
      ? dashboardEntry.Parts.map(part => normalizePart({
        ...part,
        WorkEntryDocEntry: part?.WorkEntryDocEntry ?? part?.WorkEntryEntry ?? dashboardEntry?.WorkEntryDocEntry ?? dashboardEntry?.WorkEntryEntry ?? dashboardEntry?.DocEntry ?? workEntryDocEntry,
      }))
      : [];
    setRepairPartStatuses([...uniqueRows, ...dashboardParts]);
  }, [dbName, jobCardEntry, jobCardNo, userCode, workEntryDocEntry]);

  useEffect(() => {
    loadRepairPartStatuses().catch(error => {
      Toast.show({ type: 'error', text1: 'Unable to load part status', text2: error?.message || 'Please try again.' });
    });
  }, [loadRepairPartStatuses]);

  const updateDetail = (index, field, value) => {
    setWorkDetails(previous => previous.map((detail, detailIndex) => (
      detailIndex === index ? { ...detail, [field]: value } : detail
    )));
  };

  const addDetail = () => setWorkDetails(previous => ([
    ...previous,
    { LineId: previous.length + 1, WorkType: 'Repair', Description: '', Remarks: '' },
  ]));

  const addWorkDetail = () => {
    setDetailDraft({ LineId: workDetails.length + 1, WorkType: 'Inspection', Description: '', Remarks: '' });
    setActiveModal('detail');
  };

  const editWorkDetail = (detail) => {
    setDetailDraft({ ...detail });
    setActiveModal('detail');
  };

  const saveDetailDraft = () => {
    if (!detailDraft.WorkType?.trim() || !detailDraft.Description?.trim() || !detailDraft.Remarks?.trim()) {
      Toast.show({ type: 'error', text1: 'Complete all work detail fields' });
      return;
    }
    setWorkDetails(previous => {
      const exists = previous.some(detail => detail.LineId === detailDraft.LineId);
      return exists
        ? previous.map(detail => detail.LineId === detailDraft.LineId ? detailDraft : detail)
        : [...previous, detailDraft];
    });
    setActiveModal(null);
  };

  const resolveLoggedInMechanicId = async () => {
    if (empId) return empId;
    const response = await masterService.getMechanics(dbName, user?.Depot || user?.depot || '');
    const mechanicCode = String(userCode || '').trim().toLowerCase();
    const mechanic = extractRows(response).find(item => [
      item?.UserCode,
      item?.Code,
      item?.EmpCode,
      item?.User,
    ].some(value => String(value || '').trim().toLowerCase() === mechanicCode));
    return Number(mechanic?.EmpID || mechanic?.EmployeeID || mechanic?.ID || mechanic?.id || 0);
  };

  const loadExistingWorkEntry = useCallback(async () => {
    if ((!jobCardEntry && !workEntryDocEntry) || !userCode) {
      setEntryLoading(false);
      return;
    }
    try {
      const routeWorkEntry = route.params?.existingWorkEntry;
      const routeWorkEntryId = routeWorkEntry?.WorkEntryDocEntry ?? routeWorkEntry?.WorkEntryEntry ?? routeWorkEntry?.DocEntry;
      const routeWorkEntryMatches = routeWorkEntry && (
        (workEntryDocEntry && routeWorkEntryId !== undefined && String(routeWorkEntryId) === String(workEntryDocEntry))
        || String(routeWorkEntry?.JobCard ?? routeWorkEntry?.JobCardNo ?? '') === String(jobCardNo)
      );
      const response = await repairService.getMyRepairWorkDashboard(dbName, userCode);
      const dashboardData = response?.Data ?? response?.data ?? response;
      const workEntries = Array.isArray(dashboardData?.WorkEntries) ? dashboardData.WorkEntries : [];
      const mechanicEntries = workEntries.filter(entry => !entry?.EmpID || !empId || Number(entry.EmpID) === empId);
      const cardEntries = mechanicEntries.filter(entry => (
        jobCardNo
        && String(entry?.JobCard ?? entry?.JobCardNo ?? entry?.JobCardDocNum ?? '') === String(jobCardNo)
      ));
      const entryMatchesRoute = entry => workEntryDocEntry && String(
        entry?.WorkEntryDocEntry ?? entry?.WorkEntryEntry ?? entry?.DocEntry ?? '',
      ) === String(workEntryDocEntry);
      const matchingEntry = (routeWorkEntryMatches ? routeWorkEntry : null)
        || mechanicEntries.find(entry => entryMatchesRoute(entry) && (
          !entry?.JobCard && !entry?.JobCardNo && !entry?.JobCardDocNum
          || String(entry?.JobCard ?? entry?.JobCardNo ?? entry?.JobCardDocNum) === String(jobCardNo)
        ))
        || cardEntries.find(entryMatchesRoute)
        || cardEntries.find(entry => !['C', 'CM', 'SV', 'CL', 'COMPLETED', 'CLOSED'].includes(String(entry?.Status || '').toUpperCase()))
        || cardEntries[0];
      if (!matchingEntry) return;

      const existingEntryId = matchingEntry?.WorkEntryDocEntry || matchingEntry?.WorkEntryEntry || matchingEntry?.DocEntry;
      if (existingEntryId) setWorkEntryDocEntry(existingEntryId);
      setDisplayJobCard(String(jobCardNo || matchingEntry?.JobCard || '-'));
      setDisplayWorkEntry(String(matchingEntry?.DocNum ?? existingEntryId ?? '-'));
      setDisplayJobCardStatus(String(matchingEntry?.JobCardStatus || matchingEntry?.Status || '').trim());
      setStatus(matchingEntry?.Status || 'W');
      setRemarks(matchingEntry?.Remarks || '');
      setHasSavedWork(true);
      if (Array.isArray(matchingEntry?.WorkDetails)) setWorkDetails(matchingEntry.WorkDetails);
      if (Array.isArray(matchingEntry?.Parts)) setParts(matchingEntry.Parts.map(normalizePart));
      const dashboardImages = [
        ...(Array.isArray(matchingEntry?.Images) ? matchingEntry.Images : []),
        ...(Array.isArray(matchingEntry?.WorkImages) ? matchingEntry.WorkImages : []),
        ...(Array.isArray(matchingEntry?.RepairImages) ? matchingEntry.RepairImages : []),
        ...(Array.isArray(matchingEntry?.ImageList) ? matchingEntry.ImageList : []),
      ];
      if (dashboardImages.length > 0) {
        const imageRows = dashboardImages.map(normalizeWorkImage).filter(image => image.uri);
        setImages(imageRows);
        setSavedImages(imageRows);
      }
      const existingTools = [
        ...(Array.isArray(matchingEntry?.SpecialTools) ? matchingEntry.SpecialTools : []),
        ...(Array.isArray(matchingEntry?.Tools) ? matchingEntry.Tools : []),
      ];
      if (existingTools.length > 0) setTools(existingTools);
      console.log('[RepairWork] Existing work entry loaded:', JSON.stringify(matchingEntry));
    } catch (error) {
      console.warn('[RepairWork] Existing work dashboard unavailable:', error?.message || error);
    } finally {
      setEntryLoading(false);
    }
  }, [dbName, empId, jobCardEntry, jobCardNo, route.params?.existingWorkEntry, userCode, workEntryDocEntry]);

  useEffect(() => { loadExistingWorkEntry(); }, [loadExistingWorkEntry]);

  useEffect(() => {
    let active = true;
    storeService.getSpecialTools(dbName, user?.Depot || user?.depot || '').then((response) => {
      if (!active) return;
      const rows = extractRows(response).map((tool) => ({
        ...tool,
        ToolCode: String(tool?.ToolCode || tool?.Code || '').trim(),
        ToolName: String(tool?.ToolName || tool?.Name || tool?.Description || '').trim(),
      })).filter((tool) => tool.ToolCode && tool.ToolCode.toUpperCase() !== 'OTHER');
      setAvailableTools(rows);
    }).catch((error) => {
      console.warn('[RepairWork] Special-tool catalogue unavailable:', error?.message || error);
    });
    return () => { active = false; };
  }, [dbName, user?.Depot, user?.depot]);

  const pickImages = async (phase = imagePhase) => {
    if (!workEntryDocEntry) {
      Toast.show({ type: 'info', text1: 'Start repair work first', text2: 'Create the work entry before adding repair images.' });
      return;
    }
    try {
      const currentCount = images.filter(image => image?.Phase === phase).length;
      if (currentCount >= MAX_IMAGES_PER_PHASE) {
        Toast.show({ type: 'info', text1: 'Image limit reached', text2: `Only ${MAX_IMAGES_PER_PHASE} ${phase === 'BF' ? 'before' : 'after'} images are allowed.` });
        return;
      }
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES_PER_PHASE - currentCount,
        quality: 0.7,
        base64: false,
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || []).slice(0, MAX_IMAGES_PER_PHASE - currentCount).map(image => ({ ...image, Phase: phase, isDraft: true }))]);
        setActiveModal(null);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to select images', text2: error?.message || 'Please try again.' });
    }
  };

  const captureImage = async (phase = imagePhase) => {
    if (!workEntryDocEntry) {
      Toast.show({ type: 'info', text1: 'Start repair work first', text2: 'Create the work entry before taking a repair image.' });
      return;
    }
    try {
      const currentCount = images.filter(image => image?.Phase === phase).length;
      if (currentCount >= MAX_IMAGES_PER_PHASE) {
        Toast.show({ type: 'info', text1: 'Image limit reached', text2: `Only ${MAX_IMAGES_PER_PHASE} ${phase === 'BF' ? 'before' : 'after'} images are allowed.` });
        return;
      }
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Toast.show({ type: 'error', text1: 'Camera permission required', text2: 'Allow camera access to capture an image.' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: false,
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || []).slice(0, MAX_IMAGES_PER_PHASE - currentCount).map(image => ({ ...image, Phase: phase, isDraft: true }))]);
        setActiveModal(null);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to capture image', text2: error?.message || 'Please try again.' });
    }
  };

  const addConfiguredComponent = () => {
    if (!componentDraft.ItemCode.trim() || !componentDraft.ItemName.trim()) {
      Toast.show({ type: 'error', text1: 'Select a configured component first' });
      return;
    }
    setParts(previous => [...previous, { ...componentDraft, ReqQty: Number(componentDraft.ReqQty) || 1 }]);
    setComponentDraft({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
  };

  const uploadRepairImages = async (entryDocEntry) => {
    const drafts = images.filter(image => image?.isDraft && image?.uri);
    let uploadedNames = [];
    if (drafts.length > 0) {
      const response = await workEntryService.uploadImages(drafts.map(image => ({
        uri: image.uri,
        name: image.fileName || image.fileName || image.name,
        mimeType: image.mimeType || image.type || 'image/jpeg',
      })));
      uploadedNames = Array.isArray(response?.FileNames)
        ? response.FileNames
        : String(response?.FileName || '').split(',').map(name => name.trim()).filter(Boolean);
      if (uploadedNames.length !== drafts.length) {
        throw new Error(response?.Message || 'Image upload did not return a filename for each selected image.');
      }
    }

    const persistedImages = images.filter(image => !image?.isDraft).map((image, index) => ({
      ...image,
      LineId: image?.LineId ?? index,
      WorkEntryEntry: Number(entryDocEntry) || entryDocEntry,
      ImgType: image?.Phase === 'AF' ? 'After Repair' : 'Before Repair',
      ImgNo: image?.ImgNo ?? index + 1,
      ImgPath: image?.ImgPath || image?.ImagePath || image?.FileName || image?.fileName || image?.name || '',
    }));
    const newImages = drafts.map((image, index) => ({
      LineId: persistedImages.length + index,
      WorkEntryEntry: Number(entryDocEntry) || entryDocEntry,
      ImgType: image?.Phase === 'AF' ? 'After Repair' : 'Before Repair',
      Phase: image?.Phase,
      ImgNo: images.filter(saved => !saved?.isDraft && saved?.Phase === image?.Phase).length + index + 1,
      ImgPath: uploadedNames[index],
      FileName: uploadedNames[index],
      Remarks: image?.Phase === 'AF' ? 'Assembly after repair.' : 'Assembly before repair.',
      uri: image?.uri,
      isDraft: false,
    }));
    return [...persistedImages, ...newImages];
  };

  const saveWork = async (nextStatus = status) => {
    if (workEntryLocked) {
      Toast.show({ type: 'info', text1: 'Work already verified', text2: 'This repair entry is read-only.' });
      return;
    }
    try {
      setSubmitting(true);
      console.log('[RepairWork] Save button pressed:', JSON.stringify({
        action: workEntryDocEntry ? 'Update Repair Work Entry' : 'Create Repair Work Entry',
        currentWorkEntryDocEntry: workEntryDocEntry,
        jobCardEntry,
        nextStatus,
      }));
      const entryDocEntry = workEntryDocEntry || await createWorkEntry();
      if (!entryDocEntry) return;
      if (!hasSavedWork && !images.some(image => image?.Phase === 'BF')) {
        throw new Error('Add a before repair image before the first save.');
      }
      if (nextStatus === 'C' && (!images.some(image => image?.Phase === 'BF') || !images.some(image => image?.Phase === 'AF'))) {
        throw new Error('Add both a before repair image and an after repair image before completing.');
      }
      const uploadedImages = await uploadRepairImages(entryDocEntry);
      const payload = {
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(entryDocEntry) || entryDocEntry,
        UserCode: userCode,
        Status: nextStatus,
        Remarks: remarks,
        // The repair API treats every submitted work detail as a new row and
        // requires LineId zero for each one; local IDs remain distinct only
        // for rendering and editing in this screen.
        WorkDetails: workDetails.filter(detail => detail.Description.trim()).map(detail => ({ ...detail, LineId: 0 })),
        Images: uploadedImages,
        Parts: parts,
      };
      console.log('[RepairWork] POST UpdateRepairWorkEntry payload:', JSON.stringify(payload));
      const response = await repairService.updateRepairWorkEntry(payload);
      console.log('[RepairWork] UpdateRepairWorkEntry response:', JSON.stringify(response));
      if (!isSuccess(response)) throw new Error(response?.Message || 'Repair work update failed.');
      setStatus(nextStatus);
      setImages(uploadedImages.map(normalizeWorkImage));
      setSavedImages(uploadedImages.map(normalizeWorkImage));
      setHasSavedWork(true);
      Toast.show({ type: 'success', text1: nextStatus === 'C' ? 'Repair submitted for review' : nextStatus === 'P' ? 'Repair work paused' : 'Repair work saved' });
    } catch (error) {
      console.error('[RepairWork] Save repair work failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Unable to save repair work', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnPart = (part) => {
    const received = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
    const returned = Number(part?.ReturnedQty ?? part?.ReturnQty ?? part?.RetQty ?? 0) || 0;
    setReturnPartsDraft({
      part,
      ReturnQty: String(Math.max(received - returned, 1)),
      Remarks: 'Unused part returned',
    });
    setShowReturnPartsModal(true);
  };

  const submitPartReturn = async () => {
    const part = returnPartsDraft?.part;
    const lineId = part?.LineId ?? part?.LineNum ?? part?.LineID ?? part?.PartLine;
    const received = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
    const returned = Number(part?.ReturnedQty ?? part?.ReturnQty ?? part?.RetQty ?? 0) || 0;
    const returnQty = Number(returnPartsDraft?.ReturnQty);
    if (lineId === undefined || lineId === null || String(lineId).trim() === '') {
      Toast.show({ type: 'error', text1: 'Part line unavailable', text2: 'This part cannot be returned.' });
      return;
    }
    if (!Number.isInteger(returnQty) || returnQty <= 0 || returnQty > received - returned) {
      Toast.show({ type: 'error', text1: 'Invalid return quantity', text2: `Enter a quantity from 1 to ${received - returned}.` });
      return;
    }
    try {
      setSubmitting(true);
      const response = await repairService.updateRepairWorkEntry({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: userCode,
        Status: 'W',
        PauseRmk: '',
        Remarks: remarks || 'Repair work in progress',
        PartReturns: [{
          LineId: Number(lineId) || lineId,
          ReturnQty: returnQty,
          Remarks: String(returnPartsDraft?.Remarks || '').trim(),
        }],
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part return request failed.');
      const returnedQtyAfterRequest = returned + returnQty;
      const updateReturnedQty = rows => rows.map(row => {
        const rowLineId = row?.LineId ?? row?.LineNum ?? row?.LineID ?? row?.PartLine;
        const sameLine = String(rowLineId ?? '') === String(lineId);
        const sameItem = !part?.ItemCode || String(row?.ItemCode || row?.Code || '') === String(part.ItemCode);
        return sameLine && sameItem
          ? { ...row, RetQty: returnedQtyAfterRequest, ReturnedQty: returnedQtyAfterRequest }
          : row;
      });
      setParts(updateReturnedQty);
      setRepairPartStatuses(updateReturnedQty);
      setShowReturnPartsModal(false);
      setReturnPartsDraft(null);
      await loadRepairPartStatuses();
      Toast.show({ type: 'success', text1: 'Part return requested' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to return part', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const requestAdditionalPart = async () => {
    const itemCode = String(partDraft.ItemCode || '').trim();
    const itemName = String(partDraft.ItemName || '').trim();
    if (!itemCode || !itemName) {
      Toast.show({ type: 'error', text1: 'Select an additional spare part first' });
      return;
    }
    try {
      setSubmitting(true);
      if (!workEntryDocEntry) {
        Toast.show({ type: 'error', text1: 'Repair work entry is required', text2: 'Create the work entry before requesting an additional part.' });
        return;
      }
      const requestedPart = {
        ItemCode: itemCode,
        ItemName: itemName,
        ReqQty: Number(partDraft.ReqQty) || 1,
        Remarks: partDraft.Remarks.trim(),
      };
      const response = await repairService.requestRepairAdditionalPart({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: userCode,
        Status: status || 'W',
        Remarks: remarks || 'Additional spare part requested for repair.',
        Part: requestedPart,
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part request failed.');
      const nextParts = [...parts, { ...requestedPart, Status: 'RQ', RequestType: 'additional' }];
      setParts(nextParts);
      setPartDraft({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
      setActiveModal(null);
      Toast.show({ type: 'success', text1: 'Additional part requested', text2: 'Awaiting approval.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to request part', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const addToolDraft = (tool) => {
    const code = String(tool?.ToolCode || tool?.Code || '').trim();
    if (!code) return;
    if (tools.some(item => String(item?.ToolCode || item?.Code || '').trim().toLowerCase() === code.toLowerCase())
      || toolDrafts.some(item => String(item?.ToolCode || '').trim().toLowerCase() === code.toLowerCase())) {
      Toast.show({ type: 'info', text1: 'Tool already added' });
      setShowToolsModal(false);
      return;
    }
    setToolDrafts(previous => [...previous, {
      ToolCode: code,
      ToolName: String(tool?.ToolName || tool?.Name || tool?.Description || code).trim(),
      Remarks: '',
    }]);
    setShowToolsModal(false);
  };

  const requestTools = async () => {
    if (!workEntryDocEntry || toolDrafts.length === 0) {
      Toast.show({ type: 'info', text1: 'Select tools', text2: 'Start work and select at least one tool.' });
      return;
    }
    try {
      setSubmitting(true);
      const response = await repairService.updateRepairWorkEntry({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: userCode,
        Status: 'W',
        PauseRmk: '',
        Remarks: remarks || 'Repair work in progress',
        SpecialTools: toolDrafts.map(tool => ({
          ToolCode: tool.ToolCode,
          ToolName: tool.ToolName,
          Remarks: tool.Remarks || '',
        })),
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Special tool request failed.');
      setTools(previous => [...toolDrafts.map(tool => ({ ...tool, Status: 'RQ' })), ...previous]);
      setToolDrafts([]);
      Toast.show({ type: 'success', text1: 'Special tools requested', text2: 'Awaiting approval.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to request tools', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getToolLine = (tool) => Number(tool?.ToolLine ?? tool?.LineId ?? tool?.Line ?? tool?.LineNum ?? 0) || 0;
  const receiveTool = async (tool) => {
    const lineId = getToolLine(tool);
    if (!workEntryDocEntry || !lineId) return;
    try {
      setSubmitting(true);
      const response = await storeService.receiveSpecialTool({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        MechanicCode: userCode,
        Tools: [{ LineId: lineId, ToolCode: tool?.ToolCode || tool?.Code }],
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Unable to receive tool.');
      setTools(previous => previous.map(item => item === tool ? { ...item, Status: 'RC' } : item));
      Toast.show({ type: 'success', text1: 'Tool received' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to receive tool', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const returnTool = async (tool) => {
    const lineId = getToolLine(tool);
    if (!workEntryDocEntry || !lineId) return;
    try {
      setSubmitting(true);
      const response = await storeService.returnSpecialTool({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        MechanicCode: userCode,
        Tools: [{ LineId: lineId, Remarks: tool?.Remarks || 'Returned in good condition' }],
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Unable to return tool.');
      setTools(previous => previous.map(item => item === tool ? { ...item, Status: 'RT' } : item));
      Toast.show({ type: 'success', text1: 'Tool returned' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to return tool', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const receivePart = async (part) => {
    const lineId = part?.LineId ?? part?.LineNum ?? part?.LineID;
    if (!jobCardEntry) {
      Toast.show({ type: 'error', text1: 'Job card unavailable', text2: 'Cannot receive a repair part without JobCardEntry.' });
      return;
    }
    try {
      setSubmitting(true);
      const receiveQty = Number(part?.ReceiveQty ?? part?.ReceivedQty ?? part?.Qty ?? part?.ReqQty ?? 1) || 1;
      const response = await repairService.receiveRepairPart({
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        MechanicUserCode: userCode,
        Parts: [{
          LineId: Number(lineId) || lineId,
          ReceiveQty: receiveQty,
        }],
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part receipt failed.');
      await loadRepairPartStatuses();
      Toast.show({ type: 'success', text1: 'Part marked as received' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to receive part', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const partTableRows = [...parts, ...repairPartStatuses].reduce((rows, part) => {
    const normalizedPart = normalizePart(part);
    const code = normalizedPart.ItemCode;
    const lineId = normalizedPart?.LineId ?? normalizedPart?.LineNum ?? normalizedPart?.LineID ?? normalizedPart?.PartLine;
    const existing = rows.find(row => (
      code && String(row.code || row?.ItemCode || '') === code
        && (lineId === undefined || lineId === null || String(row?.LineId ?? row?.LineNum ?? row?.LineID ?? row?.PartLine ?? '') === String(lineId))
    ) || (!lineId && !code && row.code === code));
    if (existing) {
      return rows.map(row => row === existing ? {
        ...row,
        ...normalizedPart,
        ReceivedQty: Math.max(Number(row?.ReceivedQty ?? row?.RecQty ?? 0) || 0, Number(normalizedPart?.ReceivedQty ?? normalizedPart?.RecQty ?? 0) || 0),
        RecQty: Math.max(Number(row?.ReceivedQty ?? row?.RecQty ?? 0) || 0, Number(normalizedPart?.ReceivedQty ?? normalizedPart?.RecQty ?? 0) || 0),
        ReturnedQty: Math.max(Number(row?.ReturnedQty ?? row?.ReturnQty ?? row?.RetQty ?? 0) || 0, Number(normalizedPart?.ReturnedQty ?? normalizedPart?.ReturnQty ?? normalizedPart?.RetQty ?? 0) || 0),
        code,
      } : row);
    }
    return [...rows, { ...normalizedPart, code }];
  }, []).filter(part => part.code);

  const getImageName = (image, fallback) => image?.ImgPath || image?.ImagePath || image?.fileName || image?.name || fallback;
  const showImage = (image, fallback) => setSelectedImage({
    uri: image?.uri || '',
    name: getImageName(image, fallback),
  });

  if (entryLoading) return <Loader />;

  if (!workEntryDocEntry) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.dark }]}>Repair Work Entry</Text>
        <Card style={styles.summary}>
          <Card.Content>
            <Text style={{ color: colors.dark }}>Job card: {displayJobCard || jobCardEntry || '-'}</Text>
            <Text style={{ color: colors.gray }}>Job card status: {displayJobCardStatus || '-'}</Text>
            <Text style={{ color: colors.dark }}>Assembly: {route.params?.assemblyName || 'Assembly'}</Text>
            <Text style={{ color: colors.gray }}>Work entry: Not started</Text>
          </Card.Content>
        </Card>
        <Card style={styles.section}>
          <Card.Content>
            <Text style={[styles.sectionTitle, { color: colors.dark, marginTop: 0 }]}>Ready to start repair work?</Text>
            <Text style={{ color: colors.gray, marginTop: SPACING.sm }}>
              Start the accepted repair job to create your work entry. You can then add work details, images, parts, and tools.
            </Text>
            <Button mode="contained" icon="play" onPress={handleStartWork} loading={submitting} disabled={submitting} style={{ marginTop: SPACING.md }}>
              Start Work
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Repair Work Entry</Text>
      <Card style={styles.summary}>
        <Card.Content>
          <Text style={{ color: colors.dark }}>Job card: {displayJobCard || '-'}</Text>
          <Text style={{ color: colors.gray }}>Job card status: {displayJobCardStatus || '-'}</Text>
          <Text style={{ color: colors.dark }}>Assembly: {route.params?.assemblyName || 'Assembly'}</Text>
          <Text style={{ color: colors.gray }}>Work entry: {displayWorkEntry || 'Opening...'}</Text>
        </Card.Content>
      </Card>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work details</Text>
      {workDetails.map((detail, index) => (
        <TouchableOpacity key={detail.LineId} activeOpacity={0.8} onPress={() => editWorkDetail(detail)}>
          <Card style={styles.section}>
          <Card.Content>
            <Text style={{ color: colors.dark, fontWeight: '700' }}>{detail.WorkType || 'Work detail'}</Text>
            <Text style={{ color: colors.gray }}>{detail.Description || 'No description entered'}</Text>
            <Text style={{ color: colors.gray }}>{detail.Remarks || 'No remarks entered'}</Text>
          </Card.Content>
          </Card>
        </TouchableOpacity>
      ))}
      <Button mode="outlined" onPress={addWorkDetail} disabled={submitting}>Add work detail</Button>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Before repair image (BF)</Text>
      <Button mode="outlined" icon="camera" onPress={() => { setImagePhase('BF'); setActiveModal('images'); }} disabled={submitting}>Add before image</Button>
      <View style={styles.imageNameList}>{images.filter(image => image?.Phase === 'BF').map((image, index) => <TouchableOpacity key={`${image?.ImgPath || image?.name || index}`} onPress={() => showImage(image, 'Before repair image')}><Text style={[styles.imageName, { color: colors.primary }]}>{getImageName(image, 'Before repair image')}</Text></TouchableOpacity>)}</View>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts</Text>
      <Button mode="outlined" icon="playlist-plus" onPress={() => setActiveModal('parts')} disabled={partsLoading || submitting}>Add or request part</Button>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partsTableScroll}>
        <View style={styles.partsTable}>
          <View style={[styles.partsTableRow, styles.partsTableHeader, { borderColor: colors.border || '#E0E0E0' }]}>
            {['Part', 'Requested', 'Approved', 'Issued', 'Received', 'Returned', 'Status', 'Action'].map((label) => (
              <Text key={label} style={[styles.partsTableCell, styles.partsTableHeaderText, { color: colors.dark }]}>{label}</Text>
            ))}
          </View>
          {partTableRows.length === 0 ? (
            <Text style={[styles.emptyPartsText, { color: colors.gray }]}>No parts requested yet.</Text>
          ) : partTableRows.map((part, index) => {
            const label = getPartStatusLabel(part);
            const issued = Number(part?.IssuedQty ?? part?.IssueQty ?? 0) || 0;
            const received = Number(part?.ReceivedQty ?? part?.RecQty ?? 0) || 0;
            const canReceive = issued > received;
            const returned = Number(part?.ReturnedQty ?? part?.ReturnQty ?? part?.RetQty ?? 0) || 0;
            const canReturn = received > returned;
            return (
              <View key={`${part.code}-${part?.LineId ?? index}`} style={[styles.partsTableRow, { borderColor: colors.border || '#E0E0E0' }]}>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ItemName || part?.PartName || part.code}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ReqQty ?? part?.Qty ?? 0}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ApprovedQty ?? part?.AprQty ?? 0}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{issued}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{received}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{returned}</Text>
                <Text style={[styles.partsTableCell, { color: colors.gray }]}>{label}</Text>
                <View style={styles.partsTableAction}>
                  {canReceive ? <Button compact mode="outlined" onPress={() => receivePart(part)} disabled={submitting}>Receive</Button> : null}
                  {canReturn ? <Button compact mode="outlined" onPress={() => openReturnPart(part)} disabled={submitting}>Return</Button> : null}
                  {!canReceive && !canReturn ? <Text style={{ color: colors.gray }}>-</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Special tools</Text>
      <Button mode="outlined" icon="hammer-wrench" onPress={() => setShowToolsModal(true)} disabled={submitting}>Select special tool</Button>
      {toolDrafts.length > 0 && (
        <View style={styles.toolDraftList}>
          {toolDrafts.map((tool, index) => (
            <View key={`${tool.ToolCode || tool.Code || 'tool'}-${index}`} style={[styles.toolDraftCard, { borderColor: colors.border || '#E0E0E0' }]}>
              <View style={styles.toolDraftHeader}>
                <Text style={{ color: colors.dark, fontWeight: '700' }}>{tool.ToolName || tool.ToolCode || 'Tool'}</Text>
                <TouchableOpacity onPress={() => setToolDrafts(previous => previous.filter((_, itemIndex) => itemIndex !== index))}>
                  <MaterialIcons name="close" size={18} color="#BB0000" />
                </TouchableOpacity>
              </View>
              <TextInput
                mode="outlined"
                label="Tool remarks"
                value={tool.Remarks || ''}
                onChangeText={value => setToolDrafts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, Remarks: value } : item))}
                multiline
                style={styles.input}
              />
            </View>
          ))}
          <Button mode="contained" onPress={requestTools} disabled={submitting}>Request selected tools</Button>
        </View>
      )}
      {tools.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.partsTableScroll}>
          <View style={styles.toolTable}>
            <View style={[styles.partsTableRow, styles.partsTableHeader, { borderColor: colors.border || '#E0E0E0' }]}>
              {['Special tool', 'Code', 'Status', 'Action'].map(label => (
                <Text key={label} style={[styles.partsTableCell, styles.partsTableHeaderText, { color: colors.dark }]}>{label}</Text>
              ))}
            </View>
            {tools.map((tool, index) => {
            const toolStatus = String(tool?.Status || '').trim().toUpperCase();
            const isIssued = ['IS', 'ISSUED'].includes(toolStatus);
            const isReceived = ['RC', 'RECEIVED'].includes(toolStatus);
            const isReturned = ['RT', 'RETURNED'].includes(toolStatus);
            const statusLabel = isReturned ? 'Returned' : isReceived ? 'Received' : isIssued ? 'Issued' : ['AP', 'APPROVED', 'A'].includes(toolStatus) ? 'Approved' : ['RJ', 'REJECTED', 'R'].includes(toolStatus) ? 'Rejected' : 'Pending approval';
            return (
              <View key={`${tool?.ToolCode || tool?.Code || 'tool'}-${tool?.LineId ?? index}`} style={[styles.partsTableRow, { borderColor: colors.border || '#E0E0E0' }]}>
                <Text style={[styles.toolTableCell, { color: colors.dark, fontWeight: '600' }]}>{tool?.ToolName || tool?.ToolCode || tool?.Code || 'Tool'}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{tool?.ToolCode || tool?.Code || '-'}</Text>
                <Text style={[styles.partsTableCell, { color: colors.gray }]}>{statusLabel}</Text>
                <View style={styles.toolTableAction}>
                  {isIssued && !isReceived && !isReturned ? <Button compact mode="outlined" onPress={() => receiveTool(tool)} disabled={submitting}>Receive</Button> : null}
                  {isReceived && !isReturned ? <Button compact mode="outlined" onPress={() => returnTool(tool)} disabled={submitting}>Return</Button> : null}
                  {!isIssued && !isReceived ? <Text style={{ color: colors.gray }}>-</Text> : null}
                </View>
              </View>
            );
          })}
          </View>
        </ScrollView>
      )}

      <View style={styles.buttonRow}>
        <Button mode="contained" onPress={() => saveWork('W')} loading={submitting} disabled={submitting || !workEntryDocEntry} style={styles.workActionButton} contentStyle={styles.workActionContent}>
          {workEntryDocEntry ? 'Update Repair work entry' : 'Create Repair Work Entry'}
        </Button>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Repair remarks</Text>
      <Button mode="outlined" icon="note-edit" onPress={() => setActiveModal('remarks')} disabled={submitting}>
        {remarks.trim() ? 'Edit repair remarks' : 'Add repair remarks'}
      </Button>
      {remarks.trim() ? <Text style={[styles.summaryText, { color: colors.gray }]}>{remarks}</Text> : null}

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>After repair image (AF)</Text>
      <Button mode="outlined" icon="camera" onPress={() => { if (!workEntryDocEntry) { Toast.show({ type: 'info', text1: 'Start repair work first', text2: 'Create the work entry before adding the after image.' }); return; } setImagePhase('AF'); setActiveModal('images'); }} disabled={submitting}>Add after image</Button>
      <View style={styles.imageNameList}>{images.filter(image => image?.Phase === 'AF').map((image, index) => <TouchableOpacity key={`${image?.ImgPath || image?.name || index}`} onPress={() => showImage(image, 'After repair image')}><Text style={[styles.imageName, { color: colors.primary }]}>{getImageName(image, 'After repair image')}</Text></TouchableOpacity>)}</View>

      <Button
        mode="contained"
        buttonColor={COLORS.success || '#007A5A'}
        onPress={() => saveWork('C')}
        loading={submitting}
        disabled={submitting || !workEntryDocEntry || !remarks.trim() || !hasBeforeImage || !hasAfterImage}
        style={[styles.workActionButton, { marginTop: SPACING.md }]}
        contentStyle={styles.workActionContent}
      >
        Complete repair work
      </Button>

      <Modal visible={activeModal === 'detail'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title={detailDraft.LineId <= workDetails.length ? 'Edit work detail' : 'Add work detail'} />
            <Card.Content>
              <TextInput mode="outlined" label="Work type" value={detailDraft.WorkType || ''} onChangeText={value => setDetailDraft(previous => ({ ...previous, WorkType: value }))} style={styles.input} />
              <TextInput mode="outlined" label="Description" value={detailDraft.Description || ''} onChangeText={value => setDetailDraft(previous => ({ ...previous, Description: value }))} multiline style={styles.input} />
              <TextInput mode="outlined" label="Remarks" value={detailDraft.Remarks || ''} onChangeText={value => setDetailDraft(previous => ({ ...previous, Remarks: value }))} multiline style={styles.input} />
              <View style={styles.buttonRow}>
                <Button onPress={() => setActiveModal(null)}>Cancel</Button>
                <Button mode="contained" onPress={saveDetailDraft}>Save detail</Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>

      <Modal visible={activeModal === 'images'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title="Add repair image" />
            <Card.Content>
              <Text style={{ color: colors.gray, marginBottom: SPACING.md }}>Choose how to add an image.</Text>
              <Button mode="contained" icon="camera" onPress={() => captureImage(imagePhase)} disabled={submitting} style={styles.modalButton}>Capture {imagePhase === 'AF' ? 'after' : 'before'} image</Button>
              <Button mode="outlined" icon="image-multiple" onPress={() => pickImages(imagePhase)} disabled={submitting} style={styles.modalButton}>Choose {imagePhase === 'AF' ? 'after' : 'before'} image</Button>
              <Button onPress={() => setActiveModal(null)}>Cancel</Button>
            </Card.Content>
          </Card>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedImage)} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <TouchableOpacity style={styles.imagePreviewOverlay} activeOpacity={1} onPress={() => setSelectedImage(null)}>
          <View style={styles.imagePreviewCard}>
            <Text style={[styles.imagePreviewTitle, { color: colors.dark }]}>{selectedImage?.name || 'Repair image'}</Text>
            {selectedImage?.uri ? <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} resizeMode="contain" /> : <Text style={{ color: colors.gray }}>Image preview unavailable.</Text>}
            <Button onPress={() => setSelectedImage(null)}>Close</Button>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={activeModal === 'parts'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title="Add or request part" />
            <Card.Content>
              <RadioButton.Group onValueChange={value => setPartMode(value)} value={partMode}>
                <View style={styles.radioRow}>
                  <View style={styles.radioOption}><RadioButton value="configured" /><Text>Configured component</Text></View>
                  <View style={styles.radioOption}><RadioButton value="additional" /><Text>Additional item</Text></View>
                </View>
              </RadioButton.Group>
              {partMode === 'configured' ? <>
                <TouchableOpacity onPress={() => setShowComponentsModal(true)} disabled={partsLoading || submitting}>
                  <TextInput mode="outlined" label="Select configured component" value={componentDraft.ItemName ? `${componentDraft.ItemCode} - ${componentDraft.ItemName}` : ''} placeholder="Tap to select" editable={false} pointerEvents="none" right={<TextInput.Icon icon="chevron-down" />} style={styles.input} />
                </TouchableOpacity>
                <TextInput mode="outlined" label="Quantity" keyboardType="numeric" value={String(componentDraft.ReqQty)} onChangeText={value => setComponentDraft(previous => ({ ...previous, ReqQty: value }))} style={styles.input} />
                <TextInput mode="outlined" label="Remarks" value={componentDraft.Remarks} onChangeText={value => setComponentDraft(previous => ({ ...previous, Remarks: value }))} multiline style={styles.input} />
                <Button mode="contained" onPress={() => { addConfiguredComponent(); setActiveModal(null); }} disabled={partsLoading || submitting}>Add configured component</Button>
              </> : <>
                <TouchableOpacity onPress={() => setShowAdditionalPartsModal(true)} disabled={partsLoading || submitting}>
                  <TextInput mode="outlined" label="Select additional spare part" value={partDraft.ItemName ? `${partDraft.ItemCode} - ${partDraft.ItemName}` : ''} placeholder="Tap to select" editable={false} pointerEvents="none" right={<TextInput.Icon icon="chevron-down" />} style={styles.input} />
                </TouchableOpacity>
                <TextInput mode="outlined" label="Quantity" keyboardType="numeric" value={String(partDraft.ReqQty)} onChangeText={value => setPartDraft(previous => ({ ...previous, ReqQty: value }))} style={styles.input} />
                <TextInput mode="outlined" label="Remarks" value={partDraft.Remarks} onChangeText={value => setPartDraft(previous => ({ ...previous, Remarks: value }))} multiline style={styles.input} />
                <Button mode="contained" onPress={requestAdditionalPart} disabled={submitting}>Request additional part</Button>
              </>}
              <Button onPress={() => setActiveModal(null)}>Cancel</Button>
            </Card.Content>
          </Card>
        </View>
      </Modal>

      <ModalSelector
        visible={showComponentsModal}
        onClose={() => setShowComponentsModal(false)}
        onSelect={(value, item) => { const selectedPart = normalizePart(item || { ItemCode: value }); setComponentDraft(previous => ({ ...previous, ItemCode: selectedPart.ItemCode, ItemName: selectedPart.ItemName })); setShowComponentsModal(false); }}
        title="Select Configured Component"
        data={configuredComponents}
        loading={partsLoading}
        displayKey="ItemName"
        valueKey="ItemCode"
        renderItem={(item) => (
          <Text style={{ color: colors.dark, fontWeight: '600' }}>
            {item?.ItemCode ? `${item.ItemCode} - ` : ''}{item?.ItemName || item?.ItemCode || 'Component'}
          </Text>
        )}
        searchKeys={['ItemName', 'ItemCode']}
        searchPlaceholder="Search configured components..."
      />
      <ModalSelector
        visible={showAdditionalPartsModal}
        onClose={() => setShowAdditionalPartsModal(false)}
        onSelect={(value, item) => { const selectedPart = normalizePart(item || { ItemCode: value }); setPartDraft(previous => ({ ...previous, ItemCode: selectedPart.ItemCode, ItemName: selectedPart.ItemName })); setShowAdditionalPartsModal(false); }}
        title="Select Additional Spare Part"
        data={additionalParts}
        loading={partsLoading}
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode']}
        searchPlaceholder="Search additional parts..."
        renderItem={(item) => {
          const selectedPart = normalizePart(item);
          return (
            <View>
              <Text style={{ fontWeight: '700' }}>{selectedPart.ItemCode}</Text>
              <Text>{selectedPart.ItemName}</Text>
            </View>
          );
        }}
      />
      <ModalSelector
        visible={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        onSelect={(value, item) => {
          const selectedTool = { ...item, ToolCode: String(item?.ToolCode || item?.Code || value || '').trim(), ToolName: String(item?.ToolName || item?.Name || item?.Description || '').trim() };
          addToolDraft(selectedTool);
        }}
        title="Select Special Tool"
        data={availableTools}
        loading={partsLoading}
        displayKey="ToolName"
        valueKey="ToolCode"
        searchKeys={['ToolName', 'ToolCode', 'Code']}
        searchPlaceholder="Search tools..."
        renderItem={(item) => {
          const toolCode = String(item?.ToolCode || item?.Code || '').trim();
          const toolName = String(item?.ToolName || item?.Name || item?.Description || '').trim();
          return (
            <View>
              <Text style={{ fontWeight: '700', color: colors.dark }}>{toolCode || 'Tool'}</Text>
              <Text style={{ color: colors.gray }}>{toolName || 'Special tool'}</Text>
            </View>
          );
        }}
      />

      <Modal visible={activeModal === 'remarks'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title="Repair remarks" />
            <Card.Content>
              <TextInput mode="outlined" label="Remarks" value={remarks} onChangeText={setRemarks} multiline style={styles.input} />
              <View style={styles.buttonRow}>
                <Button onPress={() => setActiveModal(null)}>Cancel</Button>
                <Button mode="contained" onPress={() => setActiveModal(null)}>Save remarks</Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>

      <Modal visible={showReturnPartsModal} transparent animationType="slide" onRequestClose={() => setShowReturnPartsModal(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title={`Return ${returnPartsDraft?.part?.ItemName || returnPartsDraft?.part?.ItemCode || 'part'}`} />
            <Card.Content>
              <TextInput
                mode="outlined"
                label="Return quantity"
                keyboardType="numeric"
                value={returnPartsDraft?.ReturnQty || ''}
                onChangeText={value => setReturnPartsDraft(previous => ({ ...previous, ReturnQty: value.replace(/[^0-9]/g, '') }))}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Remarks"
                value={returnPartsDraft?.Remarks || ''}
                onChangeText={value => setReturnPartsDraft(previous => ({ ...previous, Remarks: value }))}
                multiline
                style={styles.input}
              />
              <View style={styles.buttonRow}>
                <Button onPress={() => setShowReturnPartsModal(false)} disabled={submitting}>Cancel</Button>
                <Button mode="contained" onPress={submitPartReturn} loading={submitting} disabled={submitting}>Submit return</Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.md },
  summary: { marginBottom: SPACING.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: SPACING.md, marginBottom: SPACING.sm },
  section: { marginBottom: SPACING.sm },
  input: { marginBottom: SPACING.sm, backgroundColor: 'transparent' },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  workActionButton: { flex: 1, marginHorizontal: 0 },
  workActionContent: { minHeight: 48, paddingHorizontal: 4 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  image: { width: 76, height: 76, borderRadius: 6 },
  imageNameList: { marginTop: SPACING.xs },
  imageName: { fontSize: 13, marginBottom: SPACING.xs },
  imagePreviewOverlay: { flex: 1, justifyContent: 'center', padding: SPACING.lg, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  imagePreviewCard: { maxHeight: '85%', padding: SPACING.md, backgroundColor: '#FFFFFF', borderRadius: 8 },
  imagePreviewTitle: { fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  imagePreview: { width: '100%', height: 360, marginBottom: SPACING.sm },
  toolDraftList: { marginTop: SPACING.sm },
  toolDraftCard: { borderWidth: 1, borderRadius: 8, padding: SPACING.sm, marginBottom: SPACING.sm },
  toolDraftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  toolTable: { minWidth: 460 },
  toolTableCell: { width: 124, paddingHorizontal: 8, fontSize: 12 },
  toolTableAction: { width: 112, paddingHorizontal: 4, alignItems: 'flex-start' },
  part: { marginTop: SPACING.xs },
  partsTableScroll: { marginTop: SPACING.sm },
  partsTable: { minWidth: 668 },
  partsTableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, minHeight: 52 },
  partsTableHeader: { backgroundColor: '#F3F4F6', minHeight: 42 },
  partsTableHeaderText: { fontWeight: '700' },
  partsTableCell: { width: 92, paddingHorizontal: 8, fontSize: 12 },
  partsTableAction: { width: 112, paddingHorizontal: 4, alignItems: 'flex-start' },
  emptyPartsText: { padding: SPACING.md },
  radioRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: SPACING.sm },
  radioOption: { flexDirection: 'row', alignItems: 'center', marginRight: SPACING.md },
  partCard: { marginTop: SPACING.sm },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: SPACING.lg, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  modalCard: { maxHeight: '90%' },
  modalButton: { marginBottom: SPACING.sm },
  summaryText: { marginTop: SPACING.sm },
});

export default RepairWorkScreen;
