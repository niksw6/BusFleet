import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Text, Divider, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../components/AppIcon.js';

import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { complaintService, maintenanceService, jobCardService } from '../api/services';
import { getStatusName } from '../utils/helpers';
import { isSupervisorUser } from '../utils/roleAccess';

const ComplaintDetailScreen = ({ route, navigation }) => {
  const {
    complaintNo,
    dbName,
    complaintType,
    jobCardNo: routeJobCardNo,
    jobCardDocEntry: routeJobCardDocEntry,
    source,
    busNo: routeBusNo,
    lastSrvDt,
    lastSrvKM,
    active,
  } = route.params;
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const supervisorUser = isSupervisorUser(user);
  
  // Determine if this is a breakdown or complaint
  const isBreakdown = complaintType?.toLowerCase().includes('breakdown');
  const isPreventive = String(complaintType || '').toLowerCase().includes('preventive') || source === 'scheduler';

  const [loading, setLoading] = useState(true);
  const [closingIncident, setClosingIncident] = useState(false);
  const [updatingIncidentStatus, setUpdatingIncidentStatus] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [complaint, setComplaint] = useState(null);
  const [schedulerLines, setSchedulerLines] = useState([]);
  const [progressMap, setProgressMap] = useState({
    incidentCreated: false,
    jobCardCreated: false,
    workOrderCreated: false,
    workOrderSubmitted: false,
    workOrderDocEntry: null,
    inProgress: false,
    closed: false,
    workOrderCount: 0,
    canSupervisorClose: false,
  });

  const formatSchedulerRepeatType = (repeatTypeValue) => {
    const normalized = String(repeatTypeValue || '').trim().toLowerCase();
    if (normalized === 'o' || normalized === 'once') return 'Once';
    if (normalized === 'r' || normalized === 'repeat') return 'Repeat';
    return repeatTypeValue || '-';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'O': return '#0070F2'; // Blue - Open
      case 'I': return '#FF9500'; // Orange - In Progress
      case 'C': return '#2B7D2B'; // Green - Completed
      case 'CM': return '#2B7D2B'; // Green - Completed
      case 'D': return '#BB0000'; // Red - Declined
      default: return '#6A6D70'; // Gray
    }
  };

  const normalizeStatus = (statusValue) => String(statusValue || '').trim().toUpperCase();

  const isClosedStatus = (statusValue) => {
    const status = normalizeStatus(statusValue);
    return status === 'C' || status === 'CM' || status === 'COMPLETED' || status === 'CLOSED';
  };

  const hasMeaningfulFaultRows = (faultRows) => {
    if (!Array.isArray(faultRows) || faultRows.length === 0) return false;
    return faultRows.some((faultRow) => {
      const faultName = String(faultRow?.Fault || faultRow?.FaultName || faultRow?.FaultCode || '').trim();
      const faultDesc = String(faultRow?.Description || faultRow?.Dscption || faultRow?.FaultDescription || '').trim();
      return Boolean(faultName || faultDesc);
    });
  };

  const resolveWorkOrderCount = async (incidentData) => {
    const linkedJobCardNo = String(
      incidentData?.JobCardNo || incidentData?.JobcardNo || routeJobCardNo || '',
    ).trim();
    const linkedJobCardDocEntry = Number(
      incidentData?.JobCardDocEntry || incidentData?.JobCardEntry || routeJobCardDocEntry || 0,
    );

    if (!linkedJobCardNo && !linkedJobCardDocEntry) {
      return { count: 0, latestDocEntry: null };
    }

    try {
      const workOrdersResponse = await jobCardService.getWorkOrders(dbName || 'MUTSPL_TEST', null);
      const workOrders = Array.isArray(workOrdersResponse?.Data) ? workOrdersResponse.Data : [];
      const linkedOrders = workOrders.filter((entry) => {
        const entryJcDocEntry = Number(entry?.JCDocEnt || entry?.DocEntry || 0);
        const entryJcDocNum = String(entry?.JCDocNum || entry?.JobCardNo || '').trim();
        return (
          (linkedJobCardDocEntry > 0 && entryJcDocEntry === linkedJobCardDocEntry)
          || (linkedJobCardNo && entryJcDocNum && entryJcDocNum === linkedJobCardNo)
        );
      });
      const latestDocEntry = linkedOrders.reduce((maxDocEntry, entry) => {
        const currentDocEntry = Number(entry?.DocEntry || 0);
        return currentDocEntry > maxDocEntry ? currentDocEntry : maxDocEntry;
      }, 0);
      return {
        count: linkedOrders.length,
        latestDocEntry: latestDocEntry > 0 ? latestDocEntry : null,
      };
    } catch (workOrderError) {
      console.warn('Unable to resolve linked work orders:', workOrderError?.message || workOrderError);
      return { count: 0, latestDocEntry: null };
    }
  };

  const resolveLinkedJobCardInfo = async (incidentData) => {
    const existingJobCardNo = String(
      incidentData?.JobCardNo || incidentData?.JobcardNo || routeJobCardNo || '',
    ).trim();
    const existingJobCardDocEntry = Number(
      incidentData?.JobCardDocEntry || incidentData?.JobCardEntry || routeJobCardDocEntry || 0,
    );

    if (existingJobCardNo || existingJobCardDocEntry > 0) {
      return {
        ...incidentData,
        JobCardNo: existingJobCardNo,
        JobCardDocEntry: existingJobCardDocEntry || undefined,
      };
    }

    try {
      const jobCardsResponse = await jobCardService.getJobCards(dbName || 'MUTSPL_TEST', null);
      const jobCards = Array.isArray(jobCardsResponse?.Data) ? jobCardsResponse.Data : [];
      if (jobCards.length === 0) return incidentData;

      const incidentKeyValues = [
        incidentData?.ComplaintNo,
        incidentData?.DocEntry,
        incidentData?.BreakdownNo,
        complaintNo,
      ];
      const incidentKeyStrings = incidentKeyValues
        .map(value => String(value || '').trim())
        .filter(Boolean);
      const incidentKeyNumbers = incidentKeyValues
        .map(value => Number(value))
        .filter(value => !Number.isNaN(value));
      const incidentBusNo = String(incidentData?.BusNo || routeBusNo || '').trim();

      const linkedCard = jobCards.find((card) => {
        const cardComplaintValues = [
          card?.CmplaintNo,
          card?.ComplaintNo,
          card?.CompNo,
          card?.CmpNo,
          card?.BreakdownNo,
          card?.BrkdnNo,
          card?.BrkDocEnt,
          card?.BrkDocEntry,
        ];
        const hasIncidentReference = cardComplaintValues.some((value) => String(value || '').trim());
        if (!hasIncidentReference) return false;

        const cardComplaintStrings = cardComplaintValues
          .map(value => String(value || '').trim())
          .filter(Boolean);
        const cardComplaintNumbers = cardComplaintValues
          .map(value => Number(value))
          .filter(value => !Number.isNaN(value));
        const complaintMatches = (
          incidentKeyStrings.some(value => cardComplaintStrings.includes(value))
          || incidentKeyNumbers.some(value => cardComplaintNumbers.includes(value))
        );

        if (!complaintMatches) return false;

        if (!incidentBusNo) return true;
        const cardBusNo = String(card?.BusNo || card?.RegNo || '').trim();
        return !cardBusNo || cardBusNo === incidentBusNo;
      });

      if (!linkedCard) return incidentData;

      return {
        ...incidentData,
        JobCardNo: String(linkedCard?.JobCardNo || linkedCard?.DocNum || linkedCard?.DocEntry || '').trim(),
        JobCardDocEntry: Number(linkedCard?.DocEntry || 0) || undefined,
        JobCardStatus: linkedCard?.Status || incidentData?.JobCardStatus,
      };
    } catch (jobCardLookupError) {
      console.warn('Unable to resolve linked job card:', jobCardLookupError?.message || jobCardLookupError);
      return incidentData;
    }
  };

  const deriveProgressMap = async (incidentData) => {
    const incidentStatus = normalizeStatus(incidentData?.Status);
    const jobCardStatus = normalizeStatus(incidentData?.JobCardStatus);
    const linkedJobCardNo = String(
      incidentData?.JobCardNo || incidentData?.JobcardNo || routeJobCardNo || '',
    ).trim();
    const linkedJobCardDocEntry = Number(
      incidentData?.JobCardDocEntry || incidentData?.JobCardEntry || routeJobCardDocEntry || 0,
    );
    const jobCardCreated = linkedJobCardNo.length > 0 || linkedJobCardDocEntry > 0;
    const { count: workOrderCount, latestDocEntry: workOrderDocEntry } = await resolveWorkOrderCount(incidentData);
    const workOrderCreated = workOrderCount > 0;
    const workOrderSubmitted = workOrderCreated;
    const closed = isClosedStatus(incidentStatus);
    const inProgress = !closed && (
      incidentStatus === 'I'
      || jobCardStatus === 'I'
      || jobCardStatus === 'IP'
      || jobCardCreated
      || workOrderCreated
    );

    setProgressMap({
      incidentCreated: true,
      jobCardCreated,
      workOrderCreated,
      workOrderSubmitted,
      workOrderDocEntry,
      inProgress,
      closed,
      workOrderCount,
      canSupervisorClose: supervisorUser && !isPreventive && jobCardCreated && workOrderCreated && !closed,
    });
  };

  const handleCloseIncident = async () => {
    if (!complaint) return;

    try {
      setClosingIncident(true);
      const formType = String(complaint?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';
      const docEntry = complaint?.ComplaintNo || complaintNo;

      const response = await complaintService.updateComplaintStatus(
        dbName || 'MUTSPL_TEST',
        Number(docEntry) || docEntry,
        'CM',
        formType,
      );

      if (!response?.Success) {
        throw new Error(response?.Message || 'Unable to close incident');
      }

      const linkedJobCardDocEntry = Number(
        complaint?.JobCardDocEntry || complaint?.JobCardEntry || routeJobCardDocEntry || 0,
      );
      const linkedJobCardNo = String(
        complaint?.JobCardNo || complaint?.JobcardNo || routeJobCardNo || '',
      ).trim();
      const jobCardTarget = linkedJobCardDocEntry > 0 ? linkedJobCardDocEntry : linkedJobCardNo;

      if (jobCardTarget) {
        try {
          const jobCardCloseResponse = await jobCardService.updateJobCardStatus(
            dbName || 'MUTSPL_TEST',
            jobCardTarget,
            'CM',
          );
          if (!jobCardCloseResponse?.Success) {
            console.warn('Job card status update skipped:', jobCardCloseResponse?.Message || 'Unknown response');
          }
        } catch (jobCardError) {
          console.warn('Unable to update linked job card status:', jobCardError?.message || jobCardError);
        }
      }

      const linkedWorkOrderDocEntry = Number(progressMap?.workOrderDocEntry || 0);
      if (linkedWorkOrderDocEntry > 0) {
        try {
          const workOrderCloseResponse = await jobCardService.closeIncident(
            dbName || 'MUTSPL_TEST',
            linkedWorkOrderDocEntry,
            'W',
          );
          if (!workOrderCloseResponse?.Success) {
            console.warn('Work order close skipped:', workOrderCloseResponse?.Message || 'Unknown response');
          }
        } catch (workOrderCloseError) {
          console.warn('Unable to close linked work order:', workOrderCloseError?.message || workOrderCloseError);
        }
      }

      Toast.show({
        type: 'success',
        text1: 'Incident Closed',
        text2: response?.Message || 'Supervisor closed the incident successfully',
      });

      await fetchComplaintDetail();
    } catch (error) {
      console.error('Error closing incident:', error);
      Toast.show({
        type: 'error',
        text1: 'Close Failed',
        text2: error?.message || 'Unable to close incident',
      });
    } finally {
      setClosingIncident(false);
    }
  };

  const handleRejectIncident = async () => {
    if (!complaint) return;

    try {
      setUpdatingIncidentStatus(true);
      const formType = String(complaint?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';
      const docEntry = complaint?.ComplaintNo || complaintNo;

      const response = await complaintService.updateComplaintStatus(
        dbName || 'MUTSPL_TEST',
        Number(docEntry) || docEntry,
        'D',
        formType,
      );

      if (!response?.Success) {
        throw new Error(response?.Message || 'Unable to reject incident');
      }

      Toast.show({
        type: 'success',
        text1: 'Incident Rejected',
        text2: response?.Message || 'Incident marked as declined',
      });

      await fetchComplaintDetail();
    } catch (error) {
      console.error('Error rejecting incident:', error);
      Toast.show({
        type: 'error',
        text1: 'Reject Failed',
        text2: error?.message || 'Unable to reject incident',
      });
    } finally {
      setUpdatingIncidentStatus(false);
    }
  };

  const fetchComplaintDetail = async () => {
    try {
      setLoading(true);
      console.log('📄 Fetching incident detail:', complaintNo, 'Type:', complaintType);
      const companyDb = dbName || 'MUTSPL_TEST';

      if (isPreventive) {
        const schedulerBusNo = String(routeBusNo || complaintNo || '').trim();
        const schedulerResponse = await maintenanceService.getSchedulerByBus(companyDb, schedulerBusNo);

        if (schedulerResponse?.Success) {
          const lines = Array.isArray(schedulerResponse.Data) ? schedulerResponse.Data : [];
          setSchedulerLines(lines);
          const preventiveDetail = {
            ComplaintNo: complaintNo || schedulerBusNo,
            BusNo: schedulerBusNo,
            ComplaintType: 'Preventive Maintenance',
            ComplaintDate: lastSrvDt || '-',
            ComplaintTime: '',
            Priority: 'Medium',
            Status: String(active || 'Y').toUpperCase() === 'Y' ? 'O' : 'D',
            LastSrvDt: lastSrvDt || '-',
            LastSrvKM: lastSrvKM || 0,
          };
          setComplaint(preventiveDetail);
          setProgressMap({
            incidentCreated: true,
            jobCardCreated: false,
            workOrderCreated: false,
            workOrderSubmitted: false,
            workOrderDocEntry: null,
            inProgress: !isClosedStatus(preventiveDetail.Status),
            closed: isClosedStatus(preventiveDetail.Status),
            workOrderCount: 0,
            canSupervisorClose: false,
          });
        } else {
          setSchedulerLines([]);
          const preventiveDetail = {
            ComplaintNo: complaintNo || schedulerBusNo,
            BusNo: schedulerBusNo,
            ComplaintType: 'Preventive Maintenance',
            ComplaintDate: lastSrvDt || '-',
            ComplaintTime: '',
            Priority: 'Medium',
            Status: String(active || 'Y').toUpperCase() === 'Y' ? 'O' : 'D',
            LastSrvDt: lastSrvDt || '-',
            LastSrvKM: lastSrvKM || 0,
          };
          setComplaint(preventiveDetail);
          setProgressMap({
            incidentCreated: true,
            jobCardCreated: false,
            workOrderCreated: false,
            workOrderSubmitted: false,
            workOrderDocEntry: null,
            inProgress: !isClosedStatus(preventiveDetail.Status),
            closed: isClosedStatus(preventiveDetail.Status),
            workOrderCount: 0,
            canSupervisorClose: false,
          });
        }

        return;
      }
      
      // Use appropriate API based on complaint type
      let response = null;
      try {
        response = isBreakdown
          ? await complaintService.getBreakdownDetail(companyDb, complaintNo)
          : await complaintService.getComplaintDetail(companyDb, complaintNo);
      } catch (detailError) {
        console.warn('Primary incident detail endpoint failed:', detailError?.message || detailError);
      }
      
      console.log('📄 Incident detail response:', response);
      
      const normalizeIncidentRow = (row) => ({
        ...row,
        ComplaintNo: row?.ComplaintNo || row?.DocEntry || row?.BreakdownNo || complaintNo,
        BusNo: row?.BusNo || row?.RegNo || routeBusNo || '-',
        ComplaintType: row?.ComplaintType || row?.FormType || complaintType || 'Driver Complaint',
        ComplaintDate: row?.ComplaintDate || row?.RegDate || row?.IncidentDate || row?.BreakdownDate || row?.ReportDate || '-',
        ComplaintTime: row?.ComplaintTime || row?.RegTime || row?.IncidentTime || row?.BreakdownTime || row?.ReportTime || '',
        Description: row?.Description || row?.Dscrpton || row?.FaultDescription || '',
        DriverName: row?.DriverName || row?.DrvName || row?.Driver || '-',
        DriverCode: row?.DriverCode || row?.DrvCode || '-',
        Odometer: row?.Odometer || row?.Odometr || 0,
        SupervisorName: row?.SupervisorName || row?.SprvsrNm || '-',
        SupervisorCode: row?.SupervisorCode || row?.Supervisr || '-',
        RouteNo: row?.RouteNo || row?.Route || row?.RoutNo || '',
        BreakdownPlace: row?.BrkPlace || row?.BreakdownPlace || row?.Location || '',
        JobCardNo: row?.JobCardNo || row?.JobcardNo || row?.JobCard || routeJobCardNo || '',
        JobCardDocEntry: row?.JobCardDocEntry || row?.JobCardEntry || routeJobCardDocEntry,
        JobCardStatus: row?.JobCardStatus,
        JobCardDate: row?.JobCardDate || row?.JobCardRegDate,
        Faults: Array.isArray(row?.Faults) ? row.Faults : [],
      });

      const buildFaultMasterLookup = (rows) => {
        const lookup = new Map();
        (rows || []).forEach((entry) => {
          const keys = [
            entry?.Code,
            entry?.FaultCode,
            entry?.Name,
            entry?.Fault,
            entry?.FaultName,
          ]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean);

          const description = String(
            entry?.Descriptions
            || entry?.Description
            || entry?.Dscription
            || entry?.FaultDescription
            || '',
          ).trim();

          if (!description || keys.length === 0) return;
          keys.forEach((key) => {
            if (!lookup.has(key)) {
              lookup.set(key, description);
            }
          });
        });
        return lookup;
      };

      const enrichIncidentFaults = (row, faultMasterLookup) => {
        const inlineFaultRows = Array.isArray(row?.Faults) ? row.Faults : [];
        const seededFaultRows = inlineFaultRows.length > 0
          ? inlineFaultRows
          : (function() {
              const fallbackFault = String(row?.FaultName || row?.Fault || row?.FaultCode || '').trim();
              if (!fallbackFault) return [];
              return [{
                Fault: fallbackFault,
                FaultCode: row?.FaultCode || '',
                Description: row?.FaultDescription || row?.Description || row?.Dscrption || '',
              }];
            }());

        const meaningfulFaultRows = seededFaultRows.filter((faultRow) => {
          const faultName = String(faultRow?.Fault || faultRow?.FaultName || faultRow?.FaultCode || '').trim();
          const faultDesc = String(faultRow?.Description || faultRow?.Dscption || faultRow?.FaultDescription || faultRow?.FaultDesc || '').trim();
          return Boolean(faultName || faultDesc);
        });

        const enrichedFaultRows = meaningfulFaultRows.map((faultRow) => {
          const faultName = String(faultRow?.Fault || faultRow?.FaultName || '').trim();
          const faultCode = String(faultRow?.FaultCode || '').trim();
          const existingDescription = String(
            faultRow?.Description
            || faultRow?.Dscption
            || faultRow?.FaultDescription
            || faultRow?.FaultDesc
            || '',
          ).trim();

          if (existingDescription) {
            return {
              ...faultRow,
              Fault: faultName || faultCode || '',
              Description: existingDescription,
            };
          }

          const lookupKeys = [faultCode, faultName]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean);
          const masterDescription = lookupKeys
            .map((key) => faultMasterLookup.get(key))
            .find(Boolean) || '';

          return {
            ...faultRow,
            Fault: faultName || faultCode || '',
            Description: String(masterDescription || '').trim(),
          };
        });

        return {
          ...row,
          Faults: enrichedFaultRows,
        };
      };

      const extractFaultRowsFromRecord = (record) => {
        if (!record || typeof record !== 'object') return [];

        const inlineRows = Array.isArray(record?.Faults) ? record.Faults : [];
        const meaningfulInline = inlineRows.filter((faultRow) => {
          const faultName = String(faultRow?.Fault || faultRow?.FaultName || faultRow?.FaultCode || '').trim();
          const faultDesc = String(faultRow?.Description || faultRow?.Dscption || faultRow?.FaultDescription || faultRow?.FaultDesc || '').trim();
          return Boolean(faultName || faultDesc);
        });

        if (meaningfulInline.length > 0) {
          return meaningfulInline;
        }

        const topFaultName = String(record?.FaultName || record?.Fault || record?.FaultCode || '').trim();
        const topFaultDesc = String(record?.FaultDescription || record?.Description || record?.Dscption || '').trim();
        if (!topFaultName && !topFaultDesc) return [];

        return [{
          Fault: topFaultName,
          FaultCode: String(record?.FaultCode || '').trim(),
          Description: topFaultDesc,
        }];
      };

      const mergeUniqueFaultRows = (records, faultMasterLookup) => {
        const merged = [];
        const seen = new Set();

        records.forEach((record) => {
          const rows = extractFaultRowsFromRecord(record);
          const enrichedRows = enrichIncidentFaults({ Faults: rows }, faultMasterLookup).Faults;
          enrichedRows.forEach((faultRow) => {
            const faultName = String(faultRow?.Fault || faultRow?.FaultName || faultRow?.FaultCode || '').trim();
            const faultDesc = String(faultRow?.Description || faultRow?.Dscption || faultRow?.FaultDescription || faultRow?.FaultDesc || '').trim();
            if (!faultName && !faultDesc) return;

            const dedupeKey = `${faultName.toLowerCase()}|${faultDesc.toLowerCase()}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            merged.push(faultRow);
          });
        });

        return merged;
      };

      let detailPayload = null;
      if (response?.Success && response?.Data) {
        detailPayload = Array.isArray(response.Data) ? response.Data[0] : response.Data;
      }

      let matchedIncident = null;
      try {
        const incidentsRes = await complaintService.getIncidents(companyDb, null, null);
        const incidentRows = Array.isArray(incidentsRes?.Data) ? incidentsRes.Data : [];
        matchedIncident = incidentRows.find((item) => {
          const docEntryValue = String(item?.DocEntry || item?.ComplaintNo || '').trim();
          return docEntryValue && docEntryValue === String(complaintNo || '').trim();
        }) || null;
      } catch (incidentsError) {
        console.warn('GetIncidents lookup failed:', incidentsError?.message || incidentsError);
      }

      if (!detailPayload) {
        if (matchedIncident) {
          detailPayload = matchedIncident;
        }
      }

      if (detailPayload) {
        console.log('📄 All available fields in detail payload:', Object.keys(detailPayload));
        console.log('📄 Checking for job card fields:');
        console.log('   - JobCardNo:', detailPayload.JobCardNo);
        console.log('   - JobCard:', detailPayload.JobCard);
        console.log('   - JobCardDocEntry:', detailPayload.JobCardDocEntry);
        console.log('   - JobCardEntry:', detailPayload.JobCardEntry);
        console.log('   - JobCardStatus:', detailPayload.JobCardStatus);
        
        // Normalize complaint/breakdown fields into one incident shape
        let normalizedData = normalizeIncidentRow(detailPayload);
        let faultMasterLookup = new Map();

        try {
          const faultMasterResponse = await complaintService.getFaultMaster(companyDb);
          const faultMasterRows = Array.isArray(faultMasterResponse?.Data) ? faultMasterResponse.Data : [];
          faultMasterLookup = buildFaultMasterLookup(faultMasterRows);
        } catch (faultMasterError) {
          console.warn('Unable to fetch fault master for description enrichment:', faultMasterError?.message || faultMasterError);
        }

        const mergedFaults = mergeUniqueFaultRows([
          detailPayload,
          matchedIncident,
          source,
          normalizedData,
        ], faultMasterLookup);

        normalizedData = {
          ...normalizedData,
          Faults: mergedFaults,
        };

        normalizedData = await resolveLinkedJobCardInfo(normalizedData);

        setComplaint(normalizedData);
        await deriveProgressMap(normalizedData);
      } else {
        setComplaint(null);
      }
    } catch (error) {
      console.error('Error fetching complaint detail:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchComplaintDetail();
    });

    return unsubscribe;
  }, [navigation, complaintNo, dbName, complaintType, routeJobCardNo, routeJobCardDocEntry]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchComplaintDetail();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.light }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.dark }]}>Loading incident details...</Text>
      </View>
    );
  }

  if (!complaint) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.light }]}>
        <MaterialIcons name="error-outline" size={64} color={colors.gray} />
        <Text style={[styles.errorText, { color: colors.dark }]}>Incident not found</Text>
      </View>
    );
  }

  const linkedJobCardNo = String(complaint?.JobCardNo || complaint?.JobcardNo || routeJobCardNo || '').trim();
  const linkedJobCardDocEntry = Number(
    complaint?.JobCardDocEntry || complaint?.JobCardEntry || routeJobCardDocEntry || 0,
  );
  const resolvedFaultsForJobCard = (() => {
    const rawFaults = Array.isArray(complaint?.Faults) ? complaint.Faults : [];
    const meaningfulFaults = rawFaults.filter((faultRow) => {
      const faultName = String(faultRow?.Fault || faultRow?.FaultName || faultRow?.FaultCode || '').trim();
      const faultDesc = String(faultRow?.Description || faultRow?.Dscption || faultRow?.FaultDescription || faultRow?.FaultDesc || '').trim();
      return Boolean(faultName || faultDesc);
    });

    return meaningfulFaults;
  })();
  const hasLinkedJobCard = linkedJobCardNo.length > 0 || linkedJobCardDocEntry > 0;
  const linkedJobCardDisplay = linkedJobCardNo || (linkedJobCardDocEntry > 0 ? String(linkedJobCardDocEntry) : '');
  const jobTypeCode = String(complaint?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';
  const openWorkOrderDetail = () => {
    if (!linkedJobCardDisplay) return;

    navigation.navigate('WorkOrderDetail', {
      docEntry: linkedJobCardDocEntry > 0 ? linkedJobCardDocEntry : linkedJobCardDisplay,
      jobCardNo: linkedJobCardDisplay,
      jobType: jobTypeCode,
      complaintNo: complaint.ComplaintNo,
      busNo: complaint.BusNo,
      depot: complaint.Depot,
      description: complaint.Description,
      complaintType: complaint.ComplaintType,
      regTime: complaint.RegTime,
      complaintTime: complaint.ComplaintTime,
      incidentTime: complaint.IncidentTime,
      dbName: dbName,
    });
  };

  const openSubmittedWorkOrder = () => {
    if (!progressMap.workOrderDocEntry) return;

    navigation.navigate('WorkOrderApiDetail', {
      workOrderDocEntry: progressMap.workOrderDocEntry,
      dbName,
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.light }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Header Card */}
      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.complaintNo, { color: colors.dark }]}>Incident #{complaint.ComplaintNo}</Text>
            <Text style={[styles.busNo, { color: colors.primary }]}>
              <MaterialIcons name="directions-bus" size={18} /> Bus {complaint.BusNo}
            </Text>
          </View>
          <View
            style={[styles.priorityBadge, { backgroundColor: getStatusColor(complaint.Status) }]}
          >
            <Text style={styles.priorityText}>{getStatusName(complaint.Status)}</Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.infoRow}>
          <MaterialIcons name="category" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Type:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.ComplaintType}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="flag" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Priority:</Text>
          <View style={[styles.priorityBadge, { 
            backgroundColor: complaint.Priority === 'High' ? '#FF5252' : 
                           complaint.Priority === 'Medium' ? '#FFA726' : '#66BB6A' 
          }]}>
            <Text style={styles.priorityText}>{complaint.Priority}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="event" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Date & Time:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>
            {complaint.ComplaintDate} {complaint.ComplaintTime}
          </Text>
        </View>
      </View>

      {!isPreventive && hasLinkedJobCard ? (
        <View style={[styles.card, { backgroundColor: colors.white, marginBottom: 0 }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.sm }]}>
            <MaterialIcons name="assignment" size={20} /> Job Card
          </Text>
          <View style={styles.infoRow}>
            <MaterialIcons name="confirmation-number" size={20} color={colors.primary} />
            <Text style={[styles.infoLabel, { color: colors.gray }]}>Job Card No:</Text>
            <Text style={[styles.infoValue, { color: colors.dark, fontWeight: 'bold' }]}>{linkedJobCardDisplay}</Text>
          </View>
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={openWorkOrderDetail}
            style={styles.viewJobCardButton}
            contentStyle={{ paddingVertical: 8 }}
          >
            Open Job Card
          </Button>
        </View>
      ) : null}

      {!isPreventive && supervisorUser && !hasLinkedJobCard && (complaint.Status === 'O' || complaint.Status === 'I') ? (
        <View style={[styles.card, { backgroundColor: colors.white, marginTop: 0 }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.sm }]}>
            <MaterialIcons name="pending-actions" size={20} /> Supervisor Action
          </Text>
          <Text style={[styles.progressHint, { color: colors.gray, marginTop: 0, marginBottom: SPACING.sm }]}>
            Accept to create a Job Card and push to Team Leader. Reject to decline this incident.
          </Text>
          <View style={styles.supervisorActionRow}>
            <Button
              mode="contained"
              icon="check-circle"
              uppercase={false}
              onPress={() => navigation.navigate('CreateJobCard', {
                complaintNo: complaint.ComplaintNo,
                busNo: complaint.BusNo,
                depot: complaint.Depot,
                faults: resolvedFaultsForJobCard,
                priority: complaint.Priority,
                complaintType: complaint.ComplaintType,
                driverName: complaint.DriverName,
                driverCode: complaint.DriverCode,
                odometer: complaint.Odometer,
                routeNo: complaint.RouteNo,
                breakdownPlace: complaint.BreakdownPlace,
                dbName: dbName,
              })}
              style={[styles.createJobCardButton, styles.supervisorActionButton, { marginHorizontal: 0, marginTop: 0, marginBottom: 0 }]}
              contentStyle={{ paddingVertical: 8 }}
              labelStyle={{ color: '#FFFFFF', fontWeight: '700' }}
            >
              Accept
            </Button>
            <Button
              mode="outlined"
              icon="close-circle"
              uppercase={false}
              onPress={handleRejectIncident}
              loading={updatingIncidentStatus}
              disabled={updatingIncidentStatus}
              style={[styles.supervisorActionButton, { borderColor: '#BB0000' }]}
              labelStyle={{ color: '#BB0000', fontWeight: '700' }}
              contentStyle={{ paddingVertical: 8 }}
            >
              Reject
            </Button>
          </View>
        </View>
      ) : null}

      {!isPreventive && (
        <View style={[styles.card, { backgroundColor: colors.white }]}> 
          <Text style={[styles.sectionTitle, { color: colors.dark }]}> 
            <MaterialIcons name="timeline" size={20} /> Progress Map
          </Text>

          <View style={styles.progressRow}>
            <MaterialIcons
              name={progressMap.incidentCreated ? 'check-circle' : 'radio-button-unchecked'}
              size={18}
              color={progressMap.incidentCreated ? colors.primary : colors.gray}
            />
            <Text style={[styles.progressText, { color: colors.dark }]}>Incident Created</Text>
          </View>

          <View style={styles.progressRow}>
            <MaterialIcons
              name={progressMap.jobCardCreated ? 'check-circle' : 'radio-button-unchecked'}
              size={18}
              color={progressMap.jobCardCreated ? colors.primary : colors.gray}
            />
            <Text style={[styles.progressText, { color: colors.dark }]}>Job Card Created</Text>
          </View>

          <View style={styles.progressRow}>
            <MaterialIcons
              name={progressMap.inProgress ? 'check-circle' : 'radio-button-unchecked'}
              size={18}
              color={progressMap.inProgress ? colors.primary : colors.gray}
            />
            <Text style={[styles.progressText, { color: colors.dark }]}>In Progress</Text>
          </View>

          <View style={styles.progressRow}>
            <MaterialIcons
              name={progressMap.workOrderSubmitted ? 'check-circle' : 'radio-button-unchecked'}
              size={18}
              color={progressMap.workOrderSubmitted ? colors.primary : colors.gray}
            />
            <Text style={[styles.progressText, { color: colors.dark }]}>Work Order Submitted</Text>
            {progressMap.workOrderSubmitted && progressMap.workOrderDocEntry ? (
              <TouchableOpacity onPress={openSubmittedWorkOrder} style={styles.progressLinkButton}>
                <MaterialIcons name="open-in-new" size={14} color={colors.primary} />
                <Text style={[styles.progressLinkText, { color: colors.primary }]}>Open</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.progressRow}>
            <MaterialIcons
              name={progressMap.closed ? 'check-circle' : 'radio-button-unchecked'}
              size={18}
              color={progressMap.closed ? colors.primary : colors.gray}
            />
            <Text style={[styles.progressText, { color: colors.dark }]}>Closed</Text>
          </View>

          {progressMap.canSupervisorClose && (
            <Button
              mode="contained"
              icon="check-circle"
              onPress={handleCloseIncident}
              loading={closingIncident}
              disabled={closingIncident}
              style={styles.closeIncidentButton}
              contentStyle={{ minHeight: 44 }}
            >
              Close Incident
            </Button>
          )}

          {!progressMap.canSupervisorClose && supervisorUser && !progressMap.closed && (
            <Text style={[styles.progressHint, { color: colors.gray }]}>
              Close button will be enabled after Work Order is submitted.
            </Text>
          )}
        </View>
      )}

      {/* Vehicle & Driver Info */}
      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={[styles.sectionTitle, { color: colors.dark }]}>
          <MaterialIcons name="info" size={20} /> {isPreventive ? 'Vehicle Information' : 'Vehicle & Driver Information'}
        </Text>

        <View style={styles.infoRow}>
          <MaterialIcons name="location-city" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Depot:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.Depot}</Text>
        </View>

        {!isPreventive && (
          <View style={styles.infoRow}>
            <MaterialIcons name="person" size={20} color={colors.gray} />
            <Text style={[styles.infoLabel, { color: colors.gray }]}>Driver:</Text>
            <Text style={[styles.infoValue, { color: colors.dark }]}>
              {complaint.DriverName} ({complaint.DriverCode})
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <MaterialIcons name="speed" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>{isPreventive ? 'Last Service KM:' : 'Odometer:'}</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{isPreventive ? complaint.LastSrvKM : complaint.Odometer} km</Text>
        </View>

        {isPreventive ? (
          <View style={styles.infoRow}>
            <MaterialIcons name="event" size={20} color={colors.gray} />
            <Text style={[styles.infoLabel, { color: colors.gray }]}>Last Service:</Text>
            <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.LastSrvDt || '-'}</Text>
          </View>
        ) : (
          <View style={styles.infoRow}>
            <MaterialIcons name="supervisor-account" size={20} color={colors.gray} />
            <Text style={[styles.infoLabel, { color: colors.gray }]}>Supervisor:</Text>
            <Text style={[styles.infoValue, { color: colors.dark }]}>
              {complaint.SupervisorName} ({complaint.SupervisorCode})
            </Text>
          </View>
        )}
      </View>

      {isPreventive && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}> 
            <MaterialIcons name="build" size={20} /> Scheduled Tasks
          </Text>
          {schedulerLines.length > 0 ? schedulerLines.map((taskLine, index) => (
            <View key={`${taskLine.LineId || index}`} style={[styles.faultItem, { backgroundColor: colors.light }]}> 
              <View style={styles.faultHeader}>
                <MaterialIcons name="check-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.faultTitle, { color: colors.dark }]}>{taskLine.Task || `Task ${index + 1}`}</Text>
              </View>
              <Text style={[styles.faultDescription, { color: colors.gray }]}>Repeat Type: {formatSchedulerRepeatType(taskLine.RepeatType)}</Text>
              {Number(taskLine.EveryDay || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Every Day: {taskLine.EveryDay}</Text>
              )}
              {Number(taskLine.EveryWeek || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Every Week: {taskLine.EveryWeek}</Text>
              )}
              {Number(taskLine.EveryMonth || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Every Month: {taskLine.EveryMonth}</Text>
              )}
              {Number(taskLine.EveryKM || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Every KM: {taskLine.EveryKM}</Text>
              )}
              {Number(taskLine.NotifyDay || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Notify Day: {taskLine.NotifyDay}</Text>
              )}
              {Number(taskLine.NotifyKM || 0) > 0 && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Notify KM: {taskLine.NotifyKM}</Text>
              )}
              {String(taskLine.DueStatus || '').trim() !== '' && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Due Status: {taskLine.DueStatus}</Text>
              )}
              {String(taskLine.NextDueDt || '').trim() !== '' && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>Next Due Date: {taskLine.NextDueDt}</Text>
              )}
            </View>
          )) : (
            <Text style={[styles.description, { color: colors.gray }]}>No scheduled tasks found for this bus.</Text>
          )}
        </View>
      )}

      {/* Description */}
      {!isPreventive && complaint.Description && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            <MaterialIcons name="description" size={20} /> Description
          </Text>
          <Text style={[styles.description, { color: colors.dark }]}>
            {complaint.Description}
          </Text>
        </View>
      )}

      {/* Faults */}
      {!isPreventive && resolvedFaultsForJobCard.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            <MaterialIcons name="build" size={20} /> Faults
          </Text>
          {resolvedFaultsForJobCard.map((fault, index) => (
            <View key={index} style={[styles.faultItem, { backgroundColor: colors.light }]}>
              <View style={styles.faultHeader}>
                <MaterialIcons name="warning" size={20} color="#FF9800" />
                <Text style={[styles.faultTitle, { color: colors.dark }]}>{fault.Fault || 'Reported Issue'}</Text>
              </View>
              {(fault.Description || fault.Dscption || fault.FaultDescription) && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>
                  {fault.Description || fault.Dscption || fault.FaultDescription}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
  card: {
    margin: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  createJobCardButton: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  viewJobCardButton: {
    borderRadius: BORDER_RADIUS.md,
  },
  closeIncidentButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  complaintNo: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  busNo: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    marginVertical: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 14,
    marginLeft: SPACING.sm,
    width: 100,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: SPACING.sm,
  },
  progressMeta: {
    fontSize: 12,
    marginLeft: SPACING.xs,
    fontWeight: '500',
  },
  progressHint: {
    fontSize: 12,
    marginTop: SPACING.xs,
  },
  supervisorActionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  supervisorActionButton: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
  },
  progressLinkButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  progressLinkText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  faultItem: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  faultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  faultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: SPACING.sm,
    flex: 1,
  },
  faultDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 28,
  },
});

export default ComplaintDetailScreen;

