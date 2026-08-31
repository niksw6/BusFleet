import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { repairService, workEntryService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';
import ModalSelector from '../../../shared/components/ModalSelector';
import { getUserDepot } from '../../../utils/roleAccess';

const getRows = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  return data && typeof data === 'object' ? [data] : [];
};

const getValue = (item, keys) => {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim()) return item[key];
  }
  return '';
};

const getDocEntry = (response) => {
  const entryKeys = ['JobCardEntry', 'JobCardDocEntry', 'JobCardID', 'JobCardId', 'JobCardNo', 'DocEntry', 'DocNum'];
  const direct = getValue(response, entryKeys);
  if (direct) return direct;

  const data = response?.Data ?? response?.data;
  if (typeof data === 'string' || typeof data === 'number') return data;
  const row = getRows(response)[0];
  return getValue(row, entryKeys);
};

const RepairIncidentReviewScreen = ({ route, navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const docEntry = String(route.params?.docEntry || route.params?.DocEntry || '').trim();
  const userDepot = getUserDepot(user) || '';
  const [incident, setIncident] = useState(null);
  const [jobCardEntry, setJobCardEntry] = useState('');
  const [mechanics, setMechanics] = useState([]);
  const [selectedMechanics, setSelectedMechanics] = useState([]);
  const [images, setImages] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [jobCardRemarks, setJobCardRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [creatingJobCard, setCreatingJobCard] = useState(false);
  const [updatingJobCard, setUpdatingJobCard] = useState(false);
  const [mechanicModalVisible, setMechanicModalVisible] = useState(false);

  const loadIncident = useCallback(async () => {
    if (!docEntry) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await repairService.getRepairIncident(dbName, docEntry);
      const loadedIncident = getRows(response)[0] || null;
      setIncident(loadedIncident);
      setJobCardEntry(String(getValue(loadedIncident, ['JobCardEntry', 'JobCardDocEntry', 'JobCardNo']) || '').trim());
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load repair incident', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, docEntry]);

  useEffect(() => { loadIncident(); }, [loadIncident]);

  const handleResponse = async (decision) => {
    if (decision === 'R' && !remarks.trim()) {
      Toast.show({ type: 'error', text1: 'Remarks required', text2: 'Enter a reason before rejecting the incident.' });
      return;
    }

    const supervisor = String(
      getValue(incident, ['Supervisor', 'SupervisorID', 'EmpID'])
      || user?.EmpID
      || user?.EmployeeID
      || user?.UserID
      || user?.id
      || '',
    ).trim();
    const supervisorName = String(
      getValue(incident, ['SupName', 'SupervisorName'])
      || user?.UserCode
      || user?.User
      || user?.user
      || user?.Code
      || '',
    ).trim();

    if (!supervisor || !supervisorName) {
      Toast.show({ type: 'error', text1: 'Supervisor details unavailable', text2: 'Please sign in again and retry.' });
      return;
    }

    try {
      setResponding(true);
      const response = await repairService.respondToRepairIncident({
        CompanyDB: dbName,
        DocEntry: Number(docEntry) || docEntry,
        Supervisor: supervisor,
        SupervisorName: supervisorName,
        Decision: decision,
        Remarks: remarks.trim(),
      });
      if (!(response?.Success === true || response?.Status === true || response?.success === true)) {
        throw new Error(response?.Message || 'The incident response was not accepted.');
      }
      Toast.show({ type: 'success', text1: decision === 'A' ? 'Repair incident accepted' : 'Repair incident rejected' });
      setIncident(current => ({ ...(current || {}), Status: decision }));
      if (decision === 'R') navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to update incident', text2: error?.message || 'Please try again.' });
    } finally {
      setResponding(false);
    }
  };

  const isAccepted = ['A', 'ACCEPTED', 'APPROVED'].includes(String(getValue(incident, ['Status', 'Decision', 'ApprovalStatus'])).trim().toUpperCase());

  const loadMechanics = async () => {
    const depot = String(getValue(incident, ['Depot', 'DepotCode']) || userDepot).trim();
    if (!depot) {
      Toast.show({ type: 'error', text1: 'Depot unavailable', text2: 'The incident has no depot for mechanic lookup.' });
      return;
    }
    try {
      const response = await repairService.getRepairMechanics(dbName, depot);
      const rows = getRows(response);
      setMechanics(rows);
      setMechanicModalVisible(true);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load mechanics', text2: error?.message || 'Please try again.' });
    }
  };

  const createJobCard = async () => {
    if (!isAccepted) return;
    try {
      setCreatingJobCard(true);
      const response = await repairService.createRepairJobCard({
        CompanyDB: dbName,
        IncidentEntry: Number(docEntry) || docEntry,
        Remarks: jobCardRemarks.trim(),
      });
      const entry = getDocEntry(response);
      if (!(response?.Success === true || response?.Status === true || response?.success === true) || !entry) {
        throw new Error(response?.Message || 'Job card could not be created.');
      }
      setJobCardEntry(String(entry));
      Toast.show({ type: 'success', text1: 'Repair job card created' });
      await loadMechanics();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to create job card', text2: error?.message || 'Please try again.' });
    } finally {
      setCreatingJobCard(false);
    }
  };

  const updateJobCard = async () => {
    if (!jobCardEntry || selectedMechanics.length === 0) {
      Toast.show({ type: 'error', text1: 'Mechanic required', text2: 'Select at least one mechanic.' });
      return;
    }
    try {
      setUpdatingJobCard(true);
      let uploadedImages = [];
      if (images.length > 0) {
        const uploadResponse = await workEntryService.uploadImages(images);
        uploadedImages = (uploadResponse?.FileNames || []).map((fileName, index) => ({
          ImgType: 'Supervisor', ImgNo: index + 1, ImgPath: fileName, Remarks: 'Assembly condition before repair.',
        }));
      }
      const updatePayload = {
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        Remarks: jobCardRemarks.trim(),
        Mechanics: selectedMechanics.map(mechanic => ({ EmpID: mechanic?.EmpID || mechanic?.EmployeeID || mechanic?.ID || mechanic?.Code })),
        Images: uploadedImages,
      };
      console.log('[RepairIncidentReview] UpdateRepairJobCard API:', 'UpdateRepairJobCard');
      console.log('[RepairIncidentReview] UpdateRepairJobCard payload:', JSON.stringify(updatePayload));
      const response = await repairService.updateRepairJobCard(updatePayload);
      if (!(response?.Success === true || response?.Status === true || response?.success === true)) {
        throw new Error(response?.Message || 'Repair job card update failed.');
      }
      Toast.show({ type: 'success', text1: 'Mechanic assigned and images updated' });
      navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to update job card', text2: error?.message || 'Please try again.' });
    } finally {
      setUpdatingJobCard(false);
    }
  };

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
      if (!result.canceled) setImages(result.assets || []);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to select images', text2: error?.message || 'Please try again.' });
    }
  };

  const captureImage = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Toast.show({ type: 'error', text1: 'Camera permission required', text2: 'Allow camera access to capture an assembly image.' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) {
        setImages(current => [...current, result.assets[0]]);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to capture image', text2: error?.message || 'Please try again.' });
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Repair Incident Review</Text>
      {!incident ? (
        <Text style={[styles.empty, { color: colors.gray }]}>Repair incident details are unavailable.</Text>
      ) : (
        <View style={[styles.details, { backgroundColor: colors.card || colors.white }]}>
          <Text style={[styles.detail, { color: colors.dark }]}>Incident: A-{getValue(incident, ['DocEntry', 'IncidentEntry']) || docEntry}</Text>
          <Text style={[styles.detail, { color: colors.dark }]}>Assembly: {getValue(incident, ['AssemblyName', 'Assembly']) || '-'}</Text>
          <Text style={[styles.detail, { color: colors.dark }]}>Assembly code: {getValue(incident, ['Assembly', 'AssemblyCode']) || '-'}</Text>
          <Text style={[styles.detail, { color: colors.dark }]}>Store person: {getValue(incident, ['StorePerson', 'StorePersonID']) || '-'}</Text>
          <Text style={[styles.detail, { color: colors.dark }]}>Status: {getValue(incident, ['Status', 'Decision']) || 'Pending'}</Text>
          <Text style={[styles.detail, { color: colors.dark }]}>Remarks: {getValue(incident, ['Remarks', 'Description', 'IncidentDescription']) || '-'}</Text>
        </View>
      )}
      <TextInput
        mode="outlined"
        label="Response remarks"
        value={remarks}
        onChangeText={setRemarks}
        multiline
        numberOfLines={4}
        style={styles.input}
      />
      {isAccepted && !jobCardEntry && (
        <View style={[styles.workflowSection, { borderColor: colors.border || COLORS.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Repair job card</Text>
          <TextInput mode="outlined" label="Job card remarks" value={jobCardRemarks} onChangeText={setJobCardRemarks} multiline style={styles.input} />
          <Button mode="contained" onPress={createJobCard} loading={creatingJobCard} disabled={creatingJobCard}>Create Job Card</Button>
        </View>
      )}
      {!!jobCardEntry && (
        <View style={[styles.workflowSection, { borderColor: colors.border || COLORS.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Job Card #{jobCardEntry}</Text>
          <ModalSelector
            visible={mechanicModalVisible}
            onClose={() => setMechanicModalVisible(false)}
            onSelect={(value, item) => { setSelectedMechanics(current => [...current, item || value]); setMechanicModalVisible(false); }}
            title="Select Mechanic"
            data={mechanics}
            displayKey="EmpName"
            valueKey="EmpID"
            searchKeys={['EmployeeName', 'EmpName', 'EmpCode', 'EmpID', 'Code']}
          />
          <TouchableOpacity activeOpacity={0.8} onPress={loadMechanics} style={styles.mechanicSelector}>
            <TextInput mode="outlined" editable={false} pointerEvents="none" value={selectedMechanics.map(item => item?.EmpName || item?.EmployeeName || item?.Name || item?.EmpID).join(', ')} placeholder="Select mechanic" right={<TextInput.Icon icon="chevron-down" />} style={styles.input} />
          </TouchableOpacity>
          <View style={styles.imageActions}>
            <Button mode="outlined" onPress={pickImages} icon="image-multiple" style={styles.imageButton}>
              {images.length ? `${images.length} image(s) selected` : 'Add assembly images'}
            </Button>
            <Button mode="outlined" onPress={captureImage} icon="camera" style={styles.captureButton}>
              Capture
            </Button>
          </View>
          <Button mode="contained" onPress={updateJobCard} loading={updatingJobCard} disabled={updatingJobCard} style={styles.button}>Assign Mechanic and Update</Button>
        </View>
      )}
      {!isAccepted && (
        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => handleResponse('R')} loading={responding} disabled={responding || !incident} textColor={colors.danger || COLORS.danger}>
            Reject
          </Button>
          <Button mode="contained" onPress={() => handleResponse('A')} loading={responding} disabled={responding || !incident}>
            Accept
          </Button>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.lg },
  details: { padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.lg },
  detail: { fontSize: 15, marginBottom: SPACING.sm },
  empty: { marginBottom: SPACING.lg },
  input: { marginBottom: SPACING.lg, backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  mechanicSelector: { marginBottom: SPACING.md },
  imageActions: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, marginBottom: SPACING.sm },
  imageButton: { flex: 1, marginRight: SPACING.sm },
  captureButton: { flex: 0 },
  workflowSection: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: SPACING.md },
});

export default RepairIncidentReviewScreen;