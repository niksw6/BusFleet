import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Chip, Checkbox } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import { complaintService, jobCardService, masterService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import ModalSelector from '../../../shared/components/ModalSelector';
import FaultMechanicPartsSection from '../components/FaultMechanicPartsSection';
import { getStaffRoleLabel } from '../../../utils/roleAccess';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { getJobTypeCode } from '../../../utils/helpers';

const jobCardValidationSchema = Yup.object().shape({
  complaintType: Yup.string().required('Complaint type is required'),
  driver: Yup.string().required('Driver is required'),
  odometer: Yup.number().required('Odometer reading is required').positive('Must be a positive number'),
  routeNo: Yup.number().when('complaintType', {
    is: (val) => val && val.toLowerCase().includes('breakdown'),
    then: (schema) => schema.required('Route number is required for breakdown').positive('Must be a valid route'),
    otherwise: (schema) => schema.notRequired(),
  }),
  breakdownPlace: Yup.string().when('complaintType', {
    is: (val) => val && val.toLowerCase().includes('breakdown'),
    then: (schema) => schema.required('Breakdown place is required for breakdown'),
    otherwise: (schema) => schema.notRequired(),
  }),
  assignedMechanics: Yup.array().notRequired(),
  instructions: Yup.string().notRequired(),
});

const formatToHHMM = (value, fallback = '0000') => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 4) {
    return digits.slice(0, 4);
  }
  if (digits.length > 0) {
    return digits.padStart(4, '0');
  }
  return fallback;
};

const normalizeJobCardComplaintType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Driver Complaint';

  if (normalized === 'b' || normalized.includes('breakdown')) {
    return 'Breakdown';
  }

  if (normalized.includes('driver complaint') || normalized === 'd' || normalized === 'complaint') {
    return 'Driver Complaint';
  }

  if (normalized.includes('preventive')) {
    return 'Preventive Maintenance';
  }

  if (normalized.includes('mechanical')) {
    // Backend JC series is typically keyed for Driver Complaints/Breakdown.
    // Map mechanical labels to driver-complaint series to avoid unsupported JC series.
    return 'Driver Complaint';
  }

  // Default all other non-breakdown values to Driver Complaints for stable series mapping.
  return 'Driver Complaint';
};

const isJobCardSeriesNotFoundError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('qbs_jc_') || (message.includes('data qbs_jc_') && message.includes('not found'));
};

const getSeriesErrorMessage = (rawMessage) => {
  const message = String(rawMessage || '');
  const matched = message.match(/qbs_jc_[a-z0-9_]+/i);
  if (matched?.[0]) {
    return `Job card series setup missing (${matched[0].toUpperCase()}). Please contact backend admin.`;
  }
  return 'Job card series setup missing. Please contact backend admin.';
};

const CreateJobCardScreen = ({ route, navigation }) => {
  const { complaintNo, busNo, depot, faults, priority, complaintType, driverName, driverCode, odometer, routeNo, breakdownPlace, dbName } = route.params;
  
  console.log('🎫 Job Card Screen - Received Complaint Type:', complaintType);
  console.log('🎫 Job Card Screen - Received faults param:', JSON.stringify(faults));
  console.log('🎫 Job Card Screen - Active faults count (per-fault UI will show if > 0):',
    (faults || []).filter(f => f && f.Fault && String(f.Fault).trim() !== '').length);
  
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [maintenanceTeams, setMaintenanceTeams] = useState([]);
  const [maintenanceTeamsAvailable, setMaintenanceTeamsAvailable] = useState(true);
  const [showMechanicModal, setShowMechanicModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showAssignmentTypeModal, setShowAssignmentTypeModal] = useState(false);
  const [showBreakdownTeamModal, setShowBreakdownTeamModal] = useState(false);
  const [showDepotModal, setShowDepotModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null); // { TeamCode, TeamName }
  const [selectedBreakdownTeam, setSelectedBreakdownTeam] = useState(null);
  const [selectedAssignmentMechanic, setSelectedAssignmentMechanic] = useState(null);
  const [selectedTransferDepot, setSelectedTransferDepot] = useState(null);
  const [selectedTransferSupervisor, setSelectedTransferSupervisor] = useState(null);
  const [selectedAssignmentType, setSelectedAssignmentType] = useState('Area Breakdown Team');
  const [notifyDepotHead, setNotifyDepotHead] = useState(false);
  const [breakdownTeams, setBreakdownTeams] = useState([]);
  const [breakdownMechanics, setBreakdownMechanics] = useState([]);
  const [depots, setDepots] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loadingMechanics, setLoadingMechanics] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [tempSelectedMechanics, setTempSelectedMechanics] = useState([]);
  const formikRef = useRef(null);

  // Per-fault assignments: { [assignmentKey]: { mechanics: [], parts: [] } }
  const [faultAssignments, setFaultAssignments] = useState({});

  const routeFaultEntries = useMemo(() => (
    (faults || [])
      .map((fault, originalIndex) => ({ fault, originalIndex }))
      .filter(({ fault }) => {
        const faultName = String(fault?.Fault || fault?.FaultName || fault?.FaultCode || '').trim();
        const faultDesc = String(fault?.Description || fault?.Dscption || fault?.FaultDescription || fault?.FaultDesc || '').trim();
        return Boolean(faultName || faultDesc);
      })
  ), [faults]);

  const effectiveFaultEntries = useMemo(() => {
    return routeFaultEntries.map(({ fault, originalIndex }, idx) => ({
      fault,
      assignmentKey: `route-${originalIndex}`,
      // Store and mechanic APIs identify fault lines starting at 1.
      faultLine: idx + 1,
    }));
  }, [routeFaultEntries]);

  useEffect(() => {
    setFaultAssignments((prev) => {
      const next = { ...prev };
      const activeKeys = new Set(effectiveFaultEntries.map(entry => entry.assignmentKey));

      effectiveFaultEntries.forEach((entry) => {
        if (!next[entry.assignmentKey]) {
          next[entry.assignmentKey] = { mechanics: [], parts: [] };
        }
      });

      Object.keys(next).forEach((key) => {
        if (!activeKeys.has(key)) {
          delete next[key];
        }
      });

      return next;
    });
  }, [effectiveFaultEntries]);

  const handleFaultAssignmentChange = (faultIndex, assignment) => {
    setFaultAssignments(prev => ({ ...prev, [faultIndex]: assignment }));
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (!complaintNo || normalizeJobCardComplaintType(complaintType) !== 'Breakdown') return;
    if (selectedAssignmentType !== 'Individual Depot Mechanic') return;

    const fetchBreakdownMechanics = async () => {
      try {
        console.log('📡 Calling GetMechanicsByBreakdown for breakdown incident:', {
          CompanyDB: dbName || 'MUTSPL_TEST',
          DocEntry: complaintNo,
        });
        const depot = route.params?.depot || user?.Depot || user?.depot || '';
        const response = await masterService.getMechanicsByBreakdown(dbName || 'MUTSPL_TEST', complaintNo, depot);
        const rawData = response?.Data && Array.isArray(response.Data.Mechanics) ? response.Data.Mechanics : (Array.isArray(response?.Data) ? response.Data : []);
        const normalized = rawData
          .map((item, index) => {
            const name = String(item?.EmpName || item?.FirstName || item?.Name || item?.UserName || item?.MechanicName || '').trim();
            if (!name) return null;
            const code = String(item?.EmpCode || item?.Code || item?.EmpID || item?.UserCode || '').trim();
            return {
              ...item,
              FirstName: name,
              Name: name,
              UserName: name,
              Code: code || `BM-${index + 1}`,
              EmpCode: item?.EmpCode || code || `BM-${index + 1}`,
              EmpID: item?.EmpID || item?.EmpCode || code || `BM-${index + 1}`,
            };
          })
          .filter(Boolean);
        setBreakdownMechanics(normalized);
      } catch (error) {
        console.warn('GetMechanicsByBreakdown failed:', error?.message || error);
        setBreakdownMechanics([]);
      }
    };

    fetchBreakdownMechanics();
  }, [selectedAssignmentType, complaintNo, complaintType, dbName]);

  useEffect(() => {
    if (normalizeJobCardComplaintType(complaintType) !== 'Breakdown') return;
    if (selectedAssignmentType !== 'Transfer to nearest supervisor') return;

    const fetchDepotsForSupervisorTransfer = async () => {
      try {
        console.log('📡 Calling GetDepots for breakdown transfer route:', {
          CompanyDB: dbName || 'MUTSPL_TEST',
        });
        const response = await masterService.getDepots(dbName || 'MUTSPL_TEST');
        const data = Array.isArray(response?.Data) ? response.Data : [];
        setDepots(data);
        setSelectedTransferDepot(data[0] || null);
        setSelectedTransferSupervisor(null);
        setSupervisors([]);
      } catch (error) {
        console.warn('GetDepots failed for transfer route:', error?.message || error);
        setDepots([]);
      }
    };

    fetchDepotsForSupervisorTransfer();
  }, [selectedAssignmentType, complaintType, dbName]);

  const assignmentTypeOptions = [
    { Code: 'Area Breakdown Team', Name: 'Area Breakdown Team' },
    { Code: 'Individual Depot Mechanic', Name: 'Individual Depot Mechanic' },
    { Code: 'Transfer to nearest supervisor', Name: 'Transfer to nearest supervisor' },
  ];

  const fetchAllData = async () => {
    try {
      setLoadingData(true);
      console.log('🔍 Fetching all data for CreateJobCard...');
      const isBreakdownFlow = normalizeJobCardComplaintType(complaintType) === 'Breakdown';
      const assignmentDepot = String(route.params?.depot || user?.Depot || user?.depot || '').trim();
      const [mechanicsResult, routesResult, sparePartsResult, teamsResult, breakdownTeamsResult, breakdownMechanicsResult, depotsResult] = await Promise.allSettled([
        complaintService.getMechanics(dbName || 'MUTSPL_TEST', route.params?.depot || user?.Depot || user?.depot || ''),
        complaintService.getRoutes(dbName || 'MUTSPL_TEST'),
        masterService.getSpareParts(dbName || 'MUTSPL_TEST'),
        !isBreakdownFlow && assignmentDepot ? masterService.getTeamByDepot(dbName || 'MUTSPL_TEST', assignmentDepot) : Promise.resolve({ Data: [] }),
        isBreakdownFlow && complaintNo ? masterService.getBreakdownTeams(dbName || 'MUTSPL_TEST', complaintNo) : Promise.resolve({ Data: [] }),
        isBreakdownFlow && complaintNo ? masterService.getMechanicsByBreakdown(dbName || 'MUTSPL_TEST', complaintNo, route.params?.depot || user?.Depot || user?.depot || '') : Promise.resolve({ Data: [] }),
        isBreakdownFlow ? masterService.getDepots(dbName || 'MUTSPL_TEST') : Promise.resolve({ Data: [] }),
      ]);

      const mechanicsRes = mechanicsResult.status === 'fulfilled' ? mechanicsResult.value : null;
      const routesRes = routesResult.status === 'fulfilled' ? routesResult.value : null;
      const sparePartsRes = sparePartsResult.status === 'fulfilled' ? sparePartsResult.value : null;
      const teamsRes = teamsResult.status === 'fulfilled' ? teamsResult.value : null;
      const breakdownTeamsRes = breakdownTeamsResult.status === 'fulfilled' ? breakdownTeamsResult.value : null;
      const breakdownMechanicsRes = breakdownMechanicsResult.status === 'fulfilled' ? breakdownMechanicsResult.value : null;
      const depotsRes = depotsResult.status === 'fulfilled' ? depotsResult.value : null;

      const extractListFromPayload = (payload, fallbackKey) => {
        const data = payload?.Data;
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data[fallbackKey])) return data[fallbackKey];
        if (data && Array.isArray(data.Mechanics)) return data.Mechanics;
        if (data && Array.isArray(data.Teams)) return data.Teams;
        return [];
      };

      if (mechanicsResult.status === 'rejected') {
        console.warn('⚠️ Mechanics fetch failed:', mechanicsResult.reason?.message || mechanicsResult.reason);
      }
      if (routesResult.status === 'rejected') {
        console.warn('⚠️ Routes fetch failed:', routesResult.reason?.message || routesResult.reason);
      }
      if (sparePartsResult.status === 'rejected') {
        console.warn('⚠️ Spare parts fetch failed:', sparePartsResult.reason?.message || sparePartsResult.reason);
      }
      if (teamsResult.status === 'rejected') {
        console.log('ℹ️ Depot maintenance teams not available for this flow; continuing without team assignment list.', teamsResult.reason?.message || teamsResult.reason);
      }

      console.log('📊 Mechanics response:', mechanicsRes);
      console.log('📊 Routes response:', routesRes);

      const mechanicsData = Array.isArray(mechanicsRes?.Data) ? mechanicsRes.Data : [];
      const normalizedMechanics = mechanicsData
        .map((item, index) => {
          const name = String(item?.FirstName || item?.Name || item?.UserName || item?.MechanicName || '').trim();
          if (!name) return null;
          const code = String(item?.Code || item?.EmpCode || item?.UserCode || '').trim();
          return {
            ...item,
            FirstName: name,
            Code: code || `M-${index + 1}`,
          };
        })
        .filter(Boolean);
      setMechanics(normalizedMechanics);

      const routesData = Array.isArray(routesRes?.Data) ? routesRes.Data : [];
      setRoutes(routesData);

      const partsData = Array.isArray(sparePartsRes?.Data) ? sparePartsRes.Data : [];
      const normalizedParts = partsData
        .map((item) => {
          const code = String(item?.ItemCode || item?.Code || '').trim();
          const name = String(item?.ItemName || item?.Name || item?.Dscription || '').trim();
          if (!code && !name) return null;
          return {
            ...item,
            ItemCode: code,
            ItemName: name || code,
            UoM: item?.UoM || item?.InvntryUom || 'Nos',
          };
        })
        .filter(Boolean);
      setSpareParts(normalizedParts);

      const teamsData = Array.isArray(teamsRes?.Data) ? teamsRes.Data : [];
      if (teamsData.length > 0) {
        setMaintenanceTeams(teamsData);
        setMaintenanceTeamsAvailable(true);
      } else {
        setMaintenanceTeams([]);
        setMaintenanceTeamsAvailable(false);
      }

      const breakdownTeamsData = extractListFromPayload(breakdownTeamsRes, 'Teams');
      const breakdownMechanicsData = extractListFromPayload(breakdownMechanicsRes, 'Mechanics');
      const depotsData = extractListFromPayload(depotsRes, 'Depots');

      setBreakdownTeams(breakdownTeamsData);
      setBreakdownMechanics(
        breakdownMechanicsData
          .map((item, index) => {
            const name = String(item?.EmpName || item?.FirstName || item?.Name || item?.UserName || item?.MechanicName || '').trim();
            if (!name) return null;
            const code = String(item?.EmpCode || item?.Code || item?.EmpID || item?.UserCode || '').trim();
            return {
              ...item,
              FirstName: name,
              Name: name,
              UserName: name,
              Code: code || `BM-${index + 1}`,
              EmpCode: item?.EmpCode || code || `BM-${index + 1}`,
              EmpID: item?.EmpID || item?.EmpCode || code || `BM-${index + 1}`,
            };
          })
          .filter(Boolean)
      );
      setDepots(depotsData);
      if (depotsData.length > 0 && !selectedTransferDepot) {
        setSelectedTransferDepot(depotsData[0]);
      }

      setLoadingMechanics(false);
      setLoadingData(false);
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      setLoadingMechanics(false);
      setLoadingData(false);
    }
  };

  const initialValues = {
    complaintType: normalizeJobCardComplaintType(complaintType),
    driver: driverCode || '',
    driverName: driverName || '',
    odometer: odometer || '',
    routeNo: routeNo ? String(routeNo) : '',
    routeName: routeNo ? String(routeNo) : '',
    breakdownPlace: breakdownPlace || '',
    assignedMechanics: [],
    assignmentType: selectedAssignmentType,
    notifyDepotHead: false,
    instructions: '',
    operations: [],
  };

  const handleSubmit = (values) => {
    if (effectiveFaultEntries.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Fault lines missing',
        text2: 'This incident has no fault lines from API. Please refresh incident details and try again.',
      });
      return;
    }

    // Note: Mechanics/Electricians self-accept individual faults once the Team
    // Leader accepts this job card (AcceptFault API) — Supervisor no longer needs
    // to pre-assign a mechanic here.
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      // Format current date and time
      const now = new Date();
      const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
      const formattedHours = now.getHours().toString().padStart(2, '0');
      const formattedMinutes = now.getMinutes().toString().padStart(2, '0');
      const formattedTimeHHMM = `${formattedHours}${formattedMinutes}`;
      const partRequestDate = formattedDate;
      const partRequestTime = formattedTimeHHMM;
      const supervisorCode = String(
        user?.Code || user?.code || user?.UserCode || user?.userCode || user?.User || user?.user || ''
      ).trim();
      const supervisorName = String(
        user?.FirstName || user?.name || user?.Name || user?.UserName || user?.User || user?.user || ''
      ).trim();
      const complaintTypeForApi = normalizeJobCardComplaintType(complaintType);
      // The incident supplied by the previous screen is the authority for
      // breakdown-only actions. Do not let a stale form value turn a Driver
      // Complaint into a breakdown-team assignment.
      const isBreakdownIncident = normalizeJobCardComplaintType(complaintType) === 'Breakdown';
      const assignmentType = formValues.assignmentType || 'Area Breakdown Team';
      const isTransferAssignment = isBreakdownIncident && assignmentType === 'Transfer to nearest supervisor';
      if (isTransferAssignment && (!selectedTransferDepot || !selectedTransferSupervisor)) {
        throw new Error('Select the destination depot and supervisor before creating the job card.');
      }
      const normalizedOperations = (formValues.operations || []).map(operation => ({
        OPCode: operation?.OPCode || operation?.Code || operation?.OperationCode || '',
        OPName: operation?.OPName || operation?.Name || operation?.OperationName || '',
        StdTime: operation?.StdTime || operation?.StandardTime || '',
        STime: operation?.STime || operation?.StartTime || formattedTimeHHMM,
        ETime: operation?.ETime || operation?.EndTime || '',
        Status: operation?.Status || 'O',
      }));
      const formTypeCode = complaintTypeForApi === 'Breakdown' ? 'B' : 'D';
      const jobTypeName = complaintTypeForApi === 'Breakdown' ? 'Breakdown' : 'Driver Complaint';

      const createJobCardPayload = (payloadComplaintType) => {
        const isBreakdownIncident = payloadComplaintType === 'Breakdown' || String(payloadComplaintType || '').toLowerCase().includes('breakdown');

        if (!isBreakdownIncident) {
          return {
            CompanyDB: dbName || 'MUTSPL_TEST',
            ComplaintType: payloadComplaintType,
            BusNo: busNo || '',
            Depot: depot || '',
            Driver: formValues.driverName || '',
            DrvCode: formValues.driver || '',
            DrvName: formValues.driverName || '',
            Description: formValues.instructions || '',
            Priority: priority || 'Medium',
            Status: 'O',
            Odometer: String(formValues.odometer || '0'),
            Odometr: String(formValues.odometer || '0'),
            RegDate: formattedDate,
            RegTime: formattedTimeHHMM,
            ComplaintTime: formattedTimeHHMM,
            U_RTime: formattedTimeHHMM,
            RouteNo: parseInt(formValues.routeNo) || 0,
            BreakdownPlace: formValues.breakdownPlace || '',
            FormType: 'D',
            JobType: 'Driver Complaint',
            CmplaintNo: Number(complaintNo) || complaintNo || '',
            ComplaintNo: Number(complaintNo) || complaintNo || '',
            Branch: '1',
            BranchNm: depot || '',
            Supervisr: supervisorCode,
            SprvsrNm: supervisorName,
            TeamCode: selectedTeam?.TeamCode || '',
            TeamName: selectedTeam?.TeamName || '',
            TeamStatus: 'Pending',
            Operations: normalizedOperations,
            Parts: effectiveFaultEntries.flatMap(({ assignmentKey, faultLine }) => (
              (faultAssignments[assignmentKey]?.parts || []).map(p => ({
                ItemCode: p.ItemCode || p.Code || '',
                ItemName: p.ItemName || p.Name || '',
                ReqQty: parseFloat(p.Qty) || 1,
                FaultLine: faultLine,
                BusLocation: p.BusLocation || '',
                ReqBy: supervisorCode,
                ReqDate: partRequestDate,
                ReqTime: partRequestTime,
                StoreItemStatus: String(p.StoreItemStatus || 'Direct').trim() || 'Direct',
              }))
            )),
            Mechanics: (function() {
              if (assignmentType === 'Individual Depot Mechanic' && selectedAssignmentMechanic) {
                return [{ Mechanic: selectedAssignmentMechanic.Code || selectedAssignmentMechanic.EmpCode || selectedAssignmentMechanic.UserCode || selectedAssignmentMechanic.FirstName || '' }];
              }
              if (effectiveFaultEntries.length > 0) {
                const all = effectiveFaultEntries.flatMap(({ assignmentKey }) => (faultAssignments[assignmentKey]?.mechanics || []));
                const unique = all.filter((m, i, arr) => arr.findIndex(x => (x.Code || x.FirstName) === (m.Code || m.FirstName)) === i);
                return unique.map(m => ({ Mechanic: m.Code || m.EmpCode || m.FirstName || '' }));
              }
              return (formValues.assignedMechanics || []).map(m => ({ Mechanic: m.Code || m.EmpCode || m.FirstName || '' }));
            }()),
            PartsReceived: [],
            Faults: effectiveFaultEntries.length > 0
              ? effectiveFaultEntries.map(({ fault: f }) => {
                  const mappedFaultName = String(f?.Fault || f?.FaultName || f?.FaultCode || f?.FaultDescription || '').trim();
                  const mappedFaultDesc = String(f?.Description || f?.Dscption || f?.FaultDescription || f?.FaultDesc || '').trim();
                  return {
                    Fault: mappedFaultName,
                    Dscption: mappedFaultDesc,
                  };
                })
              : [],
            ExtRmk: '',
            IntRmk: '',
          };
        }

        const breakdownAssignmentType = assignmentType || 'Area Breakdown Team';
        const breakdownFormType = 'B';
        const breakdownJobType = 'Breakdown';
        const isAreaTeamAssignment = breakdownAssignmentType === 'Area Breakdown Team';
        const isTransferAssignment = breakdownAssignmentType === 'Transfer to nearest supervisor';

        return {
          CompanyDB: dbName || 'MUTSPL_TEST',
          ComplaintType: payloadComplaintType,
          BusNo: busNo || '',
          Depot: depot || '',
          Driver: formValues.driverName || '',
          DrvCode: formValues.driver || '',
          DrvName: formValues.driverName || '',
          Description: formValues.instructions || '',
          Priority: priority || 'Medium',
          Status: 'O',
          Odometer: String(formValues.odometer || '0'),
          Odometr: String(formValues.odometer || '0'),
          RegDate: formattedDate,
          RegTime: formattedTimeHHMM,
          ComplaintTime: formattedTimeHHMM,
          U_RTime: formattedTimeHHMM,
          RouteNo: parseInt(formValues.routeNo) || 0,
          CmplaintNo: Number(complaintNo) || complaintNo || '',
          ComplaintNo: Number(complaintNo) || complaintNo || '',
          Branch: '1',
          BranchNm: depot || '',
          Supervisr: supervisorCode,
          SprvsrNm: supervisorName,
          FormType: breakdownFormType,
          JobType: breakdownJobType,
          AsgnType: isAreaTeamAssignment ? 'T' : isTransferAssignment ? 'S' : 'M',
          BrkTeam: isAreaTeamAssignment ? (selectedBreakdownTeam?.TeamCode || selectedBreakdownTeam?.Code || '') : '',
          BrkTmName: isAreaTeamAssignment ? (selectedBreakdownTeam?.TeamName || selectedBreakdownTeam?.Name || selectedBreakdownTeam?.TeamCode || '') : '',
          BrkAssign: isAreaTeamAssignment ? (Number(complaintNo) || 0) : 0,
          BrkRmk: isAreaTeamAssignment ? '' : '',
          AttnEmpID: isTransferAssignment ? 0 : (isAreaTeamAssignment ? 0 : Number(selectedAssignmentMechanic?.EmpID || selectedAssignmentMechanic?.EmpCode || selectedAssignmentMechanic?.Code || 0)),
          AttnMech: isAreaTeamAssignment || isTransferAssignment ? '' : (selectedAssignmentMechanic?.Code || selectedAssignmentMechanic?.EmpCode || selectedAssignmentMechanic?.UserCode || ''),
          AttnMechNm: isAreaTeamAssignment || isTransferAssignment ? '' : (selectedAssignmentMechanic?.FirstName || selectedAssignmentMechanic?.Name || selectedAssignmentMechanic?.EmpName || selectedAssignmentMechanic?.UserName || ''),
          AttnMechRmk: isAreaTeamAssignment || isTransferAssignment ? '' : 'Mechanic assigned to attend the breakdown',
          PrevDepot: isTransferAssignment ? (depot || '') : '',
          PrevSupCode: isTransferAssignment ? supervisorCode : '',
          PrevSupName: isTransferAssignment ? supervisorName : '',
          TrnDepot: isTransferAssignment ? (selectedTransferDepot?.DepotCode || selectedTransferDepot?.Depot || selectedTransferDepot?.Code || '') : '',
          TrnSupCode: isTransferAssignment ? (selectedTransferSupervisor?.EmpID || selectedTransferSupervisor?.Code || selectedTransferSupervisor?.UserCode || selectedTransferSupervisor?.EmpCode || '') : '',
          TrnSupName: isTransferAssignment ? (selectedTransferSupervisor?.SupervisorName || selectedTransferSupervisor?.FirstName || selectedTransferSupervisor?.Name || selectedTransferSupervisor?.UserName || '') : '',
          TrnRmk: isTransferAssignment ? 'Transferred to nearest available supervisor' : '',
          ToDepot: isTransferAssignment ? (selectedTransferDepot?.DepotCode || selectedTransferDepot?.Depot || selectedTransferDepot?.Code || '') : '',
          ToSupervisorCode: isTransferAssignment ? (selectedTransferSupervisor?.EmpID || selectedTransferSupervisor?.Code || selectedTransferSupervisor?.UserCode || selectedTransferSupervisor?.EmpCode || '') : '',
          ToSupervisorName: isTransferAssignment ? (selectedTransferSupervisor?.SupervisorName || selectedTransferSupervisor?.FirstName || selectedTransferSupervisor?.Name || selectedTransferSupervisor?.UserName || '') : '',
          Operations: normalizedOperations,
          Mechanics: isAreaTeamAssignment || isTransferAssignment ? [] : (
            selectedAssignmentMechanic ? [{ Mechanic: selectedAssignmentMechanic.Code || selectedAssignmentMechanic.EmpCode || selectedAssignmentMechanic.UserCode || selectedAssignmentMechanic.FirstName || '' }] : []
          ),
          Faults: effectiveFaultEntries.length > 0
            ? effectiveFaultEntries.map(({ fault: f }) => {
                const mappedFaultName = String(f?.Fault || f?.FaultName || f?.FaultCode || f?.FaultDescription || '').trim();
                const mappedFaultDesc = String(f?.Description || f?.Dscption || f?.FaultDescription || f?.FaultDesc || '').trim();
                return {
                  Fault: mappedFaultName,
                  Dscption: mappedFaultDesc,
                };
              })
            : [],
          Parts: effectiveFaultEntries.flatMap(({ assignmentKey, faultLine }) => (
            (faultAssignments[assignmentKey]?.parts || []).map(p => ({
              ItemCode: p.ItemCode || p.Code || '',
              ItemName: p.ItemName || p.Name || '',
              ReqQty: parseFloat(p.Qty) || 1,
              FaultLine: faultLine,
              BusLocation: p.BusLocation || '',
              ReqBy: supervisorCode,
              ReqDate: partRequestDate,
              ReqTime: partRequestTime,
              StoreItemStatus: String(p.StoreItemStatus || 'Direct').trim() || 'Direct',
            }))
          )),
        };
      };

      // Use the same canonical type as the incident. Retrying with arbitrary
      // type labels can create a Job Card in a different backend series.
      const attemptPayload = createJobCardPayload(complaintTypeForApi);
      console.log('💼 Creating job card:', JSON.stringify(attemptPayload));
      console.log('🔍 ComplaintType (API):', complaintTypeForApi, '| Input:', formValues.complaintType || complaintType);
      const response = await jobCardService.createJobCard(attemptPayload);

      if (isBreakdownIncident && complaintTypeForApi === 'Breakdown' && assignmentType === 'Area Breakdown Team' && selectedBreakdownTeam) {
        const breakdownAssignPayload = {
          CompanyDB: dbName || 'MUTSPL_TEST',
          BreakdownDocEntry: Number(complaintNo) || complaintNo,
          TeamCode: selectedBreakdownTeam.TeamCode || selectedBreakdownTeam.Code || '',
          Remarks: 'Please attend the breakdown immediately.',
        };
        console.log('📤 AssignBreakdownTeam payload:', JSON.stringify(breakdownAssignPayload));
        try {
          const assignResponse = await complaintService.assignBreakdownTeam(
            dbName || 'MUTSPL_TEST',
            Number(complaintNo) || complaintNo,
            user?.Code || user?.code || user?.UserCode || user?.User || '',
            selectedBreakdownTeam.TeamCode || selectedBreakdownTeam.Code || '',
            'Please attend the breakdown immediately.',
          );
          console.log('✅ AssignBreakdownTeam response:', assignResponse);
        } catch (assignError) {
          console.warn('AssignBreakdownTeam call failed:', assignError?.message || assignError);
        }
      }
      if (response?.Success === false && isJobCardSeriesNotFoundError({ message: response?.Message })) {
        throw new Error(getSeriesErrorMessage(response?.Message));
      }
      
      console.log('✅ Job card created:', response);
      
      if (response.Success) {
        const responseData = response?.Data;
        const createdDocEntryFromData = Number(
          responseData?.DocEntry
          ?? responseData?.JobCardDocEntry
          ?? responseData,
        );
        const createdJobCardNo = String(
          responseData?.JobCardNo
          || responseData?.DocNum
          || response?.JobCardNo
          || response?.DocNum
          || '',
        ).trim();
        const createdJobCardDocEntry = Number(
          responseData?.DocEntry
          || responseData?.JobCardDocEntry
          || response?.DocEntry
          || response?.JobCardDocEntry
          || createdDocEntryFromData
          || 0,
        );
        if (isTransferAssignment) {
          try {
            const transferResponse = await jobCardService.transferJobCard(
              dbName || 'MUTSPL_TEST',
              createdJobCardDocEntry,
              selectedTransferDepot?.DepotCode || selectedTransferDepot?.Depot || selectedTransferDepot?.Code || '',
              selectedTransferSupervisor?.EmpID || selectedTransferSupervisor?.Code || selectedTransferSupervisor?.UserCode || selectedTransferSupervisor?.EmpCode || '',
              selectedTransferSupervisor?.SupervisorName || selectedTransferSupervisor?.FirstName || selectedTransferSupervisor?.Name || selectedTransferSupervisor?.UserName || '',
              'Transferred to nearest depot.',
            );
            if (transferResponse?.Success === false) {
              throw new Error(transferResponse?.Message || 'Transfer request failed.');
            }
            console.log('✅ Job card transfer requested:', transferResponse);
          } catch (transferError) {
            Toast.show({ type: 'error', text1: 'Transfer Failed', text2: transferError?.message || 'Job card was created but transfer failed.' });
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: response.Message || 'Job card created successfully',
        });

        // Breakdown work entry is mechanic-facing, not supervisor-facing.
        // Once the job card is created, the supervisor should return to the complaint detail,
        // while the assigned mechanic logs in and opens the Line Breakdown Work Entry screen
        // from the mechanic dashboard / assigned work flow.
        navigation.navigate({
          name: 'ComplaintDetail',
          params: {
            complaintNo,
            dbName,
            complaintType,
            busNo,
            jobCardNo: createdJobCardNo || undefined,
            jobCardDocEntry: createdJobCardDocEntry > 0 ? createdJobCardDocEntry : undefined,
          },
          merge: true,
        });

        setLoading(false);
        return;
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.Message || 'Failed to create job card',
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error creating job card:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to create job card',
      });
      setLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.light }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Formik
        innerRef={formikRef}
        initialValues={initialValues}
        validationSchema={jobCardValidationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue }) => (
          <ScrollView style={styles.scrollContent}>
            {/* Complaint Info Card */}
            <View style={[styles.section, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                Complaint Information
              </Text>
              
              <View style={styles.infoRow}>
                <MaterialIcons name="confirmation-number" size={20} color={colors.gray} />
                <Text style={[styles.infoLabel, { color: colors.gray }]}>Incident #:</Text>
                <Text style={[styles.infoValue, { color: colors.dark }]}>{complaintNo}</Text>
              </View>

              <View style={styles.infoRow}>
                <MaterialIcons name="directions-bus" size={20} color={colors.gray} />
                <Text style={[styles.infoLabel, { color: colors.gray }]}>Bus #:</Text>
                <Text style={[styles.infoValue, { color: colors.dark }]}>{busNo}</Text>
              </View>

              <View style={styles.infoRow}>
                <MaterialIcons name="location-city" size={20} color={colors.gray} />
                <Text style={[styles.infoLabel, { color: colors.gray }]}>Depot:</Text>
                <Text style={[styles.infoValue, { color: colors.dark }]}>{depot}</Text>
              </View>

              <View style={styles.infoRow}>
                <MaterialIcons name="flag" size={20} color={colors.gray} />
                <Text style={[styles.infoLabel, { color: colors.gray }]}>Priority:</Text>
                <Text style={[styles.infoValue, { color: colors.dark }]}>{priority}</Text>
              </View>

              {effectiveFaultEntries.length > 0 && (
                <Text style={[styles.hintText, { color: colors.gray }]}>
                  Add Parts Required under each fault below.
                </Text>
              )}
            </View>

            {/* ── Fault Assignments Card (own prominent card) ── */}
            {effectiveFaultEntries.length > 0 && (
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialIcons name="assignment-ind" size={20} color="#0070F2" />
                  <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: 0, marginLeft: 8 }]}>
                    Fault Parts
                  </Text>
                </View>
                <Text style={[styles.sectionHint, { color: colors.gray }]}>
                  Each fault has its own Parts Required. Mechanics/Electricians will self-accept faults once your Team Leader approves this job card.
                </Text>
                {effectiveFaultEntries
                  .map(({ fault, assignmentKey }) => (
                    <FaultMechanicPartsSection
                      key={`fault-${assignmentKey}`}
                      fault={fault}
                      faultIndex={assignmentKey}
                      mechanics={mechanics}
                      spareParts={spareParts}
                      isDarkMode={isDarkMode}
                      value={faultAssignments[assignmentKey] || { mechanics: [], parts: [] }}
                      onChange={handleFaultAssignmentChange}
                      hideMechanics
                    />
                  ))}
              </View>
            )}

            {effectiveFaultEntries.length === 0 && (
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialIcons name="warning-amber" size={20} color="#BB0000" />
                  <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: 0, marginLeft: 8 }]}>
                    Fault Parts
                  </Text>
                </View>
                <Text style={[styles.sectionHint, { color: '#BB0000' }]}>
                  No fault lines were returned by API for this incident. Job Card creation requires API fault data.
                </Text>
              </View>
            )}

            {/* Job Card Details */}
            <View style={[styles.section, { backgroundColor: colors.white }]}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                Job Card Details
              </Text>

              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
                  <Text style={[styles.summaryLabel, { color: colors.gray }]}>Incident Type</Text>
                  <Text style={[styles.summaryValue, { color: colors.dark }]}>{values.complaintType || '—'}</Text>
                </View>

                <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
                  <Text style={[styles.summaryLabel, { color: colors.gray }]}>Driver</Text>
                  <Text style={[styles.summaryValue, { color: colors.dark }]}>{values.driverName || '—'}</Text>
                </View>

                <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
                  <Text style={[styles.summaryLabel, { color: colors.gray }]}>Odometer</Text>
                  <Text style={[styles.summaryValue, { color: colors.dark }]}>{String(values.odometer || '—')}</Text>
                </View>

                {normalizeJobCardComplaintType(complaintType) === 'Breakdown' && (
                  <>
                    <View style={[styles.summaryCard, { backgroundColor: colors.light }]}>
                      <Text style={[styles.summaryLabel, { color: colors.gray }]}>Route</Text>
                      <Text style={[styles.summaryValue, { color: colors.dark }]}>{values.routeName || values.routeNo || '—'}</Text>
                    </View>

                    <View style={[styles.summaryCard, { backgroundColor: colors.light, flexBasis: '100%' }]}>
                      <Text style={[styles.summaryLabel, { color: colors.gray }]}>Breakdown Place</Text>
                      <Text style={[styles.summaryValue, { color: colors.dark }]}>{values.breakdownPlace || '—'}</Text>
                    </View>
                  </>
                )}
              </View>

                      {normalizeJobCardComplaintType(complaintType) === 'Breakdown' && (
                <View style={[styles.section, { backgroundColor: colors.white, marginTop: SPACING.sm, marginBottom: SPACING.md, padding: SPACING.md }]}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>Assign To</Text>

                  <Text style={[styles.label, { color: colors.dark }]}>Assignment Type</Text>
                  <TouchableOpacity onPress={() => setShowAssignmentTypeModal(true)} activeOpacity={0.7}>
                    <View pointerEvents="none">
                      <TextInput
                        label="Assign To"
                        mode="outlined"
                        value={values.assignmentType || 'Area Breakdown Team'}
                        style={styles.input}
                        editable={false}
                        right={<TextInput.Icon icon="chevron-down" />}
                      />
                    </View>
                  </TouchableOpacity>

                  {values.assignmentType === 'Area Breakdown Team' && (
                    <>
                      <Text style={[styles.label, { color: colors.dark }]}>Breakdown Team</Text>
                      <TouchableOpacity onPress={() => setShowBreakdownTeamModal(true)} activeOpacity={0.7}>
                        <View pointerEvents="none">
                          <TextInput
                            label="Select Breakdown Team"
                            mode="outlined"
                            value={selectedBreakdownTeam ? `${selectedBreakdownTeam.TeamName || selectedBreakdownTeam.Name || selectedBreakdownTeam.TeamCode || selectedBreakdownTeam.Code}` : ''}
                            style={styles.input}
                            placeholder="Select team"
                            editable={false}
                            right={<TextInput.Icon icon="account-group" />}
                          />
                        </View>
                      </TouchableOpacity>
                    </>
                  )}

                  {values.assignmentType === 'Individual Depot Mechanic' && (
                    <>
                      <Text style={[styles.label, { color: colors.dark }]}>Mechanic</Text>
                      <TouchableOpacity onPress={() => setShowMechanicModal(true)} activeOpacity={0.7}>
                        <View pointerEvents="none">
                          <TextInput
                            label="Select Mechanic"
                            mode="outlined"
                            value={selectedAssignmentMechanic ? `${selectedAssignmentMechanic.FirstName || selectedAssignmentMechanic.Name || selectedAssignmentMechanic.UserName || selectedAssignmentMechanic.Code}` : ''}
                            style={styles.input}
                            placeholder="Select mechanic"
                            editable={false}
                            right={<TextInput.Icon icon="account" />}
                          />
                        </View>
                      </TouchableOpacity>
                    </>
                  )}

                  {values.assignmentType === 'Transfer to nearest supervisor' && (
                    <>
                      <Text style={[styles.label, { color: colors.dark }]}>Depot</Text>
                      <TouchableOpacity onPress={() => setShowDepotModal(true)} activeOpacity={0.7}>
                        <View pointerEvents="none">
                          <TextInput
                            label="Select Depot"
                            mode="outlined"
                            value={selectedTransferDepot ? `${selectedTransferDepot.DepotName || selectedTransferDepot.Depot || selectedTransferDepot.Name || selectedTransferDepot.DepotCode || selectedTransferDepot.Code}` : ''}
                            style={styles.input}
                            placeholder="Select depot"
                            editable={false}
                            right={<TextInput.Icon icon="office-building" />}
                          />
                        </View>
                      </TouchableOpacity>

                      {selectedTransferDepot && (
                        <>
                          <Text style={[styles.label, { color: colors.dark }]}>Supervisor</Text>
                          <TouchableOpacity onPress={() => setShowSupervisorModal(true)} activeOpacity={0.7}>
                            <View pointerEvents="none">
                              <TextInput
                                label="Select Supervisor"
                                mode="outlined"
                                value={selectedTransferSupervisor ? `${selectedTransferSupervisor.SupervisorName || selectedTransferSupervisor.FirstName || selectedTransferSupervisor.Name || selectedTransferSupervisor.UserName || selectedTransferSupervisor.Code || selectedTransferSupervisor.EmpID}` : ''}
                                style={styles.input}
                                placeholder="Select supervisor"
                                editable={false}
                                right={<TextInput.Icon icon="account-supervisor" />}
                              />
                            </View>
                          </TouchableOpacity>

                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm }}>
                            <Checkbox
                              status={notifyDepotHead ? 'checked' : 'unchecked'}
                              onPress={() => setNotifyDepotHead(!notifyDepotHead)}
                            />
                            <Text style={[styles.label, { color: colors.dark, marginBottom: 0, marginTop: 0 }]}>Notify Depot Head</Text>
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* Maintenance Team — routes Job Card to a Team Leader for accept/reject (SOP §1.3, §2) */}
              {normalizeJobCardComplaintType(complaintType) === 'Breakdown' && maintenanceTeamsAvailable && maintenanceTeams.length > 0 && (
                <>
                  <Text style={[styles.label, { color: colors.dark }]}>Assign Maintenance Team (optional)</Text>
                  <TouchableOpacity onPress={() => setShowTeamModal(true)} activeOpacity={0.7}>
                    <View pointerEvents="none">
                      <TextInput
                        label="Select Team"
                        mode="outlined"
                        value={selectedTeam ? `${selectedTeam.TeamName || selectedTeam.TeamCode}` : ''}
                        style={styles.input}
                        placeholder="Tap to select maintenance team"
                        editable={false}
                        right={<TextInput.Icon icon="account-group" />}
                      />
                    </View>
                  </TouchableOpacity>
                  {selectedTeam?.TeamLeaderName ? (
                    <Text style={[styles.hintText, { color: colors.gray, marginBottom: SPACING.sm }]}>
                      Team Leader: {selectedTeam.TeamLeaderName}
                    </Text>
                  ) : null}
                </>
              )}

              <TextInput
                label="Instructions *"
                mode="outlined"
                value={values.instructions}
                onChangeText={handleChange('instructions')}
                onBlur={handleBlur('instructions')}
                multiline
                numberOfLines={6}
                error={errors.instructions && touched.instructions}
                style={styles.input}
                placeholder="Enter detailed instructions for mechanics"
              />
              {errors.instructions && touched.instructions && (
                <Text style={styles.errorText}>{errors.instructions}</Text>
              )}

              <Button
                mode="contained"
                onPress={handleSubmit}
                style={styles.submitButton}
                contentStyle={{ paddingVertical: 8 }}
                icon="clipboard-check"
              >
                Create Job Card
              </Button>
            </View>
          </ScrollView>
        )}
      </Formik>

      {/* Mechanic Selector Modal */}
      <ModalSelector
        visible={showMechanicModal}
        onClose={() => {
          if (formikRef.current && selectedAssignmentType !== 'Individual Depot Mechanic') {
            formikRef.current.setFieldValue('assignedMechanics', tempSelectedMechanics);
          }
          setShowMechanicModal(false);
        }}
        onSelect={(value, item) => {
          if (selectedAssignmentType === 'Individual Depot Mechanic') {
            setSelectedAssignmentMechanic(item);
            setShowMechanicModal(false);
            return;
          }

          const isSelected = tempSelectedMechanics.some(m => m.FirstName === item.FirstName);
          let updated;
          if (isSelected) {
            updated = tempSelectedMechanics.filter(m => m.FirstName !== item.FirstName);
            console.log('➖ Removing mechanic:', item.FirstName);
          } else {
            updated = [...tempSelectedMechanics, item];
            console.log('➕ Adding mechanic:', item.FirstName);
          }
          console.log('📋 Updated mechanics count:', updated.length);
          setTempSelectedMechanics(updated);
        }}
        title={selectedAssignmentType === 'Individual Depot Mechanic' ? 'Select Mechanic' : 'Select Mechanics'}
        data={selectedAssignmentType === 'Individual Depot Mechanic' ? (breakdownMechanics.length > 0 ? breakdownMechanics : mechanics) : mechanics}
        loading={loadingMechanics}
        searchPlaceholder="Search mechanics..."
        displayKey="FirstName"
        valueKey="FirstName"
        multiSelect={selectedAssignmentType !== 'Individual Depot Mechanic'}
        selectedItems={selectedAssignmentType === 'Individual Depot Mechanic' ? (selectedAssignmentMechanic ? [selectedAssignmentMechanic] : []) : tempSelectedMechanics}
        searchKeys={['FirstName', 'Name', 'EmpName', 'Code', 'EmpCode', 'EmpID']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.EmpName || item.FirstName || item.Name || 'Unknown'}
            </Text>
            {(item.EmpCode || item.Code || item.EmpID) && (
              <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                Code: {item.EmpCode || item.Code || item.EmpID}
              </Text>
            )}
            <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
              Role: {getStaffRoleLabel(item)}
            </Text>
          </View>
        )}
      />

      {/* Route Selector Modal - Only for Breakdown */}
      <ModalSelector
        visible={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        onSelect={(value, item) => {
          console.log('✅ Route selected - item:', JSON.stringify(item));
          console.log('✅ Route selected - value:', value);
          if (formikRef.current) {
            const routeNo = String(item.RouteNo || item.Code || item.RouteCode || value || '');
            const routeName = item.RouteName || item.Name || item.Description || `Route ${routeNo}`;
            console.log('✅ Setting routeNo:', routeNo, 'routeName:', routeName);
            formikRef.current.setFieldValue('routeNo', routeNo);
            formikRef.current.setFieldValue('routeName', routeName);
          }
          setShowRouteModal(false);
        }}
        title="Select Route"
        data={routes}
        loading={loadingData}
        searchPlaceholder="Search routes..."
        displayKey="RouteName"
        valueKey="RouteNo"
        searchKeys={['RouteName', 'RouteNo', 'Name', 'Code', 'RouteCode', 'Description']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.RouteName || item.Name || item.Description || 'Unknown Route'}
            </Text>
            {(item.RouteNo || item.Code || item.RouteCode) && (
              <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                Route No: {item.RouteNo || item.Code || item.RouteCode}
              </Text>
            )}
          </View>
        )}
      />

      <ConfirmationModal
        visible={showConfirmation}
        onCancel={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
        title="Create Job Card"
        message={`Are you sure you want to create job card for incident #${complaintNo}?`}
      />

      {/* Maintenance Team Selector */}
      <ModalSelector
        visible={showAssignmentTypeModal}
        onClose={() => setShowAssignmentTypeModal(false)}
        onSelect={(value, item) => {
          const assignmentType = item?.Code || value || 'Area Breakdown Team';
          setSelectedAssignmentType(assignmentType);
          if (formikRef.current) {
            formikRef.current.setFieldValue('assignmentType', assignmentType);
          }
          setShowAssignmentTypeModal(false);
        }}
        title="Select Assignment Type"
        data={assignmentTypeOptions}
        loading={false}
        searchPlaceholder="Search assignment types..."
        displayKey="Name"
        valueKey="Code"
        searchKeys={['Name', 'Code']}
      />

      <ModalSelector
        visible={showBreakdownTeamModal}
        onClose={() => setShowBreakdownTeamModal(false)}
        onSelect={(value, item) => {
          const team = item || {};
          setSelectedBreakdownTeam(team);
          setSelectedTeam({
            TeamCode: team.TeamCode || team.Code || '',
            TeamName: team.TeamName || team.Name || team.TeamCode || '',
            TeamLeaderName: team.TeamLeaderName || team.TeamLeader || team.Supervisor || '',
          });
          setShowBreakdownTeamModal(false);
        }}
        title="Select Breakdown Team"
        data={breakdownTeams}
        loading={loadingData}
        searchPlaceholder="Search breakdown team..."
        displayKey="TeamName"
        valueKey="TeamCode"
        searchKeys={['TeamName', 'TeamCode', 'Name', 'Area', 'Depot']}
        renderItem={(item) => (
          <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#000', flex: 1 }}>{item.TeamName || item.Name || item.TeamCode || item.Code}</Text>
              {(() => {
                const availability = String(item?.Availability || item?.Status || 'ASSIGNED').trim().toUpperCase();
                const available = availability === 'AVAILABLE';
                const label = available ? 'AVAILABLE' : 'ASSIGNED';
                return (
                  <View style={{ backgroundColor: available ? '#DCFCE7' : '#FEE2E2', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 }}>
                    <Text style={{ color: available ? '#166534' : '#B91C1C', fontSize: 10, fontWeight: '800' }}>{label}</Text>
                  </View>
                );
              })()}
            </View>
            {item.Location ? <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Location: {item.Location}</Text> : null}
            {item.Phone ? <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Phone: {item.Phone}</Text> : null}
          </View>
        )}
      />

      <ModalSelector
        visible={showDepotModal}
        onClose={() => setShowDepotModal(false)}
        onSelect={async (value, item) => {
          const selectedDepot = item || {};
          const depotCode = selectedDepot.DepotCode || selectedDepot.Depot || selectedDepot.Code || selectedDepot.Name || '';
          setSelectedTransferDepot(selectedDepot);
          setShowDepotModal(false);
          console.log('📡 Calling GetDepots for breakdown transfer flow:', {
            CompanyDB: dbName || 'MUTSPL_TEST',
            selectedDepot: depotCode,
          });
          try {
            console.log('📡 Calling GetSupervisorsByDepot:', {
              CompanyDB: dbName || 'MUTSPL_TEST',
              Depot: depotCode,
            });
            const response = await masterService.getSupervisorsByDepot(dbName || 'MUTSPL_TEST', depotCode);
            const data = Array.isArray(response?.Data) ? response.Data : [];
            const mappedSupervisors = data.map((supervisor) => ({
              ...supervisor,
              FirstName: supervisor.SupervisorName || supervisor.FirstName || supervisor.Name || supervisor.UserName || '',
              Name: supervisor.SupervisorName || supervisor.Name || supervisor.FirstName || supervisor.UserName || '',
              UserName: supervisor.SupervisorName || supervisor.UserName || supervisor.Name || supervisor.FirstName || '',
              Code: supervisor.EmpID || supervisor.UserCode || supervisor.Code || supervisor.UserID || '',
              EmpCode: supervisor.EmpID || supervisor.EmpCode || supervisor.UserCode || supervisor.Code || '',
            }));
            setSupervisors(mappedSupervisors);
            setSelectedTransferSupervisor(null);
            if (mappedSupervisors.length > 0) {
              setShowSupervisorModal(true);
            }
          } catch (error) {
            console.warn('GetSupervisorsByDepot failed:', error?.message || error);
            setSupervisors([]);
          }
        }}
        title="Select Depot"
        data={depots}
        loading={loadingData}
        searchPlaceholder="Search depots..."
        displayKey="DepotName"
        valueKey="DepotCode"
        searchKeys={['DepotName', 'DepotCode', 'Code', 'Name', 'Address']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>{item.DepotName || item.Depot || item.Name || item.DepotCode || item.Code}</Text>
            {item.DepotCode ? <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Code: {item.DepotCode}</Text> : null}
          </View>
        )}
      />

      <ModalSelector
        visible={showSupervisorModal}
        onClose={() => setShowSupervisorModal(false)}
        onSelect={(value, item) => {
          setSelectedTransferSupervisor(item || null);
          setShowSupervisorModal(false);
        }}
        title="Select Supervisor"
        data={supervisors}
        loading={loadingData}
        searchPlaceholder="Search supervisors..."
        displayKey="SupervisorName"
        valueKey="EmpID"
        searchKeys={['SupervisorName', 'FirstName', 'Name', 'UserName', 'Code', 'EmpID', 'EmpCode', 'UserCode']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>{item.SupervisorName || item.FirstName || item.Name || item.UserName || item.Code || item.EmpID || item.EmpCode}</Text>
            {(item.EmpID || item.Code || item.EmpCode || item.UserCode) ? <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Code: {item.EmpID || item.Code || item.EmpCode || item.UserCode}</Text> : null}
          </View>
        )}
      />

      <ModalSelector
        visible={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        onSelect={(value, item) => {
          setSelectedTeam({
            TeamCode: item.TeamCode || item.Code || '',
            TeamName: item.TeamName || item.Name || item.TeamCode || '',
            TeamLeaderName: item.TeamLeaderName || item.TeamLeader || '',
          });
          setShowTeamModal(false);
        }}
        title="Select Maintenance Team"
        data={maintenanceTeams}
        loading={loadingData}
        searchPlaceholder="Search teams..."
        displayKey="TeamName"
        valueKey="TeamCode"
        searchKeys={['TeamName', 'TeamCode', 'Depot']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.TeamName || item.TeamCode}
            </Text>
            {item.TeamLeaderName ? (
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Team Leader: {item.TeamLeaderName}
              </Text>
            ) : null}
            {item.Depot ? (
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Depot: {item.Depot}</Text>
            ) : null}
          </View>
        )}
      />

      <Loader visible={loading} text="Creating job card..." />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
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
    width: 120,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  faultsContainer: {
    marginTop: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  hintText: {
    fontSize: 12,
    marginTop: 2,
  },
  faultChip: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
  },
  faultContent: {
    flex: 1,
  },
  faultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faultText: {
    marginLeft: SPACING.sm,
    fontSize: 14,
  },
  faultDescription: {
    marginTop: SPACING.xs,
    marginLeft: SPACING.lg + 8,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  summaryCard: {
    minHeight: 82,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
    width: '47%',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  routeSummaryContainer: {
    marginTop: SPACING.sm,
  },
  input: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  selectedMechanics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mechanicChip: {
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  submitButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
});

export default CreateJobCardScreen;

