import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Card, RadioButton, Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { masterService, repairService } from '../../../api/services';
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
  };
};

const RepairWorkScreen = ({ route }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const jobCardEntry = route.params?.jobCardEntry || route.params?.JobCardEntry || '';
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
  const [detailDraft, setDetailDraft] = useState({ LineId: 1, WorkType: 'Inspection', Description: '', Remarks: '' });
  const [componentDraft, setComponentDraft] = useState({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
  const [partDraft, setPartDraft] = useState({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });

  const getPartStatus = (part) => String(
    part?.Status || part?.PartStatus || part?.RequestStatus || part?.IssueStatus || '',
  ).trim().toUpperCase();

  const getPartStatusLabel = (part) => {
    const partStatus = getPartStatus(part);
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
      return createdEntry;
    } catch (error) {
      console.error('[RepairWork] CreateRepairWorkEntry failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Unable to open repair work', text2: error?.message || 'Please try again.' });
      return null;
    } finally {
      setEntryLoading(false);
    }
  }, [dbName, empId, jobCardEntry, userCode, workEntryDocEntry]);

  const loadRepairPartStatuses = useCallback(async () => {
    if (!workEntryDocEntry) return;
    const [approvedResult, issuedResult, pendingResult] = await Promise.allSettled([
      repairService.getApprovedRepairParts(dbName, userCode),
      repairService.getIssuedRepairParts(dbName, jobCardEntry, userCode),
      repairService.getPendingRepairPartRequests(dbName, userCode),
    ]);
    const rows = [approvedResult, issuedResult, pendingResult].flatMap(result => (
      result.status === 'fulfilled' ? extractRows(result.value) : []
    ));
    const matchingRows = rows.filter(row => {
      const entry = row?.WorkEntryEntry || row?.WorkEntryDocEntry || row?.DocEntry;
      return !entry || String(entry) === String(workEntryDocEntry);
    });
    const uniqueRows = matchingRows.filter((row, index, allRows) => (
      allRows.findIndex(candidate => String(candidate?.LineId ?? candidate?.ItemCode) === String(row?.LineId ?? row?.ItemCode)) === index
    ));
    setRepairPartStatuses(uniqueRows);
  }, [dbName, userCode, workEntryDocEntry]);

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
      const response = await repairService.getMyRepairWorkDashboard(dbName, userCode);
      const dashboardData = response?.Data ?? response?.data ?? response;
      const workEntries = Array.isArray(dashboardData?.WorkEntries) ? dashboardData.WorkEntries : [];
      const matchingEntry = workEntries.find(entry => (
        workEntryDocEntry
        && String(entry?.WorkEntryDocEntry ?? entry?.WorkEntryEntry ?? entry?.DocEntry ?? '') === String(workEntryDocEntry)
      ) && (!entry?.EmpID || !empId || Number(entry.EmpID) === empId))
        || workEntries.find(entry => (
        (
          jobCardEntry
          && String(entry?.JobCard ?? entry?.JobCardEntry ?? entry?.JobCardNo ?? entry?.JobCardDocEntry ?? '') === String(jobCardEntry)
        )
      ) && (!entry?.EmpID || !empId || Number(entry.EmpID) === empId));
      if (!matchingEntry) return;

      const existingEntryId = matchingEntry?.WorkEntryDocEntry || matchingEntry?.WorkEntryEntry || matchingEntry?.DocEntry;
      if (existingEntryId) setWorkEntryDocEntry(existingEntryId);
      setDisplayJobCard(String(matchingEntry?.JobCard || jobCardEntry || '-'));
      setDisplayWorkEntry(String(matchingEntry?.DocNum || existingEntryId || '-'));
      setDisplayJobCardStatus(String(matchingEntry?.JobCardStatus || matchingEntry?.Status || '').trim());
      setStatus(matchingEntry?.Status || 'W');
      setRemarks(matchingEntry?.Remarks || '');
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
      }
      console.log('[RepairWork] Existing work entry loaded:', JSON.stringify(matchingEntry));
    } catch (error) {
      console.warn('[RepairWork] Existing work dashboard unavailable:', error?.message || error);
    } finally {
      setEntryLoading(false);
    }
  }, [dbName, empId, jobCardEntry, userCode, workEntryDocEntry]);

  useEffect(() => { loadExistingWorkEntry(); }, [loadExistingWorkEntry]);

  const pickImages = async (phase = imagePhase) => {
    try {
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || []).map(image => ({ ...image, Phase: phase }))]);
        setActiveModal(null);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to select images', text2: error?.message || 'Please try again.' });
    }
  };

  const captureImage = async (phase = imagePhase) => {
    try {
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Toast.show({ type: 'error', text1: 'Camera permission required', text2: 'Allow camera access to capture an image.' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || []).map(image => ({ ...image, Phase: phase }))]);
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
    return images.map((image, index) => ({
      LineId: index,
      WorkEntryEntry: Number(entryDocEntry) || entryDocEntry,
      ImgType: image?.Phase === 'AF' ? 'After Repair' : 'Before Repair',
      ImgNo: index + 1,
      ImgPath: image?.fileName || image?.name || image?.uri || '',
      Remarks: image?.Phase === 'AF' ? 'Assembly after repair.' : 'Assembly before repair.',
    }));
  };

  const saveWork = async (nextStatus = status) => {
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
      setImages([]);
      Toast.show({ type: 'success', text1: nextStatus === 'C' ? 'Repair submitted for review' : nextStatus === 'P' ? 'Repair work paused' : 'Repair work saved' });
    } catch (error) {
      console.error('[RepairWork] Save repair work failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Unable to save repair work', text2: error?.message || 'Please try again.' });
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
      const nextParts = [...parts, requestedPart];
      const response = await repairService.updateRepairWorkEntry({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: userCode,
        Status: 'W',
        Remarks: remarks,
        WorkDetails: [],
        Images: [],
        Parts: nextParts,
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part request failed.');
      setParts(nextParts);
      setPartDraft({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
      setActiveModal(null);
      Toast.show({ type: 'success', text1: 'Part added', text2: 'Save the work entry to send the request.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to request part', text2: error?.message || 'Please try again.' });
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
      const response = await repairService.receiveRepairPart({
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        MechanicUserCode: userCode,
        Parts: [{ LineId: Number(lineId) || lineId }],
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
    const code = String(part?.ItemCode || part?.Item || part?.Code || '').trim();
    const existing = rows.find(row => row.code === code);
    if (existing) {
      return rows.map(row => row.code === code ? { ...row, ...part } : row);
    }
    return [...rows, { ...part, code }];
  }, []).filter(part => part.code);

  const getImageName = (image, fallback) => image?.ImgPath || image?.ImagePath || image?.fileName || image?.name || fallback;
  const showImage = (image, fallback) => setSelectedImage({
    uri: image?.uri || '',
    name: getImageName(image, fallback),
  });

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
            {['Part', 'Requested', 'Approved', 'Issued', 'Received', 'Status', 'Action'].map((label) => (
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
            return (
              <View key={`${part.code}-${part?.LineId ?? index}`} style={[styles.partsTableRow, { borderColor: colors.border || '#E0E0E0' }]}>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ItemName || part?.PartName || part.code}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ReqQty ?? part?.Qty ?? 0}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{part?.ApprovedQty ?? part?.AprQty ?? 0}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{issued}</Text>
                <Text style={[styles.partsTableCell, { color: colors.dark }]}>{received}</Text>
                <Text style={[styles.partsTableCell, { color: colors.gray }]}>{label}</Text>
                <View style={styles.partsTableAction}>
                  {canReceive ? <Button compact mode="outlined" onPress={() => receivePart(part)} disabled={submitting}>Receive</Button> : <Text style={{ color: colors.gray }}>-</Text>}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>After repair image (AF)</Text>
      <Button mode="outlined" icon="camera" onPress={() => { setImagePhase('AF'); setActiveModal('images'); }} disabled={submitting}>Add after image</Button>
      <View style={styles.imageNameList}>{images.filter(image => image?.Phase === 'AF').map((image, index) => <TouchableOpacity key={`${image?.ImgPath || image?.name || index}`} onPress={() => showImage(image, 'After repair image')}><Text style={[styles.imageName, { color: colors.primary }]}>{getImageName(image, 'After repair image')}</Text></TouchableOpacity>)}</View>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Repair remarks</Text>
      <Button mode="outlined" icon="note-edit" onPress={() => setActiveModal('remarks')} disabled={submitting}>
        {remarks.trim() ? 'Edit repair remarks' : 'Add repair remarks'}
      </Button>
      {remarks.trim() ? <Text style={[styles.summaryText, { color: colors.gray }]}>{remarks}</Text> : null}
      <View style={styles.buttonRow}>
        <Button mode="contained" onPress={() => saveWork('W')} loading={submitting} disabled={submitting} style={styles.workActionButton} contentStyle={styles.workActionContent}>
          {workEntryDocEntry ? 'Update Repair work entry' : 'Create Repair Work Entry'}
        </Button>
        <Button mode="contained" buttonColor={COLORS.success || '#007A5A'} onPress={() => saveWork('C')} loading={submitting} disabled={submitting || !workEntryDocEntry} style={styles.workActionButton} contentStyle={styles.workActionContent}>
          Complete repair work
        </Button>
      </View>

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
