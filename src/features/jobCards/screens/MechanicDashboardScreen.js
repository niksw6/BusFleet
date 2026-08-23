import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../shared/components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { mechanicService } from '../../../api/services';
import { getUserRole } from '../../../utils/roleAccess';

/**
 * MechanicDashboardScreen — Mechanic / Electrician's "My Work" queue.
 *
 * Prefers the documented GetMyJobs endpoint, with the deployed mechanic
 * dashboard retained as a compatibility fallback.
 *
 * Flow: once a Team Leader accepts a Job Card, its faults become visible here
 * for the team's Mechanics/Electricians to accept, then
 * Start Work / log Work Entries / request parts / Complete Work — all handled
 * on FaultWorkScreen.
 */

const BUCKET = {
  TO_ACCEPT: 'TO_ACCEPT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

const TABS = [
  { key: BUCKET.TO_ACCEPT, label: 'New', icon: 'new-releases' },
  { key: BUCKET.IN_PROGRESS, label: 'In Progress', icon: 'engineering' },
  { key: BUCKET.COMPLETED, label: 'Completed', icon: 'check-circle' },
];

const deriveBucket = (item) => {
  const raw = String(
    item?.Status ?? item?.FaultStatus ?? item?.WorkStatus ?? ''
  ).trim().toUpperCase();
  if (['COMPLETED', 'COMPLETE', 'C', 'CM', 'SV', 'CL', 'SUPERVISOR VERIFIED', 'CLOSED'].includes(raw)) return BUCKET.COMPLETED;
  // WC is the backend's mechanic-complete state: work is finished but must
  // remain in progress until the Supervisor verifies/closes the job card.
  if (['ACCEPTED', 'A', 'IN PROGRESS', 'INPROGRESS', 'STARTED', 'I', 'IP', 'WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(raw)) return BUCKET.IN_PROGRESS;
  return BUCKET.TO_ACCEPT; // covers 'PENDING', '', 'P', 'NEW'
};

const isAwaitingVerification = (item) => ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(
  String(item?.Status ?? item?.FaultStatus ?? item?.WorkStatus ?? '').trim().toUpperCase()
);

const getMechanicStatusLabel = (item, bucket, awaitingVerification) => {
  const raw = String(item?.Status ?? item?.FaultStatus ?? item?.WorkStatus ?? '').trim().toUpperCase();

  if (bucket === BUCKET.COMPLETED) {
    if (raw === 'SV' || raw === 'SUPERVISOR VERIFIED') return 'Supervisor Verified';
    if (raw === 'CL' || raw === 'CLOSED') return 'Closed';
    return 'Completed';
  }

  if (awaitingVerification) return 'Awaiting Verification';
  if (raw === 'PR' || raw === 'PARTS RECEIVED') return 'Parts Received';
  if (raw === 'PI' || raw === 'PARTS ISSUED') return 'Parts Issued';
  if (raw === 'PP' || raw === 'PART APPROVAL PENDING') return 'Part Approval Pending';
  if (raw === 'IP' || raw === 'IN PROGRESS' || raw === 'INPROGRESS') return 'In Progress';
  if (raw === 'A' || raw === 'ACCEPTED') return 'Accepted';
  return bucket === BUCKET.IN_PROGRESS ? 'In Progress' : 'New';
};

const extractItems = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const candidateKeys = ['Faults', 'Jobs', 'List', 'Items', 'Data'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const getDocEntry = (item) => item?.DocEntry ?? item?.JobCardDocEntry ?? item?.JobCardNo ?? '';
const getFaultLine = (item) => item?.FaultLine ?? item?.Line ?? item?.LineNum ?? 0;
const getBreakdownComplaintNo = (item) => String(
  item?.ComplaintNo
  ?? item?.CmplaintNo
  ?? item?.BreakdownNo
  ?? item?.BreakdownDocEntry
  ?? item?.BreakdownId
  ?? item?.DocEntry
  ?? item?.JobCardDocEntry
  ?? ''
).trim();
const getBreakdownJobCardDocEntry = (item) => Number(
  item?.JobCardDocEntry
  ?? item?.DocEntry
  ?? item?.JobCardNo
  ?? 0
) || 0;
const itemKey = (item) => `${getDocEntry(item)}-${getFaultLine(item)}`;
const isBreakdownAssignment = (item) => {
  const complaintType = String(item?.ComplaintType ?? item?.IncidentType ?? item?.FormType ?? item?.Type ?? '').trim().toUpperCase();
  const description = String(item?.Description ?? item?.Fault ?? item?.FaultName ?? '').trim().toLowerCase();
  return complaintType.includes('BREAKDOWN')
    || complaintType === 'B'
    || description.includes('breakdown')
    || Boolean(item?.BreakdownDocEntry || item?.BreakdownNo || item?.BreakdownId || item?.ComplaintNo || item?.CmplaintNo);
};
const getActiveWorkEntry = (item) => {
  const entries = Array.isArray(item?.WorkEntries) ? item.WorkEntries : [];
  return entries.find(entry => !['C', 'CM', 'SV', 'CL', 'COMPLETED', 'COMPLETE', 'SUPERVISOR VERIFIED', 'CLOSED'].includes(String(entry?.Status || '').trim().toUpperCase()))
    || entries[0]
    || null;
};
const hasStartedWork = (item) => {
  const status = String(item?.Status ?? item?.FaultStatus ?? item?.WorkStatus ?? '').trim().toUpperCase();
  return ['STARTED', 'IN PROGRESS', 'INPROGRESS', 'IP'].includes(status)
    || Boolean(String(item?.StartDate || '').trim())
    || Boolean(String(item?.StartTime || '').trim());
};
const getBusLabel = (item) => (
  String(
    item?.BusNo
    || item?.Vehicle
    || item?.BusCode
    || item?.BusRegistrationNo
    || item?.RegNo
    || ''
  ).trim() || 'Bus -'
);

const MechanicDashboardScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const userCode = user?.Code || user?.code || user?.UserCode || user?.EmpCode || user?.User || user?.user || user?.name || '';
  const assigneeName = user?.FirstName || user?.Name || user?.name || userCode || 'You';
  const roleLabel = getUserRole(user) === 'Electrician' ? 'Electrician' : 'Mechanic';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(BUCKET.TO_ACCEPT);
  const [submittingKey, setSubmittingKey] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      // Prefer the documented per-mechanic queue; retain the live dashboard as
      // a compatibility fallback until every backend deployment is upgraded.
      let res;
      try {
        res = await mechanicService.getMyJobs(companyDb, userCode);
      } catch (apiError) {
        res = await mechanicService.getMechanicDashboard(companyDb, userCode);
      }
      setItems(extractItems(res?.Data ?? res));
    } catch (error) {
      console.error('❌ Error loading Mechanic Dashboard:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to load your work queue' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, userCode]);

  // Refresh when returning from Fault Work so started faults and newly-created
  // WorkEntries are not shown using the stale dashboard item.
  useFocusEffect(useCallback(() => {
    fetchData();
  }, [fetchData]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const grouped = {
    [BUCKET.TO_ACCEPT]: items.filter(i => deriveBucket(i) === BUCKET.TO_ACCEPT),
    [BUCKET.IN_PROGRESS]: items.filter(i => deriveBucket(i) === BUCKET.IN_PROGRESS),
    [BUCKET.COMPLETED]: items.filter(i => deriveBucket(i) === BUCKET.COMPLETED),
  };

  const handleAccept = async (item) => {
    const key = itemKey(item);
    try {
      setSubmittingKey(key);
      const companyDb = dbName || 'MUTSPL_TEST';
      const response = await mechanicService.acceptFault(
        companyDb,
        getDocEntry(item),
        getFaultLine(item),
        userCode,
      );
      if (response?.Success !== false) {
        Toast.show({ type: 'success', text1: 'Fault accepted', text2: 'Head to "In Progress" to start work.' });
        setItems(prev => prev.map(i => (itemKey(i) === key ? { ...i, Status: 'A' } : i)));
        setActiveTab(BUCKET.IN_PROGRESS);
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: response?.Message || 'Could not accept fault' });
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error?.message || 'Failed to accept fault' });
    } finally {
      setSubmittingKey(null);
    }
  };

  const openFault = (item) => {
    const activeWorkEntry = getActiveWorkEntry(item);
    navigation.navigate('FaultWork', {
      docEntry: getDocEntry(item),
      faultLine: getFaultLine(item),
      fault: item,
      workEntryDocEntry: activeWorkEntry?.DocEntry || activeWorkEntry?.WorkEntryDocEntry || null,
      existingWorkEntry: activeWorkEntry,
      isWorkStarted: hasStartedWork(item),
      isAwaitingVerification: isAwaitingVerification(item),
      dbName: dbName || 'MUTSPL_TEST',
    });
  };

  const openBreakdownWorkEntry = (item) => {
    navigation.navigate('LineBreakdownWorkEntry', {
      complaintNo: getBreakdownComplaintNo(item),
      jobCardDocEntry: getBreakdownJobCardDocEntry(item),
      faultLine: getFaultLine(item) || 1,
      busNo: getBusLabel(item),
      depot: item?.Depot || item?.BranchNm || item?.Branch || item?.Location || '',
      dbName: dbName || 'MUTSPL_TEST',
    });
  };

  const renderItem = (item) => {
    const key = itemKey(item);
    const bucket = deriveBucket(item);
    const breakdownAssignment = isBreakdownAssignment(item);
    const faultName = item?.Fault || item?.FaultName || item?.Description || (breakdownAssignment ? 'Line Breakdown' : 'Fault');
    const busNo = getBusLabel(item);
    const displayNo = item?.JobCardNo || item?.DocNum || getDocEntry(item);
    const assignedName = item?.AssignedMechanic?.UserName || item?.MechanicName || item?.AssignedToName || item?.EmployeeName || item?.EmpName || assigneeName;

    const statusColor =
      bucket === BUCKET.COMPLETED ? colors.statusCompleted
      : bucket === BUCKET.IN_PROGRESS ? colors.statusInProgress
      : colors.primary;
    const awaitingVerification = isAwaitingVerification(item);
    const statusLabel = getMechanicStatusLabel(item, bucket, awaitingVerification);

    return (
      <TouchableOpacity
        key={key}
        style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}
        activeOpacity={0.7}
        onPress={() => {
          if (breakdownAssignment) {
            openBreakdownWorkEntry(item);
            return;
          }
          if (bucket === BUCKET.TO_ACCEPT) {
            return;
          }
          openFault(item);
        }}
      >
        <View style={styles.cardTop}>
          <View style={[styles.faultIcon, { backgroundColor: `${statusColor}20` }]}>
            <MaterialIcons name="build" size={18} color={statusColor} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.faultName, { color: colors.dark }]}>{faultName}</Text>
            <Text style={[styles.assigneeText, { color: colors.primary }]}>Assigned to: {assignedName}</Text>
            <Text style={[styles.cardSub, { color: colors.gray }]}>
              Job Card #{displayNo} • {busNo} • {item?.Priority || 'Medium'}
            </Text>
          </View>
        </View>

        {breakdownAssignment ? (
          <View style={styles.rowBetween}>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}> 
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <Text style={[styles.openLabel, { color: colors.primary }]}>Open work entry</Text>
          </View>
        ) : bucket === BUCKET.TO_ACCEPT ? (
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleAccept(item)}
            activeOpacity={0.8}
            disabled={submittingKey === key}
          >
            <MaterialIcons name="check" size={16} color="#FFF" />
            <Text style={styles.acceptBtnText}>{submittingKey === key ? 'Accepting…' : 'Accept Fault'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rowBetween}>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.gray} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const currentList = grouped[activeTab] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="My Work"
        subtitle={roleLabel}
        onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
        showNotifications={true}
        useGradient={false}
      />

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
              <Text style={{ color: colors.gray, marginTop: 8 }}>Nothing here yet.</Text>
            </View>
          ) : (
            currentList.map(renderItem)
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    padding: SPACING.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  faultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faultName: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  assigneeText: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  acceptBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
});

export default MechanicDashboardScreen;
