import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { repairService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';

const getRows = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).find(value => Array.isArray(value)) || [];
};

const isSuccess = (response) => (
  !Object.prototype.hasOwnProperty.call(response || {}, 'Success')
  && !Object.prototype.hasOwnProperty.call(response || {}, 'Status')
) || response?.Success === true || response?.Status === true;

const getPartStatus = (part) => String(
  part?.Status || part?.PartStatus || part?.IssueStatus || '',
).trim().toUpperCase();

const isReceived = (part) => ['RC', 'RECEIVED', 'R'].includes(getPartStatus(part))
  || Number(part?.ReceivedQty || part?.RecQty || 0) > 0;

const RepairPartReceiveScreen = ({ route, navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.User || user?.user || user?.UserCode || user?.Code || user?.code || '';
  const jobCardEntry = String(route.params?.jobCardEntry || route.params?.JobCardEntry || '').trim();
  const assemblyCode = route.params?.assemblyCode || route.params?.AssemblyCode || '';
  const assemblyName = route.params?.assemblyName || route.params?.AssemblyName || 'Assembly';
  const [parts, setParts] = useState([]);
  const [resolvedJobCardEntry, setResolvedJobCardEntry] = useState(jobCardEntry);
  const [loading, setLoading] = useState(true);
  const [receivingLine, setReceivingLine] = useState(null);

  const loadParts = useCallback(async () => {
    if (!jobCardEntry) {
      setLoading(false);
      return;
    }
    try {
      const jobCardResponse = await repairService.getRepairJobCard(dbName, jobCardEntry);
      const jobCardData = jobCardResponse?.Data ?? jobCardResponse?.data ?? jobCardResponse;
      const jobCard = Array.isArray(jobCardData) ? jobCardData[0] : jobCardData;
      const canonicalJobCardEntry = String(jobCard?.JobCard || jobCard?.JobCardEntry || jobCard?.JobCardDocEntry || jobCardEntry).trim();
      setResolvedJobCardEntry(canonicalJobCardEntry);
      const response = await repairService.getIssuedRepairParts(dbName, canonicalJobCardEntry, userCode);
      setParts(getRows(response));
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load issued parts', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, jobCardEntry, userCode]);

  useEffect(() => { loadParts(); }, [loadParts]);

  const openWorkEntry = () => navigation.replace('RepairWork', {
    jobCardEntry: resolvedJobCardEntry,
    dbName,
    assemblyCode,
    assemblyName,
  });

  const receivePart = async (part) => {
    const lineId = part?.LineId ?? part?.LineNum ?? part?.LineID ?? part?.PartLine;
    if (lineId === undefined || lineId === null || String(lineId).trim() === '') {
      Toast.show({ type: 'error', text1: 'Part line unavailable', text2: 'This issued part cannot be received.' });
      return;
    }
    try {
      setReceivingLine(String(lineId));
      const response = await repairService.receiveRepairPart({
        CompanyDB: dbName,
        JobCardEntry: Number(resolvedJobCardEntry) || resolvedJobCardEntry,
        MechanicUserCode: userCode,
        Parts: [{ LineId: Number(lineId) || lineId }],
      });
      if (!isSuccess(response)) throw new Error(response?.Message || 'Part receipt failed.');
      const updatedParts = parts.map(item => String(item?.LineId ?? item?.LineNum ?? item?.LineID ?? item?.PartLine) === String(lineId)
        ? { ...item, Status: 'RC', ReceivedQty: item?.ReceivedQty || item?.Qty || item?.ReqQty || 1 }
        : item);
      setParts(updatedParts);
      Toast.show({ type: 'success', text1: 'Part received' });
      if (updatedParts.length > 0 && updatedParts.every(isReceived)) openWorkEntry();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to receive part', text2: error?.message || 'Please try again.' });
    } finally {
      setReceivingLine(null);
    }
  };

  const receiveAllParts = async () => {
    const pending = parts.filter(part => !isReceived(part));
    if (pending.length === 0) {
      openWorkEntry();
      return;
    }
    try {
      setReceivingLine('ALL');
      for (const part of pending) {
        const lineId = part?.LineId ?? part?.LineNum ?? part?.LineID ?? part?.PartLine;
        const response = await repairService.receiveRepairPart({
          CompanyDB: dbName,
          JobCardEntry: Number(resolvedJobCardEntry) || resolvedJobCardEntry,
          MechanicUserCode: userCode,
          Parts: [{ LineId: Number(lineId) || lineId }],
        });
        if (!isSuccess(response)) throw new Error(response?.Message || 'Part receipt failed.');
      }
      Toast.show({ type: 'success', text1: 'Parts received' });
      openWorkEntry();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to receive parts', text2: error?.message || 'Please try again.' });
    } finally {
      setReceivingLine(null);
    }
  };

  if (loading) return <Loader />;

  const pendingParts = parts.filter(part => !isReceived(part));
  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.light }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.dark }]}>Receive Repair Parts</Text>
      <Text style={[styles.subtitle, { color: colors.gray }]}>Job card: {resolvedJobCardEntry || '-'}</Text>
      <Text style={[styles.subtitle, { color: colors.gray }]}>Assembly: {assemblyName}</Text>
      <Button
        mode="contained"
        onPress={receiveAllParts}
        loading={receivingLine === 'ALL'}
        disabled={!!receivingLine || parts.length === 0 || pendingParts.length === 0}
        style={styles.receiveButton}
      >
        Receive Parts
      </Button>
      {parts.length === 0 ? (
        <>
          <Text style={{ color: colors.gray }}>No issued parts are waiting to be received.</Text>
          <Button mode="contained" onPress={openWorkEntry} style={styles.button}>Open Assembly Work Entry</Button>
        </>
      ) : parts.map((part, index) => {
        const lineId = String(part?.LineId ?? part?.LineNum ?? part?.LineID ?? part?.PartLine ?? index);
        const received = isReceived(part);
        return (
          <Card key={`${part?.ItemCode || part?.Item || 'part'}-${lineId}`} style={styles.card}>
            <Card.Content>
              <Text style={[styles.partName, { color: colors.dark }]}>{part?.ItemCode || part?.Item || '-'} - {part?.ItemName || part?.PartName || part?.Name || '-'}</Text>
              <Text style={{ color: colors.gray }}>Quantity: {part?.Qty || part?.ReqQty || part?.Quantity || 1}</Text>
              <Button mode={received ? 'outlined' : 'contained'} onPress={() => receivePart(part)} loading={receivingLine === lineId} disabled={received || !!receivingLine} style={styles.button}>
                {received ? 'Received' : 'Receive part'}
              </Button>
            </Card.Content>
          </Card>
        );
      })}
      {parts.length > 0 && pendingParts.length === 0 && (
        <Button mode="contained" onPress={openWorkEntry} style={styles.button}>Open Assembly Work Entry</Button>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  title: { fontSize: 24, fontWeight: '700', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, marginBottom: SPACING.xs },
  card: { marginTop: SPACING.md },
  partName: { fontSize: 16, fontWeight: '700' },
  button: { marginTop: SPACING.md },
  receiveButton: { marginTop: SPACING.lg, marginBottom: SPACING.sm },
});

export default RepairPartReceiveScreen;
