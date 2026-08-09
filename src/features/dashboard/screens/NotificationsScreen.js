import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Clipboard,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';
import { getLogs, clearLogs } from '../../../utils/logger';

import { setNotifications, setUnreadCount, markAsRead, markAllAsRead } from '../../../store/slices/notificationSlice';
import { dashboardService, complaintService, teamService, mechanicService, jobCardService } from '../../../api/services';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDateTime } from '../../../utils/helpers';
import { isTeamLeaderUser, isSupervisorUser, isFieldStaffUser } from '../../../utils/roleAccess';
import { useFocusEffect } from '@react-navigation/native';
import { storeService } from '../../../api/services';

const NotificationsScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const { notifications, unreadCount } = useSelector(state => state.notification);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logEntries, setLogEntries] = useState([]);
  const [hasBackendCountMismatch, setHasBackendCountMismatch] = useState(false);

  const openLogs = () => {
    setLogEntries(getLogs());
    setShowLogs(true);
  };

  const copyLogs = () => {
    Clipboard.setString(logEntries.join('\n'));
    Toast.show({ type: 'success', text1: 'Logs copied to clipboard' });
  };

  useFocusEffect(useCallback(() => {
    fetchNotifications();
  }, [dbName, user]));

  const resolveUserIdCandidates = () => {
    const candidates = [
      user?.User,
      user?.user,
      user?.username,
      user?.Code,
      user?.code,
      user?.Name,
      user?.name,
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);

    return [...new Set(candidates)];
  };

  const getIncidentTypeCode = (item) => {
    const explicitType = String(item?.ComplaintType || item?.complaintType || '').trim().toLowerCase();
    if (explicitType.includes('breakdown')) return 'B';
    if (explicitType.includes('preventive')) return 'M';

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'B';
    if (typeCode === 'M') return 'M';
    if (typeCode === 'D') return 'D';

    const text = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'B';
    if (text.includes('preventive')) return 'M';
    return 'D';
  };

  const resolveIncidentDocEntryFromNotification = (item) => {
    const directCandidates = [
      item?.ComplaintNo,
      item?.complaintNo,
      item?.IncidentNo,
      item?.incidentNo,
      item?.IncidentDocEntry,
      item?.incidentDocEntry,
      item?.ReferenceDocEntry,
      item?.RefDocEntry,
      item?.detailDocEntry,
      item?.docEntry,
      item?.DocEntry,
    ];

    const direct = directCandidates
      .map((value) => String(value || '').trim())
      .find(Boolean);
    if (direct) return direct;

    const text = `${item?.title || ''} ${item?.message || ''}`;
    const match = text.match(/incident\s*#\s*(\d+)/i);
    return match?.[1] || null;
  };

  const formatIncidentTitle = (item) => {
    const incidentDocEntry = resolveIncidentDocEntryFromNotification(item);
    if (!incidentDocEntry) return item?.Message || item?.Title || item?.title || 'Notification';

    const typeCode = getIncidentTypeCode(item);
    const baseTitle = String(item?.Message || item?.Title || item?.title || '').trim();

    if (!baseTitle.toLowerCase().includes('incident')) {
      return `Incident #${typeCode}-${incidentDocEntry}`;
    }

    return baseTitle.replace(/incident\s*#\s*\d+/i, `Incident #${typeCode}-${incidentDocEntry}`);
  };

  const mapNotificationItem = (item) => {
    const rawType = String(item?.Type || '').trim().toUpperCase();
    const normalizedType = rawType === 'WE' ? 'V' : rawType;
    const workEntryDoc = String(item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || '').trim();
    const defaultTitle = item?.Message || item?.Title || item?.title || 'Notification';
    const resolvedTitle = rawType === 'WE'
      ? `Mechanic completed Work Entry ${workEntryDoc || '-'}`
      : formatIncidentTitle(item);

    return {
    creatorName: item?.CreatedBy || item?.CreatorName || item?.UserName || item?.AssignBy || item?.SprvsrNm || item?.DriverName || '',
    priority: item?.Priority || item?.Severity || item?.Significance || '',
    busNo: item?.BusNo || item?.Vehicle || item?.BusCode || item?.BusRegistrationNo || item?.RegNo || '',
    detailDocEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo || null,
    significance: item?.Significance || item?.Severity || item?.Priority || item?.Type || '',
    ...item,
    id: item?.id || item?.Code || item?.DocEntry,
    code: item?.Code || item?.id || item?.DocEntry,
    title: resolvedTitle || defaultTitle,
    message: item?.Message || item?.message || '',
    read: String(item?.Read || '').trim().toUpperCase() === 'Y',
    type: normalizedType,
    timestamp: item?.Date || item?.timestamp || null,
    docEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo,
    };
  };

  const parseBackendDateTimeToMs = (dateValue, timeValue) => {
    const rawDate = String(dateValue || '').trim();
    const rawTime = String(timeValue || '').trim();

    if (!rawDate && !rawTime) return 0;

    const dotNetMatch = rawDate.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/i);
    if (dotNetMatch?.[1]) {
      const ticksMs = Number(dotNetMatch[1]);
      if (Number.isFinite(ticksMs)) return ticksMs;
    }

    const dateOnlyMdy = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const hhmmss24 = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (dateOnlyMdy && hhmmss24) {
      const month = Number(dateOnlyMdy[1]);
      const day = Number(dateOnlyMdy[2]);
      const year = Number(dateOnlyMdy[3]);
      const hour = Number(hhmmss24[1]);
      const minute = Number(hhmmss24[2]);
      const second = Number(hhmmss24[3] || 0);
      const d = new Date(year, month - 1, day, hour, minute, second);
      const ms = d.getTime();
      return Number.isNaN(ms) ? 0 : ms;
    }

    const combined = [rawDate, rawTime].filter(Boolean).join(' ');
    const parsed = new Date(combined || rawDate || rawTime);
    const ms = parsed.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  const getNotificationSortMs = (item) => {
    const dateCandidate = item?.timestamp || item?.Date || item?.CreatedDate || item?.ReqDate || item?.RequestDate;
    const timeCandidate = item?.Time || item?.time || item?.ReqTime || item?.RequestTime;
    return parseBackendDateTimeToMs(dateCandidate, timeCandidate);
  };

  const getSignificanceLabel = (item) => {
    const raw = String(item?.significance || item?.priority || '').trim();
    if (!raw) return 'Normal';
    return raw;
  };

  const ensureUniqueNotificationKeys = (items = []) => {
    const seen = new Map();
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const baseKey = [
        item?.id,
        item?.code,
        item?.type,
        item?.docEntry,
        item?.detailDocEntry,
        item?.timestamp,
        item?.title,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join('|') || `notification-${index}`;

      const occurrence = seen.get(baseKey) || 0;
      seen.set(baseKey, occurrence + 1);

      return {
        ...item,
        _listKey: occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`,
      };
    });
  };

  const inferComplaintTypeFromNotification = (item) => {
    const explicit = String(item?.ComplaintType || item?.complaintType || '').trim();
    if (explicit) return explicit;

    const typeCode = String(item?.type || item?.Type || '').trim().toUpperCase();
    if (typeCode === 'B') return 'Breakdown';
    if (typeCode === 'D') return 'Driver Complaint';

    const text = `${item?.title || ''} ${item?.message || ''}`.toLowerCase();
    if (text.includes('breakdown')) return 'Breakdown';
    return 'Driver Complaint';
  };

  const extractTeamLeaderJobCards = (dashboardData) => {
    const source = dashboardData?.Data ?? dashboardData;
    return Array.isArray(source)
      ? source
      : (Array.isArray(source?.JobCards)
        ? source.JobCards
        : Array.isArray(source?.Jobs)
          ? source.Jobs
          : []);
  };

  const deriveTeamLeaderStatus = (job) => {
    const teamStatus = String(job?.TeamStatus ?? job?.Status ?? job?.AcceptStatus ?? job?.ApprovalStatus ?? '').trim().toUpperCase();
    if (['A', 'ACCEPTED', 'ACCEPT'].includes(teamStatus)) return 'ACCEPTED';
    if (['R', 'REJECTED', 'REJECT'].includes(teamStatus)) return 'REJECTED';
    return 'PENDING';
  };

  const isSupervisorVerificationPending = (entity) => {
    const raw = String(entity?.Status ?? entity?.WorkStatus ?? entity?.FaultStatus ?? '').trim().toUpperCase();
    return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(raw);
  };

  const isPendingPartApproval = (part) => {
    const status = String(part?.Status ?? part?.ApprovalStatus ?? '').trim().toUpperCase();
    return !status || ['P', 'PENDING', 'RQ', 'REQUESTED'].includes(status);
  };

  const buildWorkflowNotifications = async (companyDb, identityCandidates) => {
    const primaryIdentity = identityCandidates[0] || '';
    const nowIso = new Date().toISOString();
    const workflowNotifications = [];

    if (isSupervisorUser(user)) {
      const incidentsRes = await complaintService.getIncidents(companyDb, null, null);
      const incidents = Array.isArray(incidentsRes?.Data) ? incidentsRes.Data : [];
      const jobCardsRes = await jobCardService.getJobCards(companyDb);
      const jobCards = Array.isArray(jobCardsRes?.Data) ? jobCardsRes.Data : [];
      const incidentsByDocEntry = new Map(
        incidents
          .filter((item) => item?.DocEntry !== undefined && item?.DocEntry !== null && String(item.DocEntry).trim())
          .map((item) => [String(item.DocEntry), item])
      );
      const incidentsWithJobCards = new Set(
        jobCards
          .map(card => card?.ComplaintNo ?? card?.IncidentNo ?? card?.ComplaintDocEntry ?? card?.IncidentDocEntry ?? card?.SourceDocEntry)
          .filter(value => value !== undefined && value !== null && String(value).trim())
          .map(String)
      );
      const pendingReview = incidents
        .filter((item) => {
          const status = String(item?.Status || '').trim().toUpperCase();
          const jobCardNo = String(item?.JobcardNo || item?.JobCardNo || '').trim();
          return status === 'O' && !jobCardNo && !incidentsWithJobCards.has(String(item?.DocEntry));
        })
        .sort((a, b) => Number(b?.DocEntry || 0) - Number(a?.DocEntry || 0));

      if (pendingReview.length > 0) {
        workflowNotifications.push(...pendingReview.map((item) => ({
          id: `workflow-supervisor-${item?.DocEntry}`,
          code: `workflow-supervisor-${item?.DocEntry}`,
          title: `Incident #${String(item?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D'}-${item?.DocEntry || '-'} requires supervisor action`,
          message: `Create job card and route this ${String(item?.ComplaintType || 'incident').toLowerCase()} to a team.`,
          creatorName: String(item?.DrvName || item?.DriverName || item?.CreatedBy || 'Driver'),
          significance: String(item?.Priority || 'Medium'),
          priority: String(item?.Priority || 'Medium'),
          busNo: String(item?.BusNo || item?.Vehicle || item?.RegNo || '').trim(),
          detailDocEntry: item?.DocEntry,
          docEntry: item?.DocEntry,
          read: false,
          type: String(item?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D',
          complaintType: item?.ComplaintType,
          timestamp: item?.IncidentDate || item?.RegDate || nowIso,
          workflowDerived: true,
        })));
      }

      const verificationPending = jobCards
        .filter(isSupervisorVerificationPending)
        .sort((a, b) => Number(b?.DocEntry || b?.JobCardDocEntry || b?.JobCardNo || 0) - Number(a?.DocEntry || a?.JobCardDocEntry || a?.JobCardNo || 0));

      workflowNotifications.push(...verificationPending.map((card, index) => {
        const jobCardDocEntry = card?.DocEntry ?? card?.JobCardDocEntry ?? card?.JCDocEnt ?? card?.JobCardNo ?? `${index + 1}`;
        const jobCardNo = card?.JobCardNo || card?.DocNum || jobCardDocEntry;
        const linkedIncidentDocEntry = String(
          card?.ComplaintNo
          ?? card?.IncidentNo
          ?? card?.ComplaintDocEntry
          ?? card?.IncidentDocEntry
          ?? ''
        ).trim();
        const linkedIncident = linkedIncidentDocEntry ? incidentsByDocEntry.get(linkedIncidentDocEntry) : null;

        return {
          id: `workflow-verify-${jobCardDocEntry}`,
          code: `workflow-verify-${jobCardDocEntry}`,
          title: `Verification pending for Job Card #${jobCardNo}`,
          message: 'Mechanic marked work complete. Verify the updates and close the incident.',
          creatorName: String(card?.MechName || card?.MechanicName || card?.AssignedTo || 'Mechanic'),
          significance: String(card?.Priority || 'High'),
          priority: String(card?.Priority || 'High'),
          busNo: String(card?.Vehicle || card?.BusNo || card?.RegNo || '').trim(),
          detailDocEntry: linkedIncidentDocEntry || jobCardDocEntry,
          docEntry: linkedIncidentDocEntry || jobCardDocEntry,
          complaintNo: linkedIncident?.ComplaintNo || linkedIncident?.DocEntry || linkedIncidentDocEntry || null,
          complaintType: linkedIncident?.ComplaintType || null,
          jobCardDocEntry,
          jobCardNo,
          read: false,
          type: 'V',
          timestamp: card?.UpdateDate || card?.ModDate || card?.AssignDt || nowIso,
          workflowDerived: true,
        };
      }));

      const partsRes = await storeService.getMechanicPartRequests(companyDb);
      const partRows = (Array.isArray(partsRes?.Data) ? partsRes.Data : (Array.isArray(partsRes?.data) ? partsRes.data : []))
        .filter(isPendingPartApproval);
      const requestsByWorkEntry = new Map();
      partRows.forEach((part) => {
        const workEntry = part?.WorkEntryDocEntry ?? part?.WorkEntryNo ?? part?.DocEntry;
        if (workEntry !== undefined && workEntry !== null && String(workEntry).trim()) {
          requestsByWorkEntry.set(String(workEntry), part);
        }
      });
      workflowNotifications.push(...Array.from(requestsByWorkEntry.values()).map((part) => {
        const workEntry = part?.WorkEntryDocEntry ?? part?.WorkEntryNo ?? part?.DocEntry;
        const jobCard = part?.JobCardDocEntry ?? part?.JobCardNo ?? '';
        return {
          id: `workflow-parts-${workEntry}`,
          code: `workflow-parts-${workEntry}`,
          title: `Parts request awaiting approval${jobCard ? ` for Job Card #${jobCard}` : ''}`,
          message: `${String(part?.MechanicName || part?.UserName || part?.UserCode || 'A mechanic')} requested ${String(part?.ItemName || part?.ItemCode || 'parts')}.`,
          creatorName: String(part?.MechanicName || part?.UserName || part?.UserCode || 'Mechanic'),
          significance: 'High',
          priority: 'High',
          busNo: String(part?.Vehicle || part?.BusNo || part?.RegNo || '').trim(),
          detailDocEntry: jobCard || workEntry,
          docEntry: jobCard || workEntry,
          read: false,
          type: 'P',
          timestamp: part?.RequestDate || part?.CreatedDate || nowIso,
          workflowDerived: true,
        };
      }));
    }

    if (isTeamLeaderUser(user) && primaryIdentity) {
      const teamRes = await teamService.getMechanicalDashboard(companyDb, primaryIdentity);
      const teamCards = extractTeamLeaderJobCards(teamRes);
      const pendingCards = teamCards
        .filter(card => deriveTeamLeaderStatus(card) === 'PENDING')
        .sort((a, b) => Number(b?.DocEntry || b?.JobCardDocEntry || b?.JobCardNo || 0) - Number(a?.DocEntry || a?.JobCardDocEntry || a?.JobCardNo || 0));

      if (pendingCards.length > 0) {
        workflowNotifications.push(...pendingCards.map((card, index) => {
          const docEntry = card?.DocEntry ?? card?.JobCardDocEntry ?? card?.JobCardNo ?? `${index + 1}`;
          const busNo = String(card?.BusNo || card?.Vehicle || card?.BusCode || card?.BusRegistrationNo || card?.RegNo || '').trim();
          const priority = String(card?.Priority || 'Medium').trim();
          const createdAt = card?.RegDate || card?.CreatedDate || card?.JobCardDate || nowIso;
          return {
            id: `workflow-team-${primaryIdentity}-${docEntry}`,
            code: `workflow-team-${primaryIdentity}-${docEntry}`,
            title: `Job Card #${card?.JobCardNo || card?.DocNum || docEntry}`,
            message: `${busNo || 'Bus -'} · ${priority} priority · accept or reject this job card.`,
            creatorName: String(card?.SprvsrNm || card?.SupervisorName || card?.AssignBy || 'Supervisor'),
            significance: priority,
            priority,
            busNo,
            detailDocEntry: docEntry,
            docEntry,
            read: false,
            type: 'T',
            timestamp: createdAt,
            workflowDerived: true,
          };
        }));
      }
    }

    if (isFieldStaffUser(user) && primaryIdentity) {
      // GetMyJobs is an assignment-scoped queue. The legacy dashboard is used
      // only while a server deployment is still being upgraded.
      let mechanicRes;
      try {
        mechanicRes = await mechanicService.getMyJobs(companyDb, primaryIdentity);
      } catch (queueError) {
        mechanicRes = await mechanicService.getMechanicDashboard(companyDb, primaryIdentity);
      }
      const source = mechanicRes?.Data ?? mechanicRes;
      const list = Array.isArray(source)
        ? source
        : (['Faults', 'Jobs', 'List', 'Items', 'Data']
          .map(key => source?.[key])
          .find(Array.isArray)
          || Object.values(source || {}).find(Array.isArray)
          || []);

      const pendingItems = list.filter((item) => {
        const status = String(item?.Status ?? item?.FaultStatus ?? '').trim().toUpperCase();
        return !['A', 'ACCEPTED', 'STARTED', 'IN PROGRESS', 'INPROGRESS', 'C', 'CM', 'COMPLETED'].includes(status);
      });

      if (pendingItems.length > 0) {
        workflowNotifications.push(...pendingItems.map((item, idx) => ({
          id: `workflow-mechanic-${primaryIdentity}-${item?.DocEntry || idx}`,
          code: `workflow-mechanic-${primaryIdentity}-${item?.DocEntry || idx}`,
          title: `Your fault on Job Card #${item?.JobCardNo || item?.DocNum || item?.DocEntry || '-'}`,
          message: `${String(item?.FaultName || item?.FaultCode || item?.Fault || 'Fault').trim()} is assigned to you. Accept it, then add your work entry.`,
          creatorName: String(item?.AssignBy || item?.SprvsrNm || 'Supervisor'),
          significance: String(item?.Priority || 'High'),
          priority: String(item?.Priority || 'High'),
          busNo: String(item?.Vehicle || item?.BusNo || item?.RegNo || '').trim(),
          detailDocEntry: item?.DocEntry,
          docEntry: item?.DocEntry,
          read: false,
          type: 'W',
          timestamp: item?.AcceptDate || item?.AssignDt || nowIso,
          workflowDerived: true,
        })));
      }

      // A Supervisor approval is an actionable mechanic update: parts can now
      // be collected and used against the matching Job Card fault.
      try {
        const approvedRes = await storeService.getApprovedJobCardParts(companyDb, primaryIdentity);
        const approvedParts = Array.isArray(approvedRes?.Data) ? approvedRes.Data : (Array.isArray(approvedRes?.data) ? approvedRes.data : []);
        const pendingCollection = approvedParts.filter(part => !part?.Received && String(part?.Status || part?.ApprovalStatus || 'A').trim().toUpperCase() !== 'R');
        const byJobCard = new Map();
        pendingCollection.forEach(part => {
          const jobCard = part?.JobCardDocEntry ?? part?.JobCardNo ?? part?.DocEntry;
          if (jobCard !== undefined && jobCard !== null && String(jobCard).trim()) byJobCard.set(String(jobCard), part);
        });
        workflowNotifications.push(...Array.from(byJobCard.entries()).map(([jobCard, part]) => ({
          id: `workflow-approved-parts-${primaryIdentity}-${jobCard}`,
          code: `workflow-approved-parts-${primaryIdentity}-${jobCard}`,
          title: `Parts approved for Job Card #${jobCard}`,
          message: `${String(part?.ItemName || part?.ItemCode || 'Requested parts')} are approved and ready to collect.`,
          creatorName: 'Supervisor',
          significance: 'High',
          priority: 'High',
          busNo: String(part?.Vehicle || part?.BusNo || part?.RegNo || '').trim(),
          detailDocEntry: jobCard,
          docEntry: jobCard,
          read: false,
          type: 'W',
          timestamp: part?.ApprovedDate || part?.RequestDate || nowIso,
          workflowDerived: true,
        })));
      } catch (approvedPartsError) {
        // Some server versions do not yet expose this queue; My Work remains available.
      }
    }

    return workflowNotifications;
  };

  async function fetchNotifications() {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const identityCandidates = resolveUserIdCandidates();

      const probeResults = await Promise.all(
        identityCandidates.map(async (identity) => {
          try {
            const [notificationsResponse, countResponse] = await Promise.all([
              dashboardService.getNotifications(companyDb, identity),
              dashboardService.getNotificationCount(companyDb, identity),
            ]);

            const notificationData = Array.isArray(notificationsResponse?.Data)
              ? notificationsResponse.Data
              : (Array.isArray(notificationsResponse?.data) ? notificationsResponse.data : []);

            return {
              identity,
              notifications: notificationData,
              unreadCount: Number(countResponse?.Data) || 0,
              success: true,
            };
          } catch (probeError) {
            return {
              identity,
              notifications: [],
              unreadCount: 0,
              success: false,
              error: probeError,
            };
          }
        })
      );

      if (probeResults.length > 0 && probeResults.every(result => !result.success)) {
        throw probeResults[0].error || new Error('Unable to fetch notifications from backend');
      }

      const bestProbe = probeResults.sort((a, b) => {
        if (b.notifications.length !== a.notifications.length) {
          return b.notifications.length - a.notifications.length;
        }
        return b.unreadCount - a.unreadCount;
      })[0] || { notifications: [], unreadCount: 0 };

      let mappedNotifications = bestProbe.notifications.map(mapNotificationItem);
      let effectiveUnreadCount = Number(bestProbe.unreadCount) || 0;
      try {
        const workflowNotifications = await buildWorkflowNotifications(companyDb, identityCandidates);
        const existingCodes = new Set(mappedNotifications.map(item => String(item.code || item.id || '')));
        mappedNotifications = [...workflowNotifications.filter(item => !existingCodes.has(String(item.code || item.id || ''))), ...mappedNotifications];
        effectiveUnreadCount += workflowNotifications.length;
      } catch (workflowError) {
        console.warn('Workflow notification derivation failed:', workflowError?.message || workflowError);
      }

      mappedNotifications.sort((a, b) => getNotificationSortMs(b) - getNotificationSortMs(a));

      // Some live deployments return only an unread count for mechanics. Keep
      // each update actionable instead of compressing several updates into one card.
      if (isFieldStaffUser(user) && mappedNotifications.length === 0 && effectiveUnreadCount > 0) {
        mappedNotifications = Array.from({ length: effectiveUnreadCount }, (_, index) => ({
          id: `workflow-mechanic-update-${bestProbe.identity || 'me'}-${index + 1}`,
          code: `workflow-mechanic-update-${bestProbe.identity || 'me'}-${index + 1}`,
          title: 'Work update waiting',
          message: 'A fault assigned to you needs attention. Open My Work to view and add your work entry.',
          creatorName: 'System',
          significance: 'High',
          priority: 'High',
          read: false,
          type: 'W',
          timestamp: new Date().toISOString(),
          workflowDerived: true,
        }));
      }

      mappedNotifications = ensureUniqueNotificationKeys(mappedNotifications);

      const mismatch = mappedNotifications.length === 0 && effectiveUnreadCount > 0;
      setHasBackendCountMismatch(mismatch);

      dispatch(setNotifications(mappedNotifications));
      const unreadFromList = mappedNotifications.filter(item => !item.read).length;
      dispatch(setUnreadCount(Math.max(unreadFromList, effectiveUnreadCount)));
    } catch (error) {
      setHasBackendCountMismatch(false);
      console.error('Error fetching notifications:', error.message || error);
      Toast.show({
        type: 'error',
        text1: 'Notifications Error',
        text2: String(error.message || error),
        visibilityTime: 8000,
      });
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const navigateToIncidentDetail = async (item, fallbackDocEntry = null) => {
    const companyDb = dbName || 'MUTSPL_TEST';
    const incidentDocEntry = String(
      fallbackDocEntry
      || resolveIncidentDocEntryFromNotification(item)
      || '',
    ).trim();

    if (!incidentDocEntry) {
      return false;
    }

    let matchedIncident = null;
    try {
      const incidentsResponse = await complaintService.getIncidents(companyDb, null, null);
      const incidents = Array.isArray(incidentsResponse?.Data) ? incidentsResponse.Data : [];
      matchedIncident = incidents.find((row) => {
        const rowDocEntry = String(row?.DocEntry || row?.ComplaintNo || '').trim();
        return rowDocEntry && rowDocEntry === incidentDocEntry;
      }) || null;
    } catch (lookupError) {
      console.warn('Notification incident lookup failed:', lookupError?.message || lookupError);
    }

    const payload = {
      complaintNo: matchedIncident?.DocEntry || incidentDocEntry,
      dbName: companyDb,
      complaintType: matchedIncident?.ComplaintType || item?.ComplaintType || inferComplaintTypeFromNotification(item),
      jobCardNo: matchedIncident?.JobCardNo || matchedIncident?.JobcardNo || item?.JobCardNo || item?.jobCardNo || item?.JobcardNo || '',
      source: matchedIncident?._source || 'incident',
      busNo: matchedIncident?.BusNo || item?.busNo || item?.BusNo || item?.Vehicle || '',
      lastSrvDt: matchedIncident?.LastSrvDt || item?.LastSrvDt || '',
      lastSrvKM: matchedIncident?.LastSrvKM || item?.LastSrvKM || 0,
      active: matchedIncident?.Active || item?.Active || 'Y',
    };

    navigation.navigate('ComplaintDetail', payload);
    return true;
  };

  const handleMarkAsRead = async (notificationCode, item = null) => {
    try {
      await dashboardService.markNotificationAsRead({
        CompanyDB: dbName || 'MUTSPL_TEST',
        Code: String(notificationCode),
      });
      dispatch(markAsRead(notificationCode));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadNotifications = notifications.filter(item => !item.read);
    try {
      await Promise.all(
        unreadNotifications
          .map((item) =>
          dashboardService.markNotificationAsRead({
            CompanyDB: dbName || 'MUTSPL_TEST',
            Code: String(item.code || item.id || item.Code),
          })
          )
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }

    dispatch(markAllAsRead());
    Toast.show({
      type: 'success',
      text1: 'All notifications marked as read',
    });
  };

  const handleNotificationPress = async (item) => {
    const notificationCode = item.code || item.id || item.Code;
    if (!item.read && notificationCode) {
      if (item.workflowDerived) {
        dispatch(markAsRead(notificationCode));
      } else {
        await handleMarkAsRead(notificationCode, item);
      }
    }

    const type = String(item.type || item.Type || '').trim().toUpperCase();
    const docEntry = item.detailDocEntry || item.docEntry || item.DocEntry;

    // Route team tasks straight to the same focused Team Approvals item.
    if ((type === 'T' || (isTeamLeaderUser(user) && type === 'J')) && docEntry) {
      navigation.navigate('TeamApprovals', { focusDocEntry: docEntry });
      return;
    }

    if (type === 'D' || type === 'B') {
      const incidentDocEntry = resolveIncidentDocEntryFromNotification(item);
      if (incidentDocEntry) {
        const navigatedToIncident = await navigateToIncidentDetail(item, incidentDocEntry);
        if (navigatedToIncident) {
          return;
        }
      }

      const navigatedToIncident = await navigateToIncidentDetail(item, docEntry);
      if (navigatedToIncident) {
        return;
      }

      navigation.navigate('ComplaintDetail', {
        complaintNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
        complaintType: type === 'B' ? 'Breakdown' : 'Driver Complaint',
        source: 'incident',
      });
      return;
    }

    if (item?.workflowDerived && type === 'W') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if (item?.workflowDerived && type === 'P') {
      navigation.navigate('PartsApproval');
      return;
    }

    if (item?.workflowDerived && type === 'V') {
      const workEntryTarget = String(item?.workEntryDocEntry || item?.DocEntry || item?.docEntry || item?.detailDocEntry || '').trim();
      const jobCardTarget = item?.jobCardDocEntry || item?.jobCardNo || docEntry;
      navigation.navigate('ReviewWorkEntries', {
        focusJobCardDocEntry: jobCardTarget,
        focusWorkEntryDocEntry: workEntryTarget,
      });
      return;
    }

    if (type === 'V') {
      const workEntryTarget = String(item?.workEntryDocEntry || item?.DocEntry || item?.docEntry || item?.detailDocEntry || '').trim();
      const jobCardTarget = item?.jobCardDocEntry || item?.jobCardNo || docEntry;
      navigation.navigate('ReviewWorkEntries', {
        focusJobCardDocEntry: jobCardTarget,
        focusWorkEntryDocEntry: workEntryTarget,
      });
      return;
    }

    if (type === 'J') {
      navigation.navigate('JobCardDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
      });
      return;
    }

    if (type === 'W') {
      navigation.navigate('MechanicDashboard');
      return;
    }

    if (docEntry) {
      navigation.navigate('JobCardDetail', {
        docEntry,
        jobCardNo: docEntry,
        dbName: dbName || 'MUTSPL_TEST',
      });
    }
  };

  const getNotificationIcon = (type, item = {}) => {
    const rawType = String(type || '').trim().toUpperCase();
    const notificationText = `${item?.title || item?.Title || ''} ${item?.message || item?.Message || ''}`.toUpperCase();
    if (['W', 'WE', 'WORK', 'WORKENTRY', 'WORK ENTRY'].includes(rawType) || notificationText.includes('WORK ENTRY')) {
      return 'build';
    }
    switch (type) {
      case 'D':
        return 'report-problem';
      case 'B':
        return 'warning';
      case 'J':
        return 'assignment';
      case 'T':
        return 'fact-check';
      case 'P':
        return 'inventory';
      case 'V':
        return 'task-alt';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'D':
        return '#0070F2'; // SAP Blue
      case 'B':
        return '#BB0000'; // SAP Red
      case 'J':
        return '#2B7D2B'; // SAP Green
      case 'T':
        return '#0EA5E9'; // Team approval blue
      case 'W':
        return '#00689E'; // SAP Teal
      case 'P':
        return '#EA580C'; // Parts request orange
      case 'V':
        return '#6D28D9'; // Verification purple
      default:
        return '#0070F2'; // SAP Blue
    }
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        {
          backgroundColor: colors.white,
          borderLeftColor: item.read ? colors.grayLight : getNotificationColor(item.type || item.Type),
        },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <View style={[styles.inlineIcon, { backgroundColor: getNotificationColor(item.type || item.Type) + '20' }]}>
              <MaterialIcons name={getNotificationIcon(item.type || item.Type, item)} size={14} color={getNotificationColor(item.type || item.Type)} />
            </View>
            <Text style={[styles.title, { color: colors.dark, fontWeight: item.read ? 'normal' : 'bold' }]} numberOfLines={1}>
              {item.title || 'Notification'}
            </Text>
          </View>
          <Text style={[styles.message, { color: colors.gray }]} numberOfLines={2}>
            {item.message || item.Message}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              By: {item.creatorName || 'System'}
            </Text>
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              Significance: {getSignificanceLabel(item)}
            </Text>
          </View>
          {!!item.busNo && (
            <Text style={[styles.metaText, { color: colors.gray }]} numberOfLines={1}>
              Bus: {item.busNo}
            </Text>
          )}
          <Text style={[styles.time, { color: colors.gray }]}>
            {formatDateTime(item.timestamp || item.Date)}
          </Text>
          {item?.workflowDerived && String(item?.type || '').toUpperCase() === 'V' && (
            <TouchableOpacity
              onPress={() => handleNotificationPress(item)}
              style={[styles.quickActionBtn, { borderColor: '#6D28D9' }]}
              activeOpacity={0.8}
            >
              <MaterialIcons name="task-alt" size={14} color="#6D28D9" />
              <Text style={styles.quickActionText}>Verify Now</Text>
            </TouchableOpacity>
          )}
        </View>

        {!item.read && (
          <View style={[styles.unreadIndicator, { backgroundColor: colors.primary }]} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      {/* Debug log modal */}
      <Modal visible={showLogs} animationType="slide" onRequestClose={() => setShowLogs(false)}>
        <View style={{ flex: 1, backgroundColor: '#111', padding: 8, paddingTop: 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Debug Logs ({logEntries.length})</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={copyLogs} style={{ backgroundColor: '#0070F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Copy All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { clearLogs(); setLogEntries([]); }} style={{ backgroundColor: '#BB0000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowLogs(false)} style={{ backgroundColor: '#444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {logEntries.map((entry, i) => (
              <Text key={i} style={{ color: entry.includes('ERROR') ? '#ff6b6b' : entry.includes('WARN') ? '#ffd93d' : '#aaffaa', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 }}>
                {entry}
              </Text>
            ))}
            {logEntries.length === 0 && (
              <Text style={{ color: '#888', fontSize: 13 }}>No logs captured yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <View style={[styles.headerActions, { backgroundColor: colors.white }]}>
        {unreadCount > 0 ? (
          <Text style={[styles.unreadCount, { color: colors.dark }]}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
        ) : (
          <Text style={[styles.unreadCount, { color: colors.gray }]}>Notifications</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllAsRead}>
              <Text style={[styles.markAllButton, { color: colors.primary }]}>Mark all as read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openLogs} style={{ marginLeft: 8, backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 11 }}>🛠 Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {hasBackendCountMismatch && (
        <View style={[styles.mismatchBanner, { backgroundColor: colors.white, borderColor: '#FFB300' }]}>
          <MaterialIcons name="info-outline" size={18} color="#A66B00" />
          <Text style={[styles.mismatchText, { color: '#7A5A00' }]}>Unread count is available, but details are not returned by backend yet. Pull to refresh.</Text>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item, index) => item._listKey || item.id?.toString() || item.code?.toString() || index.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="notifications-none" size={64} color={colors.gray} />
            <Text style={[styles.emptyText, { color: colors.gray }]}>
              {hasBackendCountMismatch ? 'Notifications are pending backend sync' : 'No notifications yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    elevation: 2,
  },
  unreadCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  markAllButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: SPACING.md,
  },
  mismatchBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mismatchText: {
    fontSize: 12,
    flex: 1,
  },
  notificationCard: {
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
  },
  notificationContent: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  inlineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  title: {
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  metaText: {
    fontSize: 11,
    flex: 1,
  },
  time: {
    fontSize: 12,
  },
  unreadIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 6,
  },
  quickActionBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6D28D915',
  },
  quickActionText: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    marginTop: SPACING.xxl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
});

export default NotificationsScreen;
