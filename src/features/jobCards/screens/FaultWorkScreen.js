import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput as RNTextInput } from 'react-native';
import { Text, TextInput, Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { mechanicService, storeService, masterService } from '../../../api/services';

/**
 * FaultWorkScreen — Mechanic/Electrician's step-by-step work flow for ONE fault line.
 *
 * Confirmed live endpoints used here:
 *   POST StartWork          { CompanyDB, DocEntry, FaultLine, UserCode }
 *   POST CreateWorkEntry    { CompanyDB, JobCardDocEntry, FaultLine, UserCode, FinalRemarks, Details:[] }
 *   POST UpdateWorkEntry    { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks, Details:[] }
 *   POST CompleteWork       { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks }
 *   POST RequestWorkEntryParts { CompanyDB, WorkEntryDocEntry, UserCode, Parts:[] }
 *   GET  GetApprovedJobCardParts?CompanyDB=...&UserCode=...
 *   POST ReceiveJobCardParts { CompanyDB, JobCardDocEntry, UserCode, Parts:[{PartLine,ReceivedQty}] }
 *
 * Note: the API set does not expose a "get my open work entry for this fault" lookup,
 * so once a Work Entry is created its WorkEntryDocEntry is kept in this screen's
 * local state (and passed back via navigation params) for the rest of the session.
 */

const STEP = {
  START: 'START',       // fault accepted, not yet started
  WORKING: 'WORKING',    // work entry in progress
  DONE: 'DONE',
};

const FaultWorkScreen = ({ route, navigation }) => {
  const { docEntry, faultLine, fault, dbName: routeDbName, workEntryDocEntry: routeWorkEntryDocEntry } = route.params || {};
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.User || user?.user || user?.name || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(STEP.START);
  const [workEntryDocEntry, setWorkEntryDocEntry] = useState(routeWorkEntryDocEntry || null);

  const [workList, setWorkList] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [approvedParts, setApprovedParts] = useState([]);

  // Work entry form
  const [finalRemarks, setFinalRemarks] = useState('');
  const [details, setDetails] = useState([]); // [{ WorkCode, WorkDone, OtherDescription, Remarks }]
  const [showWorkListModal, setShowWorkListModal] = useState(false);

  // Parts request form
  const [partsDraft, setPartsDraft] = useState([]); // [{ ItemCode, ItemName, ReqQty, Warehouse, Remarks }]
  const [showPartsModal, setShowPartsModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [workListRes, sparePartsRes, approvedRes] = await Promise.all([
        masterService.getWorkList(companyDb),
        masterService.getSpareParts(companyDb),
        storeService.getApprovedJobCardParts(companyDb, userCode),
      ]);
      setWorkList(Array.isArray(workListRes?.Data) ? workListRes.Data : []);
      setSpareParts(Array.isArray(sparePartsRes?.Data) ? sparePartsRes.Data : []);
      const allApproved = Array.isArray(approvedRes?.Data) ? approvedRes.Data : [];
      setApprovedParts(allApproved.filter(p => String(p?.JobCardDocEntry ?? p?.DocEntry ?? '') === String(docEntry)));
    } catch (error) {
      console.warn('FaultWorkScreen loadData error:', error?.message);
    } finally {
      setLoading(false);
    }
  }, [dbName, userCode, docEntry]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (workEntryDocEntry) {
      setStep(STEP.WORKING);
    }
  }, [workEntryDocEntry]);

  const faultName = fault?.Fault || fault?.FaultName || fault?.Description || 'Fault';
  const busNo = fault?.BusNo || '';

  const handleStartWork = async () => {
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await mechanicService.startWork(companyDb, docEntry, faultLine, userCode);
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Work started', text2: 'Log what you do below.' });
        setStep(STEP.WORKING);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not start work' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to start work' });
    } finally {
      setSubmitting(false);
    }
  };

  const addDetailLine = (workItem) => {
    setDetails(prev => [...prev, {
      WorkCode: workItem?.Code || 'OTHER',
      WorkDone: workItem?.Code === 'OTHER' ? '' : (workItem?.Name || ''),
      OtherDescription: '',
      Remarks: '',
    }]);
    setShowWorkListModal(false);
  };

  const updateDetailField = (idx, field, value) => {
    setDetails(prev => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };

  const removeDetailLine = (idx) => {
    setDetails(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveWorkEntry = async () => {
    if (details.length === 0) {
      Toast.show({ type: 'error', text1: 'Add work details', text2: 'Log at least one work item before saving.' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const detailsPayload = details.map(d => ({
        WorkCode: d.WorkCode || 'OTHER',
        WorkDone: d.WorkCode === 'OTHER' ? (d.OtherDescription || d.WorkDone || '') : (d.WorkDone || ''),
        OtherDescription: d.OtherDescription || '',
        Remarks: d.Remarks || '',
      }));

      if (!workEntryDocEntry) {
        const payload = {
          CompanyDB: companyDb,
          JobCardDocEntry: Number(docEntry) || docEntry,
          FaultLine: Number(faultLine) || 0,
          UserCode: userCode,
          FinalRemarks: finalRemarks,
          Details: detailsPayload,
        };
        const response = await mechanicService.createWorkEntry(payload);
        if (response?.Success !== false) {
          const newDocEntry = response?.Data?.WorkEntryDocEntry || response?.Data?.DocEntry || response?.WorkEntryDocEntry;
          setWorkEntryDocEntry(newDocEntry || null);
          navigation.setParams({ workEntryDocEntry: newDocEntry || null });
          Toast.show({ type: 'success', text1: 'Work entry saved' });
        } else {
          Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not save work entry' });
        }
      } else {
        const payload = {
          CompanyDB: companyDb,
          WorkEntryDocEntry: workEntryDocEntry,
          UserCode: userCode,
          FinalRemarks: finalRemarks,
          Details: detailsPayload,
        };
        const response = await mechanicService.updateWorkEntry(payload);
        if (response?.Success !== false) {
          Toast.show({ type: 'success', text1: 'Work entry updated' });
        } else {
          Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not update work entry' });
        }
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to save work entry' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteWork = async () => {
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Log and save your work before completing.' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await mechanicService.completeWork({
        CompanyDB: companyDb,
        WorkEntryDocEntry: workEntryDocEntry,
        UserCode: userCode,
        FinalRemarks: finalRemarks,
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Work completed!', text2: 'Supervisor has been notified to inspect.' });
        navigation.goBack();
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not complete work' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to complete work' });
    } finally {
      setSubmitting(false);
    }
  };

  const addPartToDraft = (item) => {
    const key = item.ItemCode || item.Code;
    if (partsDraft.some(p => (p.ItemCode || p.Code) === key)) {
      setShowPartsModal(false);
      return;
    }
    setPartsDraft(prev => [...prev, {
      ItemCode: item.ItemCode || item.Code || '',
      ItemName: item.ItemName || item.Name || '',
      ReqQty: '1',
      Warehouse: '',
      Remarks: '',
    }]);
    setShowPartsModal(false);
  };

  const updatePartDraftField = (itemCode, field, value) => {
    setPartsDraft(prev => prev.map(p => ((p.ItemCode || p.Code) === itemCode ? { ...p, [field]: value } : p)));
  };

  const removePartDraft = (itemCode) => {
    setPartsDraft(prev => prev.filter(p => (p.ItemCode || p.Code) !== itemCode));
  };

  const handleRequestParts = async () => {
    if (!workEntryDocEntry) {
      Toast.show({ type: 'error', text1: 'Save work entry first', text2: 'Parts requests are tied to your work entry.' });
      return;
    }
    if (partsDraft.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one part' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.requestWorkEntryParts({
        CompanyDB: companyDb,
        WorkEntryDocEntry: workEntryDocEntry,
        UserCode: userCode,
        Parts: partsDraft.map(p => ({
          ItemCode: p.ItemCode,
          ItemName: p.ItemName,
          ReqQty: parseFloat(p.ReqQty) || 1,
          Warehouse: p.Warehouse || '',
          Remarks: p.Remarks || '',
        })),
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Parts requested', text2: 'Awaiting Supervisor approval.' });
        setPartsDraft([]);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not request parts' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to request parts' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceivePart = async (part, idx) => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.receiveJobCardParts({
        CompanyDB: companyDb,
        JobCardDocEntry: Number(docEntry) || docEntry,
        UserCode: userCode,
        Parts: [{
          PartLine: part?.PartLine ?? idx,
          ReceivedQty: parseFloat(part?.ApprovedQty ?? part?.ReqQty ?? 1),
        }],
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Part marked as received' });
        setApprovedParts(prev => prev.map((p, i) => (i === idx ? { ...p, Received: true } : p)));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not mark received' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed' });
    }
  };

  if (loading) {
    return <Loader visible />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Fault header */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.faultHeaderRow}>
            <MaterialIcons name="warning" size={20} color="#E65100" />
            <Text style={[styles.faultTitle, { color: colors.dark }]}>{faultName}</Text>
          </View>
          <Text style={{ color: colors.gray, fontSize: 13, marginTop: 4 }}>
            Job Card #{docEntry} {busNo ? `• ${busNo}` : ''}
          </Text>
        </View>

        {step === STEP.START && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 10 }}>
              You've accepted this fault. Tap below when you're ready to begin work
              (this notifies the Supervisor).
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleStartWork}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <MaterialIcons name="play-arrow" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>{submitting ? 'Starting…' : 'Start Work'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === STEP.WORKING && (
          <>
            {/* Work Entry */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Entry</Text>

              {details.map((d, idx) => (
                <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>
                      {d.WorkCode === 'OTHER' ? 'Other' : d.WorkDone}
                    </Text>
                    {d.WorkCode === 'OTHER' && (
                      <RNTextInput
                        value={d.OtherDescription}
                        onChangeText={(v) => updateDetailField(idx, 'OtherDescription', v)}
                        placeholder="Describe the work done"
                        placeholderTextColor={colors.gray}
                        style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                    )}
                    <RNTextInput
                      value={d.Remarks}
                      onChangeText={(v) => updateDetailField(idx, 'Remarks', v)}
                      placeholder="Remarks (optional)"
                      placeholderTextColor={colors.gray}
                      style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC', marginTop: 4 }]}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeDetailLine(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addLineBtn, { borderColor: colors.primary }]}
                onPress={() => setShowWorkListModal(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', marginLeft: 4 }}>Add Work Item</Text>
              </TouchableOpacity>

              <TextInput
                label="Final Remarks"
                mode="outlined"
                value={finalRemarks}
                onChangeText={setFinalRemarks}
                multiline
                numberOfLines={3}
                style={{ marginTop: SPACING.sm }}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: SPACING.sm }]}
                onPress={handleSaveWorkEntry}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <MaterialIcons name="save" size={18} color="#FFF" />
                <Text style={styles.primaryBtnText}>
                  {submitting ? 'Saving…' : workEntryDocEntry ? 'Update Work Entry' : 'Save Work Entry'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Parts */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Request Parts</Text>
              {!workEntryDocEntry && (
                <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 8, fontStyle: 'italic' }}>
                  Save your Work Entry first to request parts against it.
                </Text>
              )}

              {partsDraft.map((p, i) => (
                <View key={i} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.ItemName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                      <RNTextInput
                        value={String(p.ReqQty)}
                        onChangeText={(v) => updatePartDraftField(p.ItemCode, 'ReqQty', v)}
                        keyboardType="numeric"
                        style={[styles.qtyInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                      <RNTextInput
                        value={p.Warehouse}
                        onChangeText={(v) => updatePartDraftField(p.ItemCode, 'Warehouse', v)}
                        placeholder="Warehouse"
                        placeholderTextColor={colors.gray}
                        style={[styles.inlineInput, { flex: 1, color: colors.dark, borderColor: colors.border || '#CCC' }]}
                      />
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removePartDraft(p.ItemCode)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={18} color="#BB0000" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.addLineBtn, { borderColor: '#2B7D2B' }]}
                onPress={() => setShowPartsModal(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={16} color="#2B7D2B" />
                <Text style={{ color: '#2B7D2B', fontWeight: '600', marginLeft: 4 }}>Add Part</Text>
              </TouchableOpacity>

              {partsDraft.length > 0 && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#2B7D2B', marginTop: SPACING.sm }]}
                  onPress={handleRequestParts}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <MaterialIcons name="send" size={18} color="#FFF" />
                  <Text style={styles.primaryBtnText}>Request Parts</Text>
                </TouchableOpacity>
              )}

              {approvedParts.length > 0 && (
                <View style={{ marginTop: SPACING.md }}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>Approved — Ready to collect</Text>
                  {approvedParts.map((p, idx) => (
                    <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.ItemName}</Text>
                        <Text style={{ color: colors.gray, fontSize: 12 }}>Qty: {p.ApprovedQty ?? p.ReqQty}</Text>
                      </View>
                      {p.Received ? (
                        <Chip mode="flat" style={{ backgroundColor: '#2B7D2B20' }} textStyle={{ color: '#2B7D2B', fontSize: 11 }}>
                          Received
                        </Chip>
                      ) : (
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: '#2B7D2B' }]}
                          onPress={() => handleReceivePart(p, idx)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.smallBtnText}>Mark Received</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Complete */}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.success, marginHorizontal: SPACING.md, marginBottom: SPACING.lg }]}
              onPress={handleCompleteWork}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <MaterialIcons name="done-all" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>{submitting ? 'Completing…' : 'Complete Work'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <ModalSelector
        visible={showWorkListModal}
        onClose={() => setShowWorkListModal(false)}
        onSelect={(value, item) => addDetailLine(item)}
        title="Select Work Item"
        data={workList}
        loading={false}
        searchPlaceholder="Search work items..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
      />

      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => addPartToDraft(item)}
        title="Select Part"
        data={spareParts}
        loading={false}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode']}
      />

      <Loader visible={submitting} text="Please wait..." />
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
  faultHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faultTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 8,
  },
  inlineInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
  },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 13,
    width: 50,
    textAlign: 'center',
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 10,
    marginTop: 4,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  smallBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
});

export default FaultWorkScreen;
