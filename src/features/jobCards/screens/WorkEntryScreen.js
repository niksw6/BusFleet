/**
 * WorkEntryScreen
 *
 * Mechanic-facing screen to:
 *  1. Add work entries (from Work List dropdown or manual "Other")
 *  2. Request parts per work entry
 *  3. See part request statuses (Pending → Approved → Issued by Store → Received)
 *  4. Mark parts as received after store issues them
 *  5. Click "Complete Work" to notify Supervisor for inspection
 *
 * Route params: { workOrderDocEntry, dbName, jobCardNo }
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  RefreshControl,
  TextInput as RNTextInput,
  Alert,
} from 'react-native';
import { Text, Button, Chip, TextInput, Divider, ActivityIndicator } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import ModalSelector from '../../../shared/components/ModalSelector';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { mechanicService, masterService, storeService } from '../../../api/services';
import {
  setWorkEntries,
  addWorkEntry as addWorkEntryAction,
  setPartsRequests,
  addPartRequest,
  updatePartRequestStatus,
} from '../../../store/slices/workEntrySlice';
import { PART_REQUEST_STATUS } from '../../../constants/config';
import { formatDateTime } from '../../../utils/helpers';

const isApiSuccess = (res) => res?.Success === true || res?.Status === true;

const extractApiRows = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.Data)) return res.Data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.Data?.Parts)) return res.Data.Parts;
  return [];
};

const normalizeApprovedItems = (rows = [], jobCardDocEntry) => {
  const list = Array.isArray(rows) ? rows : [];
  const target = String(jobCardDocEntry || '').trim();

  return list
    .map((item) => ({
      JobCardDocEntry: item?.JobCardDocEntry ?? item?.JCDocEnt ?? item?.DocEntry ?? '',
      WorkEntryDocEntry: item?.WorkEntryDocEntry ?? item?.WorkEntryDocEntryNo ?? item?.WorkEntry ?? '',
      PartLine: Number(item?.PartLine ?? item?.Line ?? item?.LineNum ?? 0) || 0,
      ItemCode: String(item?.ItemCode || '').trim(),
      ItemName: String(item?.ItemName || item?.Dscription || item?.ItemCode || '').trim(),
      ReqQty: Number(item?.ReqQty ?? item?.Qty ?? 0) || 0,
      ApprovedQty: Number(item?.ApprovedQty ?? 0) || 0,
      IssuedQty: Number(item?.IssuedQty ?? item?.IssueQty ?? 0) || 0,
      ReceivedQty: Number(item?.ReceivedQty ?? 0) || 0,
      Warehouse: String(item?.Warehouse || item?.StoreWarehouse || '').trim(),
      Status: String(item?.Status || '').trim().toUpperCase(),
    }))
    .filter((item) => {
      if (!target) return true;
      return String(item.JobCardDocEntry).trim() === target;
    });
};

const groupPartRequestsByWorkEntry = (rawItems = [], jobCardDocEntry) => {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const target = String(jobCardDocEntry || '').trim();
  const filtered = target
    ? list.filter((item) => String(item?.JobCardDocEntry ?? item?.JCDocEnt ?? '').trim() === target)
    : list;

  const grouped = new Map();
  filtered.forEach((item, idx) => {
    const workEntryKey = String(item?.WorkEntryDocEntry ?? item?.WorkEntry ?? `UNKNOWN-${idx}`);
    const existing = grouped.get(workEntryKey) || {
      RequestCode: workEntryKey,
      WorkEntryDocEntry: item?.WorkEntryDocEntry ?? null,
      JobCardDocEntry: item?.JobCardDocEntry ?? jobCardDocEntry,
      RequestedBy: item?.MechanicName || item?.MechanicCode || item?.UserCode || '',
      Status: item?.Status || 'P',
      Parts: [],
    };

    existing.Status = item?.Status || existing.Status;
    existing.Parts.push({
      PartLine: Number(item?.PartLine ?? item?.LineId ?? existing.Parts.length) || 0,
      ItemCode: item?.ItemCode || '',
      ItemName: item?.ItemName || item?.Dscription || '',
      ReqQty: Number(item?.ReqQty ?? item?.Qty ?? 0) || 0,
      ApprovedQty: Number(item?.ApprovedQty ?? 0) || 0,
      IssuedQty: Number(item?.IssuedQty ?? item?.IssueQty ?? 0) || 0,
      ReceivedQty: Number(item?.ReceivedQty ?? 0) || 0,
      Warehouse: item?.Warehouse || item?.StoreWarehouse || '',
      Status: String(item?.Status || existing.Status || '').trim().toUpperCase(),
      Remarks: item?.Remarks || '',
    });
    grouped.set(workEntryKey, existing);
  });

  return Array.from(grouped.values());
};

const WorkEntryScreen = ({ route, navigation }) => {
  const { workOrderDocEntry, dbName: routeDbName, jobCardNo, jobCardDocEntry, faultLine: routeFaultLine = 0 } = route.params || {};
  const dispatch = useDispatch();

  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const storeEntries = useSelector(state => state.workEntry.workEntries[String(workOrderDocEntry)] || []);
  const storePartsRequests = useSelector(state => state.workEntry.partsRequests[String(workOrderDocEntry)] || []);

  const mechanicCode = user?.Code || user?.code || user?.User || '';
  const mechanicName = user?.FirstName || user?.Name || user?.name || '';

  // ─── Local state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workList, setWorkList] = useState([]);

  // Work Entry Form
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showWorkListModal, setShowWorkListModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState(null);   // { Code, Name }
  const [customDescription, setCustomDescription] = useState('');
  const [entryRemarks, setEntryRemarks] = useState('');

  // Parts Form (per work entry)
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showSparePartsSelector, setShowSparePartsSelector] = useState(false);
  const [pendingEntryCode, setPendingEntryCode] = useState(null);
  const [spareParts, setSpareParts] = useState([]);
  const [partsDraft, setPartsDraft] = useState([]);

  // Inline parts added directly on the work entry (recorded alongside work done)
  const [entryParts, setEntryParts] = useState([]);
  const [showEntryPartsSelector, setShowEntryPartsSelector] = useState(false);

  // Issued Items (from SAP Store)
  const [issuedItems, setIssuedItems] = useState([]);

  // Complete Work confirmation
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeRemarks, setCompleteRemarks] = useState('');

  const resolvedJobCardDocEntry = Number(jobCardDocEntry || workOrderDocEntry) || workOrderDocEntry;

  // ─── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [workListRes, sparePartsRes, approvedRes, requestsRes] = await Promise.all([
        masterService.getWorkList(dbName || 'MUTSPL_TEST'),
        masterService.getSpareParts(dbName || 'MUTSPL_TEST'),
        storeService.getApprovedJobCardParts(companyDb, mechanicCode),
        storeService.getMechanicPartRequests(companyDb),
      ]);

      if (isApiSuccess(workListRes)) {
        setWorkList(extractApiRows(workListRes));
      }
      if (isApiSuccess(sparePartsRes)) {
        setSpareParts(extractApiRows(sparePartsRes));
      }
      if (isApiSuccess(approvedRes)) {
        const approvedRows = extractApiRows(approvedRes);
        setIssuedItems(normalizeApprovedItems(approvedRows, resolvedJobCardDocEntry));
      }
      if (isApiSuccess(requestsRes)) {
        const requestRows = extractApiRows(requestsRes);
        const groupedRequests = groupPartRequestsByWorkEntry(requestRows, resolvedJobCardDocEntry);
        dispatch(setPartsRequests({ docEntry: workOrderDocEntry, requests: groupedRequests }));
      }
    } catch (err) {
      console.error('WorkEntryScreen loadData error:', err);
      Toast.show({ type: 'error', text1: 'Failed to load work data', text2: err?.message || 'Backend request failed' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, workOrderDocEntry, dispatch, mechanicCode, resolvedJobCardDocEntry]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const resolveWorkDescription = () => {
    if (!selectedWork) return '';
    if (selectedWork.Code === 'OTHER') return customDescription.trim();
    return selectedWork.Name || '';
  };

  const resetEntryForm = () => {
    setSelectedWork(null);
    setCustomDescription('');
    setEntryRemarks('');
    setEntryParts([]);
    setShowAddEntry(false);
  };

  // ─── Submit work entry ────────────────────────────────────────────────────────
  const handleAddWorkEntry = async () => {
    const description = resolveWorkDescription();
    if (!description) {
      Toast.show({ type: 'error', text1: 'Please select or enter a work description' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        FaultLine: Number(routeFaultLine) || 0,
        UserCode: mechanicCode,
        FinalRemarks: entryRemarks,
        Details: [
          {
            WorkCode: selectedWork?.Code || 'OTHER',
            WorkDone: selectedWork?.Code === 'OTHER' ? description : (selectedWork?.Name || description),
            OtherDescription: selectedWork?.Code === 'OTHER' ? description : '',
            Remarks: entryRemarks || '',
          },
        ],
        Parts: entryParts.map((p) => ({
          ItemCode: p.ItemCode || p.Code || '',
          ItemName: p.ItemName || p.Name || '',
          ReqQty: parseFloat(p.Qty) || 1,
          Warehouse: p.Warehouse || '',
          Remarks: p.Remarks || '',
        })),
      };

      const res = await mechanicService.createWorkEntry(payload);
      if (res?.Success) {
        dispatch(addWorkEntryAction({ docEntry: workOrderDocEntry, entry: res.Data || payload }));
        Toast.show({ type: 'success', text1: 'Work entry added' });
        resetEntryForm();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to add work entry' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Submit parts request ─────────────────────────────────────────────────────
  const handleRequestParts = async () => {
    if (partsDraft.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one part' });
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(pendingEntryCode) || pendingEntryCode,
        UserCode: mechanicCode,
        Parts: partsDraft.map(p => ({
          ItemCode: p.ItemCode || p.Code,
          ItemName: p.ItemName || p.Name || '',
          ReqQty: parseFloat(p.ReqQty) || 1,
          Warehouse: String(p.Warehouse || '').trim(),
          Remarks: p.Remarks || '',
        })),
      };

      const res = await storeService.requestWorkEntryParts(payload);
      if (res?.Success) {
        dispatch(addPartRequest({ docEntry: workOrderDocEntry, request: res.Data || payload }));
        Toast.show({ type: 'success', text1: 'Parts requested — awaiting supervisor approval' });
        setPartsDraft([]);
        setShowPartsModal(false);
        setPendingEntryCode(null);
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to request parts' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Mark part received ───────────────────────────────────────────────────────
  const handleMarkReceived = async (request) => {
    try {
      const res = await storeService.receiveJobCardParts({
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(resolvedJobCardDocEntry) || resolvedJobCardDocEntry,
        UserCode: mechanicCode,
        Parts: (request?.Parts || []).map((part) => ({
          PartLine: Number(part?.PartLine) || 0,
          ReceivedQty: Number(part?.IssuedQty ?? part?.ApprovedQty ?? part?.ReqQty ?? 0) || 0,
        })),
      });
      if (res?.Success) {
        const requestCode = request?.RequestCode || request?.WorkEntryDocEntry || '';
        dispatch(updatePartRequestStatus({ docEntry: workOrderDocEntry, requestCode, status: 'R' }));
        Toast.show({ type: 'success', text1: 'Part marked as received' });
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    }
  };

  // ─── Complete work ─────────────────────────────────────────────────────────────
  const handleCompleteWork = async () => {
    try {
      setSubmitting(true);
      setShowCompleteConfirm(false);
      const latestEntry = storeEntries[storeEntries.length - 1];
      const workEntryDocEntry = latestEntry?.WorkEntryDocEntry || latestEntry?.DocEntry || latestEntry?.Code;
      if (!workEntryDocEntry) {
        throw new Error('No work entry found. Create and save a work entry first.');
      }
      const res = await mechanicService.completeWork({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || workEntryDocEntry,
        UserCode: mechanicCode,
        FinalRemarks: completeRemarks || '',
      });
      if (res?.Success) {
        Toast.show({
          type: 'success',
          text1: 'Work completed!',
          text2: 'Supervisor has been notified to inspect and close the incident.',
          visibilityTime: 5000,
        });
        navigation.goBack();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to complete work' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Part status badge ────────────────────────────────────────────────────────
  const getPartStatusConfig = (status) => {
    switch (String(status || '').toUpperCase()) {
      case 'A': return { label: 'Approved', color: '#2B7D2B', bg: '#2B7D2B15' };
      case 'I': return { label: 'Issued by Store', color: '#0070F2', bg: '#0070F215' };
      case 'R': return { label: 'Received', color: '#388E3C', bg: '#388E3C15' };
      case 'X': return { label: 'Rejected', color: '#BB0000', bg: '#BB000015' };
      default:  return { label: 'Pending Approval', color: '#FF8F00', bg: '#FF8F0015' };
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return <Loader />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />
        }
      >
        {/* Header Card */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.cardTitle, { color: colors.dark }]}>
            Work Entry
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.gray }]}>
            WO #{workOrderDocEntry}{jobCardNo ? `  ·  JC #${jobCardNo}` : ''}
          </Text>
        </View>

        {/* ── Work Entries ── */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="assignment" size={18} color="#0070F2" />
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Entries</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#0070F2' }]}
              onPress={() => setShowAddEntry(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="add" size={16} color="#FFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {storeEntries.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.gray }]}>No work entries yet. Tap Add to begin.</Text>
          ) : (
            storeEntries.map((entry, i) => (
              <View key={i} style={[styles.entryRow, { borderColor: colors.border || '#E0E0E0' }]}>
                <View style={styles.entryLeft}>
                  <MaterialIcons name="build" size={16} color="#0070F2" />
                  <View style={styles.entryText}>
                    <Text style={[styles.entryDesc, { color: colors.dark }]}>
                      {entry.Description || entry.WorkListName || '—'}
                    </Text>
                    {entry.Remarks ? (
                      <Text style={[styles.entryRemarks, { color: colors.gray }]}>{entry.Remarks}</Text>
                    ) : null}
                    {entry.EntryDate ? (
                      <Text style={[styles.entryDate, { color: colors.gray }]}>
                        {formatDateTime(entry.EntryDate)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.partsBtn, { borderColor: '#2B7D2B' }]}
                  onPress={() => {
                    setPendingEntryCode(entry.Code || entry.DocEntry || String(i));
                    setPartsDraft([]);
                    setShowPartsModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="settings" size={13} color="#2B7D2B" />
                  <Text style={[styles.partsBtnText, { color: '#2B7D2B' }]}>Parts</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Parts Requests ── */}
        {storePartsRequests.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="inventory" size={18} color="#2B7D2B" />
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Requests</Text>
            </View>

            {storePartsRequests.map((req, i) => {
              const cfg = getPartStatusConfig(req.Status);
              const isIssued = String(req.Status || '').toUpperCase() === 'I';
              const isReceived = String(req.Status || '').toUpperCase() === 'R';
              const requestCode = req.RequestCode || req.Code || String(i);

              return (
                <View key={i} style={[styles.partReqRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={styles.partReqTop}>
                    <Text style={[styles.partReqTitle, { color: colors.dark }]}>
                      Request #{requestCode}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {Array.isArray(req.Parts) && req.Parts.map((p, pi) => (
                    <Text key={pi} style={[styles.partItem, { color: colors.gray }]}>
                      • {p.ItemName || p.ItemCode}  Req:{p.ReqQty}
                      {Number(p.ApprovedQty || 0) > 0 ? `  App:${p.ApprovedQty}` : ''}
                      {Number(p.IssuedQty || 0) > 0 ? `  Iss:${p.IssuedQty}` : ''}
                      {Number(p.ReceivedQty || 0) > 0 ? `  Rec:${p.ReceivedQty}` : ''}
                    </Text>
                  ))}

                  {isIssued && !isReceived && (
                    <TouchableOpacity
                      style={[styles.receiveBtn, { backgroundColor: '#0070F2' }]}
                      onPress={() => handleMarkReceived(req)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="check-circle" size={16} color="#FFF" />
                      <Text style={styles.receiveBtnText}>Part Received</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Issued Items from Store ── */}
        {issuedItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="inventory" size={18} color="#7B3FE4" />
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Issued Items (from Store)</Text>
            </View>
            <Text style={[styles.completeHint, { color: colors.gray, marginBottom: 8 }]}>
              These parts have been approved and issued by the SAP Store for this job card.
            </Text>

            {issuedItems.map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.issuedItemRow,
                  { borderColor: colors.border || '#E0E0E0', backgroundColor: '#F9F4FF' },
                ]}
              >
                <View style={styles.issuedItemLeft}>
                  <MaterialIcons name="package" size={16} color="#7B3FE4" />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.entryDesc, { color: colors.dark }]}>
                      {item.ItemName || item.ItemCode}
                    </Text>
                    <Text style={[styles.entryRemarks, { color: colors.gray }]}>
                      Code: {item.ItemCode}  ·  Req: {item.ReqQty}
                      {item.ApprovedQty > 0 ? `  ·  App: ${item.ApprovedQty}` : ''}
                      {item.IssuedQty > 0 ? `  ·  Iss: ${item.IssuedQty}` : ''}
                      {item.ReceivedQty > 0 ? `  ·  Rec: ${item.ReceivedQty}` : ''}
                      {item.Warehouse ? `  ·  WH: ${item.Warehouse}` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.addToFaultBtn, { borderColor: '#7B3FE4' }]}
                  onPress={() =>
                    Alert.alert(
                      'Add to Fault',
                      `Assign "${item.ItemName || item.ItemCode}" (Qty: ${item.IssuedQty}) to a fault?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Confirm',
                          onPress: () =>
                            Toast.show({
                              type: 'success',
                              text1: 'Item assigned',
                              text2: `${item.ItemName || item.ItemCode} added to fault record.`,
                            }),
                        },
                      ]
                    )
                  }
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add-link" size={14} color="#7B3FE4" />
                  <Text style={[styles.addToFaultBtnText, { color: '#7B3FE4' }]}>Add to Fault</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Complete Work ── */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Finish Work</Text>
          <Text style={[styles.completeHint, { color: colors.gray }]}>
            Once all work entries are complete, click below. Supervisor will be notified to inspect and close the incident.
          </Text>
          <TextInput
            label="Completion Remarks (optional)"
            mode="outlined"
            value={completeRemarks}
            onChangeText={setCompleteRemarks}
            multiline
            numberOfLines={3}
            style={styles.remarksInput}
          />
          <Button
            mode="contained"
            onPress={() => setShowCompleteConfirm(true)}
            icon="check-circle"
            style={[styles.completeBtn, { backgroundColor: '#2B7D2B' }]}
            contentStyle={{ paddingVertical: 6 }}
          >
            Complete Work
          </Button>
        </View>
      </ScrollView>

      {/* ── Add Work Entry Modal ── */}
      <Modal visible={showAddEntry} animationType="slide" transparent onRequestClose={resetEntryForm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
            <Text style={[styles.modalTitle, { color: colors.dark }]}>Add Work Entry</Text>

            {/* Work List Selector */}
            <TouchableOpacity
              style={[styles.selectorBtn, { borderColor: colors.border || '#CCC' }]}
              onPress={() => setShowWorkListModal(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectorBtnText, { color: selectedWork ? colors.dark : colors.gray }]}>
                {selectedWork ? selectedWork.Name : 'Select Work from List *'}
              </Text>
              <MaterialIcons name="expand-more" size={20} color={colors.gray} />
            </TouchableOpacity>

            {/* Manual description when "Other" selected */}
            {selectedWork?.Code === 'OTHER' && (
              <TextInput
                label="Description *"
                mode="outlined"
                value={customDescription}
                onChangeText={setCustomDescription}
                style={styles.modalInput}
                placeholder="Describe the work done"
              />
            )}

            <TextInput
              label="Remarks"
              mode="outlined"
              value={entryRemarks}
              onChangeText={setEntryRemarks}
              multiline
              numberOfLines={2}
              style={styles.modalInput}
            />

            {/* ── Parts used in this work entry ── */}
            <View style={{ marginTop: 8, marginBottom: 4 }}>
              <Text style={[styles.partsSectionLabel, { color: colors.dark }]}>Parts Used</Text>

              {entryParts.map((p, i) => (
                <View key={i} style={[styles.partDraftRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partName, { color: colors.dark }]}>
                      {p.ItemName || p.Name || p.ItemCode}
                    </Text>
                    <Text style={{ color: colors.gray, fontSize: 11 }}>{p.ItemCode}</Text>
                  </View>
                  <RNTextInput
                    value={String(p.Qty)}
                    onChangeText={(v) => {
                      const updated = [...entryParts];
                      updated[i] = { ...updated[i], Qty: v };
                      setEntryParts(updated);
                    }}
                    keyboardType="numeric"
                    style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                  <Text style={{ color: colors.gray, fontSize: 11, marginHorizontal: 4 }}>{p.UoM || 'Nos'}</Text>
                  <TouchableOpacity onPress={() => setEntryParts(entryParts.filter((_, j) => j !== i))}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addPartBtn, { borderColor: '#0070F2' }]}
                onPress={() => setShowEntryPartsSelector(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={16} color="#0070F2" />
                <Text style={[styles.addPartBtnText, { color: '#0070F2' }]}>Add Part</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={resetEntryForm} style={{ flex: 1, marginRight: 8 }}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleAddWorkEntry}
                loading={submitting}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                Add Entry
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Entry Parts Selector ── */}
      <ModalSelector
        visible={showEntryPartsSelector}
        onClose={() => setShowEntryPartsSelector(false)}
        onSelect={(value, item) => {
          const already = entryParts.find(p => (p.ItemCode || p.Code) === (item.ItemCode || item.Code));
          if (!already) {
            setEntryParts(prev => [...prev, { ...item, Qty: '1' }]);
          }
          setShowEntryPartsSelector(false);
        }}
        title="Select Part"
        data={spareParts}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>{item.ItemName || item.Name}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{item.ItemCode}</Text>
          </View>
        )}
      />

      {/* ── Parts Request Modal ── */}
      <Modal visible={showPartsModal} animationType="slide" transparent onRequestClose={() => setShowPartsModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalSheet, { backgroundColor: colors.white }]}>
              <Text style={[styles.modalTitle, { color: colors.dark }]}>Request Parts</Text>

              {/* Added parts draft */}
              {partsDraft.map((p, i) => (
                <View key={i} style={[styles.partDraftRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partName, { color: colors.dark }]}>
                      {p.ItemName || p.Name || p.ItemCode}
                    </Text>
                    <Text style={[{ color: colors.gray, fontSize: 11 }]}>{p.ItemCode}</Text>
                  </View>
                  <RNTextInput
                    value={String(p.ReqQty)}
                    onChangeText={(v) => {
                      const updated = [...partsDraft];
                      updated[i] = { ...updated[i], ReqQty: v };
                      setPartsDraft(updated);
                    }}
                    keyboardType="numeric"
                    style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                  />
                  <Text style={[{ color: colors.gray, fontSize: 11, marginHorizontal: 4 }]}>Qty</Text>
                  <TouchableOpacity onPress={() => setPartsDraft(partsDraft.filter((_, j) => j !== i))}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addPartBtn, { borderColor: '#2B7D2B' }]}
                onPress={() => setShowSparePartsSelector(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={16} color="#2B7D2B" />
                <Text style={[styles.addPartBtnText, { color: '#2B7D2B' }]}>Add Part</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => { setShowPartsModal(false); setPartsDraft([]); }} style={{ flex: 1, marginRight: 8 }}>
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleRequestParts}
                  loading={submitting}
                  disabled={submitting || partsDraft.length === 0}
                  style={{ flex: 1 }}
                >
                  Request ({partsDraft.length})
                </Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Work List Selector */}
      <ModalSelector
        visible={showWorkListModal}
        onClose={() => setShowWorkListModal(false)}
        onSelect={(value, item) => {
          setSelectedWork(item);
          if (item.Code !== 'OTHER') setCustomDescription('');
          setShowWorkListModal(false);
        }}
        title="Select Work"
        data={workList}
        loading={false}
        searchPlaceholder="Search work list..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
        renderItem={(item) => (
          <Text style={{ fontSize: 15, color: '#000' }}>{item.Name}</Text>
        )}
      />

      {/* Spare Parts Selector */}
      <ModalSelector
        visible={showSparePartsSelector}
        onClose={() => setShowSparePartsSelector(false)}
        onSelect={(value, item) => {
          const key = item.ItemCode || item.Code;
          const alreadyAdded = partsDraft.some(p => (p.ItemCode || p.Code) === key);
          if (!alreadyAdded) {
            setPartsDraft(prev => [
              ...prev,
              {
                ItemCode: item.ItemCode || item.Code || '',
                ItemName: item.ItemName || item.Name || item.Dscription || '',
                ReqQty: '1',
                Warehouse: '',
                Remarks: '',
              },
            ]);
          }
          setShowSparePartsSelector(false);
        }}
        title="Select Part"
        data={spareParts}
        loading={false}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode', 'Code', 'Name', 'Dscription']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.ItemName || item.Name || item.Dscription}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>
              {item.ItemCode || item.Code}
              {item.UoM || item.InvntryUom ? ` · ${item.UoM || item.InvntryUom}` : ''}
            </Text>
          </View>
        )}
      />

      {/* Complete Work confirmation */}
      <ConfirmationModal
        visible={showCompleteConfirm}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={handleCompleteWork}
        title="Complete Work?"
        message="This will notify the Supervisor to inspect the work and close the incident. You cannot add more work entries after this."
      />

      <Loader visible={submitting} text="Processing..." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.md },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginLeft: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginLeft: 3 },
  emptyText: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.sm },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  entryLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  entryText: { flex: 1, marginLeft: 8 },
  entryDesc: { fontSize: 14, fontWeight: '600' },
  entryRemarks: { fontSize: 12, marginTop: 2 },
  entryDate: { fontSize: 11, marginTop: 2 },
  partsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    flexShrink: 0,
  },
  partsBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 3 },
  partReqRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  partReqTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  partReqTitle: { fontSize: 13, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  partItem: { fontSize: 12, marginTop: 2 },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  receiveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 6 },
  completeHint: { fontSize: 13, marginBottom: SPACING.sm, lineHeight: 18 },
  remarksInput: { marginBottom: SPACING.sm },
  completeBtn: { borderRadius: BORDER_RADIUS.md },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000060',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: 40,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: SPACING.md },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
  },
  selectorBtnText: { fontSize: 15, flex: 1 },
  modalInput: { marginBottom: SPACING.sm },
  modalActions: { flexDirection: 'row', marginTop: SPACING.md },
  partDraftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  partName: { fontSize: 13, fontWeight: '600' },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 13,
    width: 44,
    textAlign: 'center',
    marginHorizontal: 6,
  },
  addPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  addPartBtnText: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  partsSectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  // Issued items
  issuedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 8,
  },
  issuedItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 8,
  },
  addToFaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addToFaultBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 3 },
});

export default WorkEntryScreen;
