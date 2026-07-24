import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput as RNTextInput, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { storeService } from '../../../api/services';

/**
 * PartsApprovalScreen — Supervisor/Store view of Mechanics' mid-work parts requests.
 *
 * Uses the confirmed live endpoints:
 *   GET  GetMechanicPartRequests?CompanyDB=...
 *   POST ApproveMechanicPartRequest { CompanyDB, WorkEntryDocEntry, JobCardDocEntry, SupervisorCode, Parts:[{PartLine,ApprovedQty,Approved,StoreWarehouse,Remarks}] }
 *
 * Response shape for GetMechanicPartRequests is unconfirmed, so this screen defensively
 * finds the request array wherever it lives, then groups part lines by WorkEntryDocEntry
 * so the Supervisor can approve/reject a whole work-entry's parts list in one action.
 */

const isApiSuccess = (res) => res?.Success === true || res?.Status === true;

const extractItems = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.Data)) return res.Data;
  if (Array.isArray(res?.data)) return res.data;

  const data = res?.Data;
  if (!data || typeof data !== 'object') return [];

  // Support object-shaped payloads where each request has nested Parts[]
  const nestedRequestRows = Object.values(data).filter((value) => value && typeof value === 'object');
  if (nestedRequestRows.length > 0) {
    const flattened = [];
    nestedRequestRows.forEach((row) => {
      const parts = Array.isArray(row?.Parts) ? row.Parts : [];
      if (parts.length === 0) {
        flattened.push(row);
        return;
      }
      parts.forEach((part) => {
        flattened.push({
          ...row,
          ...part,
        });
      });
    });
    if (flattened.length > 0) return flattened;
  }

  return [];
};

const getWorkEntryDocEntry = (item) => item?.WorkEntryDocEntry ?? item?.WorkEntryNo ?? item?.DocEntry ?? '';
const getJobCardDocEntry = (item) => item?.JobCardDocEntry ?? item?.JobCardNo ?? '';
const getPartLine = (item) => item?.PartLine ?? item?.Line ?? item?.LineNum ?? 0;

const groupByWorkEntry = (items) => {
  const map = new Map();
  items.forEach((item) => {
    const key = String(getWorkEntryDocEntry(item));
    if (!map.has(key)) {
      map.set(key, {
        workEntryDocEntry: getWorkEntryDocEntry(item),
        jobCardDocEntry: getJobCardDocEntry(item),
        mechanicName: item?.MechanicName || item?.UserName || item?.UserCode || '',
        faultName: item?.Fault || item?.FaultName || '',
        parts: [],
      });
    }
    map.get(key).parts.push({
      partLine: getPartLine(item),
      itemCode: item?.ItemCode || '',
      itemName: item?.ItemName || item?.ItemCode || 'Item',
      reqQty: item?.ReqQty ?? item?.Qty ?? 1,
      issuedQty: item?.IssuedQty ?? item?.IssueQty ?? 0,
      receivedQty: item?.ReceivedQty ?? 0,
      approvedQty: String(item?.ReqQty ?? item?.Qty ?? 1),
      approved: true,
      storeWarehouse: item?.Warehouse || '',
      remarks: '',
    });
  });
  return Array.from(map.values());
};

const PartsApprovalScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.User || user?.user || user?.name || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState([]);
  const [submittingKey, setSubmittingKey] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const res = await storeService.getMechanicPartRequests(companyDb);
      if (!isApiSuccess(res)) {
        setGroups([]);
        return;
      }
      const items = extractItems(res);
      setGroups(groupByWorkEntry(items));
    } catch (error) {
      console.error('❌ Error loading part requests:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to load parts requests' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const updatePartField = (groupKey, partLine, field, value) => {
    setGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        parts: g.parts.map(p => (p.partLine === partLine ? { ...p, [field]: value } : p)),
      };
    }));
  };

  const toggleApproved = (groupKey, partLine) => {
    setGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        parts: g.parts.map(p => (p.partLine === partLine ? { ...p, approved: !p.approved } : p)),
      };
    }));
  };

  const handleSubmit = async (group) => {
    const groupKey = String(group.workEntryDocEntry);
    try {
      setSubmittingKey(groupKey);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.approveMechanicPartRequest({
        CompanyDB: companyDb,
        WorkEntryDocEntry: group.workEntryDocEntry,
        JobCardDocEntry: group.jobCardDocEntry,
        SupervisorCode: userCode,
        Parts: group.parts.map(p => ({
          PartLine: p.partLine,
          ApprovedQty: parseFloat(p.approvedQty) || 0,
          Approved: p.approved,
          StoreWarehouse: p.storeWarehouse || '',
          Remarks: p.remarks || '',
        })),
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Parts request processed' });
        setGroups(prev => prev.filter(g => String(g.workEntryDocEntry) !== groupKey));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not process request' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to process request' });
    } finally {
      setSubmittingKey(null);
    }
  };

  const renderGroup = (group) => {
    const groupKey = String(group.workEntryDocEntry);
    const isSubmitting = submittingKey === groupKey;
    return (
      <View key={groupKey} style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
            <MaterialIcons name="inventory" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.cardTitle, { color: colors.dark }]}>
              Job Card #{group.jobCardDocEntry} • Work Entry #{group.workEntryDocEntry}
            </Text>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              {group.mechanicName ? `${group.mechanicName} • ` : ''}{group.faultName}
            </Text>
          </View>
        </View>

        {group.parts.map((p) => (
          <View key={p.partLine} style={[styles.partRow, { borderColor: colors.border || '#E0E0E0' }]}>
            <View style={styles.partRowTop}>
              <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13, flex: 1 }}>{p.itemName}</Text>
              <TouchableOpacity
                style={[styles.approveToggle, { backgroundColor: p.approved ? '#2B7D2B20' : '#BB000020' }]}
                onPress={() => toggleApproved(groupKey, p.partLine)}
              >
                <MaterialIcons
                  name={p.approved ? 'check-circle' : 'cancel'}
                  size={16}
                  color={p.approved ? '#2B7D2B' : '#BB0000'}
                />
                <Text style={{ color: p.approved ? '#2B7D2B' : '#BB0000', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                  {p.approved ? 'Approve' : 'Reject'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>Requested: {p.reqQty}</Text>
            {(Number(p.issuedQty) > 0 || Number(p.receivedQty) > 0) && (
              <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                {Number(p.issuedQty) > 0 ? `Issued: ${p.issuedQty}` : ''}
                {Number(p.receivedQty) > 0 ? `${Number(p.issuedQty) > 0 ? '  •  ' : ''}Received: ${p.receivedQty}` : ''}
              </Text>
            )}

            {p.approved && (
              <View style={styles.partRowInputs}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.gray, fontSize: 11 }}>Approved Qty</Text>
                  <RNTextInput
                    value={p.approvedQty}
                    onChangeText={(v) => updatePartField(groupKey, p.partLine, 'approvedQty', v)}
                    keyboardType="numeric"
                    style={[styles.smallInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                </View>
                <View style={{ flex: 1.4, marginLeft: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 11 }}>Warehouse</Text>
                  <RNTextInput
                    value={p.storeWarehouse}
                    onChangeText={(v) => updatePartField(groupKey, p.partLine, 'storeWarehouse', v)}
                    placeholder="e.g. WH01"
                    placeholderTextColor={colors.gray}
                    style={[styles.smallInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                </View>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }]}
          onPress={() => handleSubmit(group)}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <MaterialIcons name="send" size={16} color="#FFF" />
          <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting…' : 'Submit Decision'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <Loader visible />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="Parts Requests"
        subtitle="Approve mechanic parts"
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={false}
        useGradient={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {groups.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="inventory" size={48} color={colors.gray} />
            <Text style={{ color: colors.gray, marginTop: 8 }}>No pending parts requests.</Text>
          </View>
        ) : (
          groups.map(renderGroup)
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 13, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  partRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 8,
  },
  partRowTop: { flexDirection: 'row', alignItems: 'center' },
  approveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  partRowInputs: { flexDirection: 'row', marginTop: 8 },
  smallInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    marginTop: 2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
    marginTop: 4,
  },
  submitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});

export default PartsApprovalScreen;
