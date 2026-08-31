import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { repairService } from '../../../api/services';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';
import { isStoreUser } from '../../../utils/roleAccess';

const rowsFrom = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['Parts', 'RepairParts', 'Requests', 'Items', 'Rows', 'List', 'Result']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return Object.values(data).find(Array.isArray) || [];
};

const workEntryId = (part) => part?.WorkEntryDocEntry ?? part?.WorkEntryEntry ?? part?.WorkEntry ?? part?.DocEntry ?? '';
const lineId = (part) => part?.LineId ?? part?.LineNum ?? part?.PartLine ?? 0;
const quantity = (part) => Number(part?.ApprovedQty ?? part?.ReqQty ?? part?.Qty ?? 1) || 1;

const RepairPartsRequestsScreen = ({ navigation }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || 'MUTSPL_TEST';
  const colors = useSelector(state => state.theme.isDarkMode) ? DARK_COLORS : COLORS;
  const storeUser = isStoreUser(user);
  const userCode = user?.User || user?.UserCode || user?.Code || user?.code || '';
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');

  const loadParts = useCallback(async () => {
    setLoading(true);
    try {
      const response = storeUser
        ? await repairService.getApprovedRepairParts(dbName, userCode)
        : await repairService.getPendingRepairPartRequests(dbName, userCode);
      setParts(rowsFrom(response));
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load repair parts', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, storeUser, userCode]);

  useFocusEffect(useCallback(() => { loadParts(); }, [loadParts]));

  const processPart = async (part, approved) => {
    const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || ''}`;
    try {
      setWorkingKey(key);
      const payload = storeUser
        ? {
          CompanyDB: dbName,
          WorkEntryEntry: Number(workEntryId(part)) || workEntryId(part),
          LineId: Number(lineId(part)) || lineId(part),
          IssuedQty: quantity(part),
          UserCode: userCode,
          ItemCode: part?.ItemCode,
          ItemName: part?.ItemName,
        }
        : {
          CompanyDB: dbName,
          WorkEntryEntry: Number(workEntryId(part)) || workEntryId(part),
          LineId: Number(lineId(part)) || lineId(part),
          ItemCode: part?.ItemCode,
          ItemName: part?.ItemName,
          ApprovedQty: approved ? quantity(part) : 0,
          Response: approved ? 'A' : 'R',
          Remarks: part?.Remarks || '',
          UserCode: userCode,
        };
      const response = storeUser
        ? await repairService.issueRepairPart(payload)
        : await repairService.respondToRepairPartRequest(payload);
      if (response?.Success === false || response?.Status === false) throw new Error(response?.Message || 'Request failed.');
      setParts(previous => previous.filter(item => item !== part));
      Toast.show({ type: 'success', text1: storeUser ? 'Part issued' : 'Part request processed' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to process part', text2: error?.message || 'Please try again.' });
    } finally {
      setWorkingKey('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader title={storeUser ? 'Issue Repair Parts' : 'Approve Repair Parts'} subtitle="Repair work-entry parts" onMenuPress={() => navigation.openDrawer?.()} showNotifications useGradient={false} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadParts} />}>
        {parts.length === 0 && !loading ? <Text style={{ color: colors.gray }}>No repair part requests.</Text> : null}
        {parts.map((part, index) => {
          const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || index}`;
          return <Card key={key} style={styles.card}><Card.Content>
            <Text style={[styles.name, { color: colors.dark }]}>{part?.ItemName || part?.ItemCode || 'Repair part'}</Text>
            <Text style={{ color: colors.gray }}>Code: {part?.ItemCode || '-'} | Quantity: {quantity(part)}</Text>
            <Text style={{ color: colors.gray }}>Work entry: {workEntryId(part) || '-'}</Text>
            {part?.Remarks ? <Text style={{ color: colors.gray }}>Remarks: {part.Remarks}</Text> : null}
            <View style={styles.actions}>
              {storeUser ? <Button mode="contained" onPress={() => processPart(part, true)} loading={workingKey === key} disabled={Boolean(workingKey)}>Issue part</Button> : <>
                <Button mode="contained" onPress={() => processPart(part, true)} loading={workingKey === key} disabled={Boolean(workingKey)}>Approve</Button>
                <Button mode="outlined" onPress={() => processPart(part, false)} disabled={Boolean(workingKey)}>Reject</Button>
              </>}
            </View>
          </Card.Content></Card>;
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.md },
  card: { marginBottom: SPACING.md },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});

export default RepairPartsRequestsScreen;