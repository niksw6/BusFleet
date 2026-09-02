import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Card, RadioButton, Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { masterService, repairService, workEntryService } from '../../../api/services';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';

const isSuccess = (response) => (
  !Object.prototype.hasOwnProperty.call(response || {}, 'Success')
  && !Object.prototype.hasOwnProperty.call(response || {}, 'Status')
) || response?.Success === true || response?.Status === true;

const getWorkEntryDocEntry = (response) => {
  const data = response?.Data ?? response?.data ?? response;
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
  return { ...image, uri: image?.uri || '' };
};

const extractImageBase64 = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (typeof data === 'string') return data.replace(/^data:[^;]+;base64,/i, '');
  if (!data || typeof data !== 'object') return '';
  for (const key of ['Base64', 'ImageBase64', 'FileBase64', 'Content', 'ImageData', 'ImgData', 'Photo', 'Binary']) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      return data[key].replace(/^data:[^;]+;base64,/i, '');
    }
  }
  return '';
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
  const [entryLoading, setEntryLoading] = useState(!route.params?.workEntryDocEntry);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('W');
  const [pauseReason, setPauseReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [workDetails, setWorkDetails] = useState([]);
  const [images, setImages] = useState([]);
  const [parts, setParts] = useState([]);
  const [repairPartStatuses, setRepairPartStatuses] = useState([]);
  const [configuredComponents, setConfiguredComponents] = useState([]);
  const [additionalParts, setAdditionalParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [showComponentsModal, setShowComponentsModal] = useState(false);
  const [showAdditionalPartsModal, setShowAdditionalPartsModal] = useState(false);
  const [partMode, setPartMode] = useState('configured');
  const [activeModal, setActiveModal] = useState(null);
  const [detailDraft, setDetailDraft] = useState({ LineId: 0, WorkType: 'Inspection', Description: '', Remarks: '' });
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
      repairService.getIssuedRepairParts(dbName, workEntryDocEntry, userCode),
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
    { LineId: previous.length, WorkType: 'Repair', Description: '', Remarks: '' },
  ]));

  const addWorkDetail = () => {
    setDetailDraft({ LineId: workDetails.length, WorkType: 'Inspection', Description: '', Remarks: '' });
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
      setStatus(matchingEntry?.Status || 'W');
      setPauseReason(matchingEntry?.PauseRmk || '');
      setRemarks(matchingEntry?.Remarks || '');
      if (Array.isArray(matchingEntry?.WorkDetails)) setWorkDetails(matchingEntry.WorkDetails);
      if (Array.isArray(matchingEntry?.Parts)) setParts(matchingEntry.Parts.map(normalizePart));
      if (Array.isArray(matchingEntry?.Images)) {
        const imageRows = matchingEntry.Images.map(normalizeWorkImage).filter(image => image.uri || image?.ImgPath || image?.ImagePath);
        setImages(imageRows);
        imageRows.filter(image => !image.uri).forEach(async (image) => {
          try {
            const fileName = image?.ImgPath || image?.ImagePath;
            const response = await workEntryService.getWorkEntryImageBase64(fileName);
            const base64 = extractImageBase64(response);
            if (!base64) return;
            setImages(previous => previous.map(previousImage => (
              previousImage === image ? { ...previousImage, uri: `data:image/jpeg;base64,${base64}` } : previousImage
            )));
          } catch (error) {
            console.warn('[RepairWork] Unable to load image:', fileName, error?.message || error);
          }
        });
      }
      console.log('[RepairWork] Existing work entry loaded:', JSON.stringify(matchingEntry));
    } catch (error) {
      console.warn('[RepairWork] Existing work dashboard unavailable:', error?.message || error);
    } finally {
      setEntryLoading(false);
    }
  }, [dbName, empId, jobCardEntry, userCode, workEntryDocEntry]);

  useEffect(() => { loadExistingWorkEntry(); }, [loadExistingWorkEntry]);

  const pickImages = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || [])]);
        setActiveModal(null);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to select images', text2: error?.message || 'Please try again.' });
    }
  };

  const captureImage = async () => {
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
      });
      if (!result.canceled) {
        setImages(previous => [...previous, ...(result.assets || [])]);
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

  const uploadRepairImages = async () => {
    if (!images.length) return [];
    const response = await workEntryService.uploadImages(images);
    return (response?.FileNames || []).map((fileName, index) => ({
      LineId: index,
      ImgType: status === 'C' ? 'COMPLETED' : 'DAMAGE',
      ImgNo: index + 1,
      ImgPath: fileName,
      Remarks: status === 'C' ? 'Completed assembly' : 'Damaged component',
    }));
  };

  const saveWork = async (nextStatus = status) => {
    try {
      setSubmitting(true);
      const entryDocEntry = workEntryDocEntry || await createWorkEntry();
      if (!entryDocEntry) return;
      const uploadedImages = await uploadRepairImages();
      const payload = {
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(entryDocEntry) || entryDocEntry,
        UserCode: userCode,
        Status: nextStatus,
        PauseRmk: nextStatus === 'P' ? pauseReason : '',
        Remarks: remarks,
        WorkDetails: workDetails.filter(detail => detail.Description.trim()).map((detail, index) => ({ ...detail, LineId: index })),
        Images: uploadedImages,
        Parts: parts,
      };
      const response = nextStatus === 'C'
        ? await repairService.completeRepairWorkEntry(payload)
        : await repairService.updateRepairWorkEntry(payload);
      if (!isSuccess(response)) throw new Error(response?.Message || 'Repair work update failed.');
      if (uploadedImages.length > 0) {
        await Promise.all(uploadedImages.map(image => repairService.addRepairWorkImage({
          CompanyDB: dbName,
          WorkEntryEntry: Number(entryDocEntry) || entryDocEntry,
          ImgType: image.ImgType,
          ImgNo: image.ImgNo,
          ImgPath: image.ImgPath,
          Remarks: image.Remarks,
        })));
      }
      setStatus(nextStatus);
      setImages([]);
      Toast.show({ type: 'success', text1: nextStatus === 'C' ? 'Repair submitted for review' : nextStatus === 'P' ? 'Repair work paused' : 'Repair work saved' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to save repair work', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const togglePause = async () => {
    if (status !== 'P' && !pauseReason.trim()) {
      Toast.show({ type: 'error', text1: 'Enter a pause reason first' });
      return;
    }
    await saveWork(status === 'P' ? 'W' : 'P');
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
      const response = await repairService.requestRepairAdditionalPart({
        CompanyDB: dbName,
        WorkEntryEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        ItemCode: itemCode,
        ItemName: itemName,
        ReqQty: Number(partDraft.ReqQty) || 1,
        Remarks: partDraft.Remarks.trim(),
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part request failed.');
      setPartDraft({ ItemCode: '', ItemName: '', ReqQty: '1', Remarks: '' });
      await loadRepairPartStatuses();
      setActiveModal(null);
      Toast.show({ type: 'success', text1: 'Additional part requested' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to request part', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const receivePart = async (part) => {
    const lineId = part?.LineId ?? part?.LineNum ?? part?.LineID;
    const quantity = Number(part?.IssuedQty || part?.IssQty || part?.ApprovedQty || part?.ReqQty || 1);
    try {
      setSubmitting(true);
      const response = await repairService.receiveRepairPart({
        CompanyDB: dbName,
        WorkEntryEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        LineId: lineId,
        ReceivedQty: quantity,
        UserCode: userCode,
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Repair Work Entry</Text>
      <Card style={styles.summary}>
        <Card.Content>
          <Text style={{ color: colors.dark }}>Job card: {jobCardEntry || '-'}</Text>
          <Text style={{ color: colors.dark }}>Assembly: {route.params?.assemblyName || 'Assembly'}</Text>
          <Text style={{ color: colors.gray }}>Work entry: {workEntryDocEntry || 'Opening...'}</Text>
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

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Images</Text>
      <Button mode="outlined" icon="camera" onPress={() => setActiveModal('images')} disabled={submitting}>Add image</Button>
      <View style={styles.imageRow}>{images.filter(image => image?.uri).map((image, index) => <Image key={`${image.uri}-${index}`} source={{ uri: image.uri }} style={styles.image} />)}</View>

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts</Text>
      <Button mode="outlined" icon="playlist-plus" onPress={() => setActiveModal('parts')} disabled={partsLoading || submitting}>Add or request part</Button>
      {parts.map((part, index) => <Text key={`${part.ItemCode}-${index}`} style={[styles.part, { color: colors.dark }]}>{part.ItemCode} - {part.ItemName} x {part.ReqQty}</Text>)}

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Part status</Text>
      {repairPartStatuses.length === 0
        ? <Text style={{ color: colors.gray }}>No requested parts yet.</Text>
        : repairPartStatuses.map((part, index) => {
          const label = getPartStatusLabel(part);
          const canReceive = label === 'Issued';
          return <Card key={`${part?.ItemCode || 'part'}-${part?.LineId ?? index}`} style={styles.partCard}>
            <Card.Content>
              <Text style={{ color: colors.dark }}>{part?.ItemCode || '-'} - {part?.ItemName || part?.Name || '-'}</Text>
              <Text style={{ color: colors.gray }}>Quantity: {part?.ReqQty || part?.Qty || 1} | {label}</Text>
              {canReceive && <Button mode="outlined" onPress={() => receivePart(part)} disabled={submitting}>Receive item</Button>}
            </Card.Content>
          </Card>;
        })}

      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Repair remarks</Text>
      <Button mode="outlined" icon="note-edit" onPress={() => setActiveModal('remarks')} disabled={submitting}>
        {remarks.trim() ? 'Edit repair remarks' : 'Add repair remarks'}
      </Button>
      {remarks.trim() ? <Text style={[styles.summaryText, { color: colors.gray }]}>{remarks}</Text> : null}
      <View style={styles.buttonRow}>
        <Button mode="outlined" onPress={() => status === 'P' ? togglePause() : setActiveModal('pause')} loading={submitting} disabled={submitting}>{status === 'P' ? 'Resume work' : 'Pause work'}</Button>
        <Button mode="contained" onPress={() => saveWork('W')} loading={submitting} disabled={submitting}>
          {workEntryDocEntry ? 'Update Repair work entry' : 'Create Repair Work Entry'}
        </Button>
      </View>

      <Modal visible={activeModal === 'detail'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title={detailDraft.LineId < workDetails.length ? 'Edit work detail' : 'Add work detail'} />
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
              <Button mode="contained" icon="camera" onPress={captureImage} disabled={submitting} style={styles.modalButton}>Capture image</Button>
              <Button mode="outlined" icon="image-multiple" onPress={pickImages} disabled={submitting} style={styles.modalButton}>Choose from gallery</Button>
              <Button onPress={() => setActiveModal(null)}>Cancel</Button>
            </Card.Content>
          </Card>
        </View>
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

      <Modal visible={activeModal === 'pause'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Card.Title title="Pause repair work" />
            <Card.Content>
              <TextInput mode="outlined" label="Pause reason" value={pauseReason} onChangeText={setPauseReason} multiline style={styles.input} />
              <View style={styles.buttonRow}>
                <Button onPress={() => setActiveModal(null)}>Cancel</Button>
                <Button mode="contained" onPress={() => { setActiveModal(null); togglePause(); }}>Pause work</Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>

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
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  image: { width: 76, height: 76, borderRadius: 6 },
  part: { marginTop: SPACING.xs },
  radioRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: SPACING.sm },
  radioOption: { flexDirection: 'row', alignItems: 'center', marginRight: SPACING.md },
  partCard: { marginTop: SPACING.sm },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: SPACING.lg, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  modalCard: { maxHeight: '90%' },
  modalButton: { marginBottom: SPACING.sm },
  summaryText: { marginTop: SPACING.sm },
});

export default RepairWorkScreen;
