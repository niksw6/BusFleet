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
 * PartsApprovalScreen — Supervisor/Store view of Mechanics' mid-work parts/tool requests.
 *
 * Uses the confirmed live endpoints:
 *   GET  GetMechanicPartRequests?CompanyDB=...
 *   POST ApproveMechanicPartRequest { CompanyDB, WorkEntryDocEntry, JobCardDocEntry, SupervisorCode, Parts:[{PartLine,ApprovedQty,Approved,StoreWarehouse,Remarks}] }
 *   GET  GetSpecialTools?CompanyDB=...&Depot=...
 *   POST ApproveSpecialToolRequest { CompanyDB, WorkEntryDocEntry, SupervisorCode, Tools:[{LineId,Approved,Remarks}] }
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
const getToolLineId = (item) => item?.LineId ?? item?.ToolLine ?? item?.Line ?? item?.LineNum ?? 0;

const groupByWorkEntry = (items) => {
  const map = new Map();
  items.forEach((item, index) => {
    const key = String(getWorkEntryDocEntry(item));
    if (!map.has(key)) {
      map.set(key, {
        workEntryDocEntry: getWorkEntryDocEntry(item),
        jobCardDocEntry: getJobCardDocEntry(item),
        mechanicName: item?.MechanicName || item?.UserName || item?.UserCode || '',
        mechanicCode: item?.MechanicCode || item?.UserCode || '',
        vehicle: item?.Vehicle || item?.VehicleNo || item?.RegNo || '',
        faultName: item?.Fault || item?.FaultName || '',
        parts: [],
      });
    }
    map.get(key).parts.push({
      partKey: `${getPartLine(item)}-${item?.ItemCode || ''}-${index}`,
      partLine: getPartLine(item),
      itemCode: item?.ItemCode || '',
      itemName: item?.ItemName || item?.ItemCode || 'Item',
      reqQty: item?.ReqQty ?? item?.Qty ?? 1,
      issuedQty: item?.IssuedQty ?? item?.IssueQty ?? 0,
      receivedQty: item?.ReceivedQty ?? 0,
      approvedQty: String(item?.ReqQty ?? item?.Qty ?? 1),
      approved: true,
      storeWarehouse: item?.Warehouse || '',
      storeItemStatus: String(item?.StoreItemStatus || 'Direct').trim() || 'Direct',
      remarks: '',
      status: String(item?.Status || 'RQ').trim().toUpperCase(),
      reqDate: parseODataDate(item?.ReqDate || item?.RequestDate || ''),
    });
  });
  return Array.from(map.values());
};

const extractToolItems = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.Data)) return res.Data;
  if (Array.isArray(res?.data)) return res.data;

  const data = res?.Data ?? res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const flattened = [];
  const nestedValues = Object.values(data).filter((value) => value && typeof value === 'object');
  nestedValues.forEach((value) => {
    if (Array.isArray(value)) {
      flattened.push(...value);
      return;
    }
    if (Array.isArray(value?.Tools) || Array.isArray(value?.SpecialTools) || Array.isArray(value?.ToolRequests)) {
      flattened.push(...(Array.isArray(value?.Tools) ? value.Tools : []));
      flattened.push(...(Array.isArray(value?.SpecialTools) ? value.SpecialTools : []));
      flattened.push(...(Array.isArray(value?.ToolRequests) ? value.ToolRequests : []));
      return;
    }
    flattened.push(value);
  });

  return flattened;
};

const groupToolsByWorkEntry = (items) => {
  const requestItems = items.filter(item => {
    const we = item?.WorkEntryDocEntry ?? item?.WorkEntryNo ?? item?.WorkEntry ?? item?.DocEntry;
    return we !== null && we !== undefined && String(we).trim() !== '';
  });

  const map = new Map();
  requestItems.forEach((item, index) => {
    const key = String(getWorkEntryDocEntry(item));
    if (!map.has(key)) {
      map.set(key, {
        workEntryDocEntry: getWorkEntryDocEntry(item),
        jobCardDocEntry: getJobCardDocEntry(item),
        mechanicName: item?.MechanicName || item?.UserName || item?.UserCode || '',
        mechanicCode: item?.MechanicCode || item?.UserCode || '',
        vehicle: item?.Vehicle || item?.VehicleNo || item?.RegNo || '',
        faultName: item?.Fault || item?.FaultName || '',
        tools: [],
      });
    }
    map.get(key).tools.push({
      toolKey: `${getToolLineId(item)}-${item?.ToolCode || item?.Code || ''}-${index}`,
      lineId: getToolLineId(item),
      toolCode: item?.ToolCode || item?.Code || '',
      toolName: item?.ToolName || item?.Name || item?.ToolCode || item?.Code || 'Tool',
      mechanicRemarks: item?.Remarks || item?.MechanicRemarks || '',
      reqDate: parseODataDate(item?.ReqDate || item?.RequestDate || ''),
      status: String(item?.Status || 'RQ').trim().toUpperCase(),
      remarks: '',
      approved: true,
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
  const [toolGroups, setToolGroups] = useState([]);
  const [submittingKey, setSubmittingKey] = useState(null);
  const [submittingToolKey, setSubmittingToolKey] = useState(null);
  const [activeSection, setActiveSection] = useState(initialSection === 'tools' ? 'tools' : 'parts');

  useEffect(() => {
    setActiveSection(initialSection === 'tools' ? 'tools' : 'parts');
  }, [initialSection]);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      if (activeSection === 'tools') {
        const toolResult = await storeService.getMechanicToolRequests(companyDb);
        if (isApiSuccess(toolResult)) {
          const toolRows = extractToolItems(toolResult);
          setToolGroups(groupToolsByWorkEntry(toolRows));
        } else {
          setToolGroups([]);
        }
        setGroups([]);
      } else {
        const partResult = await storeService.getMechanicPartRequests(companyDb);
        if (isApiSuccess(partResult)) {
          const partRows = extractItems(partResult);
          setGroups(groupByWorkEntry(partRows));
        } else {
          setGroups([]);
        }
        setToolGroups([]);
      }
    } catch (error) {
      const message = activeSection === 'tools'
        ? (error?.message || 'Failed to load special tool requests')
        : (error?.message || 'Failed to load parts requests');
      console.error(`❌ Error loading ${activeSection === 'tools' ? 'special tool' : 'parts'} requests:`, error);
      Toast.show({ type: 'error', text1: 'Error', text2: message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSection, dbName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const updatePartField = (groupKey, partKey, field, value) => {
    setGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        parts: g.parts.map(p => (p.partKey === partKey ? { ...p, [field]: value } : p)),
      };
    }));
  };

  const setPartApproval = (groupKey, partKey, approved) => {
    setGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        parts: g.parts.map(p => (p.partKey === partKey ? { ...p, approved } : p)),
      };
    }));
  };

  const updateToolField = (groupKey, toolKey, field, value) => {
    setToolGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        tools: g.tools.map(t => (t.toolKey === toolKey ? { ...t, [field]: value } : t)),
      };
    }));
  };

  const setToolApproval = (groupKey, toolKey, approved) => {
    setToolGroups(prev => prev.map(g => {
      if (String(g.workEntryDocEntry) !== groupKey) return g;
      return {
        ...g,
        tools: g.tools.map(t => (t.toolKey === toolKey ? { ...t, approved } : t)),
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
          StoreItemStatus: p.storeItemStatus || 'Direct',
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
              Parts Request • Work Entry #{group.workEntryDocEntry}
            </Text>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              {group.mechanicName ? `${group.mechanicName}` : ''}
              {group.vehicle ? ` • Vehicle: ${group.vehicle}` : ''}
              {group.jobCardDocEntry ? ` • JC #${group.jobCardDocEntry}` : ''}
            </Text>
          </View>
        </View>

        {group.parts.map((p) => {
          const statusInfo = PART_STATUS_LABELS[p.status] || { label: p.status, color: '#666' };
          return (
            <View key={p.partKey} style={[styles.partRow, { borderColor: colors.border || '#E0E0E0' }]}>
              <View style={styles.partRowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.itemName}</Text>
                  {p.itemCode ? <Text style={{ color: colors.gray, fontSize: 11 }}>{p.itemCode}</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}18`, borderColor: `${statusInfo.color}40` }]}>
                  <Text style={{ color: statusInfo.color, fontSize: 11, fontWeight: '700' }}>{statusInfo.label}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                <Text style={{ color: colors.gray, fontSize: 12 }}>Requested: {p.reqQty}</Text>
                {p.reqDate ? <Text style={{ color: colors.gray, fontSize: 12 }}>Date: {p.reqDate}</Text> : null}
                {Number(p.issuedQty) > 0 && <Text style={{ color: colors.gray, fontSize: 12 }}>Issued: {p.issuedQty}</Text>}
                {Number(p.receivedQty) > 0 && <Text style={{ color: colors.gray, fontSize: 12 }}>Received: {p.receivedQty}</Text>}
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: p.approved ? '#2B7D2B20' : '#F1F5F9' }]}
                  onPress={() => setPartApproval(groupKey, p.partKey, true)}
                >
                  <MaterialIcons name="check-circle" size={16} color="#2B7D2B" />
                  <Text style={{ color: '#2B7D2B', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                    {p.approved ? 'Approved' : 'Approve'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: !p.approved ? '#BB000020' : '#F1F5F9' }]}
                  onPress={() => setPartApproval(groupKey, p.partKey, false)}
                >
                  <MaterialIcons name="cancel" size={16} color="#BB0000" />
                  <Text style={{ color: '#BB0000', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Reject</Text>
                </TouchableOpacity>
              </View>

              {p.approved && (
                <>
                  <View style={styles.partRowInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.gray, fontSize: 11 }}>Approved Qty</Text>
                      <RNTextInput
                        value={p.approvedQty}
                        onChangeText={(v) => updatePartField(groupKey, p.partKey, 'approvedQty', v)}
                        keyboardType="numeric"
                        style={[styles.smallInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                    </View>
                    <View style={{ flex: 1.4, marginLeft: 8 }}>
                      <Text style={{ color: colors.gray, fontSize: 11 }}>Warehouse</Text>
                      <RNTextInput
                        value={p.storeWarehouse}
                        onChangeText={(v) => updatePartField(groupKey, p.partKey, 'storeWarehouse', v)}
                        placeholder="e.g. WH01"
                        placeholderTextColor={colors.gray}
                        style={[styles.smallInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                    </View>
                  </View>

                  <View style={styles.radioRow}>
                    <Text style={{ color: colors.gray, fontSize: 11, marginRight: 8 }}>Issue Mode</Text>
                    {['Direct', 'Interim'].map((mode) => {
                      const selected = String(p.storeItemStatus || 'Direct').toLowerCase() === mode.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={`${p.partKey}-${mode}`}
                          style={styles.radioOption}
                          onPress={() => updatePartField(groupKey, p.partKey, 'storeItemStatus', mode)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.radioOuter, selected && { borderColor: colors.primary }]}>
                            {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                          </View>
                          <Text style={{ color: colors.dark, fontSize: 12 }}>{mode}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          );
        })}

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

  const handleSubmitTools = async (group) => {
    const groupKey = String(group.workEntryDocEntry);
    try {
      setSubmittingToolKey(groupKey);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.approveSpecialToolRequest({
        CompanyDB: companyDb,
        WorkEntryDocEntry: group.workEntryDocEntry,
        SupervisorCode: userCode,
        Tools: group.tools.map((t) => ({
          LineId: Number(t.lineId) || 0,
          Approved: t.approved,
          Remarks: t.remarks || '',
        })),
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Special tool request processed' });
        setToolGroups(prev => prev.filter(g => String(g.workEntryDocEntry) !== groupKey));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not process request' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to process request' });
    } finally {
      setSubmittingToolKey(null);
    }
  };

  const renderToolGroup = (group) => {
    const groupKey = String(group.workEntryDocEntry);
    const isSubmitting = submittingToolKey === groupKey;
    return (
      <View key={`tool-${groupKey}`} style={[styles.card, { backgroundColor: colors.white, borderColor: '#7C3AED30' }]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: '#7C3AED20' }]}>
            <MaterialIcons name="handyman" size={18} color="#7C3AED" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.cardTitle, { color: '#7C3AED' }]}>
              Special Tools • Work Entry #{group.workEntryDocEntry}
            </Text>
            <Text style={[styles.cardSub, { color: '#7C3AED99' }]}>
              {group.mechanicName ? `${group.mechanicName}` : ''}
              {group.vehicle ? ` • Vehicle: ${group.vehicle}` : ''}
              {group.jobCardDocEntry ? ` • JC #${group.jobCardDocEntry}` : ''}
            </Text>
          </View>
        </View>

        {group.tools.map((tool) => {
          const statusInfo = PART_STATUS_LABELS[tool.status] || { label: tool.status || 'Requested', color: '#D97706' };
          return (
            <View key={tool.toolKey} style={[styles.partRow, { borderColor: '#7C3AED20' }]}>
              <View style={styles.partRowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#5B21B6', fontWeight: '600', fontSize: 13 }}>
                    {tool.toolName}{tool.toolCode ? ` (${tool.toolCode})` : ''}
                  </Text>
                  {tool.reqDate ? <Text style={{ color: '#7C3AED99', fontSize: 11 }}>Requested: {tool.reqDate}</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusInfo.color}18`, borderColor: `${statusInfo.color}40` }]}>
                  <Text style={{ color: statusInfo.color, fontSize: 11, fontWeight: '700' }}>{statusInfo.label}</Text>
                </View>
              </View>

              {tool.mechanicRemarks ? (
                <Text style={{ color: '#7C3AED99', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                  Mechanic note: {tool.mechanicRemarks}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: tool.approved ? '#2B7D2B20' : '#F1F5F9' }]}
                  onPress={() => setToolApproval(groupKey, tool.toolKey, true)}
                >
                  <MaterialIcons name="check-circle" size={16} color="#2B7D2B" />
                  <Text style={{ color: '#2B7D2B', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                    {tool.approved ? 'Approved' : 'Approve'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveToggle, { backgroundColor: !tool.approved ? '#BB000020' : '#F1F5F9' }]}
                  onPress={() => setToolApproval(groupKey, tool.toolKey, false)}
                >
                  <MaterialIcons name="cancel" size={16} color="#BB0000" />
                  <Text style={{ color: '#BB0000', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Reject</Text>
                </TouchableOpacity>
              </View>

              <RNTextInput
                value={tool.remarks}
                onChangeText={(v) => updateToolField(groupKey, tool.toolKey, 'remarks', v)}
                placeholder="Supervisor remarks (optional)"
                placeholderTextColor="#7C3AED80"
                style={[styles.smallInput, { color: '#5B21B6', borderColor: '#7C3AED40', marginTop: 8 }]}
              />
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: '#7C3AED' }]}
          onPress={() => handleSubmitTools(group)}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          <MaterialIcons name="send" size={16} color="#FFF" />
          <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting…' : 'Submit Tool Decision'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <Loader visible />;
  }

  const isToolSection = activeSection === 'tools';
  const headerTitle = isToolSection ? 'Special Tool Requests' : 'Parts & Tools Requests';
  const headerSubtitle = isToolSection
    ? 'Review and approve mechanics\' special tool requests'
    : 'Review and approve mechanics\' mid-work parts requests';
  const emptyIcon = isToolSection ? 'handyman' : 'inventory';
  const emptyText = isToolSection ? 'No pending special tool requests.' : 'No pending parts requests.';
  const sectionColor = isToolSection ? '#7C3AED' : colors.primary;
  const sectionIcon = isToolSection ? 'handyman' : 'inventory';
  const sectionLabel = isToolSection ? 'Special Tool Requests' : 'Parts Requests';

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={true}
        useGradient={false}
      />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {isToolSection ? (
          toolGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name={emptyIcon} size={48} color={colors.gray} />
              <Text style={{ color: colors.gray, marginTop: 8 }}>{emptyText}</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeaderRow}>
                <MaterialIcons name={sectionIcon} size={16} color={sectionColor} />
                <Text style={[styles.sectionHeaderText, { color: sectionColor }]}>{sectionLabel} ({toolGroups.length})</Text>
              </View>
              {toolGroups.map(renderToolGroup)}
            </>
          )
        ) : (
          groups.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name={emptyIcon} size={48} color={colors.gray} />
              <Text style={{ color: colors.gray, marginTop: 8 }}>{emptyText}</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeaderRow}>
                <MaterialIcons name={sectionIcon} size={16} color={sectionColor} />
                <Text style={[styles.sectionHeaderText, { color: sectionColor }]}>{sectionLabel} ({groups.length})</Text>
              </View>
              {groups.map(renderGroup)}
            </>
          )
        )}
      </ScrollView>
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
  radioRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  radioOption: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#A0A0A0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
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
