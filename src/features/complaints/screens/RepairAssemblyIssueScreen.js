import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
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

const isSuccess = (response) => (
  !Object.prototype.hasOwnProperty.call(response || {}, 'Success')
  && !Object.prototype.hasOwnProperty.call(response || {}, 'Status')
) || response?.Success === true || response?.Status === true;

const RepairAssemblyIssueScreen = ({ route, navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const storePersonID = user?.User || user?.user || user?.UserCode || user?.Code || user?.code || '';
  const notificationJobCardEntry = route.params?.jobCardEntry || route.params?.JobCardEntry || '';
  const [assemblies, setAssemblies] = useState([]);
  const [selectedAssembly, setSelectedAssembly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const loadAssemblies = useCallback(async () => {
    try {
      const response = await repairService.getRepairAssemblyForIssue(dbName, 0, storePersonID);
      const rows = getRows(response);
      setAssemblies(rows);
      const requested = rows.find(row => String(row?.JobCardEntry || row?.DocEntry || row?.JobCardNo || '') === String(notificationJobCardEntry));
      setSelectedAssembly(requested || (rows.length === 1 ? rows[0] : null));
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load assemblies', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, notificationJobCardEntry, storePersonID]);

  useEffect(() => { loadAssemblies(); }, [loadAssemblies]);

  const issueAssembly = async () => {
    const jobCardEntry = selectedAssembly?.JobCardEntry || selectedAssembly?.JobCardDocEntry || selectedAssembly?.DocEntry || notificationJobCardEntry;
    if (!jobCardEntry) {
      Toast.show({ type: 'error', text1: 'Job card unavailable', text2: 'Select an assembly to issue.' });
      return;
    }
    try {
      setIssuing(true);
      const response = await repairService.issueRepairAssembly({
        CompanyDB: dbName,
        JobCardEntry: Number(jobCardEntry) || jobCardEntry,
        StorePersonID: storePersonID,
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Assembly issue failed.');
      Toast.show({ type: 'success', text1: 'Assembly issued', text2: 'Mechanic has been notified.' });
      navigation.goBack();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to issue assembly', text2: error?.message || 'Please try again.' });
    } finally {
      setIssuing(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Issue Repair Assembly</Text>
      {assemblies.length === 0 ? (
        <Text style={{ color: colors.gray }}>No repair assemblies are waiting for issue.</Text>
      ) : assemblies.map((assembly, index) => {
        const active = selectedAssembly === assembly;
        return (
          <Button
            key={`${assembly?.DocEntry || assembly?.JobCardEntry || index}`}
            mode={active ? 'contained' : 'outlined'}
            onPress={() => setSelectedAssembly(assembly)}
            style={styles.assemblyButton}
          >
            {assembly?.AssemblyName || assembly?.Assembly || 'Assembly'}
            {' - Job Card '}
            {assembly?.JobCardEntry || assembly?.JobCardDocEntry || assembly?.DocEntry || '-'}
          </Button>
        );
      })}
      <Button mode="contained" onPress={issueAssembly} loading={issuing} disabled={issuing || !selectedAssembly} style={styles.issueButton}>
        Issue Assembly
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.lg },
  assemblyButton: { marginBottom: SPACING.sm },
  issueButton: { marginTop: SPACING.md },
});

export default RepairAssemblyIssueScreen;
