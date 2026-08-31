import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { repairService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';

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

const getUserCodes = (user) => [...new Set([
  user?.User,
  user?.user,
  user?.Code,
  user?.code,
  user?.UserCode,
  user?.EmpCode,
].map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];

const RepairJobCardAssignmentScreen = ({ route, navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const jobCardEntry = String(route.params?.jobCardEntry || route.params?.JobCardEntry || route.params?.docEntry || '').trim();
  const [jobCard, setJobCard] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  const loadJobCard = useCallback(async () => {
    if (!jobCardEntry) {
      setLoading(false);
      return;
    }
    try {
      const response = await repairService.getRepairJobCard(dbName, jobCardEntry);
      setJobCard(getRows(response)[0] || null);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load repair job card', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, jobCardEntry]);

  useEffect(() => { loadJobCard(); }, [loadJobCard]);

  const respond = async (responseStatus) => {
    if (responseStatus === 'R' && !remarks.trim()) {
      Toast.show({ type: 'error', text1: 'Remarks required', text2: 'Enter a reason before rejecting the assignment.' });
      return;
    }
    const assignedMechanic = (Array.isArray(jobCard?.Mechanics) ? jobCard.Mechanics : []).find((mechanic) => {
      const mechanicCodes = [mechanic?.UserCode, mechanic?.EmpCode, mechanic?.Code]
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      return mechanicCodes.some(code => getUserCodes(user).includes(code));
    });
    const empId = String(
      assignedMechanic?.EmpID
      || user?.EmpID
      || user?.EmployeeID
      || user?.UserID
      || user?.id
      || '',
    ).trim();
    if (!empId) {
      Toast.show({ type: 'error', text1: 'Mechanic details unavailable', text2: 'Please sign in again and retry.' });
      return;
    }
    try {
      setResponding(true);
      const response = await repairService.respondToRepairJobCardAssignment({
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        EmpID: empId,
        Response: responseStatus,
        Remarks: remarks.trim(),
      });
      if (!(response?.Success === true || response?.Status === true || response?.success === true)) {
        throw new Error(response?.Message || 'The assignment response was not accepted.');
      }
      Toast.show({ type: 'success', text1: responseStatus === 'A' ? 'Repair assignment accepted' : 'Repair assignment rejected' });
      if (responseStatus === 'A') {
        navigation.replace('RepairWork', {
          jobCardEntry,
          dbName,
          incidentEntry: getValue(jobCard, ['IncidentEntry', 'IncidentDocEntry']),
          storePersonID: getValue(jobCard, ['StorePersonID', 'StorePerson', 'StoreCode']),
          assemblyCode: getValue(jobCard, ['AssemblyCode', 'Assembly', 'AssemblyNo', 'RepairAssemblyCode']),
          assemblyName: getValue(jobCard, ['AssemblyName', 'AssemblyDescription', 'Assembly']) || 'Assembly',
        });
        return;
      }
      navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to respond to assignment', text2: error?.message || 'Please try again.' });
    } finally {
      setResponding(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Repair Job Assignment</Text>
      <View style={[styles.details, { backgroundColor: colors.card || colors.white }]}>
        <Text style={[styles.detail, { color: colors.dark }]}>Job card: {jobCardEntry}</Text>
        <Text style={[styles.detail, { color: colors.dark }]}>Assembly: {getValue(jobCard, ['AssemblyName', 'Assembly']) || '-'}</Text>
        <Text style={[styles.detail, { color: colors.dark }]}>Supervisor remarks: {getValue(jobCard, ['Remarks', 'Description']) || '-'}</Text>
        <Text style={[styles.detail, { color: colors.dark }]}>Status: {getValue(jobCard, ['Status', 'AssignmentStatus']) || 'Pending'}</Text>
      </View>
      <TextInput mode="outlined" label="Response remarks" value={remarks} onChangeText={setRemarks} multiline numberOfLines={4} style={styles.input} />
      <View style={styles.actions}>
        <Button mode="outlined" onPress={() => respond('R')} loading={responding} disabled={responding} textColor={colors.danger || COLORS.danger}>Reject</Button>
        <Button mode="contained" onPress={() => respond('A')} loading={responding} disabled={responding}>Accept</Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.lg },
  details: { padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.lg },
  detail: { fontSize: 15, marginBottom: SPACING.sm },
  input: { marginBottom: SPACING.lg, backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
});

export default RepairJobCardAssignmentScreen;