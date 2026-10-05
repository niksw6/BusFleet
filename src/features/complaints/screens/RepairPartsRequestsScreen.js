import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
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
  for (const key of ['Parts', 'RepairParts', 'SpecialTools', 'Tools', 'Requests', 'Items', 'Rows', 'List', 'Result']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return Object.values(data).find(Array.isArray) || [];
};

const workEntryId = (part) => part?.WorkEntryDocEntry ?? part?.WorkEntryEntry ?? part?.WorkEntry ?? part?.DocEntry ?? '';
const jobCardId = (part) => part?.JobCardEntry ?? part?.JobCardDocEntry ?? part?.JobCard ?? part?.JobCardNo ?? '';
const lineId = (part) => part?.LineId ?? part?.LineNum ?? part?.PartLine ?? 0;
const quantity = (part) => Number(part?.ApprovedQty ?? part?.ReqQty ?? part?.Qty ?? 1) || 1;
const requestedQty = (part) => Number(part?.ReqQty ?? part?.Qty ?? part?.ApprovedQty ?? 1) || 1;
const toolLineId = (tool, index) => tool?.ToolLine ?? tool?.LineId ?? tool?.Line ?? tool?.LineNum ?? index;
const toolWorkEntryId = (tool) => tool?.WorkEntryDocEntry ?? tool?.WorkEntryNo ?? tool?.DocEntry ?? '';
const repairWorkEntryId = (entry) => entry?.WorkEntryDocEntry ?? entry?.WorkEntryEntry ?? entry?.DocEntry ?? entry?.WorkEntryNo ?? entry?.DocNum ?? '';

const RepairPartsRequestsScreen = ({ navigation, route = { params: {} } }) => {
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || 'MUTSPL_TEST';
  const colors = useSelector(state => state.theme.isDarkMode) ? DARK_COLORS : COLORS;
  const storeUser = isStoreUser(user);
  const userCode = user?.User || user?.UserCode || user?.Code || user?.code || '';
  const [parts, setParts] = useState([]);
  const [toolRequests, setToolRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');
  const [approvedQtyByKey, setApprovedQtyByKey] = useState({});

  const loadParts = useCallback(async () => {
    setLoading(true);
    try {
      const [partsResult, toolsResult] = await Promise.allSettled([
        storeUser
          ? repairService.getApprovedRepairParts(dbName, userCode)
          : repairService.getPendingRepairPartRequests(dbName, userCode),
        !storeUser && route?.params?.repairSpecialTool
          ? route?.params?.focusJobCardDocEntry
            ? repairService.getRepairJobCard(dbName, route.params.focusJobCardDocEntry)
            : repairService.getMyRepairWorkDashboard(dbName, userCode)
          : Promise.resolve(null),
      ]);
      if (partsResult.status === 'fulfilled') setParts(rowsFrom(partsResult.value));
      else throw partsResult.reason;
      if (toolsResult.status === 'fulfilled' && toolsResult.value) {
        const focusWorkEntry = String(route?.params?.focusWorkEntryDocEntry || '').trim();
        const repairJobCard = toolsResult.value?.Data ?? toolsResult.value?.data ?? toolsResult.value;
        const workEntries = Array.isArray(repairJobCard?.WorkEntries) ? repairJobCard.WorkEntries : [];
        const tools = workEntries.flatMap(entry => (
          (Array.isArray(entry?.SpecialTools) ? entry.SpecialTools : []).map((tool, index) => ({
            ...tool,
            LineId: toolLineId(tool, index),
            WorkEntryDocEntry: toolWorkEntryId(tool) || repairWorkEntryId(entry),
            JobCardEntry: entry?.JobCardEntry ?? entry?.JobCardDocEntry ?? entry?.JobCard ?? '',
            ToolCode: tool?.ToolCode || tool?.Code || '',
            ToolName: tool?.ToolName || tool?.Name || tool?.Description || tool?.ToolCode || 'Special tool',
          }))
        )).filter(tool => ['RQ', 'REQUESTED', 'PENDING'].includes(String(tool?.Status || tool?.ToolStatus || '').trim().toUpperCase()));
        setToolRequests(focusWorkEntry
          ? tools.filter(tool => String(tool.WorkEntryDocEntry) === focusWorkEntry)
          : tools);
      } else {
        setToolRequests([]);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load repair parts', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [dbName, route?.params?.focusWorkEntryDocEntry, route?.params?.repairSpecialTool, storeUser, userCode]);

  useFocusEffect(useCallback(() => { loadParts(); }, [loadParts]));

  const updateApprovedQty = (part, nextValue) => {
    const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || ''}`;
    const sanitized = nextValue.replace(/[^0-9]/g, '');
    setApprovedQtyByKey(previous => ({ ...previous, [key]: sanitized || '0' }));
  };

  const approvedQtyFor = (part) => {
    const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || ''}`;
    const requested = requestedQty(part);
    const rawValue = approvedQtyByKey[key];
    if (rawValue === undefined || rawValue === null || rawValue === '') return String(requested);
    const numeric = Number(rawValue) || 0;
    return String(Math.min(numeric, requested));
  };

  const approveRepairTool = async (tool) => {
    const key = `tool-${tool.WorkEntryDocEntry}-${tool.LineId}`;
    if (!tool.WorkEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Work entry unavailable', text2: 'This special-tool request has no work-entry reference.' });
      return;
    }
    try {
      setWorkingKey(key);
      const response = await repairService.approveRepairSpecialTool({
        CompanyDB: dbName,
        WorkEntryDocEntry: Number(tool.WorkEntryDocEntry) || tool.WorkEntryDocEntry,
        UserCode: userCode,
        ToolLineIds: [Number(tool.LineId) || tool.LineId],
      });
      if (response?.Success === false || response?.Status === false) throw new Error(response?.Message || 'Approval failed.');
      setToolRequests(previous => previous.filter(item => item !== tool));
      Toast.show({ type: 'success', text1: 'Special tool approved' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to approve special tool', text2: error?.message || 'Please try again.' });
    } finally {
      setWorkingKey('');
    }
  };

  const processPart = async (part, approved) => {
    const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || ''}`;
    const repairJobCardEntry = jobCardId(part);
    if (!repairJobCardEntry) {
      Toast.show({ type: 'error', text1: 'Job card unavailable', text2: 'This repair-part request is missing its JobCardEntry.' });
      return;
    }

    if (!storeUser && approved) {
      const requestQty = requestedQty(part);
      const approvedQty = Number(approvedQtyFor(part)) || 0;
      if (approvedQty > requestQty) {
        Toast.show({
          type: 'error',
          text1: 'Invalid approved quantity',
          text2: `Approved quantity cannot exceed the requested quantity (${requestQty}).`,
        });
        return;
      }
      if (approvedQty <= 0) {
        Toast.show({ type: 'error', text1: 'Invalid approved quantity', text2: 'Approved quantity must be greater than 0.' });
        return;
      }
    }

    try {
      setWorkingKey(key);
      const payload = storeUser
        ? {
          CompanyDB: dbName,
          JobCardEntry: Number(repairJobCardEntry) || repairJobCardEntry,
          StoreUserCode: userCode,
          Parts: [{
            LineId: Number(lineId(part)) || lineId(part),
            IssueQty: quantity(part),
          }],
        }
        : {
          CompanyDB: dbName,
          JobCardEntry: Number(repairJobCardEntry) || repairJobCardEntry,
          LineId: Number(lineId(part)) || lineId(part),
          SupervisorUserCode: userCode,
          Response: approved ? 'A' : 'R',
          ApprovedQty: approved ? Number(approvedQtyFor(part)) || 0 : 0,
          Remarks: part?.Remarks || '',
        };
      const response = storeUser
        ? await repairService.issueRepairPart(payload)
        : await repairService.respondToRepairPartRequest(payload);
      if (response?.Success === false || response?.Status === false) throw new Error(response?.Message || 'Request failed.');
      setParts(previous => previous.filter(item => item !== part));
      if (!storeUser) {
        setApprovedQtyByKey(previous => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }
      Toast.show({ type: 'success', text1: storeUser ? 'Part issued' : 'Part request processed' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to process part', text2: error?.message || 'Please try again.' });
    } finally {
      setWorkingKey('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader title={storeUser ? 'Issue Repair Parts' : 'Approve Repair Parts & Special Tools'} subtitle={storeUser ? 'Repair work-entry parts' : 'Repair parts and special-tool requests'} onMenuPress={() => navigation.openDrawer?.()} showNotifications useGradient={false} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadParts} />}>
        {toolRequests.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Special tool requests</Text>
            {toolRequests.map((tool, index) => {
              const key = `tool-${tool.WorkEntryDocEntry}-${tool.LineId}`;
              return (
                <Card key={`${key}-${index}`} style={styles.card}>
                  <Card.Content>
                    <Text style={[styles.name, { color: colors.dark }]}>{tool.ToolName || tool.ToolCode || 'Special tool'}</Text>
                    <Text style={{ color: colors.gray }}>Code: {tool.ToolCode || '-'} | Work entry: {tool.WorkEntryDocEntry || '-'}</Text>
                    {tool?.Remarks ? <Text style={{ color: colors.gray }}>Remarks: {tool.Remarks}</Text> : null}
                    <Button mode="contained" onPress={() => approveRepairTool(tool)} loading={workingKey === key} disabled={Boolean(workingKey)} style={styles.toolButton}>Approve special tool</Button>
                  </Card.Content>
                </Card>
              );
            })}
          </>
        )}
        {!storeUser && route?.params?.repairSpecialTool && toolRequests.length === 0 && !loading ? <Text style={{ color: colors.gray }}>No pending special-tool requests.</Text> : null}
        {!storeUser && !route?.params?.repairSpecialTool ? <Text style={[styles.sectionTitle, { color: colors.dark }]}>Repair part requests</Text> : null}
        {parts.length === 0 && !loading ? <Text style={{ color: colors.gray }}>No repair part requests.</Text> : null}
        {parts.map((part, index) => {
          const key = `${workEntryId(part)}-${lineId(part)}-${part?.ItemCode || index}`;
          const requested = requestedQty(part);
          const approvedValue = approvedQtyFor(part);
          return <Card key={key} style={styles.card}><Card.Content>
            <Text style={[styles.name, { color: colors.dark }]}>{part?.ItemName || part?.ItemCode || 'Repair part'}</Text>
            <Text style={{ color: colors.gray }}>Code: {part?.ItemCode || '-'} | Requested qty: {requested}</Text>
            <Text style={{ color: colors.gray }}>Job card: {jobCardId(part) || '-'} | Work entry: {workEntryId(part) || '-'}</Text>
            {part?.Remarks ? <Text style={{ color: colors.gray }}>Remarks: {part.Remarks}</Text> : null}
            {!storeUser && (
              <View style={styles.qtyRow}>
                <Text style={{ color: colors.dark, fontWeight: '600', marginRight: 10 }}>Approved qty</Text>
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="numeric"
                  value={approvedValue}
                  onChangeText={value => updateApprovedQty(part, value)}
                  style={[styles.qtyInput, { backgroundColor: colors.white, color: colors.dark, borderColor: colors.grayLight }]}
                  contentStyle={{ fontSize: 14 }}
                  maxLength={6}
                />
              </View>
            )}
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
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: SPACING.sm },
  toolButton: { marginTop: 12, alignSelf: 'flex-start' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  qtyInput: {
    width: 120,
    height: 42,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});

export default RepairPartsRequestsScreen;
