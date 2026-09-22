import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { repairService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';

const isSuccess = (response) => (
  !Object.prototype.hasOwnProperty.call(response || {}, 'Success')
  && !Object.prototype.hasOwnProperty.call(response || {}, 'Status')
) || response?.Success === true || response?.Status === true;

const getValue = (source, keys) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return '';
};

const RepairAssemblyReceiveScreen = ({ route, navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const notification = route.params?.notification || {};
  const jobCardEntry = String(route.params?.jobCardEntry || route.params?.JobCardEntry || '').trim();
  const assemblyCode = getValue(route.params, ['assemblyCode', 'AssemblyCode', 'assembly', 'Assembly']);
  const assemblyName = getValue(route.params, ['assemblyName', 'AssemblyName']) || 'Assembly';
  const receiveDisabled = route.params?.receiveDisabled === true;
  const userCode = getValue(user, ['User', 'user', 'UserCode', 'Code', 'code']);
  const empId = getValue(user, ['EmpID', 'EmployeeID', 'ID', 'id']);
  const [assembly, setAssembly] = useState(notification);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);

  const loadAssembly = useCallback(async () => {
    try {
      const [issueResult, jobCardResult] = await Promise.allSettled([
        repairService.getRepairAssemblyForIssue(dbName, jobCardEntry || 0, userCode),
        jobCardEntry ? repairService.getRepairJobCard(dbName, jobCardEntry) : Promise.resolve(null),
      ]);
      const issueResponse = issueResult.status === 'fulfilled' ? issueResult.value : null;
      const issueData = issueResponse?.Data ?? issueResponse?.data ?? issueResponse;
      const issueRows = Array.isArray(issueData) ? issueData : issueData && typeof issueData === 'object' ? [issueData] : [];
      const matchingIssue = issueRows.find(row => String(getValue(row, ['JobCardEntry', 'JobCardDocEntry', 'DocEntry', 'JobCardNo'])) === jobCardEntry);
      const jobCardResponse = jobCardResult.status === 'fulfilled' ? jobCardResult.value : null;
      const jobCardData = jobCardResponse?.Data ?? jobCardResponse?.data ?? jobCardResponse;
      const jobCard = Array.isArray(jobCardData) ? jobCardData[0] : jobCardData;
      const mergedAssembly = { ...(assembly || {}), ...(jobCard || {}), ...(matchingIssue || issueRows[0] || {}) };
      if (Object.keys(mergedAssembly).length > 0) setAssembly(mergedAssembly);
    } catch (error) {
      // The notification contains enough data to receive; keep the screen usable if the queue lookup is unavailable.
      if (!assembly || Object.keys(assembly).length === 0) {
        Toast.show({ type: 'error', text1: 'Unable to load issued assembly', text2: error?.message || 'Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }, [assembly, dbName, jobCardEntry, userCode]);

  useEffect(() => { loadAssembly(); }, [loadAssembly]);

  const receiveAssembly = async () => {
    const resolvedJobCardEntry = getValue(assembly, ['JobCardEntry', 'JobCardDocEntry', 'DocEntry', 'JobCardNo']) || jobCardEntry;
    if (!resolvedJobCardEntry) {
      Toast.show({ type: 'error', text1: 'Job card unavailable', text2: 'The issued assembly has no job card reference.' });
      return;
    }

    try {
      setReceiving(true);
      const resolvedAssemblyCode = getValue(assembly, ['AssemblyCode', 'assemblyCode', 'Assembly', 'AssemblyNo', 'RepairAssemblyCode', 'RepairAssembly']) || assemblyCode;
      if (!resolvedAssemblyCode) {
        throw new Error('Assembly code is missing from the repair job card.');
      }
      const response = await repairService.receiveRepairAssembly({
        CompanyDB: dbName,
        JobCardEntry: Number(resolvedJobCardEntry) || resolvedJobCardEntry,
        UserCode: userCode,
        EmpID: Number(empId) || empId || undefined,
        AssemblyCode: resolvedAssemblyCode,
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Assembly receipt failed.');
      Toast.show({ type: 'success', text1: 'Assembly received', text2: 'Now receive any issued repair parts.' });
      navigation.replace('RepairPartReceive', {
        jobCardEntry: String(resolvedJobCardEntry),
        dbName,
        assemblyCode: resolvedAssemblyCode,
        assemblyName: getValue(assembly, ['AssemblyName', 'AssemblyDescription', 'Assembly']) || assemblyName,
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to receive assembly', text2: error?.message || 'Please try again.' });
    } finally {
      setReceiving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Receive Repair Assembly</Text>
      <View style={[styles.details, { backgroundColor: colors.card || colors.white }]}>
        <Text style={[styles.detail, { color: colors.dark }]}>Job card: {getValue(assembly, ['JobCardEntry', 'JobCardDocEntry', 'DocEntry', 'JobCardNo']) || jobCardEntry || '-'}</Text>
        <Text style={[styles.detail, { color: colors.dark }]}>Assembly: {getValue(assembly, ['AssemblyName', 'AssemblyDescription', 'Assembly']) || assemblyName}</Text>
        <Text style={[styles.detail, { color: colors.gray }]}>Issued assembly: Ready to receive</Text>
      </View>
      <Button mode="contained" onPress={receiveAssembly} loading={receiving} disabled={receiving || receiveDisabled} style={styles.receiveButton}>
        {receiveDisabled ? 'Waiting for Assembly Issue' : 'Receive Assembly and Open Work Entry'}
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.lg },
  details: { padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.lg },
  detail: { fontSize: 15, marginBottom: SPACING.sm },
  receiveButton: { marginTop: SPACING.md },
});

export default RepairAssemblyReceiveScreen;
