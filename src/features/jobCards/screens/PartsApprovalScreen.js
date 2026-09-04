import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput as RNTextInput, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { storeService } from '../../../api/services';

const BUS_LOCATIONS = [
  'FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM',
  'FRONT_LEFT', 'FRONT_RIGHT', 'BACK_LEFT', 'BACK_RIGHT',
  'CENTER', 'ENGINE', 'CABIN', 'UNDERBODY',
].map((value) => ({ Code: value, Name: value }));

/**
 * PartsApprovalScreen — Supervisor/Store view of Mechanics' mid-work parts requests.
 *
 * Uses the confirmed live endpoints:
 *   GET  GetMechanicPartRequests?CompanyDB=...
 *   POST ApproveMechanicPartRequest { CompanyDB, WorkEntryDocEntry, JobCardDocEntry, SupervisorCode, Parts:[{PartLine,ApprovedQty,Approved,Remarks}] }
 *
 * Response shape for GetMechanicPartRequests is unconfirmed, so this screen defensively
 * finds the request array wherever it lives, then groups part lines by WorkEntryDocEntry
 * so the Supervisor can approve/reject a whole work-entry's parts list in one action.
 */

const isApiSuccess = (res) => {
  if (Array.isArray(res)) return true;
  if (!res || typeof res !== 'object') return false;
  const hasExplicitFlag = Object.prototype.hasOwnProperty.call(res, 'Success')
    || Object.prototype.hasOwnProperty.call(res, 'Status');
  if (!hasExplicitFlag) return true;
  return res?.Success === true || res?.Status === true;
};

const parseODataDate = (value) => {
  if (!value) return '';
  const match = String(value).match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
  if (match) {
    const ts = parseInt(match[1], 10);
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }
  // ISO or plain string
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }
  return String(value);
};

const PART_STATUS_LABELS = {
  RQ: { label: 'Requested', color: '#D97706' },
  AP: { label: 'Approved', color: '#2B7D2B' },
  RJ: { label: 'Rejected', color: '#BB0000' },
  IS: { label: 'Issued', color: '#1D4ED8' },
};

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
        flattened.push({ ...row, ...part });
      });
    });
    if (flattened.length > 0) return flattened;
  }

  return [];
};

const getWorkEntryDocEntry = (item) => item?.WorkEntryDocEntry ?? item?.WorkEntryNo ?? item?.DocEntry ?? '';
const getJobCardDocEntry = (item) => item?.JobCardDocEntry ?? item?.JobCardNo ?? '';
const getPartLine = (item) => item?.PartLine ?? item?.Line ?? item?.LineNum ?? 0;
const getToolLine = (item, index) => item?.ToolLine ?? item?.LineId ?? item?.Line ?? item?.LineNum ?? index + 1;

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
      approved: null,
      storeItemStatus: item?.StoreItemStatus || 'Direct',
      busLocation: item?.BusLocation || '',
      remarks: '',
    });
  });
  return Array.from(map.values());
};

const PartsApprovalScreen = ({ navigation, route }) => {
  const initialSection = (route?.params?.initialSection || 'parts').toLowerCase();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.User || user?.user || user?.name || '';

  const scrollViewRef = React.useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState([]);
  const [toolRequests, setToolRequests] = useState([]);
  const [submittingKey, setSubmittingKey] = useState(null);
  const [locationTarget, setLocationTarget] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [partsResult, toolsResult] = await Promise.allSettled([
        storeService.getMechanicPartRequests(companyDb),
        storeService.getMechanicToolRequests(companyDb),
      ]);
      if (partsResult.status === 'fulfilled' && isApiSuccess(partsResult.value)) {
        setGroups(groupByWorkEntry(extractItems(partsResult.value)));
      } else {
        setGroups([]);
      }
      if (toolsResult.status === 'fulfilled' && isApiSuccess(toolsResult.value)) {
        setToolRequests(extractItems(toolsResult.value).map((tool, index) => ({
          ...tool,
          lineId: getToolLine(tool, index),
          toolCode: tool?.ToolCode || tool?.Code || '',
          toolName: tool?.ToolName || tool?.Name || tool?.Description || tool?.ToolCode || tool?.Code || 'Tool',
          workEntryDocEntry: getWorkEntryDocEntry(tool),
          jobCardDocEntry: getJobCardDocEntry(tool),
          mechanicCode: tool?.MechanicCode || tool?.UserCode || tool?.EmpCode || '',
          mechanicName: tool?.MechanicName || tool?.RequestedBy || tool?.UserName || '',
          vehicle: tool?.Vehicle || tool?.BusNo || tool?.VehicleNo || '',
          requestedDate: tool?.ReqDate || tool?.RequestDate || tool?.Date || '',
          requestedTime: tool?.ReqTime || tool?.RequestTime || tool?.Time || '',
          requestRemarks: tool?.Remarks || '',
          approved: null,
          remarks: '',
        })));
      } else {
        setToolRequests([]);
      }
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

  const setPartApproval = (groupKey, partLine, approved) => {
    setGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        parts: g.parts.map(p => (p.partLine === partLine ? { ...p, approved } : p)),
      };
    }));
  };

  const setStoreItemStatus = (groupKey, partLine, storeItemStatus) => {
    updatePartField(groupKey, partLine, 'storeItemStatus', storeItemStatus);
  };

  const selectBusLocation = (value, item) => {
    if (locationTarget) {
      updatePartField(locationTarget.groupKey, locationTarget.partLine, 'busLocation', item?.Code || value);
    }
    setLocationTarget(null);
  };

  const setToolApproval = (toolIndex, approved) => {
    setToolRequests(previous => previous.map((tool, index) => (
      index === toolIndex ? { ...tool, approved } : tool
    )));
  };

  const handleToolSubmit = async (tool, toolIndex) => {
    if (tool.approved !== true && tool.approved !== false) {
      Toast.show({ type: 'info', text1: 'Select a decision', text2: 'Approve or reject the special tool request first.' });
      return;
    }
    const key = `tool-${tool.workEntryDocEntry}-${tool.lineId}`;
    try {
      setSubmittingKey(key);
      const response = await storeService.approveSpecialToolRequest({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(tool.workEntryDocEntry) || tool.workEntryDocEntry,
        SupervisorCode: userCode,
        Tools: [{ LineId: Number(tool.lineId) || tool.lineId, Approved: tool.approved, Remarks: tool.remarks || '' }],
      });
      if (!isApiSuccess(response)) throw new Error(response?.Message || 'Could not process special tool request.');
      setToolRequests(previous => previous.filter((_, index) => index !== toolIndex));
      Toast.show({ type: 'success', text1: 'Special tool request processed' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Tool request failed', text2: error?.message || 'Please try again.' });
    } finally {
      setSubmittingKey(null);
    }
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
        Parts: group.parts
          .filter(p => p.approved === true || p.approved === false)
          .map(p => ({
          PartLine: p.partLine,
          StoreItemStatus: p.storeItemStatus || 'Direct',
          ApprovedQty: parseFloat(p.approvedQty) || 0,
          Approved: p.approved,
          BusLocation: p.busLocation || '',
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
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: p.approved === true ? '#2B7D2B20' : '#F1F5F9' }]}
                  onPress={() => setPartApproval(groupKey, p.partLine, true)}
                >
                  <MaterialIcons name="check-circle" size={16} color={p.approved === true ? '#2B7D2B' : colors.gray} />
                  <Text style={{ color: p.approved === true ? '#2B7D2B' : colors.gray, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: p.approved === false ? '#BB000020' : '#F1F5F9' }]}
                  onPress={() => setPartApproval(groupKey, p.partLine, false)}
                >
                  <MaterialIcons name="cancel" size={16} color={p.approved === false ? '#BB0000' : colors.gray} />
                  <Text style={{ color: p.approved === false ? '#BB0000' : colors.gray, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>Requested: {p.reqQty}</Text>
            {(Number(p.issuedQty) > 0 || Number(p.receivedQty) > 0) && (
              <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                {Number(p.issuedQty) > 0 ? `Issued: ${p.issuedQty}` : ''}
                {Number(p.receivedQty) > 0 ? `${Number(p.issuedQty) > 0 ? '  •  ' : ''}Received: ${p.receivedQty}` : ''}
              </Text>
            )}

            {p.approved && (
              <View>
                <View style={styles.storeItemStatusRow}>
                  <Text style={{ color: colors.gray, fontSize: 11 }}>Store item status</Text>
                  <View style={styles.statusOptions}>
                    {['Direct', 'Interim'].map((status) => {
                      const selected = p.storeItemStatus === status;
                      return (
                        <TouchableOpacity
                          key={status}
                          style={[styles.statusOption, { borderColor: selected ? colors.primary : colors.border || '#CCC' }, selected && { backgroundColor: `${colors.primary}18` }]}
                          onPress={() => setStoreItemStatus(groupKey, p.partLine, status)}
                        >
                          <Text style={{ color: selected ? colors.primary : colors.gray, fontSize: 12, fontWeight: '600' }}>{status}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
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
                <TouchableOpacity
                  style={{ flex: 1.4, marginLeft: 8 }}
                  onPress={() => setLocationTarget({ groupKey, partLine: p.partLine })}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: colors.gray, fontSize: 11 }}>Bus location</Text>
                  <View style={[styles.smallInput, styles.locationPicker, { borderColor: colors.border || '#CCC' }]}>
                    <Text style={{ color: p.busLocation ? colors.dark : colors.gray, fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {p.busLocation || 'Select location'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={18} color={colors.gray} />
                  </View>
                </TouchableOpacity>
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
        showNotifications={true}
        useGradient={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {groups.length === 0 && toolRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="inventory" size={48} color={colors.gray} />
            <Text style={{ color: colors.gray, marginTop: 8 }}>No pending parts or tool requests.</Text>
          </View>
        ) : (
          <>
            {groups.map(renderGroup)}
            {toolRequests.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: '#7C3AED20' }]}>
                    <MaterialIcons name="build" size={18} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.cardTitle, { color: colors.dark }]}>Special Tool Requests</Text>
                    <Text style={[styles.cardSub, { color: colors.gray }]}>Review mechanic tool requests</Text>
                  </View>
                </View>
                {toolRequests.map((tool, index) => {
                  const submittingTool = submittingKey === `tool-${tool.workEntryDocEntry}-${tool.lineId}`;
                  return (
                    <View key={`${tool.toolCode}-${tool.lineId}-${index}`} style={[styles.partRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{tool.toolName}</Text>
                      <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                        {tool.toolCode ? `Tool Code: ${tool.toolCode}  ` : ''}Tool Line: {tool.lineId}
                      </Text>
                      <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                        Job Card #{tool.jobCardDocEntry || '-'}  Work Entry #{tool.workEntryDocEntry || '-'}
                      </Text>
                      {(tool.mechanicName || tool.mechanicCode) ? (
                        <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                          Requested by: {tool.mechanicName || '-'}{tool.mechanicCode ? ` (${tool.mechanicCode})` : ''}
                        </Text>
                      ) : null}
                      {tool.vehicle ? <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>Vehicle: {tool.vehicle}</Text> : null}
                      {(tool.requestedDate || tool.requestedTime) ? (
                        <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                          Requested: {tool.requestedDate ? parseODataDate(tool.requestedDate) : '-'}{tool.requestedTime ? ` ${tool.requestedTime}` : ''}
                        </Text>
                      ) : null}
                      {tool.requestRemarks ? <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>Remarks: {tool.requestRemarks}</Text> : null}
                      <View style={[styles.toolActionRow, { marginTop: 8 }]}>
                        <TouchableOpacity
                          style={[styles.approveToggle, { backgroundColor: tool.approved === true ? '#2B7D2B20' : '#F1F5F9' }]}
                          onPress={() => setToolApproval(index, true)}
                        >
                          <MaterialIcons name="check-circle" size={16} color={tool.approved === true ? '#2B7D2B' : colors.gray} />
                          <Text style={{ color: tool.approved === true ? '#2B7D2B' : colors.gray, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.approveToggle, { backgroundColor: tool.approved === false ? '#BB000020' : '#F1F5F9' }]}
                          onPress={() => setToolApproval(index, false)}
                        >
                          <MaterialIcons name="cancel" size={16} color={tool.approved === false ? '#BB0000' : colors.gray} />
                          <Text style={{ color: tool.approved === false ? '#BB0000' : colors.gray, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.toolSubmitButton, { backgroundColor: colors.primary }]}
                          onPress={() => handleToolSubmit(tool, index)}
                          disabled={submittingTool}
                        >
                          <Text style={styles.submitBtnText}>{submittingTool ? 'Submitting...' : 'Submit'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ModalSelector
        visible={Boolean(locationTarget)}
        onClose={() => setLocationTarget(null)}
        onSelect={selectBusLocation}
        title="Select Bus Location"
        data={BUS_LOCATIONS}
        loading={false}
        searchPlaceholder="Search locations..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
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
  toolActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolSubmitButton: { marginLeft: 'auto', borderRadius: BORDER_RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  choiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 92,
    justifyContent: 'center',
  },
  choiceChipSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  choiceChipUnselected: {
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
  },
  choiceRadio: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    marginRight: 6,
  },
  choiceRadioSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#7C3AED',
  },
  choiceChipText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  choiceChipTextSelected: {
    color: '#5B21B6',
  },
  partRowInputs: { flexDirection: 'row', marginTop: 8 },
  storeItemStatusRow: { marginTop: 8 },
  statusOptions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusOption: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    marginTop: 2,
  },
  locationPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
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
