/**
 * WorkOrderApiDetailScreen
 *
 * Shows work order details.
 * For Mechanic: Accept Job button + Work Entry navigation after acceptance.
 * For Supervisor/TechnicalHead/DepotHead: Parts request approval.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService, storeService } from '../../../api/services';
import { formatDate, getStatusName } from '../../../utils/helpers';
import { isMechanicUser, isSupervisorUser, isTechnicalHeadUser, isDepotHeadUser } from '../../../utils/roleAccess';

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
      Warehouse: item?.Warehouse || item?.StoreWarehouse || '',
      Remarks: item?.Remarks || '',
    });
    grouped.set(workEntryKey, existing);
  });

  return Array.from(grouped.values());
};

const WorkOrderApiDetailScreen = ({ route, navigation }) => {
  const { workOrderDocEntry, dbName: routeDbName, jobCardNo } = route.params || {};
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const isMechanic = isMechanicUser(user);
  const canManage = isSupervisorUser(user) || isTechnicalHeadUser(user) || isDepotHeadUser(user);
  const mechanicCode = user?.Code || user?.code || user?.User || '';
  const mechanicName = user?.FirstName || user?.Name || user?.name || '';

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [approvingPart, setApprovingPart] = useState(null);
  const [workOrderDetail, setWorkOrderDetail] = useState(null);
  const [partsRequests, setPartsRequests] = useState([]);
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);

  const acceptStatus = workOrderDetail?.AcceptStatus || workOrderDetail?.JobAcceptStatus || 'P';
  const isAccepted = String(acceptStatus).toUpperCase() === 'A';

  useEffect(() => { fetchData(); }, [workOrderDocEntry]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (!workOrderDocEntry) { setWorkOrderDetail(null); return; }
      const woRes = await jobCardService.getWorkOrderById(dbName || 'MUTSPL_TEST', workOrderDocEntry);
      if (woRes?.Success && woRes?.Data) setWorkOrderDetail(woRes.Data);
      else setWorkOrderDetail(null);

      const resolvedJobCardDocEntry = woRes?.Data?.JCDocEnt || woRes?.Data?.JobCardDocEntry || null;
      if (resolvedJobCardDocEntry) {
        const partsRes = await storeService.getMechanicPartRequests(dbName || 'MUTSPL_TEST');
        setPartsRequests(groupPartRequestsByWorkEntry(partsRes?.Data || [], resolvedJobCardDocEntry));
      } else {
        setPartsRequests([]);
      }
    } catch (error) {
      console.error('Error fetching work order detail:', error);
      Toast.show({ type: 'error', text1: 'Failed to Load', text2: 'Unable to fetch work order details' });
      setWorkOrderDetail(null);
      setPartsRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptJob = async () => {
    try {
      setAccepting(true);
      setShowAcceptConfirm(false);
      const res = await jobCardService.acceptJob(dbName || 'MUTSPL_TEST', workOrderDocEntry, mechanicCode, mechanicName);
      if (res?.Success) {
        Toast.show({ type: 'success', text1: 'Job Accepted!', text2: 'Supervisor, Technical Head and Depot Head notified.', visibilityTime: 5000 });
        await fetchData();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed to accept job' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error accepting job' });
    } finally {
      setAccepting(false);
    }
  };

  const handleApprovePartRequest = async (request, status) => {
    try {
      const requestCode = request?.RequestCode || request?.WorkEntryDocEntry || 'REQ';
      setApprovingPart(requestCode);
      const approve = status === 'A';
      const res = await storeService.approveMechanicPartRequest({
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: request?.WorkEntryDocEntry,
        JobCardDocEntry: request?.JobCardDocEntry,
        SupervisorCode: user?.Code || user?.code || user?.User || '',
        Parts: (request?.Parts || []).map((part) => ({
          PartLine: Number(part?.PartLine) || 0,
          ApprovedQty: approve ? (Number(part?.ReqQty) || 0) : 0,
          Approved: approve,
          StoreItemStatus: 'Direct',
          Remarks: String(part?.Remarks || '').trim(),
        })),
      });
      if (res?.Success) {
        Toast.show({ type: 'success', text1: status === 'A' ? 'Part request approved' : 'Part request rejected' });
        await fetchData();
      } else {
        Toast.show({ type: 'error', text1: res?.Message || 'Failed' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.message || 'Error' });
    } finally {
      setApprovingPart(null);
    }
  };

  const getPartStatusConfig = (status) => {
    switch (String(status || '').toUpperCase()) {
      case 'AP':
      case 'A':
        return { label: 'Approved', color: '#2B7D2B', bg: '#2B7D2B15' };
      case 'PS':
        return { label: 'Partially Issued', color: '#0C63E7', bg: '#0C63E715' };
      case 'IS':
      case 'I':
        return { label: 'Fully Issued', color: '#0070F2', bg: '#0070F215' };
      case 'PR':
        return { label: 'Partial Received', color: '#2F7A34', bg: '#2F7A3415' };
      case 'RC':
      case 'R':
        return { label: 'Fully Received', color: '#388E3C', bg: '#388E3C15' };
      case 'RJ':
      case 'X':
        return { label: 'Rejected', color: '#BB0000', bg: '#BB000015' };
      default:  return { label: 'Pending Approval', color: '#FF8F00', bg: '#FF8F0015' };
    }
  };

  const formatStartTime = (raw) => {
    if (!raw && raw !== 0) return '-';
    const value = String(raw).trim();
    if (!value) return '-';
    if (/^\d{3,4}$/.test(value)) { const n = value.padStart(4, '0'); return `${n.slice(0,2)}:${n.slice(2)}`; }
    const m = value.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : value;
  };

  const getBusLabel = (entity) => (
    String(
      entity?.Vehicle
      || entity?.BusNo
      || entity?.BusCode
      || entity?.BusRegistrationNo
      || entity?.RegNo
      || ''
    ).trim() || '-'
  );

  const detailRows = [
    ['DocEntry', workOrderDetail?.DocEntry ?? '-'],
    ['JCDocEnt', workOrderDetail?.JCDocEnt ?? '-'],
    ['JCDocNum', workOrderDetail?.JCDocNum || '-'],
    ['Vehicle',  getBusLabel(workOrderDetail)],
    ['Driver',   workOrderDetail?.Driver || '-'],
    ['Depot',    workOrderDetail?.Depot || '-'],
    ['Priority', workOrderDetail?.Priority || '-'],
    ['Status',   getStatusName(workOrderDetail?.Status) || workOrderDetail?.Status || '-'],
    ['AssignBy', workOrderDetail?.AssignBy || '-'],
    ['AssignDt', workOrderDetail?.AssignDt ? formatDate(workOrderDetail.AssignDt) : '-'],
    ['TotalHrs', workOrderDetail?.TotalHrs ?? '-'],
    ['Accept',   isAccepted ? 'Accepted' : 'Pending Acceptance'],
  ];

  if (loading) return <Loader />;

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Mechanic Actions */}
        {isMechanic && (
          <View style={[styles.actionCard, { backgroundColor: colors.white }]}>
            {!isAccepted ? (
              <>
                <Text style={[styles.actionHint, { color: colors.gray }]}>
                  You have been assigned this job. Accept it to start work.
                </Text>
                <Button mode="contained" icon="check-circle" onPress={() => setShowAcceptConfirm(true)}
                  loading={accepting} disabled={accepting}
                  style={[styles.actionBtn, { backgroundColor: '#2B7D2B' }]}
                  contentStyle={{ paddingVertical: 6 }}>
                  Accept Job
                </Button>
              </>
            ) : (
              <>
                <View style={[styles.acceptedBadge, { backgroundColor: '#2B7D2B15' }]}>
                  <MaterialIcons name="check-circle" size={16} color="#2B7D2B" />
                  <Text style={[styles.acceptedText, { color: '#2B7D2B' }]}>Job Accepted</Text>
                </View>
                <Button mode="contained" icon="assignment"
                  onPress={() => navigation.navigate('WorkEntry', {
                    workOrderDocEntry,
                    dbName: dbName || 'MUTSPL_TEST',
                    jobCardNo: workOrderDetail?.JCDocNum || jobCardNo,
                    jobCardDocEntry: workOrderDetail?.JCDocEnt || workOrderDetail?.JobCardDocEntry || workOrderDocEntry,
                    complaintType: workOrderDetail?.ComplaintType || workOrderDetail?.Complaint || '',
                    depot: workOrderDetail?.Depot || workOrderDetail?.DepotName || ''
                  })}
                  style={[styles.actionBtn, { backgroundColor: '#0070F2', marginTop: 8 }]}
                  contentStyle={{ paddingVertical: 6 }}>
                  Work Entries & Parts
                </Button>
              </>
            )}
          </View>
        )}

        {/* Work Order Details */}
        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Order Details</Text>
          {detailRows.map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.gray }]}>{label}:</Text>
              <Text style={[styles.detailValue, { color: colors.dark }]}>{String(value)}</Text>
            </View>
          ))}
        </View>

        {/* Mechanics */}
        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Mechanics</Text>
          {Array.isArray(workOrderDetail?.Mechanics) && workOrderDetail.Mechanics.length > 0 ? (
            workOrderDetail.Mechanics.map((mech, index) => (
              <View key={`mech-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}>
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {mech?.MechName || '-'} ({mech?.MechCode || mech?.MechanicCode || '-'})</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Fault: {mech?.Fault || '-'} | Status: {mech?.Status || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Start: {mech?.StartDt ? formatDate(mech.StartDt) : '-'} {formatStartTime(mech?.StartTm)}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>End: {mech?.EndDt ? formatDate(mech.EndDt) : '-'} {formatStartTime(mech?.EndTm)}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>TotalHrs: {mech?.TotalHrs ?? '-'} | Remarks: {mech?.Remarks || '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="person-outline" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No mechanics found</Text>
            </View>
          )}
        </View>

        {/* Faults */}
        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Faults</Text>
          {Array.isArray(workOrderDetail?.Faults) && workOrderDetail.Faults.length > 0 ? (
            workOrderDetail.Faults.map((fault, index) => (
              <View key={`fault-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}>
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {fault?.FaultCode || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Desc: {fault?.FaultDesc || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>
                  Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}
                  {fault?.DueHours ? ` | Due: ${fault.DueHours}h` : ''}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>CompDate: {fault?.CompDate ? formatDate(fault.CompDate) : '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="report-problem" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No faults found</Text>
            </View>
          )}
        </View>

        {/* Parts (original job card parts) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts (Job Card)</Text>
          {Array.isArray(workOrderDetail?.Parts) && workOrderDetail.Parts.length > 0 ? (
            workOrderDetail.Parts.map((part, index) => (
              <View key={`part-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}>
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {part?.ItemCode || '-'} — {part?.ItemName || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>ReqQty: {part?.ReqQty ?? part?.RequiredQty ?? part?.Qty ?? '-'} | IssQty: {part?.IssQty ?? part?.IssuedQty ?? '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Whs: {part?.Whs || part?.WhsCode || part?.Warehouse || '-'} | Fault: {part?.Fault || part?.FaultCode || '-'} | Status: {part?.Status || '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="inventory" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No parts found</Text>
            </View>
          )}
        </View>

        {/* Parts Requests (mechanic-requested + supervisor approval) */}
        {(canManage || isMechanic) && partsRequests.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Requests</Text>
            {partsRequests.map((req, i) => {
              const cfg = getPartStatusConfig(req.Status);
              const requestCode = req.RequestCode || req.Code || String(i);
              const isPending = !req.Status || String(req.Status || '').toUpperCase() === 'P';
              return (
                <View key={i} style={[styles.partReqRow, { borderColor: colors.border || '#E0E0E0' }]}>
                  <View style={styles.partReqTop}>
                    <Text style={[styles.itemTitle, { color: colors.dark }]}>Req #{requestCode}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  {Array.isArray(req.Parts) && req.Parts.map((p, pi) => (
                    <Text key={pi} style={[styles.itemMeta, { color: colors.gray }]}>
                      • {p.ItemName || p.ItemCode} x{p.ReqQty}
                    </Text>
                  ))}
                  {req.RequestedBy && <Text style={[styles.itemMeta, { color: colors.gray }]}>By: {req.RequestedBy}</Text>}
                  {canManage && isPending && (
                    <View style={styles.approveRow}>
                      <Button mode="contained" compact icon="check"
                        onPress={() => handleApprovePartRequest(req, 'A')}
                        loading={approvingPart === requestCode} disabled={!!approvingPart}
                        style={[styles.approveBtn, { backgroundColor: '#2B7D2B' }]}
                        labelStyle={{ fontSize: 12 }}>
                        Approve
                      </Button>
                      <Button mode="outlined" compact icon="close"
                        onPress={() => handleApprovePartRequest(req, 'X')}
                        loading={approvingPart === requestCode} disabled={!!approvingPart}
                        style={[styles.approveBtn, { borderColor: '#BB0000', marginLeft: 8 }]}
                        labelStyle={{ fontSize: 12, color: '#BB0000' }}>
                        Reject
                      </Button>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>

      <ConfirmationModal
        visible={showAcceptConfirm}
        onClose={() => setShowAcceptConfirm(false)}
        onConfirm={handleAcceptJob}
        title="Accept Job?"
        message="Accepting will notify the Supervisor, Technical Head and Depot Head. You can then start work entries."
      />
      <Loader visible={accepting} text="Accepting job..." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.lg },
  actionCard: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, elevation: 3 },
  actionHint: { fontSize: 13, marginBottom: SPACING.sm, lineHeight: 18 },
  actionBtn: { borderRadius: BORDER_RADIUS.md },
  acceptedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  acceptedText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  sectionCard: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  detailLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  detailValue: { fontSize: 12, flex: 1.4, textAlign: 'right' },
  itemCard: { borderRadius: BORDER_RADIUS.sm, padding: SPACING.xs, marginBottom: SPACING.xs },
  itemTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  itemMeta: { fontSize: 11, marginTop: 2 },
  emptyState: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs },
  emptyText: { fontSize: 12 },
  partReqRow: { borderWidth: 1, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm },
  partReqTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  approveRow: { flexDirection: 'row', marginTop: SPACING.sm },
  approveBtn: { borderRadius: BORDER_RADIUS.sm },
});

export default WorkOrderApiDetailScreen;
