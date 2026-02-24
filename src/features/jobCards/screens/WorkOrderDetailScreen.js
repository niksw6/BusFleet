import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Text, Button, Divider, TextInput as PaperTextInput } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService, masterService } from '../../../api/services';
import ModalSelector from '../../../shared/components/ModalSelector';
import { formatDate, getStatusName, formatJobCardDisplayNo, getJobTypeCode } from '../../../utils/helpers';

/**
 * Work Order Detail Screen
 * Mimics HeavyVehicleInspection.com work order detail view
 * Shows tabs: Mechanics, PartDetails, Details, WorkOrder
 */
const WorkOrderDetailScreen = ({ route, navigation }) => {
  const {
    jobCardNo,
    docEntry,
    jobType,
    complaintType: routeComplaintType,
    complaintNo,
    dbName: routeDbName,
    regTime: routeRegTime,
    complaintTime: routeComplaintTime,
    incidentTime: routeIncidentTime,
  } = route.params;
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Details');
  const [workOrder, setWorkOrder] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [parts, setParts] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [selectedPartIndex, setSelectedPartIndex] = useState(null);
  const [faultSelectionTarget, setFaultSelectionTarget] = useState({ type: null, key: null });
  const [loadingPartsData, setLoadingPartsData] = useState(true);
  const [loadingWarehousesData, setLoadingWarehousesData] = useState(true);
  const [workEntry, setWorkEntry] = useState({ description: '', hours: '' });
  const [mechanicWork, setMechanicWork] = useState([]);
  const [selectedMechanics, setSelectedMechanics] = useState([]);
  const [mechanicFaultMap, setMechanicFaultMap] = useState({});
  const [submittingWorkOrder, setSubmittingWorkOrder] = useState(false);
  const [workOrderEntries, setWorkOrderEntries] = useState([]);
  const [loadingWorkOrderEntries, setLoadingWorkOrderEntries] = useState(false);
  const [workOrderExpandedMap, setWorkOrderExpandedMap] = useState({});

  const tabs = [
    'Details',
    'Mechanics',
    'PartDetails',
    'WorkOrder',
  ];

  useEffect(() => {
    fetchWorkOrderDetails();
    fetchSpareParts();
    fetchWarehouses();
    fetchRelatedWorkOrders();
  }, []);

  const fetchRelatedWorkOrders = async () => {
    try {
      setLoadingWorkOrderEntries(true);
      const response = await jobCardService.getWorkOrders(dbName || 'MUTSPL_TEST', 'O');
      if (response?.Success && Array.isArray(response?.Data)) {
        const currentDocEntry = Number(workOrder?.DocEntry || docEntry || 0);
        const currentJobCardNo = String(workOrder?.JobCardNo || jobCardNo || '').trim();
        const filtered = response.Data.filter(entry => {
          const entryDoc = Number(entry?.JCDocEnt || entry?.DocEntry || 0);
          const entryJobNo = String(entry?.JCDocNum || entry?.JobCardNo || '').trim();
          return (currentDocEntry && entryDoc === currentDocEntry) ||
            (currentJobCardNo && entryJobNo && entryJobNo === currentJobCardNo);
        });

        const enriched = await Promise.all(
          filtered.map(async (entry) => {
            const workOrderDocEntry = Number(entry?.DocEntry || 0);
            if (!workOrderDocEntry) {
              return {
                ...entry,
                AssignedMechanics: String(entry?.MechName || '').trim(),
                MechanicStartDt: entry?.StartDt || null,
                MechanicStartTm: entry?.StartTm || null,
                MechanicsTotalHrs: entry?.TotalHrs ?? null,
                WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || entry?.FaultDesc || '').trim(),
                DetailedFaults: [],
                DetailedParts: [],
              };
            }

            try {
              const detailResponse = await jobCardService.getWorkOrderById(dbName || 'MUTSPL_TEST', workOrderDocEntry);
              const detailData = detailResponse?.Success ? detailResponse?.Data : null;

              if (!detailData) {
                return {
                  ...entry,
                  AssignedMechanics: String(entry?.MechName || '').trim(),
                  MechanicStartDt: entry?.StartDt || null,
                  MechanicStartTm: entry?.StartTm || null,
                  MechanicsTotalHrs: entry?.TotalHrs ?? null,
                  WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || entry?.FaultDesc || '').trim(),
                  DetailedFaults: [],
                  DetailedParts: [],
                };
              }

              const mechanics = Array.isArray(detailData?.Mechanics) ? detailData.Mechanics : [];

              const mechanicNames = mechanics
                .map(mech => String(mech?.MechName || '').trim())
                .filter(Boolean);

              const firstMechanicWithStart = mechanics.find(mech => mech?.StartDt || mech?.StartTm);

              const mechanicRemarks = mechanics
                .map(mech => String(mech?.Remarks || '').trim())
                .filter(Boolean);

              const totalFromMechanics = mechanics.reduce((sum, mech) => sum + (Number(mech?.TotalHrs) || 0), 0);

              return {
                ...entry,
                AssignedMechanics: mechanicNames.join(', ') || String(entry?.MechName || '').trim(),
                MechanicStartDt: firstMechanicWithStart?.StartDt || detailData?.AssignDt || null,
                MechanicStartTm: firstMechanicWithStart?.StartTm || null,
                MechanicsTotalHrs: detailData?.TotalHrs ?? totalFromMechanics ?? null,
                WorkDoneDetails: mechanicRemarks.join(', ') || String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || entry?.FaultDesc || '').trim(),
                DetailedFaults: Array.isArray(detailData?.Faults) ? detailData.Faults : [],
                DetailedParts: Array.isArray(detailData?.Parts) ? detailData.Parts : [],
              };
            } catch (detailError) {
              console.error('Error fetching work order detail:', detailError);
              return {
                ...entry,
                AssignedMechanics: String(entry?.MechName || '').trim(),
                MechanicStartDt: entry?.StartDt || null,
                MechanicStartTm: entry?.StartTm || null,
                MechanicsTotalHrs: entry?.TotalHrs ?? null,
                WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || entry?.FaultDesc || '').trim(),
                DetailedFaults: [],
                DetailedParts: [],
              };
            }
          })
        );

        setWorkOrderEntries(enriched);
        setWorkOrderExpandedMap((prev) => {
          const next = { ...prev };
          enriched.forEach((entry, index) => {
            const key = String(entry?.DocEntry || entry?.DocNum || `entry-${index}`);
            if (next[key] === undefined) {
              next[key] = true;
            }
          });
          return next;
        });
      } else {
        setWorkOrderEntries([]);
      }
    } catch (error) {
      console.error('Error fetching related work orders:', error);
      setWorkOrderEntries([]);
    } finally {
      setLoadingWorkOrderEntries(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      setLoadingWarehousesData(true);
      const response = await masterService.getWarehouses(dbName || 'MUTSPL_TEST');
      if (response?.Success && Array.isArray(response.Data)) {
        setWarehouses(response.Data);
      } else {
        setWarehouses([]);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      setWarehouses([]);
    } finally {
      setLoadingWarehousesData(false);
    }
  };

  const fetchSpareParts = async () => {
    try {
      setLoadingPartsData(true);
      const response = await masterService.getSpareParts(dbName || 'MUTSPL_TEST');
      if (response?.Success && Array.isArray(response.Data)) {
        setSpareParts(response.Data);
      } else {
        setSpareParts([]);
      }
    } catch (error) {
      console.error('Error fetching spare parts:', error);
      setSpareParts([]);
    } finally {
      setLoadingPartsData(false);
    }
  };

  const getSelectedParts = () => workOrder?.Parts || [];

  const updateSelectedParts = (updatedParts) => {
    setWorkOrder(prev => ({ ...(prev || {}), Parts: updatedParts }));
    setParts(updatedParts);
  };

  const updatePartField = (index, field, value) => {
    const updated = [...getSelectedParts()];
    updated[index] = { ...updated[index], [field]: value };
    updateSelectedParts(updated);
  };

  const updatePartFields = (index, fields) => {
    const updated = [...getSelectedParts()];
    updated[index] = { ...updated[index], ...fields };
    updateSelectedParts(updated);
  };

  const getDisplayDate = (job) => {
    if (!job) return '-';
    const dateValue = job.RegDate || job.CreateDate || job.DocDate;
    if (!dateValue) return '-';
    return String(dateValue).includes('T') ? formatDate(dateValue) : dateValue;
  };

  const getDisplayTime = (job) => {
    if (!job && !routeRegTime && !routeComplaintTime && !routeIncidentTime) return '-';

    const rawTime =
      job?.RegTime ||
      job?.ComplaintTime ||
      job?.IncidentTime ||
      job?.CreateTime ||
      job?.DocTime ||
      job?.BrkTime ||
      routeRegTime ||
      routeComplaintTime ||
      routeIncidentTime;

    if (!rawTime) {
      const dateTimeSource = job?.RegDate || job?.CreateDate || job?.DocDate;
      if (dateTimeSource) {
        const isoMatch = String(dateTimeSource).match(/T(\d{2}:\d{2})(:\d{2})?/);
        if (isoMatch?.[1]) return isoMatch[1];

        const parsedDate = new Date(dateTimeSource);
        if (!Number.isNaN(parsedDate.getTime())) {
          return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
        }
      }
      return '-';
    }

    const timeString = String(rawTime).trim();
    if (!timeString || timeString === 'HH12:MI AM') return '-';

    const placeholderPattern = /HH(\d{1,2})?:MI\s*(AM|PM)?/i;
    const placeholderMatch = timeString.match(placeholderPattern);
    if (placeholderMatch) {
      const hours = placeholderMatch[1] ? placeholderMatch[1].padStart(2, '0') : '';
      const amPm = placeholderMatch[2] ? ` ${placeholderMatch[2].toUpperCase()}` : '';
      return hours ? `${hours}:00${amPm}` : '-';
    }

    if (/^\d{3,4}$/.test(timeString)) {
      const normalized = timeString.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }

    const isoMatch = timeString.match(/T(\d{2}:\d{2})(:\d{2})?/);
    if (isoMatch?.[1]) {
      return isoMatch[1];
    }

    const hhMmSsMatch = timeString.match(/^(\d{2}:\d{2}):\d{2}$/);
    if (hhMmSsMatch?.[1]) {
      return hhMmSsMatch[1];
    }

    const parsedDate = new Date(timeString);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
    }

    return timeString;
  };

  const getDisplayComplaintType = (job) => {
    if (routeComplaintType && String(routeComplaintType).trim()) {
      return routeComplaintType;
    }
    return job?.ComplaintType || '-';
  };

  const formatMechanicTime = (raw) => {
    if (!raw && raw !== 0) return '-';
    const value = String(raw).trim();
    if (!value) return '-';
    if (/^\d{3,4}$/.test(value)) {
      const normalized = value.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }
    const hhMmMatch = value.match(/^(\d{2}):(\d{2})/);
    if (hhMmMatch) return `${hhMmMatch[1]}:${hhMmMatch[2]}`;
    return value;
  };

  const getMechanicSummaryFromCurrentWO = () => {
    const mechanics = Array.isArray(workOrder?.Mechanics) ? workOrder.Mechanics : [];
    if (mechanics.length === 0) {
      return {
        startDt: '-',
        startTm: '-',
        totalHrs: '-',
        remarks: '-',
      };
    }

    const firstWithStart = mechanics.find(mech => mech?.StartDt || mech?.StartTm) || mechanics[0];
    const remarks = mechanics
      .map(mech => String(mech?.Remarks || '').trim())
      .filter(Boolean)
      .join(', ');
    const totalHrsValue = mechanics.reduce((sum, mech) => sum + (Number(mech?.TotalHrs) || 0), 0);

    return {
      startDt: firstWithStart?.StartDt ? formatDate(firstWithStart.StartDt) : '-',
      startTm: formatMechanicTime(firstWithStart?.StartTm),
      totalHrs: (workOrder?.TotalHrs ?? totalHrsValue ?? '-') === '' ? '-' : (workOrder?.TotalHrs ?? totalHrsValue ?? '-'),
      remarks: remarks || '-',
    };
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

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return '#FF5252';
      case 'Medium':
        return '#FFA726';
      case 'Low':
        return '#66BB6A';
      default:
        return '#6A6D70';
    }
  };

  const fetchWorkOrderDetails = async () => {
    try {
      setLoading(true);
      const lookupDocEntry = docEntry || jobCardNo;
      const response = await jobCardService.getJobCardDetail(dbName || 'MUTSPL_TEST', lookupDocEntry);
      
      if (response.Success && response.Data) {
        setWorkOrder(response.Data);
        
        // Use API data for tasks/operations and parts if available
        if (response.Data.Operations && Array.isArray(response.Data.Operations)) {
          setTasks(response.Data.Operations);
        } else {
          setTasks([]);
        }
        
        if (response.Data.Parts && Array.isArray(response.Data.Parts)) {
          setParts(response.Data.Parts);
        } else {
          setParts([]);
        }
      }
    } catch (error) {
      console.error('Error fetching work order details:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: 'Unable to fetch work order details',
      });
    } finally {
      setLoading(false);
    }
  };

  const getMechanicName = (mechanic) => (
    mechanic?.Mechanic || mechanic?.MechanicName || mechanic?.Name || mechanic?.Mech || '-'
  );

  const getAvailableFaults = () => {
    if (workOrder?.Faults && workOrder.Faults.length > 0) {
      return workOrder.Faults.map((fault, index) => ({
        FaultCode: String(fault?.FaultCode || fault?.Fault || `FLT${String(index + 1).padStart(3, '0')}`),
        FaultDesc: fault?.FaultDesc || fault?.Dscption || fault?.Description || fault?.Fault || workEntry.description || '',
      }));
    }

    return [{
      FaultCode: 'FLT001',
      FaultDesc: workEntry.description || 'General Work',
    }];
  };

  const getFaultDisplayLabel = (faultCode) => {
    if (!faultCode) return '';
    const fault = getAvailableFaults().find(f => String(f.FaultCode) === String(faultCode));
    if (!fault) return String(faultCode);
    return fault.FaultDesc ? `${fault.FaultCode} - ${fault.FaultDesc}` : fault.FaultCode;
  };

  const openFaultSelector = (type, key) => {
    setFaultSelectionTarget({ type, key });
    setShowFaultModal(true);
  };

  const handleFaultSelected = (value, item) => {
    const selectedFaultCode = String(item?.FaultCode || value || '');
    if (!selectedFaultCode) return;

    if (faultSelectionTarget.type === 'mechanic') {
      setMechanicFaultMap(prev => ({ ...prev, [faultSelectionTarget.key]: selectedFaultCode }));
    }

    if (faultSelectionTarget.type === 'part' && Number.isInteger(faultSelectionTarget.key)) {
      updatePartField(faultSelectionTarget.key, 'Fault', selectedFaultCode);
    }

    setShowFaultModal(false);
    setFaultSelectionTarget({ type: null, key: null });
  };

  const toggleMechanicSelection = (mechanicName) => {
    const isAlreadySelected = selectedMechanics.includes(mechanicName);

    if (isAlreadySelected) {
      setSelectedMechanics(prev => prev.filter(name => name !== mechanicName));
      setMechanicFaultMap(prev => {
        const updated = { ...prev };
        delete updated[mechanicName];
        return updated;
      });
      return;
    }

    const defaultFault = getAvailableFaults()[0]?.FaultCode || 'FLT001';
    setSelectedMechanics(prev => [...prev, mechanicName]);
    setMechanicFaultMap(prev => ({ ...prev, [mechanicName]: prev[mechanicName] || defaultFault }));
  };

  const handleCreateWorkOrder = async () => {
    if (!workEntry.description.trim() || !workEntry.hours.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please fill in all fields',
      });
      return;
    }

    if (selectedMechanics.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Select Mechanics',
        text2: 'Please select at least one mechanic',
      });
      return;
    }

    try {
      setSubmittingWorkOrder(true);

      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentDateTime = `${currentDate}T00:00:00`;
      const currentTimeHHmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const totalHours = Number.parseFloat(workEntry.hours) || 0;
      const jobCardDocEntry = Number(workOrder?.DocEntry || docEntry || 0);
      const jobCardDocNum = String(workOrder?.JobCardNo || jobCardNo || '').trim();

      if (!jobCardDocEntry) {
        Toast.show({
          type: 'error',
          text1: 'Missing Job Card',
          text2: 'Unable to identify Job Card document entry',
        });
        return;
      }

      if (!jobCardDocNum) {
        Toast.show({
          type: 'error',
          text1: 'Missing Job Card Number',
          text2: 'Unable to identify Job Card number',
        });
        return;
      }

      const normalizedFaults = getAvailableFaults();
      const fallbackFaultCode = normalizedFaults[0]?.FaultCode || 'FLT001';

      const selectedMechanicRows = selectedMechanics.map((name, index) => {
        const source = (workOrder?.Mechanics || []).find(m => getMechanicName(m) === name) || {};
        const faultRef = mechanicFaultMap[name] || normalizedFaults[index % normalizedFaults.length]?.FaultCode || fallbackFaultCode;
        return {
          Fault: faultRef,
          MechCode: source.MechanicCode || source.MechCode || source.Code || source.Mechanic || '',
          MechName: name,
          StartDt: currentDateTime,
          StartTm: currentTimeHHmm,
          EndDt: null,
          EndTm: null,
          TotalHrs: totalHours,
          Status: 'IP',
          Remarks: '',
        };
      });

      const mechanicsWithoutCode = selectedMechanicRows.filter(row => !String(row.MechCode || '').trim());
      if (mechanicsWithoutCode.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Mechanic Code Missing',
          text2: 'Selected mechanics must have MechCode in Job Card details',
        });
        return;
      }

      const selectedParts = getSelectedParts();
      const partRows = selectedParts.map((part, index) => ({
        Fault: part.Fault || normalizedFaults[index % normalizedFaults.length]?.FaultCode || fallbackFaultCode,
        ItemCode: part.ItemCode || '',
        ItemName: part.ItemName || '',
        ReqQty: Number(part.ReqQty) || 0,
        AddQty: Number(part.AddQty) || 0,
        IssQty: Number(part.IssQty) || 0,
        Whs: part.Whs || '',
        DraftEnt: null,
        Status: part.Status || 'R',
      }));

      const partsWithoutWarehouse = partRows.filter(part => !String(part.Whs || '').trim());
      if (partsWithoutWarehouse.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Warehouse Required',
          text2: 'Please select warehouse for all selected parts',
        });
        return;
      }

      const payload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JCDocEnt: jobCardDocEntry,
        JCDocNum: jobCardDocNum,
        Vehicle: String(workOrder?.BusNo || ''),
        Driver: String(workOrder?.Driver || ''),
        Depot: String(workOrder?.Depot || ''),
        Priority: String(workOrder?.Priority || 'Medium'),
        Status: 'O',
        AssignBy: String(user?.Code || user?.code || workOrder?.Supervisr || ''),
        AssignDt: currentDateTime,
        TotalHrs: totalHours,
        Faults: normalizedFaults.map(fault => ({
          FaultCode: fault.FaultCode,
          FaultDesc: fault.FaultDesc,
          Status: 'O',
          TotalHrs: totalHours,
          CompDate: null,
        })),
        Mechanics: selectedMechanicRows,
        Parts: partRows,
      };

      const response = await jobCardService.createWorkOrder(payload);
      if (response?.Success) {
        const timestamp = now.toISOString();
        const newWorkEntries = selectedMechanics.map((mechanicName, index) => ({
          id: Date.now() + index,
          mechanicName,
          description: workEntry.description,
          hours: workEntry.hours,
          timestamp,
        }));

        setMechanicWork(prev => [...newWorkEntries, ...prev]);
        setWorkEntry({ description: '', hours: '' });
        setSelectedMechanics([]);
        await fetchRelatedWorkOrders();

        Toast.show({
          type: 'success',
          text1: 'Work Order Created',
          text2: response.Message || 'Work order submitted successfully',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Submission Failed',
          text2: response?.Message || 'Unable to create work order',
        });
      }
    } catch (error) {
      console.error('Error creating work order:', error);
      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: error.message || 'Unable to create work order',
      });
    } finally {
      setSubmittingWorkOrder(false);
    }
  };

  const renderWODetails = () => (
    <View style={styles.tabContent}>
      {(() => {
        const mechanicSummary = getMechanicSummaryFromCurrentWO();
        return (
      <View style={styles.detailsGrid}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Job Card No:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{formatJobCardDisplayNo({ ...workOrder, JobType: workOrder?.JobType || jobType || getJobTypeCode(workOrder || {}) })}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Date:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayDate(workOrder)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Time:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayTime(workOrder)}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Vehicle Number:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.BusNo || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Complaint Type:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{getDisplayComplaintType(workOrder)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Priority:</Text>
          <View
            style={[styles.priorityBadgeInline, { backgroundColor: getPriorityColor(workOrder?.Priority || 'Low') }]}
          >
            <Text style={styles.priorityTextInline}>{workOrder?.Priority || 'Low'}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Status:</Text>
          <View
            style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(workOrder?.Status) }]}
          >
            <Text style={styles.priorityTextInline}>{getStatusName(workOrder?.Status)}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>StartDt:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.startDt}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>StartTm:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.startTm}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>TotalHrs:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.totalHrs}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Work Done:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{mechanicSummary.remarks}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Driver:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Driver || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Supervisor:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.SprvsrNm || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Depot:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Depot || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Branch:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.BranchNm || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Route No:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.RouteNo?.toString() || '-'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Odometer:</Text>
          <Text style={[styles.detailValue, { color: colors.dark }]}>{workOrder?.Odometer || '-'} km</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.gray }]}>Description:</Text>
          <Text style={[styles.detailValue, { color: colors.dark, marginTop: 4 }]}>{workOrder?.Description || '-'}</Text>
        </View>

        {workOrder?.Faults && workOrder.Faults.length > 0 && (
          <View style={styles.faultsSection}>
            <Text style={[styles.detailLabel, { color: colors.gray, marginBottom: 8 }]}>Faults:</Text>
            {workOrder.Faults.map((fault, index) => (
              <View key={index} style={[styles.faultItem, { backgroundColor: colors.light, padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.xs }]}>
                <Text style={[styles.faultName, { color: colors.dark }]}>
                  • {fault?.FaultCode || fault?.Fault || '-'}
                </Text>
                <Text style={[styles.faultDesc, { color: colors.gray, marginLeft: SPACING.md }]}>
                  {fault?.FaultDesc || fault?.Dscption || '-'}
                </Text>
                <Text style={[styles.faultMeta, { color: colors.gray, marginLeft: SPACING.md }]}>
                  Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {workOrder?.Parts && workOrder.Parts.length > 0 && (
          <View style={styles.faultsSection}>
            <Text style={[styles.detailLabel, { color: colors.gray, marginBottom: 8 }]}>Parts:</Text>
            {workOrder.Parts.map((part, index) => (
              <View key={index} style={[styles.faultItem, { backgroundColor: colors.light, padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.xs }]}>
                <Text style={[styles.faultName, { color: colors.dark }]}>
                  • {part?.ItemCode || '-'} - {part?.ItemName || '-'}
                </Text>
                <Text style={[styles.faultDesc, { color: colors.gray, marginLeft: SPACING.md }]}>
                  ReqQty: {part?.ReqQty ?? '-'} | IssQty: {part?.IssQty ?? '-'} | AddQty: {part?.AddQty ?? '-'}
                </Text>
                <Text style={[styles.faultMeta, { color: colors.gray, marginLeft: SPACING.md }]}>
                  Whs: {part?.Whs || '-'} | Fault: {part?.Fault || '-'} | Status: {part?.Status || '-'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
        );
      })()}
    </View>
  );

  const renderPartsDetails = () => (
    <View style={[styles.tabContent, styles.partsTabContent]}>
      <View style={styles.partsHeader}>
        <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Details</Text>
      </View>

      <Text style={[styles.mappingHintText, { color: colors.gray, marginBottom: SPACING.xs }]}>
        For each part, select both Fault and Warehouse code.
      </Text>

      <TouchableOpacity onPress={() => setShowPartsModal(true)} activeOpacity={0.7}>
        <View pointerEvents="none">
          <PaperTextInput
            label="Select Spare Parts"
            mode="outlined"
            value={getSelectedParts().length > 0 ? `${getSelectedParts().length} part(s) selected` : ''}
            style={styles.selectorInput}
            placeholder="Tap to select parts"
            editable={false}
            outlineColor={colors.border || '#D0D0D0'}
            activeOutlineColor={colors.primary}
            right={<PaperTextInput.Icon icon="package-variant" />}
          />
        </View>
      </TouchableOpacity>

      {getSelectedParts().length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>No parts added in job card</Text>
        </View>
      ) : (
        <View style={styles.partList}>
          {getSelectedParts().map((part, index) => (
            <View key={`${part.ItemCode || 'part'}-${index}`} style={[styles.partListRow, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
              <View style={styles.partHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.partName, { color: colors.dark }]}>{part.ItemName || 'Unknown Part'}</Text>
                  <Text style={[styles.partCode, { color: colors.gray }]}>Code: {part.ItemCode || '-'}</Text>
                </View>
                <TouchableOpacity onPress={() => {
                  const updated = getSelectedParts().filter((_, i) => i !== index);
                  updateSelectedParts(updated);
                }}>
                  <MaterialIcons name="close" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>

              <View style={styles.partFieldRow}>
                <TouchableOpacity
                  style={styles.partFieldFull}
                  onPress={() => openFaultSelector('part', index)}
                  activeOpacity={0.7}
                >
                  <View pointerEvents="none">
                    <PaperTextInput
                      label="Fault Mapping"
                      mode="outlined"
                      value={getFaultDisplayLabel(part.Fault)}
                      style={styles.partFieldInput}
                      placeholder="Tap to select fault"
                      editable={false}
                      right={<PaperTextInput.Icon icon="alert-circle-outline" />}
                    />
                  </View>
                </TouchableOpacity>

                <PaperTextInput
                  label="Required Quantity"
                  mode="outlined"
                  value={String(part.ReqQty || '')}
                  onChangeText={(text) => updatePartField(index, 'ReqQty', parseInt(text, 10) || 0)}
                  keyboardType="numeric"
                  style={[styles.partFieldInput, styles.partFieldHalf]}
                />

                <TouchableOpacity
                  style={styles.partFieldHalf}
                  onPress={() => {
                    setSelectedPartIndex(index);
                    setShowWarehouseModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View pointerEvents="none">
                    <PaperTextInput
                      label="Warehouse"
                      mode="outlined"
                      value={part.Whs || ''}
                      style={styles.partFieldInput}
                      placeholder="Tap to select warehouse"
                      editable={false}
                      right={<PaperTextInput.Icon icon="warehouse" />}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={[styles.selectedCodeText, { color: colors.gray }]}> 
                Selected Warehouse Code: {part.Whs || '-'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderMechanicsDetails = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.xs }]}>Assigned Mechanics (tap to select)</Text>
      {workOrder?.Mechanics && workOrder.Mechanics.length > 0 ? (
        <View style={styles.mechanicsList}>
          {workOrder.Mechanics.map((mechanic, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => toggleMechanicSelection(getMechanicName(mechanic))}
              style={[
                styles.mechanicCard,
                workOrder?.Mechanics?.length === 1 && styles.singleMechanicCard,
                { backgroundColor: colors.light, borderColor: colors.border || '#D0D0D0' },
                selectedMechanics.includes(getMechanicName(mechanic)) && styles.selectedMechanicCard,
                selectedMechanics.includes(getMechanicName(mechanic)) && { borderColor: colors.primary }
              ]}
            >
              <MaterialIcons
                name={selectedMechanics.includes(getMechanicName(mechanic)) ? 'check-circle' : 'person'}
                size={22}
                color={selectedMechanics.includes(getMechanicName(mechanic)) ? colors.primary : colors.primary}
              />
              <Text style={[styles.mechanicName, { color: colors.dark }]}>
                {getMechanicName(mechanic)}
              </Text>
            </TouchableOpacity>
          ))} 
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="person-outline" size={48} color={colors.gray} />
          <Text style={[styles.emptyText, { color: colors.gray, marginTop: SPACING.sm }]}>
            No mechanics assigned yet
          </Text>
        </View>
      )}

      <View style={[styles.mappingSection, { backgroundColor: colors.light, borderColor: colors.border || '#E0E0E0' }]}>
        <Text style={[styles.label, { color: colors.dark }]}>Fault Mapping for Mechanics</Text>
        {selectedMechanics.length > 0 ? (
          selectedMechanics.map((mechanicName) => (
            <View key={mechanicName} style={styles.mappingRow}>
              <Text style={[styles.mappingMechanicName, { color: colors.dark }]} numberOfLines={1}>
                {mechanicName}
              </Text>
              <TouchableOpacity
                style={styles.mappingFaultSelector}
                onPress={() => openFaultSelector('mechanic', mechanicName)}
                activeOpacity={0.7}
              >
                <View pointerEvents="none">
                  <PaperTextInput
                    label="Fault"
                    mode="outlined"
                    value={getFaultDisplayLabel(mechanicFaultMap[mechanicName])}
                    style={styles.partFieldInput}
                    placeholder="Select fault"
                    editable={false}
                    right={<PaperTextInput.Icon icon="alert-circle-outline" />}
                  />
                </View>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={[styles.mappingHintText, { color: colors.gray }]}>
            Select one or more mechanics above to map faults.
          </Text>
        )}
      </View>

      <Divider style={{ marginVertical: SPACING.sm }} />

      <View style={styles.workEntryForm}>
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.dark }]}>Work Description:</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.light, color: colors.dark }]}
            value={workEntry.description}
            onChangeText={(text) => setWorkEntry({ ...workEntry, description: text })}
            placeholder="Describe the work performed..."
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.dark }]}>Hours Worked:</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.light, color: colors.dark }]}
            value={workEntry.hours}
            onChangeText={(text) => setWorkEntry({ ...workEntry, hours: text })}
            placeholder="Enter hours (e.g., 2.5)"
            keyboardType="decimal-pad"
          />
        </View>

        {mechanicWork.length > 0 && (
          <Text style={[styles.selectedMechanicsText, { color: colors.primary }]}>
            Draft work entries created: {mechanicWork.length}
          </Text>
        )}
      </View>
    </View>
  );

  const renderWorkOrderEntries = () => (
    <View style={styles.tabContent}>
      {loadingWorkOrderEntries ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>Loading work orders...</Text>
        </View>
      ) : workOrderEntries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.gray }]}>No work orders linked to this job card</Text>
        </View>
      ) : (
        <View style={styles.workOrderListContainer}>
          {workOrderEntries.map((entry, index) => {
            const entryKey = String(entry?.DocEntry || entry?.DocNum || `entry-${index}`);
            const isExpanded = workOrderExpandedMap[entryKey] !== false;

            return (
              <View
                key={`${entry?.DocEntry || entry?.DocNum || index}`}
                style={[styles.workOrderEntryCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}
              >
                <View style={styles.workOrderEntryHeader}>
                  <View style={styles.workOrderEntryHeaderLeft}>
                    <TouchableOpacity
                      style={[styles.entryCollapseIconButton, { borderColor: colors.border || '#D0D0D0', backgroundColor: colors.light }]}
                      onPress={() => setWorkOrderExpandedMap(prev => ({ ...prev, [entryKey]: !isExpanded }))}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.workOrderEntryNo, { color: colors.dark }]}>WO #{entry?.DocEntry ?? '-'}</Text>
                  </View>
                  <View style={styles.workOrderEntryHeaderRight}>
                    <View style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(entry?.Status || 'O') }]}>
                      <Text style={styles.priorityTextInline}>{getStatusName(entry?.Status || 'O')}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.entryOpenIconButton, { borderColor: colors.border || '#D0D0D0', backgroundColor: colors.light }]}
                      onPress={() => navigation.navigate('WorkOrderApiDetail', {
                        workOrderDocEntry: entry?.DocEntry,
                        dbName: dbName || 'MUTSPL_TEST',
                      })}
                      disabled={!entry?.DocEntry}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="open-in-new" size={16} color={entry?.DocEntry ? colors.primary : colors.gray} />
                    </TouchableOpacity>
                  </View>
                </View>

                {isExpanded && (
                  <>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Assigned:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.AssignedMechanics || '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>StartDt:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.MechanicStartDt ? formatDate(entry.MechanicStartDt) : '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>StartTm:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{formatMechanicTime(entry?.MechanicStartTm)}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>TotalHrs:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.MechanicsTotalHrs ?? '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Vehicle:</Text>
                      <Text style={[styles.workOrderEntryValue, { color: colors.dark }]}>{entry?.Vehicle || '-'}</Text>
                    </View>
                    <View style={styles.workOrderEntryRow}>
                      <Text style={[styles.workOrderEntryLabel, { color: colors.gray }]}>Work Done:</Text>
                      <Text
                        style={[styles.workOrderEntryValue, { color: colors.dark, flex: 1, textAlign: 'right' }]}
                        numberOfLines={2}
                      >
                        {entry?.WorkDoneDetails || entry?.WorkDone || entry?.WorkDesc || entry?.Remarks || entry?.Description || entry?.FaultDesc || '-'}
                      </Text>
                    </View>

                    {Array.isArray(entry?.DetailedFaults) && entry.DetailedFaults.length > 0 && (
                      <View style={styles.entryDetailsSection}>
                        <Text style={[styles.entryDetailsTitle, { color: colors.gray }]}>Faults:</Text>
                        {entry.DetailedFaults.map((fault, faultIndex) => (
                          <View key={`${entry?.DocEntry || index}-fault-${faultIndex}`} style={[styles.entryDetailsCard, { backgroundColor: colors.light }]}> 
                            <Text style={[styles.entryDetailsPrimary, { color: colors.dark }]}>• {fault?.FaultCode || fault?.Fault || '-'}</Text>
                            <Text style={[styles.entryDetailsSecondary, { color: colors.gray }]}>{fault?.FaultDesc || fault?.Dscption || '-'}</Text>
                            <Text style={[styles.entryDetailsMeta, { color: colors.gray }]}>Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {Array.isArray(entry?.DetailedParts) && entry.DetailedParts.length > 0 && (
                      <View style={styles.entryDetailsSection}>
                        <Text style={[styles.entryDetailsTitle, { color: colors.gray }]}>Parts:</Text>
                        {entry.DetailedParts.map((part, partIndex) => (
                          <View key={`${entry?.DocEntry || index}-part-${partIndex}`} style={[styles.entryDetailsCard, { backgroundColor: colors.light }]}> 
                            <Text style={[styles.entryDetailsPrimary, { color: colors.dark }]}>• {part?.ItemCode || '-'} - {part?.ItemName || '-'}</Text>
                            <Text style={[styles.entryDetailsSecondary, { color: colors.gray }]}>ReqQty: {part?.ReqQty ?? '-'} | IssQty: {part?.IssQty ?? '-'} | AddQty: {part?.AddQty ?? '-'}</Text>
                            <Text style={[styles.entryDetailsMeta, { color: colors.gray }]}>Whs: {part?.Whs || '-'} | Fault: {part?.Fault || '-'} | Status: {part?.Status || '-'}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Details':
        return renderWODetails();
      case 'PartDetails':
        return renderPartsDetails();
      case 'Mechanics':
        return renderMechanicsDetails();
      case 'WorkOrder':
        return renderWorkOrderEntries();
      default:
        return null;
    }
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}> 
      {/* Header Card - Similar to Incident Detail */}
      <View style={[styles.headerCard, { backgroundColor: colors.white }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.jobCardNo, { color: colors.dark }]}>Job Card #{formatJobCardDisplayNo({ ...workOrder, JobCardNo: workOrder?.JobCardNo || jobCardNo, DocEntry: workOrder?.DocEntry || docEntry, JobType: workOrder?.JobType || jobType || getJobTypeCode(workOrder || {}) })}</Text>
            <Text style={[styles.busNoHeader, { color: colors.primary }]}>
              <MaterialIcons name="directions-bus" size={16} /> Bus {workOrder?.BusNo || '-'}
            </Text>
          </View>
          <View style={styles.headerRightSection}>
            <View
              style={[styles.priorityBadgeInline, { backgroundColor: getStatusColor(workOrder?.Status) }]}
            >
              <Text style={styles.priorityTextInline}>{getStatusName(workOrder?.Status)}</Text>
            </View>
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.infoSection}>
          <View style={styles.infoLeft}>
            <View style={styles.infoRow}>
              <MaterialIcons name="category" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Type:</Text>
              <Text style={[styles.infoValue, { color: colors.dark }]}>{getDisplayComplaintType(workOrder)}</Text>
            </View>

            <View style={styles.infoRow}>
              <MaterialIcons name="flag" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Priority:</Text>
              <View style={[styles.priorityBadgeInline, { 
                backgroundColor: workOrder?.Priority === 'High' ? '#FF5252' : 
                               workOrder?.Priority === 'Medium' ? '#FFA726' : '#66BB6A' 
              }]}>
                <Text style={styles.priorityTextInline}>{workOrder?.Priority || '-'}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <MaterialIcons name="event" size={16} color={colors.gray} />
              <Text style={[styles.infoLabel, { color: colors.gray }]}>Date & Time:</Text>
              <Text style={[styles.infoValue, { color: colors.dark }]}>
                {`${getDisplayDate(workOrder)} ${getDisplayTime(workOrder)}`.trim()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.white }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab,
              activeTab === tab && { borderBottomColor: colors.primary }
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              { color: colors.gray },
              activeTab === tab && { color: colors.primary, fontWeight: 'bold' }
            ]} numberOfLines={2}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView style={styles.contentContainer}>
        {renderTabContent()}
      </ScrollView>

      <View
        style={[
          styles.bottomActionBar,
          { backgroundColor: colors.white, borderTopColor: colors.border || '#E0E0E0' }
        ]}
      >
        <Button
          mode="contained"
          onPress={handleCreateWorkOrder}
          loading={submittingWorkOrder}
          disabled={submittingWorkOrder}
          buttonColor={colors.primary}
          style={styles.bottomActionButton}
          contentStyle={styles.bottomActionButtonContent}
          labelStyle={styles.bottomActionLabel}
        >
          Create Work Order
        </Button>
      </View>

      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => {
          const currentParts = getSelectedParts();
          const exists = currentParts.some(p => p.ItemCode === item.ItemCode);
          if (exists) {
            const updated = currentParts.filter(p => p.ItemCode !== item.ItemCode);
            updateSelectedParts(updated);
          } else {
            const defaultFaultCode = getAvailableFaults()[0]?.FaultCode || 'FLT001';
            const newPart = {
              ItemCode: item.ItemCode,
              ItemName: item.ItemName,
              ReqQty: 0,
              Whs: '',
              WhsName: '',
              Fault: defaultFaultCode,
            };
            updateSelectedParts([...currentParts, newPart]);
          }
        }}
        title="Select Spare Parts"
        data={spareParts}
        loading={loadingPartsData}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        multiSelect={true}
        selectedItems={getSelectedParts()}
        searchKeys={['ItemName', 'ItemCode']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.ItemName || 'Unknown'}
            </Text>
            <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              Code: {item.ItemCode}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showWarehouseModal}
        onClose={() => {
          setShowWarehouseModal(false);
          setSelectedPartIndex(null);
        }}
        onSelect={(value, item) => {
          const targetIndex = selectedPartIndex;
          if (targetIndex === null || targetIndex === undefined) return;
          const selectedCode = String(item?.WhsCode || value || '').trim();
          const selectedName = String(item?.WhsName || '').trim();
          updatePartFields(targetIndex, {
            Whs: selectedCode,
            WhsName: selectedName,
          });
          setShowWarehouseModal(false);
          setSelectedPartIndex(null);
        }}
        title="Select Warehouse"
        data={warehouses}
        loading={loadingWarehousesData}
        searchPlaceholder="Search warehouse..."
        displayKey="WhsName"
        valueKey="WhsCode"
        searchKeys={['WhsCode', 'WhsName']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.WhsName || '-'}
            </Text>
            <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              Code: {item.WhsCode || '-'}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showFaultModal}
        onClose={() => {
          setShowFaultModal(false);
          setFaultSelectionTarget({ type: null, key: null });
        }}
        onSelect={handleFaultSelected}
        title="Select Fault"
        data={getAvailableFaults()}
        loading={false}
        searchPlaceholder="Search fault..."
        displayKey="FaultDesc"
        valueKey="FaultCode"
        searchKeys={['FaultCode', 'FaultDesc']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.FaultCode || '-'}
            </Text>
            <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              {item.FaultDesc || '-'}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    padding: SPACING.sm,
    marginHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginBottom: SPACING.xs,
  },
  jobCardNo: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  busNoHeader: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    marginBottom: SPACING.xs,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoLeft: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: SPACING.xs,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 70,
  },
  infoValue: {
    fontSize: 12,
    flex: 1,
  },
  priorityBadgeInline: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 12,
  },
  priorityTextInline: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  tabsContainer: {
    flexGrow: 0,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 8,
    minHeight: 52,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  bottomActionBar: {
    borderTopWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bottomActionButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.md,
  },
  bottomActionButtonContent: {
    minHeight: 48,
  },
  bottomActionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  commonActionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  commonActionButton: {
    flex: 1,
  },
  partList: {
    marginTop: SPACING.sm,
    width: '100%',
  },
  partListRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    width: '100%',
  },
  partHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  partName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: SPACING.sm,
  },
  partCode: {
    fontSize: 12,
  },
  partFieldInput: {
    marginTop: SPACING.xs,
    backgroundColor: 'transparent',
  },
  partFieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  partFieldFull: {
    width: '100%',
  },
  partFieldHalf: {
    flex: 1,
  },
  tabContent: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.lg,
  },
  partsTabContent: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: 0,
  },
  formColumn: {
    flex: 1,
    minWidth: 300,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
  },
  selectorInput: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  picker: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
    justifyContent: 'center',
  },
  selectInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    height: 40,
    justifyContent: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    width: '100%',
  },
  taskButton: {
    flex: 1,
  },
  addButton: {
    minWidth: 100,
  },
  scanButton: {
    flex: 1,
  },
  partsHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    width: '100%',
  },
  tableHeader: {
    borderRadius: BORDER_RADIUS.sm,
  },
  tableRow: {
    borderBottomWidth: 1,
  },
  taskCol: {
    flex: 2,
  },
  statusCol: {
    flex: 1,
  },
  typeCol: {
    flex: 1,
  },
  assignedCol: {
    flex: 1.5,
  },
  noteCol: {
    flex: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    width: '100%',
  },
  emptyText: {
    fontSize: 14,
  },
  attachmentSection: {
    marginTop: SPACING.lg,
    width: '100%',
  },
  attachButton: {
    marginTop: SPACING.sm,
  },
  costCard: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    width: '100%',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: {
    fontSize: 14,
  },
  costValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  costLabelBold: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  costValueBold: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  costNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    width: '100%',
  },
  noteText: {
    fontSize: 13,
  },
  detailsGrid: {
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    flex: 2,
    textAlign: 'right',
  },
  faultsSection: {
    width: '100%',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  faultItem: {
    width: '100%',
  },
  faultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  faultDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  faultMeta: {
    fontSize: 11,
    marginTop: 3,
  },
  mechanicsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.sm,
  },
  mechanicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    width: '48%',
    borderWidth: 1,
  },
  singleMechanicCard: {
    width: '100%',
  },
  selectedMechanicCard: {
    borderWidth: 1.5,
  },
  mechanicName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  selectedMechanicsText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  mappingSection: {
    width: '100%',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
  },
  mappingRow: {
    width: '100%',
    marginTop: SPACING.xs,
  },
  mappingMechanicName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  mappingFaultSelector: {
    width: '100%',
  },
  mappingHintText: {
    fontSize: 12,
    marginTop: SPACING.xs,
  },
  selectedCodeText: {
    fontSize: 12,
    marginTop: 4,
  },
  workOrderListContainer: {
    width: '100%',
  },
  workOrderEntryCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    width: '100%',
  },
  workOrderEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  workOrderEntryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
    paddingRight: SPACING.xs,
  },
  workOrderEntryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  entryOpenIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCollapseIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workOrderEntryNo: {
    fontSize: 14,
    fontWeight: '700',
  },
  workOrderEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  workOrderEntryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  workOrderEntryValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  entryDetailsSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  entryDetailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  entryDetailsCard: {
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  entryDetailsPrimary: {
    fontSize: 12,
    fontWeight: '600',
  },
  entryDetailsSecondary: {
    fontSize: 11,
    marginTop: 3,
  },
  entryDetailsMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
  },
  workEntryForm: {
    width: '100%',
  },
  workEntryCard: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  workEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  workHours: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  workDescription: {
    fontSize: 14,
    marginBottom: SPACING.xs,
  },
  workTimestamp: {
    fontSize: 11,
  },
});

export default WorkOrderDetailScreen;
