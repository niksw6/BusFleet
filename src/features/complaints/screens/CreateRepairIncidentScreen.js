import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import { repairService, masterService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';

const extractRows = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).find(Array.isArray) || [];
};

const isApiSuccess = (response) => response?.Success === true || response?.Status === true || response?.success === true;

const CreateRepairIncidentScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || 'MUTSPL_TEST';
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const storePerson = String(user?.User || user?.user || user?.UserCode || user?.Code || user?.code || '').trim();

  const [assemblies, setAssemblies] = useState([]);
  const [depots, setDepots] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [assembly, setAssembly] = useState(null);
  const [selectedDepot, setSelectedDepot] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assemblyModalVisible, setAssemblyModalVisible] = useState(false);
  const [depotModalVisible, setDepotModalVisible] = useState(false);
  const [supervisorModalVisible, setSupervisorModalVisible] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [assemblyResponse, depotResponse] = await Promise.all([
          repairService.getRepairAssemblies(dbName),
          masterService.getDepots(dbName),
        ]);
        setAssemblies(extractRows(assemblyResponse));
        setDepots(extractRows(depotResponse));
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Unable to load repair data', text2: error?.message || 'Please try again.' });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [dbName]);

  const selectedDepotCode = String(
    selectedDepot?.DepotCode || selectedDepot?.Code || selectedDepot?.Depot || selectedDepot?.Value || '',
  ).trim();

  useEffect(() => {
    setSupervisor(null);
    setSupervisors([]);
    if (!selectedDepotCode) return undefined;

    let cancelled = false;
    const loadSupervisors = async () => {
      try {
        const response = await masterService.getSupervisorsByDepot(dbName, selectedDepotCode);
        if (!cancelled) setSupervisors(extractRows(response));
      } catch (error) {
        if (!cancelled) {
          Toast.show({ type: 'error', text1: 'Unable to load supervisors', text2: error?.message || 'Please try again.' });
        }
      }
    };
    loadSupervisors();
    return () => { cancelled = true; };
  }, [dbName, selectedDepotCode]);

  const handleSubmit = async () => {
    if (!assembly || !supervisor || !remarks.trim()) {
      Toast.show({ type: 'error', text1: 'Incomplete form', text2: 'Select an assembly, supervisor, and enter remarks.' });
      return;
    }

    try {
      setSubmitting(true);
      const response = await repairService.createRepairIncident({
        CompanyDB: dbName,
        StorePerson: storePerson,
        Assembly: String(assembly?.AssemblyCode || assembly?.Assembly || assembly?.Code || assembly?.Value || '').trim(),
        AssemblyName: String(assembly?.AssemblyName || assembly?.Name || assembly?.Description || '').trim(),
        Supervisor: String(supervisor?.EmpID || supervisor?.Supervisor || supervisor?.SupervisorCode || supervisor?.Code || '').trim(),
        SupName: String(supervisor?.SupName || supervisor?.SupervisorName || supervisor?.Name || supervisor?.UserName || '').trim(),
        Remarks: remarks.trim(),
      });
      if (!isApiSuccess(response)) throw new Error(response?.Message || 'Repair incident could not be created.');
      Toast.show({ type: 'success', text1: 'Repair incident created' });
      navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Creation failed', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Create Repair Incident</Text>

      <Text style={[styles.label, { color: colors.dark }]}>Incident:</Text>
      <TextInput mode="outlined" value="Assembly" editable={false} style={styles.input} outlineColor={colors.border || COLORS.border} />

      <Text style={[styles.label, { color: colors.dark }]}>Assembly:</Text>
      <ModalSelector
        visible={assemblyModalVisible}
        onClose={() => setAssemblyModalVisible(false)}
        onSelect={(value, item) => { setAssembly(item || value); setAssemblyModalVisible(false); }}
        title="Select Assembly"
        data={assemblies}
        loading={false}
        displayKey="AssemblyName"
        valueKey="AssemblyCode"
        searchKeys={['AssemblyName', 'AssemblyCode']}
        searchPlaceholder="Search assemblies..."
      />
      <TouchableOpacity activeOpacity={0.8} onPress={() => setAssemblyModalVisible(true)}>
        <TextInput
          mode="outlined"
          value={assembly?.AssemblyName || assembly?.Name || assembly?.Description || ''}
          placeholder="Select assembly"
          editable={false}
          pointerEvents="none"
          style={styles.input}
          outlineColor={colors.border || COLORS.border}
          right={<TextInput.Icon icon="chevron-down" />}
        />
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.dark }]}>Depot:</Text>
      <ModalSelector
        visible={depotModalVisible}
        onClose={() => setDepotModalVisible(false)}
        onSelect={(value, item) => { setSelectedDepot(item || value); setDepotModalVisible(false); }}
        title="Select Depot"
        data={depots}
        loading={false}
        displayKey="DepotName"
        valueKey="DepotCode"
        searchKeys={['DepotName', 'DepotCode']}
        searchPlaceholder="Search depots..."
      />
      <TouchableOpacity activeOpacity={0.8} onPress={() => setDepotModalVisible(true)}>
        <TextInput
          mode="outlined"
          value={selectedDepot?.DepotName || selectedDepot?.Name || selectedDepot?.DepotCode || ''}
          placeholder="Select depot"
          editable={false}
          pointerEvents="none"
          style={styles.input}
          outlineColor={colors.border || COLORS.border}
          right={<TextInput.Icon icon="chevron-down" />}
        />
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.dark }]}>Supervisor:</Text>
      <ModalSelector
        visible={supervisorModalVisible}
        onClose={() => setSupervisorModalVisible(false)}
        onSelect={(value, item) => { setSupervisor(item || value); setSupervisorModalVisible(false); }}
        title="Select Supervisor"
        data={supervisors}
        loading={false}
        displayKey="SupervisorName"
        valueKey="EmpID"
        searchKeys={['SupervisorName', 'UserCode', 'EmpID']}
        searchPlaceholder="Search supervisors..."
      />
      <TouchableOpacity activeOpacity={0.8} onPress={() => setSupervisorModalVisible(true)}>
        <TextInput
          mode="outlined"
          value={supervisor?.SupervisorName || supervisor?.SupName || supervisor?.Name || supervisor?.UserName || ''}
          placeholder={selectedDepotCode ? `Select supervisor for ${selectedDepotCode}` : 'Select depot first'}
          editable={false}
          pointerEvents="none"
          style={styles.input}
          outlineColor={colors.border || COLORS.border}
          right={<TextInput.Icon icon="chevron-down" />}
        />
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.dark }]}>Remarks:</Text>
      <TextInput
        mode="outlined"
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Enter repair remarks"
        multiline
        numberOfLines={4}
        style={styles.input}
        outlineColor={colors.border || COLORS.border}
      />
      <Button mode="contained" onPress={handleSubmit} loading={submitting} disabled={submitting} style={styles.button}>
        Create Repair Incident
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.lg },
  label: { fontSize: 15, fontWeight: '600', marginTop: SPACING.md, marginBottom: SPACING.xs },
  input: { backgroundColor: 'transparent', marginBottom: SPACING.sm },
  button: { marginTop: SPACING.lg },
});

export default CreateRepairIncidentScreen;
