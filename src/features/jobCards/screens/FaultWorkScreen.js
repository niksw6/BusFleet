import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput as RNTextInput, Modal as RNModal } from 'react-native';
import { Text, TextInput, Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { mechanicService, storeService, masterService, jobCardService } from '../../../api/services';

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
  const { docEntry, faultLine, fault, dbName: routeDbName, workEntryDocEntry: routeWorkEntryDocEntry, existingWorkEntry, isWorkStarted } = route.params || {};
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.User || user?.user || user?.name || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(() => (
    isWorkStarted || routeWorkEntryDocEntry || existingWorkEntry?.DocEntry ? STEP.WORKING : STEP.START
  ));
  const [workEntryDocEntry, setWorkEntryDocEntry] = useState(routeWorkEntryDocEntry || null);

  const [workList, setWorkList] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [approvedParts, setApprovedParts] = useState([]);
  const [resolvedFaultCode, setResolvedFaultCode] = useState('');

  // Work entry form
  const [finalRemarks, setFinalRemarks] = useState(existingWorkEntry?.FinalRemarks || '');
  const [details, setDetails] = useState(() => (Array.isArray(existingWorkEntry?.Details)
    ? existingWorkEntry.Details.map(detail => ({
        WorkCode: detail?.WorkCode || 'OTHER',
        WorkDone: detail?.WorkDone || '',
        OtherDescription: detail?.OtherDescription || '',
        Remarks: detail?.Remarks || '',
      }))
    : [])); // [{ WorkCode, WorkDone, OtherDescription, Remarks }]
  const [showWorkListModal, setShowWorkListModal] = useState(false);

  // Parts request form
  const [partsDraft, setPartsDraft] = useState([]); // [{ ItemCode, ItemName, ReqQty, Warehouse, Remarks }]
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehouseTargetCode, setWarehouseTargetCode] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receivedQty, setReceivedQty] = useState('');

  const extractRows = (response) => {
    const data = response?.Data ?? response?.data ?? response;
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).find(Array.isArray) || [];
  };

  const normalizeWorkItems = (rows) => rows.map((row) => ({
    ...row,
    Code: String(row?.Code || row?.WorkCode || row?.WorkListCode || row?.Solution || row?.WorkId || row?.ID || '').trim(),
    Name: String(row?.Name || row?.WorkName || row?.WorkDone || row?.ActivityName || row?.Description || row?.Dscription || row?.Code || row?.WorkCode || '').trim(),
  })).filter(row => row.Code || row.Name);

  const normalizeParts = (rows) => rows.map((row) => ({
    ...row,
    ItemCode: String(row?.ItemCode || row?.Code || '').trim(),
    ItemName: String(row?.ItemName || row?.Name || row?.Dscription || row?.Description || row?.ItemCode || row?.Code || '').trim(),
  })).filter(row => row.ItemCode || row.ItemName);

  const getPartQty = (part) => {
    const values = [part?.ApprovedQty, part?.AprQty, part?.Qty, part?.ReqQty, part?.RequestedQty];
    const positive = values.find(value => Number(value) > 0);
    return positive ?? values.find(value => value !== undefined && value !== null && value !== '') ?? 1;
  };

  const isPartApproved = (part) => {
    // Parts embedded with an assigned fault were selected by the Supervisor
    // while creating the Job Card. They are pre-approved by business rule;
    // only extra parts raised by a mechanic go through approval.
    if (part?.SupervisorProvided) return true;
    const status = String(part?.Status ?? part?.ApprovalStatus ?? '').trim().toUpperCase();
    return Number(part?.AprQty ?? part?.ApprovedQty ?? 0) > 0
      || ['A', 'AP', 'APPROVED', 'READY', 'READY TO COLLECT'].includes(status);
  };

  // Receipt is a backend line operation, never a UI-list-index operation.
  // GetMechanicDashboard supplies Parts[].FaultLine for this exact fault;
  // prefer it over all other line fields.
  const getReceivedPartLine = (part) => {
    const rawLine = part?.FaultLine
      ?? part?.PartLine
      ?? part?.FaultLineNo
      ?? part?.Line
      ?? part?.LineNum;
    if (rawLine === undefined || rawLine === null || String(rawLine).trim() === '') return null;
    const line = Number(rawLine);
    if (!Number.isFinite(line) || line < 0) return null;
    return line === 0 ? 1 : line;
  };

  const faultReference = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || fault?.Code || '').trim();
  const partIdentityCandidates = [...new Set([
    userCode,
    user?.EmpCode,
    user?.EmployeeCode,
    user?.EmpID,
    user?.EmployeeID,
    user?.username,
    user?.Name,
    user?.name,
  ].map(value => String(value || '').trim()).filter(Boolean))];

  const loadData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const [faultDetailsResult, sparePartsResult, warehousesResult, approvedResults, jobCardResult] = await Promise.all([
        Promise.allSettled([
        masterService.getFaultDetails(companyDb),
        masterService.getSpareParts(companyDb),
        masterService.getWarehouses(companyDb),
        ]),
        Promise.allSettled(partIdentityCandidates.map(identity => storeService.getApprovedJobCardParts(companyDb, identity))),
        Promise.allSettled([
        jobCardService.getJobCardDetail(companyDb, docEntry),
        ]),
      ]).then(([masterResults, partResults, jobCardResults]) => [...masterResults, partResults, jobCardResults]);
      const faultMasters = faultDetailsResult.status === 'fulfilled' ? extractRows(faultDetailsResult.value) : [];
      const normalizedReference = faultReference.toLowerCase();
      const matchingFault = faultMasters.find((row) => [row?.FaultCode, row?.Fault, row?.Description]
        .some(value => String(value || '').trim().toLowerCase() === normalizedReference));
      const resolvedFaultCode = String(matchingFault?.FaultCode || faultReference).trim();
      setResolvedFaultCode(resolvedFaultCode);
      let faultWorkItems = [];
      if (resolvedFaultCode) {
        try {
          const faultResponse = await masterService.getFaultByCode(companyDb, resolvedFaultCode);
          faultWorkItems = normalizeWorkItems(extractRows(faultResponse));
        } catch (faultLookupError) {
          // General work list below remains the safe fallback.
        }
      }
      const workItems = faultWorkItems;
      const partItems = sparePartsResult.status === 'fulfilled' ? normalizeParts(extractRows(sparePartsResult.value)) : [];
      const warehouseRows = warehousesResult.status === 'fulfilled' ? extractRows(warehousesResult.value) : [];
      setWarehouses(warehouseRows.map((row) => ({
        ...row,
        WarehouseCode: String(row?.WarehouseCode || row?.WhsCode || row?.Code || '').trim(),
        WarehouseName: String(row?.WarehouseName || row?.WhsName || row?.Name || row?.WarehouseCode || row?.WhsCode || '').trim(),
      })).filter(row => row.WarehouseCode || row.WarehouseName));
      setWorkList([...workItems, { Code: 'OTHER', Name: 'Other work (enter manually)' }]);
      setSpareParts([...partItems, { ItemCode: 'OTHER', ItemName: 'Other part (enter manually)' }]);

      const approvedFromQueue = approvedResults.flatMap(result => (
        result.status === 'fulfilled' ? extractRows(result.value) : []
      ));
      const detail = jobCardResult.status === 'fulfilled' ? (jobCardResult.value?.Data ?? jobCardResult.value) : {};
      const detailParts = [
        ...(Array.isArray(detail?.Parts) ? detail.Parts : []),
        ...(Array.isArray(detail?.Faults) ? detail.Faults.flatMap((row, index) => (
          Array.isArray(row?.Parts)
            ? row.Parts.map(part => ({
                ...part,
                FaultLine: part?.FaultLine ?? part?.FaultLineNo ?? row?.FaultLine ?? row?.LineNum ?? index,
              }))
            : []
        )) : []),
      ];
      const getPartFaultLine = (part) => {
        return part?.FaultLine ?? part?.FaultLineNo ?? part?.JCLine ?? part?.Line ?? part?.LineNum;
      };
      const selectPartsForFault = (parts) => {
        const unscoped = parts.filter(part => getPartFaultLine(part) === undefined || getPartFaultLine(part) === null);
        const exact = parts.filter(part => String(getPartFaultLine(part)) === String(faultLine));
        if (exact.length > 0) return [...exact, ...unscoped];

        // Existing Job Cards created before the updated API contract used
        // one-based lines. Use that only when no exact current-format match exists.
        const legacy = parts.filter(part => Number(getPartFaultLine(part)) === Number(faultLine) + 1);
        return [...legacy, ...unscoped];
      };
      const belongsToThisJobCard = (part) => {
        const partJobCard = part?.JobCardDocEntry ?? part?.JobCardNo ?? part?.DocEntry;
        return String(partJobCard ?? '') === String(docEntry);
      };
      const belongsToFault = (part) => {
        const partFaultLine = part?.FaultLine ?? part?.FaultLineNo ?? part?.JCLine ?? part?.Line ?? part?.LineNum;
        return partFaultLine === undefined || partFaultLine === null || String(partFaultLine) === String(faultLine);
      };
      const approved = [
        ...selectPartsForFault(approvedFromQueue.filter(belongsToThisJobCard)),
        ...selectPartsForFault(detailParts).map(p => ({ ...p, SupervisorProvided: true })),
        // GetMechanicDashboard is the authoritative assigned-fault response.
        // Its Parts collection must travel with the mechanic into Fault Work.
        ...(Array.isArray(fault?.Parts) ? fault.Parts.map(part => ({
          ...part,
          FaultLine: part?.FaultLine ?? faultLine,
          SupervisorProvided: true,
        })) : []),
        // Mechanic-requested parts are returned inside the active WorkEntry.
        // Status AP marks them as approved by the Supervisor and ready to use.
        ...(Array.isArray(existingWorkEntry?.Parts) ? existingWorkEntry.Parts.map(part => ({
          ...part,
          FaultLine: part?.FaultLine ?? faultLine,
          WorkEntryDocEntry: existingWorkEntry?.DocEntry ?? workEntryDocEntry,
        })) : []),
      ];
      const uniqueParts = new Map();
      approved.forEach((part, index) => uniqueParts.set(
        `${part?.ItemCode || part?.Code || ''}-${part?.FaultLine ?? part?.PartLine ?? part?.LineId ?? index}`,
        part,
      ));
      setApprovedParts(Array.from(uniqueParts.values()));
    } finally {
      setLoading(false);
    }
  }, [dbName, userCode, docEntry, faultReference, faultLine, workEntryDocEntry, existingWorkEntry, partIdentityCandidates.join('|')]);

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
  const approvedForCollection = approvedParts.filter(isPartApproved);
  const pendingSupervisorParts = approvedParts.filter(part => !isPartApproved(part));

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
    const workCode = String(workItem?.Code || workItem?.WorkCode || workItem?.WorkListCode || workItem?.Solution || workItem?.WorkId || 'OTHER').trim();
    const workName = String(workItem?.Name || workItem?.WorkName || workItem?.WorkDone || workItem?.ActivityName || workItem?.Description || workItem?.Dscription || workCode).trim();
    setDetails(prev => [...prev, {
      WorkCode: workCode,
      WorkDone: workCode === 'OTHER' ? '' : workName,
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
          // The live work-entry endpoint resolves the assigned fault using the
          // same DocEntry/FaultCode pair returned by GetMechanicDashboard.
          DocEntry: Number(docEntry) || docEntry,
          JobCardDocEntry: Number(docEntry) || docEntry,
          FaultLine: Number(faultLine) || 0,
          FaultCode: resolvedFaultCode || String(fault?.FaultCode || fault?.Fault || '').trim(),
          FaultName: String(fault?.FaultName || fault?.Description || fault?.Fault || '').trim(),
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

  const openReceivePart = (part) => {
    const partLine = getReceivedPartLine(part);
    if (!partLine) {
      Toast.show({ type: 'error', text1: 'Part line unavailable', text2: 'This part has no PartLine or FaultLine from the backend.' });
      return;
    }
    setReceiveTarget({ part, partLine });
    setReceivedQty(String(getPartQty(part)));
  };

  const handleReceivePart = async () => {
    if (!receiveTarget) return;
    const { part, partLine } = receiveTarget;
    const approvedQty = Number(getPartQty(part));
    const enteredQty = Number(receivedQty);
    if (!enteredQty || enteredQty <= 0 || enteredQty > approvedQty) {
      Toast.show({ type: 'error', text1: 'Enter a valid quantity', text2: `Received quantity must be between 1 and ${approvedQty}.` });
      return;
    }
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await storeService.receiveJobCardParts({
        CompanyDB: companyDb,
        JobCardDocEntry: Number(docEntry) || docEntry,
        UserCode: userCode,
        Parts: [{
          PartLine: partLine,
          ReceivedQty: enteredQty,
        }],
      });
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Part marked as received' });
        setApprovedParts(prev => prev.map(p => (
          getReceivedPartLine(p) === partLine
          && String(p?.ItemCode || p?.Code || '') === String(part?.ItemCode || part?.Code || '')
            ? { ...p, Received: true, ReceivedQty: enteredQty }
            : p
        )));
        setReceiveTarget(null);
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

        {/* Supervisor-selected parts must be visible before work starts too. */}
        {approvedParts.length > 0 && step === STEP.START && (
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts selected for this fault</Text>
            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 6 }}>
              These parts were selected by the Supervisor. Approved parts can be collected after work starts.
            </Text>
            {approvedParts.map((part, index) => (
              <Text key={`${part?.ItemCode || part?.Code || 'part'}-${index}`} style={{ color: colors.dark, fontSize: 13, marginTop: 5 }}>
                • {part?.ItemName || part?.Name || part?.Dscription || part?.ItemCode || part?.Code} — Qty: {getPartQty(part)}{isPartApproved(part) ? ' · Approved' : ' · Awaiting approval'}
              </Text>
            ))}
          </View>
        )}

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
              {pendingSupervisorParts.length > 0 && (
                <View style={[styles.approvedBox, { borderColor: '#2B7D2B40' }]}>
                  <Text style={{ color: '#9A6700', fontWeight: '700', fontSize: 13 }}>Supervisor-selected parts — awaiting approval</Text>
                  <Text style={{ color: colors.gray, fontSize: 12, marginTop: 3 }}>These parts are linked to this fault. They become ready to collect when the approved quantity is returned by the server.</Text>
                  {pendingSupervisorParts.map((part, index) => <Text key={`${part?.ItemCode || part?.Code || 'part'}-${index}`} style={{ color: colors.dark, fontSize: 13, marginTop: 5 }}>• {part?.ItemName || part?.Name || part?.Dscription || part?.ItemCode || part?.Code} — Requested: {getPartQty(part)}</Text>)}
                </View>
              )}
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
                      <TouchableOpacity onPress={() => { setWarehouseTargetCode(p.ItemCode); setShowWarehouseModal(true); }} style={[styles.warehousePicker, { borderColor: colors.border || '#CCC' }]}>
                        <Text numberOfLines={1} style={{ color: p.Warehouse ? colors.dark : colors.gray, fontSize: 13 }}>{p.Warehouse || 'Select warehouse'}</Text>
                        <MaterialIcons name="arrow-drop-down" size={18} color={colors.gray} />
                      </TouchableOpacity>
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

              {approvedForCollection.length > 0 && (
                <View style={{ marginTop: SPACING.md }}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>Approved — Ready to collect</Text>
                  {approvedForCollection.map((p, idx) => (
                    <View key={idx} style={[styles.detailRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{p.ItemName}</Text>
                        <Text style={{ color: colors.gray, fontSize: 12 }}>Approved: {getPartQty(p)}{p.ReceivedQty ? ` • Received: ${p.ReceivedQty}` : ''}</Text>
                      </View>
                      {p.Received ? (
                        <Chip mode="flat" style={{ backgroundColor: '#2B7D2B20' }} textStyle={{ color: '#2B7D2B', fontSize: 11 }}>
                          Received
                        </Chip>
                      ) : (
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: '#2B7D2B' }]}
                          onPress={() => openReceivePart(p)}
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

      <RNModal visible={Boolean(receiveTarget)} transparent animationType="fade" onRequestClose={() => setReceiveTarget(null)}>
        <View style={styles.receiveOverlay}>
          <View style={[styles.receiveBox, { backgroundColor: colors.white }]}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Confirm received quantity</Text>
            <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 10 }}>Approved quantity: {receiveTarget ? getPartQty(receiveTarget.part) : 0}</Text>
            <RNTextInput value={receivedQty} onChangeText={setReceivedQty} keyboardType="numeric" placeholder="Received quantity" placeholderTextColor={colors.gray} style={[styles.inlineInput, { color: colors.dark, borderColor: colors.border || '#CCC' }]} />
            <View style={styles.receiveActions}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.gray }]} onPress={() => setReceiveTarget(null)}><Text style={styles.smallBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2B7D2B' }]} onPress={handleReceivePart}><Text style={styles.smallBtnText}>Confirm</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

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

      <ModalSelector
        visible={showWarehouseModal}
        onClose={() => { setShowWarehouseModal(false); setWarehouseTargetCode(null); }}
        onSelect={(value, item) => {
          if (warehouseTargetCode !== null) updatePartDraftField(warehouseTargetCode, 'Warehouse', item?.WarehouseCode || value);
          setShowWarehouseModal(false);
          setWarehouseTargetCode(null);
        }}
        title="Select Warehouse"
        data={warehouses}
        loading={false}
        searchPlaceholder="Search warehouses..."
        displayKey="WarehouseName"
        valueKey="WarehouseCode"
        searchKeys={['WarehouseName', 'WarehouseCode']}
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
  warehousePicker: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  approvedBox: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: '#2B7D2B0D' },
  receiveOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.lg },
  receiveBox: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  receiveActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: SPACING.md },
});

export default FaultWorkScreen;
