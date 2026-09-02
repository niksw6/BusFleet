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
import MaterialIcons from '../../../shared/components/AppIcon.js';

import Loader from '../../../shared/components/Loader';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { teamService, masterService } from '../../../api/services';
import { formatDate } from '../../../utils/helpers';
import { getStaffRoleLabel, getUserTeamCode } from '../../../utils/roleAccess';

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
  if (['A', 'ACCEPTED', 'ACCEPT', 'AP', 'APPROVED', 'APPROVAL'].includes(raw)) return STATUS.ACCEPTED;
  if (['R', 'REJECTED', 'REJECT'].includes(raw)) return STATUS.REJECTED;
  return STATUS.PENDING; // covers 'P', 'PENDING', 'O', 'OPEN', '' etc.
};

// The dashboard endpoint's exact response shape isn't fixed yet — defensively
// find the job-card array wherever it lives (flat array, or nested under a key).
const looksLikeJobCard = (item) => {
  if (!item || typeof item !== 'object') return false;
  return Boolean(
    item?.DocEntry
    || item?.JobCardNo
    || item?.JobCardDocEntry
    || item?.ComplaintNo
    || item?.BusNo
    || item?.FaultCode
    || item?.FaultName
    || item?.Description
    || item?.Status
  );
};

const extractArrayFromPayload = (payload, candidateKeys = [], itemMatcher = null) => {
  const matches = (item) => {
    if (!item || typeof item !== 'object') return false;
    if (itemMatcher) return itemMatcher(item);
    return true;
  };

  const search = (value) => {
    if (Array.isArray(value)) {
      const matchingItems = value.filter((item) => matches(item));
      if (matchingItems.length > 0) return matchingItems;

      for (const child of value) {
        const nested = search(child);
        if (nested.length > 0) return nested;
      }
      return [];
    }

    if (!value || typeof value !== 'object') return [];

    for (const key of candidateKeys) {
      const normalizedKey = String(key).toLowerCase();
      const matchKey = Object.keys(value).find((entryKey) => String(entryKey).toLowerCase() === normalizedKey);
      const nested = search(matchKey ? value[matchKey] : undefined);
      if (nested.length > 0) return nested;
    }

    for (const child of Object.values(value)) {
      const nested = search(child);
      if (nested.length > 0) return nested;
    }

    return [];
  };

  return search(payload);
};

const extractJobCards = (data) => extractArrayFromPayload(data, ['JobCards', 'Jobs', 'List', 'Items', 'Data', 'Rows', 'Result'], looksLikeJobCard);

const extractList = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  return extractArrayFromPayload(data, ['Data', 'List', 'Items', 'Rows', 'Result']);
};

const looksLikeFault = (item) => {
  if (!item || typeof item !== 'object') return false;
  const hasFaultLabel = Boolean(
    item?.FaultCode
    || item?.FaultName
    || item?.Fault
    || item?.FaultDescription
    || item?.Description
    || item?.Dscption
    || item?.Problem
    || item?.Issue
  );
  const hasAssignmentSignal = Boolean(
    item?.MechanicCode
    || item?.MechanicName
    || item?.AssignedMechanic
  );
  const hasLineSignal = Boolean(item?.LineId || item?.Line || item?.LineNum || item?.FaultLine);
  return hasFaultLabel || (hasAssignmentSignal && hasLineSignal);
};

const extractFaultRows = (response, job) => {
  const sources = [response, job, response?.Data, job?.Data, response?.Result, job?.Result];
  for (const source of sources) {
    const rows = extractArrayFromPayload(source, ['Faults', 'FaultList', 'FaultDetails', 'FaultLineDetails', 'Details', 'Items', 'Rows', 'Result', 'Data'], looksLikeFault);
    if (rows.length > 0) return rows;
  }
  return [];
};

const tryExtractFaultRows = (response, job) => {
  const rows = extractFaultRows(response, job);
  if (rows.length > 0) return normalizeFaultRows(rows);

  const fallbackSources = [
    job?.Faults,
    job?.FaultList,
    job?.FaultDetails,
    job?.FaultLineDetails,
    job?.Details,
    job?.Items,
    job?.Rows,
    job?.Result,
    job?.Data,
  ];

  for (const source of fallbackSources) {
    const nested = extractFaultRows(source, job);
    if (nested.length > 0) return normalizeFaultRows(nested);
  }

  return [];
};

const normalizeFaultRows = (rows) => {
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return [rows];
  return [];
};

const getFaultDisplayText = (fault) => {
  const candidates = [
    fault?.FaultCode,
    fault?.FaultCodeNo,
    fault?.Code,
    fault?.Fault,
    fault?.FaultName,
    fault?.FaultDescription,
    fault?.Description,
    fault?.Dscption,
    fault?.Problem,
    fault?.Issue,
    fault?.WorkDescription,
    fault?.WorkDone,
    fault?.WorkCode,
    fault?.Name,
    fault?.Title,
    fault?.ShortDescription,
    fault?.Details,
    fault?.Remarks,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (candidates.length > 0) {
    return candidates.join(' - ');
  }

  const nestedText = [
    fault?.FaultDetails?.FaultName,
    fault?.FaultDetails?.Description,
    fault?.FaultDetails?.Dscption,
    fault?.FaultData?.FaultName,
    fault?.FaultData?.Description,
    fault?.FaultData?.Dscption,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return nestedText.length > 0 ? nestedText.join(' - ') : '';
};

const getMechanicDisplayText = (fault) => {
  const candidates = [
    fault?.AssignedMechanic?.UserName,
    fault?.AssignedMechanic?.Name,
    fault?.AssignedMechanic?.DisplayName,
    fault?.MechanicName,
    fault?.AssignedTo,
    fault?.AcceptedBy,
    fault?.AssignedToName,
    fault?.EmployeeName,
    fault?.Mechanic,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return candidates[0] || '';
};

const getFaultStatusText = (fault) => {
  const status = String(fault?.Status || fault?.MechanicStatus || fault?.AssignmentStatus || '').trim();
  return status || '';
};

// AssignMechanics stores this value as the mechanic's FaultLine. The current
// backend returns FaultLine as zero-based, while LineId (when supplied) is
// already one-based. Always send the one-based contract.
const getAssignmentFaultLine = (fault, index = 0) => {
  const lineId = Number(fault?.LineId);
  if (Number.isFinite(lineId) && lineId > 0) return lineId;

  const backendLine = fault?.FaultLine ?? fault?.Line ?? fault?.LineNum;
  const numericLine = Number(backendLine);
  if (Number.isFinite(numericLine)) return numericLine + 1;

  return index + 1;
};

const resolveLeaderTeamCode = (teams, user, leaderCode) => {
  const normalizedLeaderCode = String(leaderCode || '').trim().toLowerCase();
  const normalizedLeaderNames = [user?.FirstName, user?.Name, user?.name, user?.User, user?.user]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  const match = teams.find((team) => {
    const mappedLeaderCode = String(
      team?.TeamLeaderCode || team?.TeamLeadCode || team?.LeaderCode || team?.UserCode || ''
    ).trim().toLowerCase();
    const mappedLeaderName = String(
      team?.TeamLeaderName || team?.TeamLeadName || team?.LeaderName || ''
    ).trim().toLowerCase();

    return (normalizedLeaderCode && mappedLeaderCode === normalizedLeaderCode)
      || (mappedLeaderName && normalizedLeaderNames.includes(mappedLeaderName));
  });

  return String(match?.TeamCode || match?.Code || '').trim() || null;
};

// GetMyTeamMembers is user-scoped, so its response is also a reliable fallback
// when the team-master endpoint is not enabled on a deployment.
const resolveMembersTeamCode = (members) => {
  const memberWithTeam = members.find((member) => {
    const value = member?.TeamCode || member?.teamCode || member?.MaintenanceTeamCode || member?.maintenanceTeamCode;
    return String(value || '').trim();
  });
  return String(
    memberWithTeam?.TeamCode
    || memberWithTeam?.teamCode
    || memberWithTeam?.MaintenanceTeamCode
    || memberWithTeam?.maintenanceTeamCode
    || ''
  ).trim() || null;
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
        DisplayRole: getStaffRoleLabel(memberObject),
      };
    })
    .filter(member => member?.DisplayName)
);

const getDocEntry = (job) => job?.DocEntry ?? job?.JobCardDocEntry ?? job?.JobCardNo ?? job?.DocNum ?? '';
const jobKey = (job) => String(getDocEntry(job));

const resolveMasterFaultCode = (fault, faultMasters = []) => {
  const sourceValues = [fault?.FaultCode, fault?.Fault, fault?.FaultName, fault?.FaultDescription, fault?.Description]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const match = faultMasters.find((master) => [master?.FaultCode, master?.Fault, master?.Description]
    .some(value => sourceValues.includes(String(value || '').trim().toLowerCase())));
  return String(match?.FaultCode || fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
};

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
  const teamLeaderTeamCode = getUserTeamCode(user);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobCards, setJobCards] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [maintenanceTeams, setMaintenanceTeams] = useState([]);
  const [faultMasters, setFaultMasters] = useState([]);
  const [teamCodeFromApi, setTeamCodeFromApi] = useState(null);
  const [activeTab, setActiveTab] = useState(STATUS.PENDING);
  const [expandedKey, setExpandedKey] = useState(null);
  const [faultsMap, setFaultsMap] = useState({}); // { [jobKey]: { loading, data } }
  const [submitting, setSubmitting] = useState(false);
  const [assigningFaultKey, setAssigningFaultKey] = useState(null);
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [faultAssignments, setFaultAssignments] = useState({});
  const [showAssignmentConfirm, setShowAssignmentConfirm] = useState(false);

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
      const [dashboardRes, membersRes, faultMastersRes] = await Promise.all([
        teamService.getMechanicalDashboard(companyDb, teamLeaderCode),
        teamService.getMyTeamMembers(companyDb, teamLeaderCode),
        masterService.getFaultDetails(companyDb).catch(() => null),
      ]);

      setJobCards(extractJobCards(dashboardRes?.Data ?? dashboardRes));
      const memberRows = extractList(membersRes);
      console.log('GetMyTeamMembers response:', JSON.stringify(membersRes));
      setTeamMembers(normalizeTeamMembers(memberRows));
      setTeamCodeFromApi(String(
        membersRes?.Data?.TeamCode
        || membersRes?.data?.TeamCode
        || membersRes?.TeamCode
        || ''
      ).trim() || null);
      setMaintenanceTeams([]);
      setFaultMasters(extractList(faultMastersRes));
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

    const companyDb = dbName || 'MUTSPL_TEST';
    const docIdentifiers = [
      getDocEntry(job),
      job?.DocNum,
      job?.JobCardNo,
      job?.JobCardDocEntry,
      job?.DocEntry,
    ].filter((value) => value !== undefined && value !== null && value !== '');

    try {
      let faultRows = [];
      for (const identifier of docIdentifiers) {
        try {
          const res = await teamService.getJobCardFaults(companyDb, identifier);
          faultRows = tryExtractFaultRows(res, job);
          if (faultRows.length > 0) {
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (faultRows.length === 0) {
        faultRows = tryExtractFaultRows(job, job);
      }

      setFaultsMap(prev => ({ ...prev, [key]: { loading: false, data: faultRows } }));
      return faultRows;
    } catch (error) {
      const fallbackFaultRows = tryExtractFaultRows(null, job);
      setFaultsMap(prev => ({ ...prev, [key]: { loading: false, data: fallbackFaultRows } }));
      return fallbackFaultRows;
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

  const openAssignmentConfirm = async (job) => {
    const faults = normalizeFaultRows(faultsMap[jobKey(job)]?.data || await loadFaults(job));
    if (faults.length === 0) {
      Toast.show({ type: 'error', text1: 'Faults are required', text2: 'This Job Card has no faults available to assign.' });
      return;
    }
    setFaultAssignments({});
    setAcceptTarget(job);
    setShowAssignmentConfirm(true);
  };

  const handleAccept = async (job, assignments = {}) => {
    try {
      setSubmitting(true);
      const companyDb = dbName || 'MUTSPL_TEST';
      if (!teamLeaderCode) {
        throw new Error('User code is missing for Team Leader API');
      }
      const response = await teamService.updateTeamStatus(companyDb, getDocEntry(job), teamLeaderCode, 'A');
      if (response?.Success !== false) {
        const faultRows = faultsMap[jobKey(job)]?.data || [];
        const assignmentRows = faultRows.map((fault, index) => {
          const sourceCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
          const code = resolveMasterFaultCode(fault, faultMasters);
          const members = Array.isArray(assignments[sourceCode]) ? assignments[sourceCode] : [];
          return members.map(member => ({
            FaultLine: getAssignmentFaultLine(fault, index),
            FaultCode: code,
            FaultName: String(fault?.FaultName || fault?.FaultDescription || fault?.Description || fault?.Dscption || code).trim(),
            MechanicCode: member.ResolvedCode,
            MechanicName: member.DisplayName,
            DueHours: Number(fault?.DueHours || fault?.EstimatedHours || 0),
          }));
        }).flat().filter(Boolean);
        if (faultRows.some((fault) => {
          const sourceCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
          return !Array.isArray(assignments[sourceCode]) || assignments[sourceCode].length === 0;
        })) {
          throw new Error('Assign at least one mechanic or electrician to every fault before accepting.');
        }
        const assignmentResponse = await teamService.assignMechanics(companyDb, getDocEntry(job), assignmentRows);
        if (assignmentResponse?.Success === false) {
          throw new Error(assignmentResponse?.Message || 'Job accepted, but the fault assignments were not saved.');
        }
        setFaultsMap(previous => ({
          ...previous,
          [jobKey(job)]: {
            ...previous[jobKey(job)],
              data: faultRows.map(fault => {
              const sourceCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
                const members = Array.isArray(assignments[sourceCode]) ? assignments[sourceCode] : [];
                return members.length > 0
                  ? { ...fault, AssignedMechanics: members, MechanicName: members.map(member => member.DisplayName).join(', '), MechanicCode: members.map(member => member.ResolvedCode).join(','), Status: 'ASSIGNED' }
                  : fault;
            }),
          },
        }));
        Toast.show({ type: 'success', text1: 'Job accepted and assigned', text2: 'Each mechanic now receives only their own fault.' });
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

  const assignMechanic = async (job, fault, member) => {
    const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
    if (!faultCode || !member?.ResolvedCode) {
      Toast.show({ type: 'error', text1: 'Cannot assign', text2: 'This fault or team member has no code.' });
      return;
    }
    const key = `${jobKey(job)}-${faultCode}`;
    try {
      setAssigningFaultKey(key);
      const response = await teamService.assignMechanics(
        dbName || 'MUTSPL_TEST', getDocEntry(job),
        [{
          FaultLine: getAssignmentFaultLine(fault),
          FaultCode: resolveMasterFaultCode(fault, faultMasters),
          FaultName: String(fault?.FaultName || fault?.FaultDescription || fault?.Description || faultCode).trim(),
          MechanicCode: member.ResolvedCode,
          MechanicName: member.DisplayName,
          DueHours: Number(fault?.DueHours || fault?.EstimatedHours || 0),
        }],
      );
      if (response?.Success === false) throw new Error(response?.Message || 'Assignment was not saved');
      setFaultsMap(previous => ({
        ...previous,
        [jobKey(job)]: {
          ...previous[jobKey(job)],
          data: (previous[jobKey(job)]?.data || []).map(row => row === fault
            ? { ...row, MechanicName: member.DisplayName, Status: 'ASSIGNED' } : row),
        },
      }));
      Toast.show({ type: 'success', text1: 'Mechanic assigned', text2: `${member.DisplayName} can now accept this fault.` });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Assignment failed', text2: error?.message || 'Could not assign this fault' });
    } finally {
      setAssigningFaultKey(null);
    }
  };

  const confirmAcceptanceWithAssignments = async () => {
    if (!acceptTarget) return;
    const faults = faultsMap[jobKey(acceptTarget)]?.data || [];
    const missingAssignment = faults.some(fault => {
      const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
      return !Array.isArray(faultAssignments[faultCode]) || faultAssignments[faultCode].length === 0;
    });
    if (missingAssignment) {
      Toast.show({ type: 'error', text1: 'Assign every fault', text2: 'Select at least one team member for each fault before accepting.' });
      return;
    }
    setShowAssignmentConfirm(false);
    await handleAccept(acceptTarget, faultAssignments);
    setAcceptTarget(null);
    setFaultAssignments({});
  };

  const renderFaultRow = (job, fault, idx) => {
   const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
   const faultName = getFaultDisplayText(fault);
   const faultStatus = getFaultStatusText(fault);
   const mechanicName = getMechanicDisplayText(fault);
   const displayTitle = faultName || `Fault ${idx + 1}`;

   return (
     <View key={`${faultCode || 'fault'}-${idx}`} style={[styles.faultRow, { borderColor: colors.border || '#E0E0E0' }]}>
       <MaterialIcons name="build" size={16} color={colors.primary} />
       <View style={{ flex: 1, marginLeft: 8 }}>
         <Text style={{ color: colors.dark, fontWeight: '600', fontSize: 13, flexShrink: 1 }}>
           {displayTitle}
         </Text>
         {mechanicName ? (
           <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2, flexShrink: 1 }}>
             {faultStatus ? `${faultStatus} · ` : ''}{mechanicName}
           </Text>
         ) : faultStatus ? (
           <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2, flexShrink: 1 }}>{faultStatus}</Text>
         ) : (
           <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2, fontStyle: 'italic', flexShrink: 1 }}>
             Awaiting a mechanic to accept this fault
           </Text>
         )}
         {deriveStatus(job) === STATUS.ACCEPTED && !mechanicName && teamMembers.length > 0 && (
           <View style={styles.memberChoiceRow}>
             {teamMembers.slice(0, 4).map((member) => {
               const assignKey = `${jobKey(job)}-${faultCode}`;
               return (
                 <TouchableOpacity
                   key={member.ResolvedCode || member.DisplayName}
                   disabled={assigningFaultKey === assignKey}
                   onPress={() => assignMechanic(job, fault, member)}
                   style={[styles.memberChoice, { borderColor: colors.primary }]}
                 >
                   <Text numberOfLines={1} style={[styles.memberChoiceText, { color: colors.primary }]}>
                     {assigningFaultKey === assignKey ? 'Assigning…' : member.DisplayName}
                   </Text>
                 </TouchableOpacity>
               );
             })}
           </View>
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
    const faultRows = normalizeFaultRows(faultsState?.data);

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
            ) : faultRows.length === 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ color: colors.gray, fontSize: 13 }}>
                  No fault rows were returned for this job card yet.
                </Text>
                <Text style={{ color: colors.gray, fontSize: 12, marginTop: 4 }}>
                  The backend may be returning the fault list in a different payload shape or this card may still be syncing.
                </Text>
              </View>
            ) : (
              faultRows.map((fault, index) => renderFaultRow(job, fault, index))
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
                  onPress={() => openAssignmentConfirm(job)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="check" size={18} color="#FFF" />
                  <Text style={styles.actionBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === STATUS.ACCEPTED && (
              <Text style={{ color: colors.gray, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                Assign a team member above, or let a mechanic/electrician accept a fault from My Work.
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
        showNotifications={true}
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

      <RNModal visible={showAssignmentConfirm} transparent animationType="slide" onRequestClose={() => { setShowAssignmentConfirm(false); setAcceptTarget(null); }}>
        <View style={styles.reasonOverlay}>
          <View style={[styles.assignmentBox, { backgroundColor: colors.white }]}>
            <Text style={[styles.reasonTitle, { color: colors.dark }]}>Assign faults before accepting</Text>
            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 12 }}>Choose one or more mechanics or electricians per fault. Each selected person receives the work item.</Text>
            <ScrollView style={{ maxHeight: 390 }}>
              {(faultsMap[jobKey(acceptTarget)]?.data || []).map((fault, index) => {
                const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || `Fault ${index + 1}`).trim();
                return <View key={faultCode} style={[styles.assignmentFault, { borderColor: colors.border || '#E0E0E0' }]}>
                  <Text style={{ color: colors.dark, fontWeight: '700', fontSize: 13 }}>{fault?.FaultDescription || faultCode}</Text>
                  <View style={styles.assignmentChoices}>
                    {teamMembers.map(member => {
                      const selectedMembers = Array.isArray(faultAssignments[faultCode]) ? faultAssignments[faultCode] : [];
                      const selected = selectedMembers.some(selectedMember => selectedMember.ResolvedCode === member.ResolvedCode);
                      return <TouchableOpacity key={member.ResolvedCode || member.DisplayName} onPress={() => setFaultAssignments(previous => {
                        const current = Array.isArray(previous[faultCode]) ? previous[faultCode] : [];
                        const next = selected
                          ? current.filter(selectedMember => selectedMember.ResolvedCode !== member.ResolvedCode)
                          : [...current, member];
                        return { ...previous, [faultCode]: next };
                      })}
                        style={[styles.assignmentChoice, { borderColor: selected ? colors.primary : (colors.border || '#E0E0E0'), backgroundColor: selected ? `${colors.primary}18` : 'transparent' }]}>
                        <Text style={{ color: selected ? colors.primary : colors.dark, fontSize: 12 }}>{member.DisplayName}</Text>
                      </TouchableOpacity>;
                    })}
                  </View>
                </View>;
              })}
            </ScrollView>
            <View style={styles.reasonButtonRow}>
              <TouchableOpacity style={[styles.reasonBtn, { backgroundColor: colors.grayLight }]} onPress={() => { setShowAssignmentConfirm(false); setAcceptTarget(null); }}><Text style={{ color: colors.dark }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.reasonBtn, { backgroundColor: colors.success }]} onPress={confirmAcceptanceWithAssignments}><Text style={{ color: '#FFF', fontWeight: '700' }}>Accept & Assign</Text></TouchableOpacity>
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
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  memberChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  memberChoice: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 116 },
  memberChoiceText: { fontSize: 11, fontWeight: '600' },
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
  assignmentBox: { width: '100%', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, maxHeight: '84%' },
  assignmentFault: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: 10, marginBottom: 9 },
  assignmentChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  assignmentChoice: { borderWidth: 1, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 9 },
  reasonTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  reasonInput: { marginBottom: 12 },
  reasonButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  reasonBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: BORDER_RADIUS.md },
});

export default TeamApprovalsScreen;
