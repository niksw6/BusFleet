import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal as RNModal,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { teamService } from '../../../api/services';
import { formatDate } from '../../../utils/helpers';

/**
 * TeamApprovalsScreen — Team Leader's queue.
 *
 * Uses the confirmed live Team Leader endpoints:
 *   GetMechanicalDashboard  — summary + list of Job Cards for the Team Leader
 *   GetMyTeamMembers        — roster of Mechanics/Electricians in this team
 *   GetJobCardFaults        — fault list for a Job Card (read-only here — mechanics
 *                             self-accept individual faults from their own dashboard,
 *                             the Team Leader only Accepts/Rejects the whole Job Card)
 *   UpdateTeamStatus        — Accept ('A') / Reject ('R', with Remarks)
 */

const STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
};

const TABS = [
  { key: STATUS.PENDING, label: 'Pending', icon: 'hourglass-empty' },
  { key: STATUS.ACCEPTED, label: 'Accepted', icon: 'check-circle' },
  { key: STATUS.REJECTED, label: 'Rejected', icon: 'cancel' },
];

// Normalize whatever status field/shape the backend sends into one of our 3 buckets.
const deriveStatus = (job) => {
  const raw = String(
    job?.TeamStatus ?? job?.Status ?? job?.AcceptStatus ?? job?.ApprovalStatus ?? ''
  ).trim().toUpperCase();
  if (['A', 'ACCEPTED', 'ACCEPT'].includes(raw)) return STATUS.ACCEPTED;
  if (['R', 'REJECTED', 'REJECT'].includes(raw)) return STATUS.REJECTED;
  return STATUS.PENDING; // covers 'P', 'PENDING', 'O', 'OPEN', '' etc.
};

// The dashboard endpoint's exact response shape isn't fixed yet — defensively
// find the job-card array wherever it lives (flat array, or nested under a key).
const extractJobCards = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const candidateKeys = ['JobCards', 'Jobs', 'List', 'Items', 'Data'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  // Fall back to first array-valued property found
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const normalizeTeamMembers = (members = []) => (
  members
    .map((member, index) => {
      const memberObject = (member && typeof member === 'object') ? member : { Name: String(member || '').trim() };
      const resolvedName = String(
        memberObject?.FirstName
        || memberObject?.firstName
        || memberObject?.firstname
        || memberObject?.Name
        || memberObject?.name
        || memberObject?.MechanicName
        || memberObject?.mechanicName
        || memberObject?.MechName
        || memberObject?.mechName
        || memberObject?.EmployeeName
        || memberObject?.employeeName
        || memberObject?.EmpName
        || memberObject?.empName
        || memberObject?.User
        || memberObject?.user
        || memberObject?.UserName
        || memberObject?.username
        || memberObject?.LoginName
        || memberObject?.loginName
        || ''
      ).trim();
      const resolvedCode = String(
        memberObject?.Code
        || memberObject?.code
        || memberObject?.MechanicCode
        || memberObject?.mechanicCode
        || memberObject?.MechCode
        || memberObject?.mechCode
        || memberObject?.UserCode
        || memberObject?.userCode
        || memberObject?.EmpCode
        || memberObject?.empCode
        || memberObject?.EmployeeCode
        || memberObject?.employeeCode
        || ''
      ).trim();
      const resolvedRole = String(
        memberObject?.Role
        || memberObject?.role
        || memberObject?.Designation
        || memberObject?.designation
        || memberObject?.Type
        || memberObject?.type
        || memberObject?.Usertype
        || memberObject?.usertype
        || ''
      ).trim();

      return {
        ...memberObject,
        DisplayName: resolvedName || resolvedCode || `Member ${index + 1}`,
        ResolvedCode: resolvedCode,
        DisplayCode: resolvedCode || 'Code unavailable',
        DisplayRole: resolvedRole || 'Team Member',
      };
    })
    .filter(member => member?.DisplayName)
);

const getDocEntry = (job) => job?.DocEntry ?? job?.JobCardDocEntry ?? job?.JobCardNo ?? '';
const jobKey = (job) => String(getDocEntry(job));

const getBusLabel = (entity) => (
  String(
    entity?.BusNo
    || entity?.Vehicle
    || entity?.BusCode
    || entity?.BusRegistrationNo
    || entity?.RegNo
    || ''
  ).trim() || 'Bus -'
);

const TeamApprovalsScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const teamLeaderCode = user?.User || user?.user || user?.Code || user?.code || '';
  const teamLeaderName = user?.FirstName || user?.Name || user?.name || 'Team Leader';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobCards, setJobCards] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeTab, setActiveTab] = useState(STATUS.PENDING);
  const [expandedKey, setExpandedKey] = useState(null);
  const [faultsMap, setFaultsMap] = useState({}); // { [jobKey]: { loading, data } }
  const [submitting, setSubmitting] = useState(false);

  // Reject reason modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      if (!teamLeaderCode) {
        throw new Error('User code is missing for Team Leader API');
      }
      const [dashboardRes, membersRes] = await Promise.all([
        teamService.getMechanicalDashboard(companyDb, teamLeaderCode),
        teamService.getMyTeamMembers(companyDb, teamLeaderCode),
      ]);

      setJobCards(extractJobCards(dashboardRes?.Data ?? dashboardRes));
      setTeamMembers(normalizeTeamMembers(Array.isArray(membersRes?.Data) ? membersRes.Data : []));
    } catch (error) {
      console.error('❌ Error loading Team Dashboard:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to load your team dashboard' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, teamLeaderCode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const focusDocEntry = route?.params?.focusDocEntry;
    if (!focusDocEntry || !jobCards.length) return;

    const focused = jobCards.find((job) => String(getDocEntry(job)) === String(focusDocEntry));
    if (!focused) return;

    const key = jobKey(focused);
    setExpandedKey(key);
    loadFaults(focused);
  }, [route?.params?.focusDocEntry, jobCards]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const grouped = {
    [STATUS.PENDING]: jobCards.filter((j) => deriveStatus(j) === STATUS.PENDING),
    [STATUS.ACCEPTED]: jobCards.filter((j) => deriveStatus(j) === STATUS.ACCEPTED),
    [STATUS.REJECTED]: jobCards.filter((j) => deriveStatus(j) === STATUS.REJECTED),
  };

  const loadFaults = async (job) => {
    const key = jobKey(job);
    if (faultsMap[key]?.data || faultsMap[key]?.loading) return;
    setFaultsMap(prev => ({ ...prev, [key]: { loading: true, data: null } }));
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const res = await teamService.getJobCardFaults(companyDb, getDocEntry(job));
      const faultRows = Array.isArray(res?.Data?.Faults)
        ? res.Data.Faults
        : (Array.isArray(res?.Data) ? res.Data : []);
      setFaultsMap(prev => ({ ...prev, [key]: { loading: false, data: faultRows } }));
    } catch (error) {
      setFaultsMap(prev => ({ ...prev, [key]: { loading: false, data: [] } }));
    }
  };

  const toggleExpand = (job) => {
    const key = jobKey(job);
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    loadFaults(job);
  };

  const handleAccept = async (job) => {
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      if (!teamLeaderCode) {
        throw new Error('User code is missing for Team Leader API');
      }
      const response = await teamService.updateTeamStatus(companyDb, getDocEntry(job), teamLeaderCode, 'A');
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Accepted', text2: 'Your team will now be able to pick up faults on this job card.' });
        setJobCards(prev => prev.map(j => (jobKey(j) === jobKey(job) ? { ...j, Status: 'A', TeamStatus: 'A' } : j)));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not accept job card' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to accept' });
    } finally {
      setSubmitting(false);
    }
  };

  const openRejectModal = (job) => {
    setRejectTarget(job);
    setRejectReason('');
    setShowRejectConfirm(true);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      Toast.show({ type: 'error', text1: 'Reason required', text2: 'Please provide a reason for rejection.' });
      return;
    }
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      if (!teamLeaderCode) {
        throw new Error('User code is missing for Team Leader API');
      }
      const response = await teamService.updateTeamStatus(
        companyDb,
        getDocEntry(rejectTarget),
        teamLeaderCode,
        'R',
        rejectReason.trim(),
      );
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Rejected', text2: 'Supervisor has been notified to reassign.' });
        setJobCards(prev => prev.map(j => (jobKey(j) === jobKey(rejectTarget) ? { ...j, Status: 'R', TeamStatus: 'R', Remarks: rejectReason.trim() } : j)));
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not reject job card' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to reject' });
    } finally {
      setSubmitting(false);
      setShowRejectConfirm(false);
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  const renderFaultRow = (fault, idx) => {
    const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
    const faultDesc = String(fault?.FaultDescription || fault?.Description || fault?.Dscption || '').trim();
    const faultName = faultCode && faultDesc
      ? `${faultCode} - ${faultDesc}`
      : (faultDesc || faultCode || `Fault ${idx + 1}`);
    const faultStatus = String(fault?.Status || fault?.MechanicStatus || '').trim();
    const mechanicName =
      fault?.AssignedMechanic?.UserName ||
      fault?.MechanicName ||
      fault?.AssignedTo ||
      fault?.AcceptedBy ||
      '';
    return (
      <View key={idx} style={[styles.faultRow, { borderColor: colors.border || '#E0E0E0' }]}>
        <MaterialIcons name="build" size={16} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13 }}>{faultName}</Text>
          {mechanicName ? (
            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
              {faultStatus ? `${faultStatus} · ` : ''}{mechanicName}
            </Text>
          ) : faultStatus ? (
            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>{faultStatus}</Text>
          ) : (
            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>
              Awaiting a mechanic to accept this fault
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderJobCard = (job) => {
    const key = jobKey(job);
    const status = deriveStatus(job);
    const isExpanded = expandedKey === key;
    const faultsState = faultsMap[key];

    const statusColor =
      status === STATUS.ACCEPTED ? colors.statusCompleted
      : status === STATUS.REJECTED ? colors.statusDeclined
      : colors.statusInProgress;

    const displayNo = job?.JobCardNo || job?.DocNum || getDocEntry(job);
    const busLabel = getBusLabel(job);
    return (
      <View key={key} style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.7}
          onPress={() => toggleExpand(job)}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <MaterialIcons name="build-circle" size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.dark }]}>
                Job Card #{displayNo}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>{status}</Text>
              </View>
            </View>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              {busLabel} • {job?.Depot || 'Depot N/A'} • {job?.Priority || 'Medium'} priority
            </Text>
            {(job?.RegDate || job?.CreatedDate || job?.JobCardDate) ? (
              <Text style={[styles.cardSub, { color: colors.gray, marginTop: 2 }]}>
                Created {formatDate(job.RegDate || job.CreatedDate || job.JobCardDate)}
              </Text>
            ) : null}
            {status === STATUS.REJECTED && (job?.Remarks || job?.RejectReason) ? (
              <Text style={[styles.rejectReasonText, { color: colors.statusDeclined }]}>
                Reason: {job.Remarks || job.RejectReason}
              </Text>
            ) : null}
          </View>
          <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={26} color={colors.gray} />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.cardBody}>
            <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>Faults</Text>
            {faultsState?.loading ? (
              <Text style={{ color: colors.gray, fontSize: 13 }}>Loading faults…</Text>
            ) : (faultsState?.data || []).length === 0 ? (
              <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 8 }}>No faults recorded on this job card.</Text>
            ) : (
              faultsState.data.map(renderFaultRow)
            )}

            {status === STATUS.PENDING && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  onPress={() => openRejectModal(job)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="close" size={18} color="#FFF" />
                  <Text style={styles.actionBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.success }]}
                  onPress={() => handleAccept(job)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="check" size={18} color="#FFF" />
                  <Text style={styles.actionBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === STATUS.ACCEPTED && (
              <Text style={{ color: colors.gray, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                Your team's mechanics/electricians can now accept individual faults from their own dashboard.
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const currentList = grouped[activeTab] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="Team Dashboard"
        subtitle={teamLeaderName}
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={false}
        useGradient={false}
      />

      {teamMembers.length > 0 && (
        <View style={styles.teamRow}>
          <MaterialIcons name="groups" size={16} color={colors.gray} />
          <Text style={{ color: colors.gray, fontSize: 12, marginLeft: 6, flex: 1 }} numberOfLines={1}>
            Your team: {teamMembers.map(m => m.DisplayName).filter(Boolean).join(', ')}
          </Text>
        </View>
      )}

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const count = grouped[tab.key]?.length || 0;
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={tab.icon} size={16} color={active ? colors.primary : colors.gray} />
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.gray }]}>
                {tab.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <Loader visible={true} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {currentList.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="inbox" size={48} color={colors.gray} />
              <Text style={{ color: colors.gray, marginTop: 8 }}>No {activeTab.toLowerCase()} job cards.</Text>
            </View>
          ) : (
            currentList.map(renderJobCard)
          )}
        </ScrollView>
      )}

      <RNModal
        visible={showRejectConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowRejectConfirm(false); setRejectTarget(null); }}
      >
        <View style={styles.reasonOverlay}>
          <View style={[styles.reasonBox, { backgroundColor: colors.white }]}>
            <Text style={[styles.reasonTitle, { color: colors.dark }]}>Reject Job Card</Text>
            <Text style={{ color: colors.gray, marginBottom: 10, fontSize: 13 }}>
              Please provide a reason. The Supervisor will be notified to reassign this job card.
            </Text>
            <TextInput
              mode="outlined"
              multiline
              numberOfLines={3}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Team overloaded, reassign to another team"
              style={styles.reasonInput}
            />
            <View style={styles.reasonButtonRow}>
              <TouchableOpacity
                style={[styles.reasonBtn, { backgroundColor: colors.grayLight }]}
                onPress={() => { setShowRejectConfirm(false); setRejectTarget(null); setRejectReason(''); }}
              >
                <Text style={{ color: colors.dark }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reasonBtn, { backgroundColor: colors.danger }]}
                onPress={confirmReject}
              >
                <Text style={{ color: '#FFF', fontWeight: '600' }}>Reject Job Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      <Loader visible={submitting} text="Please wait..." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  scrollContent: { padding: SPACING.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  card: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 4 },
  statusPill: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  rejectReasonText: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  cardBody: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  faultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  reasonOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  reasonBox: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  reasonTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  reasonInput: { marginBottom: 12 },
  reasonButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  reasonBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: BORDER_RADIUS.md },
});

export default TeamApprovalsScreen;
