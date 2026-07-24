import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { complaintService, maintenanceService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatTime } from '../../../utils/helpers';
import { getData, storeData } from '../../../utils/storage';
import { isSupervisorUser, isFieldStaffUser, isDriverUser } from '../../../utils/roleAccess';

/**
 * Simplified Incident Creation Screen - Matches API Fields Exactly
 * Only includes fields that are in the CreateDriverComplaint API
 */

const validationSchema = Yup.object().shape({
  vehicleNumber: Yup.string().required('Vehicle number is required'),
  incidentType: Yup.string().required('Incident type is required'),
  incidentDate: Yup.date().required('Date is required'),
  incidentTime: Yup.string().when('incidentType', {
    is: (val) => !isPreventiveMaintenanceType(val),
    then: (schema) => schema.required('Time is required'),
    otherwise: (schema) => schema,
  }),
  odometer: Yup.string().required('Odometer reading is required'),
  priority: Yup.string().when('incidentType', {
    is: (val) => !isPreventiveMaintenanceType(val),
    then: (schema) => schema.required('Priority is required'),
    otherwise: (schema) => schema,
  }),
  location: Yup.string().when('incidentType', {
    is: (val) => val?.toLowerCase().includes('breakdown'),
    then: (schema) => schema.required('Location is required for breakdown'),
    otherwise: (schema) => schema,
  }),
  routeNo: Yup.string().when('incidentType', {
    is: (val) => val?.toLowerCase().includes('breakdown'),
    then: (schema) => schema.required('Route number is required for breakdown'),
    otherwise: (schema) => schema,
  }),
  preventiveCategory: Yup.string().when('incidentType', {
    is: (val) => isPreventiveMaintenanceType(val),
    then: (schema) => schema.required('Preventive maintenance type is required'),
    otherwise: (schema) => schema,
  }),
  preventiveTaskConfigs: Yup.array().when('incidentType', {
    is: (val) => isPreventiveMaintenanceType(val),
    then: () => Yup.array()
      .of(
        Yup.object().shape({
          Task: Yup.string().required('Task is required'),
          RepeatOnce: Yup.boolean(),
          RepeatType: Yup.string().required('Repeat type is required'),
          RepeatValue: Yup.number()
            .typeError('Repeat value must be a number')
            .integer('Repeat value must be a whole number')
            .positive('Repeat value must be greater than 0')
            .required('Repeat value is required'),
          NotifyDay: Yup.number()
            .typeError('Notify Day must be a number')
            .integer('Notify Day must be a whole number')
            .min(0, 'Notify Day cannot be negative'),
          NotifyKM: Yup.number()
            .typeError('Notify KM must be a number')
            .integer('Notify KM must be a whole number')
            .min(0, 'Notify KM cannot be negative'),
        }),
      )
      .min(1, 'At least one task is required'),
    otherwise: (schema) => schema,
  }),
});

const normalizeIncidentComplaintType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Driver Complaints';

  if (normalized === 'b' || normalized.includes('breakdown')) {
    return 'Breakdown';
  }

  if (
    normalized === 'd' ||
    normalized.includes('driver complaint') ||
    normalized.includes('mechanical') ||
    normalized.includes('preventive')
  ) {
    return 'Driver Complaints';
  }

  return 'Driver Complaints';
};

function isPreventiveMaintenanceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('preventive');
}

const formatDateYMD = (value) => {
  const dateObj = new Date(value);
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

const buildSchedulerTask = (taskName) => {
  const normalizedTask = String(taskName || '').trim();
  const lower = normalizedTask.toLowerCase();

  if (lower.includes('oil')) {
    return {
      Task: normalizedTask || 'Oil Change',
      RepeatType: 'Once',
      EveryKM: 5000,
      EveryDay: 0,
      EveryWeek: 0,
      EveryMonth: 0,
      NotifyKM: 200,
      NotifyDay: 0,
    };
  }

  return {
    Task: normalizedTask || 'General Checkup',
    RepeatType: 'Repeat',
    EveryKM: 0,
    EveryDay: 0,
    EveryWeek: 0,
    EveryMonth: 3,
    NotifyKM: 0,
    NotifyDay: 5,
  };
};

const getPreventiveTaskTemplates = (preventiveCategory, fallbackTask) => {
  const category = String(preventiveCategory || '').trim();

  const templates = {
    'Schedule Service': [
      {
        Task: 'Oil Change',
        RepeatType: 'Once',
        EveryKM: 5000,
        EveryDay: 0,
        EveryWeek: 0,
        EveryMonth: 0,
        NotifyKM: 200,
        NotifyDay: 0,
      },
      {
        Task: 'General Checkup',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 0,
        EveryMonth: 3,
        NotifyKM: 0,
        NotifyDay: 5,
      },
    ],
    'Daily/Weekly/Monthly Checks': [
      {
        Task: 'Daily Safety Check',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 1,
        EveryWeek: 0,
        EveryMonth: 0,
        NotifyKM: 0,
        NotifyDay: 0,
      },
      {
        Task: 'Weekly Condition Check',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 1,
        EveryMonth: 0,
        NotifyKM: 0,
        NotifyDay: 1,
      },
      {
        Task: 'Monthly Inspection Check',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 0,
        EveryMonth: 1,
        NotifyKM: 0,
        NotifyDay: 3,
      },
    ],
    'BEST SNAP Check': [
      {
        Task: 'BEST SNAP Check',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 0,
        EveryMonth: 1,
        NotifyKM: 0,
        NotifyDay: 2,
      },
    ],
    'Survey/Preventive checks/Campaigns Checks': [
      {
        Task: 'Survey / Preventive / Campaign Checks',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 0,
        EveryMonth: 1,
        NotifyKM: 0,
        NotifyDay: 5,
      },
    ],
    'Battery maintainance': [
      {
        Task: 'Battery maintainance',
        RepeatType: 'Repeat',
        EveryKM: 0,
        EveryDay: 0,
        EveryWeek: 1,
        EveryMonth: 0,
        NotifyKM: 0,
        NotifyDay: 2,
      },
    ],
  };

  const selected = templates[category];
  if (Array.isArray(selected) && selected.length > 0) return selected;
  return [buildSchedulerTask(fallbackTask)];
};

const toInteger = (value, defaultValue = 0) => {
  const parsed = parseInt(String(value ?? '').trim(), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const getEditablePreventiveTaskConfigByTask = (taskName) => {
  const taskTemplate = buildSchedulerTask(taskName);

  let repeatTypeLabel = 'Monthly';
  let repeatValue = 1;

  if ((taskTemplate.EveryKM || 0) > 0) {
    repeatTypeLabel = 'KM';
    repeatValue = taskTemplate.EveryKM;
  } else if ((taskTemplate.EveryDay || 0) > 0) {
    repeatTypeLabel = 'Daily';
    repeatValue = taskTemplate.EveryDay;
  } else if ((taskTemplate.EveryWeek || 0) > 0) {
    repeatTypeLabel = 'Weekly';
    repeatValue = taskTemplate.EveryWeek;
  } else {
    repeatTypeLabel = 'Monthly';
    repeatValue = taskTemplate.EveryMonth || 1;
  }

  return {
    Task: taskTemplate.Task || taskName || '',
    RepeatOnce: false,
    RepeatType: repeatTypeLabel,
    RepeatValue: String(repeatValue),
    NotifyDay: String(taskTemplate.NotifyDay ?? 1),
    NotifyKM: String(taskTemplate.NotifyKM ?? 0),
  };
};

const mergePreventiveTaskConfigs = (existingConfigs = [], selectedTaskNames = []) => {
  return selectedTaskNames.map((taskName) => {
    const existingTaskConfig = existingConfigs.find(
      (taskConfig) => String(taskConfig?.Task || '').trim() === String(taskName || '').trim(),
    );
    return existingTaskConfig || getEditablePreventiveTaskConfigByTask(taskName);
  });
};

const mapTaskConfigToSchedulerTask = (task) => {
  const repeatTypeRaw = String(task?.RepeatType || 'Monthly').trim().toLowerCase();
  const repeatValue = toInteger(task?.RepeatValue, 1);
  const isRepeatOnce = task?.RepeatOnce === true || String(task?.RepeatOnce || '').toLowerCase() === 'true';
  const defaultNotifyDay = repeatTypeRaw === 'km' ? 0 : 1;
  const defaultNotifyKM = repeatTypeRaw === 'km' ? 200 : 0;
  const notifyDay = toInteger(task?.NotifyDay, defaultNotifyDay);
  const notifyKM = toInteger(task?.NotifyKM, defaultNotifyKM);

  const isKm = repeatTypeRaw === 'km';
  const isDaily = repeatTypeRaw === 'daily';
  const isWeekly = repeatTypeRaw === 'weekly';
  const isMonthly = repeatTypeRaw === 'monthly';
  const repeatTypeCode = isRepeatOnce ? 'O' : 'R';

  return {
    Task: task.Task || '',
    RepeatType: repeatTypeCode,
    EveryKM: isKm ? repeatValue : 0,
    EveryDay: isDaily ? repeatValue : 0,
    EveryWeek: isWeekly ? repeatValue : 0,
    EveryMonth: isMonthly ? repeatValue : 0,
    NotifyKM: notifyKM,
    NotifyDay: notifyDay,
  };
};

const mapTaskConfigsToSchedulerTasks = (taskConfigs = []) => {
  return taskConfigs.map((taskConfig) => ({
    ...mapTaskConfigToSchedulerTask(taskConfig),
    Task: String(taskConfig?.Task || '').trim() || 'General Checkup',
  }));
};

const mapRepeatTypeToCode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'o' || normalized === 'once') return 'O';
  return 'R';
};

const normalizeSchedulerTasks = (tasks = []) => {
  return tasks.map((task) => ({
    ...(function buildNormalizedTask() {
      const everyKM = toInteger(task?.EveryKM, 0);
      const everyDay = toInteger(task?.EveryDay, 0);
      const everyWeek = toInteger(task?.EveryWeek, 0);
      const everyMonth = toInteger(task?.EveryMonth, 0);
      const isKmBased = everyKM > 0;
      const notifyKMRaw = toInteger(task?.NotifyKM, 0);
      const notifyDayRaw = toInteger(task?.NotifyDay, 0);

      return {
        Task: String(task?.Task || '').trim() || 'General Checkup',
        RepeatType: mapRepeatTypeToCode(task?.RepeatType),
        EveryKM: everyKM,
        EveryDay: everyDay,
        EveryWeek: everyWeek,
        EveryMonth: everyMonth,
        NotifyKM: isKmBased && notifyKMRaw <= 0 ? 200 : notifyKMRaw,
        NotifyDay: !isKmBased && notifyDayRaw <= 0 ? 1 : notifyDayRaw,
      };
    }()),
  }));
};

const getRepeatValueLabel = (repeatType, repeatOnce = false) => {
  const normalized = String(repeatType || '').trim().toLowerCase();
  if (repeatOnce) {
    if (normalized === 'km') return 'After KM';
    if (normalized === 'daily') return 'After Day';
    if (normalized === 'weekly') return 'After Week';
    return 'After Month';
  }

  if (normalized === 'km') return 'Every KM';
  if (normalized === 'daily') return 'Every Day';
  if (normalized === 'weekly') return 'Every Week';
  return 'Every Month';
};

const getPreventiveTaskOptionsByCategory = (preventiveCategory) => {
  const category = String(preventiveCategory || '').trim();

  const options = {
    'Schedule Service': [
      { Code: 'Oil Change', Name: 'Oil Change' },
      { Code: 'General Checkup', Name: 'General Checkup' },
    ],
    'Daily/Weekly/Monthly Checks': [
      { Code: 'Daily Safety Check', Name: 'Daily Safety Check' },
      { Code: 'Weekly Condition Check', Name: 'Weekly Condition Check' },
      { Code: 'Monthly Inspection Check', Name: 'Monthly Inspection Check' },
    ],
    'BEST SNAP Check': [
      { Code: 'BEST SNAP Check', Name: 'BEST SNAP Check' },
    ],
    'Survey/Preventive checks/Campaigns Checks': [
      { Code: 'Survey / Preventive / Campaign Checks', Name: 'Survey / Preventive / Campaign Checks' },
      { Code: 'Campaign Follow-up Check', Name: 'Campaign Follow-up Check' },
    ],
    'Battery maintainance': [
      { Code: 'Battery maintainance', Name: 'Battery maintainance' },
      { Code: 'Battery Load Check', Name: 'Battery Load Check' },
    ],
  };

  return options[category] || [];
};

const mapTaskConfigsToModalSelectedItems = (taskConfigs = []) => {
  return (taskConfigs || [])
    .map((taskConfig) => {
      const taskName = String(taskConfig?.Task || '').trim();
      return taskName ? { Code: taskName, Name: taskName } : null;
    })
    .filter(Boolean);
};

const INCIDENT_FAULT_CACHE_KEY = '@fleet_incident_fault_cache';

const CreateIncidentScreen = ({ route, navigation }) => {
  const incidentTypeParam = route.params?.type || 'complaint';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const supervisorUser = isSupervisorUser(user);
  const mechanicUser = isFieldStaffUser(user);
  const driverUser = isDriverUser(user);
  const resolvedDriverCode = user?.Code || user?.code || user?.User || user?.user || '';
  const resolvedDriverName = user?.Name || user?.name || user?.FirstName || resolvedDriverCode || 'Driver';
  const inputOutlineColor = colors.border || (isDarkMode ? colors.grayLight : '#D9DCDD');
  const mutedSurfaceColor = isDarkMode ? colors.grayLight : colors.grayLight;
  const accentColor = colors.primary;

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Data states
  const [buses, setBuses] = useState([]);
  const [incidentTypes, setIncidentTypes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [faults, setFaults] = useState([]);
  const [selectedFaults, setSelectedFaults] = useState([]);
  const [tempSelectedFaults, setTempSelectedFaults] = useState([]);
  
  // Modal states
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showIncidentTypeModal, setShowIncidentTypeModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showPreventiveTypeModal, setShowPreventiveTypeModal] = useState(false);
  const [showPreventiveTaskModal, setShowPreventiveTaskModal] = useState(false);
  const [showRepeatTypeModal, setShowRepeatTypeModal] = useState(false);
  const [tempSelectedPreventiveTaskConfigs, setTempSelectedPreventiveTaskConfigs] = useState([]);
  const [activePreventiveTaskIndex, setActivePreventiveTaskIndex] = useState(-1);

  const preventiveMaintenanceTypes = [
    { Code: 'Schedule Service', Name: 'Schedule Service' },
    { Code: 'BEST SNAP Check', Name: 'BEST SNAP Check' },
    { Code: 'Survey/Preventive checks/Campaigns Checks', Name: 'Survey/Preventive checks/Campaigns Checks' },
    { Code: 'Battery maintainance', Name: 'Battery maintainance' },
  ];

  const priorityLevels = [
    { Code: 'Low', Name: 'Low' },
    { Code: 'Medium', Name: 'Medium' },
    { Code: 'High', Name: 'High' },
  ];

  const repeatTypeOptions = [
    { Code: 'Daily', Name: 'Daily' },
    { Code: 'Weekly', Name: 'Weekly' },
    { Code: 'Monthly', Name: 'Monthly' },
    { Code: 'KM', Name: 'KM' },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoadingData(true);
      console.log('🔍 Fetching CreateIncident data...');
      const [busesResponse, jobTypesResponse, driversResponse, routesResponse, faultsResponse] = await Promise.all([
        complaintService.getActiveBuses(dbName || 'MUTSPL_TEST'),
        complaintService.getJobTypes(dbName || 'MUTSPL_TEST'),
        complaintService.getDrivers(dbName || 'MUTSPL_TEST'),
        complaintService.getRoutes(dbName || 'MUTSPL_TEST'),
        complaintService.getFaultMaster(dbName || 'MUTSPL_TEST'),
      ]);

      console.log('📊 Buses response:', busesResponse);
      console.log('📊 Job types response:', jobTypesResponse);
      console.log('📊 Drivers response:', driversResponse);
      console.log('📊 Routes response:', routesResponse);
      console.log('📊 Faults response:', faultsResponse);

      if (busesResponse.Success) {
        console.log('✅ Setting buses:', busesResponse.Data?.length || 0, 'items');
        if (busesResponse.Data && busesResponse.Data.length > 0) {
          console.log('🚌 First bus structure:', JSON.stringify(busesResponse.Data[0], null, 2));
        }
        setBuses(busesResponse.Data || []);
      } else {
        console.log('❌ Buses API failed:', busesResponse);
      }
      if (jobTypesResponse.Success) {
        console.log('✅ Setting incident types:', jobTypesResponse.Data?.length || 0, 'items');
        const allTypes = jobTypesResponse.Data || [];
        // Mechanic can only report Line Breakdown — filter to breakdown types only
        const filteredTypes = mechanicUser
          ? allTypes.filter(t =>
              normalizeIncidentComplaintType(t.Code) === 'Breakdown' ||
              normalizeIncidentComplaintType(t.Name) === 'Breakdown'
            )
          : allTypes;
        // Fallback: if no breakdown type found from API, add one
        setIncidentTypes(
          filteredTypes.length > 0
            ? filteredTypes
            : mechanicUser
            ? [{ Code: 'B', Name: 'Line Breakdown' }]
            : allTypes
        );
      }
      if (driversResponse.Success) {
        console.log('✅ Setting drivers:', driversResponse.Data?.length || 0, 'items');
        setDrivers(driversResponse.Data || []);
      }
      if (routesResponse.Success) {
        console.log('✅ Setting routes:', routesResponse.Data?.length || 0, 'items');
        setRoutes(routesResponse.Data || []);
      }
      if (faultsResponse.Success) {
        console.log('✅ Setting faults:', faultsResponse.Data?.length || 0, 'items');
        // Normalize GetFaultMaster shape → internal shape ({ Fault, Code, Description, FaultCategory, Severity, Solutions, Time })
        const normalized = (faultsResponse.Data || []).map(item => ({
          Fault: item.Name || item.Fault || '',
          Code: item.Code || '',
          Description: item.Descriptions || item.Description || '',
          FaultCategory: item.FaultCategory || '',
          Severity: item.Severity || '',
          Solutions: Array.isArray(item.Solutions) ? item.Solutions.filter(s => s.Name) : [],
          Time: item.Time || '',
        }));
        setFaults(normalized);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load form data',
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const complaintTypeForApi = normalizeIncidentComplaintType(values.incidentType);
      const isPreventiveMaintenance = isPreventiveMaintenanceType(values.incidentType);

      // Format date as YYYY-MM-DD (as per CreateIncidents payload contract)
      const formattedDate = formatDateYMD(values.incidentDate);
      
      // Get selected vehicle details for Depot
      const selectedBus = buses.find(b => b.BusCode === values.vehicleNumber);
      const resolvedBusNo = String(
        selectedBus?.BusNo
        || selectedBus?.BusCode
        || selectedBus?.BusRegistrationNo
        || values.vehicleNumber
        || ''
      ).trim();

      // Prepare fault data from selected faults with their descriptions
      const faultsData = selectedFaults.length > 0 
        ? selectedFaults.map(fault => ({
            Fault: fault.Fault || 'General Issue',
            Dscption: fault.Description || '',
            // Enrich with master data for downstream screens (CreateJobCard → FaultMechanicPartsSection)
            Severity: fault.Severity || '',
            FaultCategory: fault.FaultCategory || '',
            Solutions: fault.Solutions || [],
            Time: fault.Time || '',
          }))
        : [{
            Fault: values.incidentType || 'General Issue',
            Dscption: '',
          }];

      // Check if it's a breakdown incident
      const isBreakdown = complaintTypeForApi === 'Breakdown';

      // Parse odometer safely
      const odometerValue = parseInt(values.odometer, 10);
      const odometerFinal = isNaN(odometerValue) ? 0 : odometerValue;

      // Time kept in HH:mm format as per payload sample
      const formattedTime = values.incidentTime;

      // Generate description from faults if available
      const generalDescription = faultsData.length > 0 
        ? faultsData.map(f => f.Fault).join(', ')
        : '';

      // Unified payload for both Breakdown and Driver Complaints
      // Only RouteNo and BrkPlace are included for breakdown type.
      const incidentData = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        ComplaintType: complaintTypeForApi,
        Supervisr: user?.UserCode || user?.Code || 'SUP001',
        SprvsrNm: user?.Name || user?.name || 'Supervisor',
        Depot: selectedBus?.AssignedDepot || selectedBus?.Depot || 'Central Depot',
        BusNo: resolvedBusNo,
        DrvCode: values.driverCode || '',
        DrvName: values.driverName || '',
        Odometr: odometerFinal,
        Status: 'O',
        Priority: values.priority,
        RegDate: formattedDate,
        RegTime: formattedTime,
        ComplaintTime: formattedTime,
        Dscrpton: generalDescription,
        Faults: faultsData,
        ...(isBreakdown ? {
          RouteNo: values.routeNo || '',
          BrkPlace: values.location || '',
        } : {}),
      };

      if (supervisorUser && isPreventiveMaintenance) {
        const editableTaskConfigs = Array.isArray(values.preventiveTaskConfigs)
          ? values.preventiveTaskConfigs
          : [];

        const schedulerTasks = editableTaskConfigs.length > 0
          ? mapTaskConfigsToSchedulerTasks(editableTaskConfigs)
          : getPreventiveTaskTemplates(values.preventiveCategory, values.incidentType);

        const normalizedSchedulerTasks = normalizeSchedulerTasks(schedulerTasks);
        const schedulerDateTime = `${formattedDate}T00:00:00`;

        const schedulerPayload = {
          CompanyDB: dbName || 'MUTSPL_TEST',
          BusNo: resolvedBusNo,
          LastSrvKM: odometerFinal,
          LastSrvDt: schedulerDateTime,
          Tasks: normalizedSchedulerTasks,
        };

        console.log('📤 Sending preventive scheduler payload:', JSON.stringify(schedulerPayload, null, 2));
        const schedulerResponse = await maintenanceService.createServiceScheduler(schedulerPayload);

        if (!schedulerResponse?.Success) {
          throw new Error(schedulerResponse?.Message || 'Failed to create service scheduler');
        }

        const preventiveCategoryLabel = values.preventiveCategory || 'Preventive maintenance';
        const schedulerSuccessMessage = String(schedulerResponse?.Message || '').trim();

        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: schedulerSuccessMessage
            ? `${schedulerSuccessMessage} (${preventiveCategoryLabel})`
            : `${preventiveCategoryLabel} schedule created successfully`,
        });

        navigation.goBack();
        return;
      }

      console.log('📤 Sending incident data:', JSON.stringify(incidentData, null, 2));
      console.log('🔍 Incident Type:', isBreakdown ? 'Breakdown' : 'Driver Complaint');
      console.log('🔍 ComplaintType (API):', complaintTypeForApi, '| Selected:', values.incidentType);
      console.log('🔍 Date format:', formattedDate);
      console.log('🔍 Time format:', formattedTime);
      console.log('🔍 Odometer values - Original:', values.odometer, 'Parsed:', odometerFinal);

      const response = await complaintService.createIncident(incidentData);

      if (response.Success) {
        const createdDocEntry = Number(response?.Data || 0);
        if (createdDocEntry > 0 && faultsData.length > 0) {
          try {
            const cacheKey = `${dbName || 'MUTSPL_TEST'}:${createdDocEntry}`;
            const existingCache = await getData(INCIDENT_FAULT_CACHE_KEY) || {};
            existingCache[cacheKey] = faultsData.map((fault) => ({
              Fault: String(fault?.Fault || '').trim(),
              Description: String(fault?.Dscption || fault?.Description || '').trim(),
              Severity: fault?.Severity || '',
              FaultCategory: fault?.FaultCategory || '',
              Solutions: Array.isArray(fault?.Solutions) ? fault.Solutions : [],
              Time: fault?.Time || '',
            }));
            await storeData(INCIDENT_FAULT_CACHE_KEY, existingCache);
          } catch (faultCacheError) {
            console.warn('Unable to cache incident faults locally:', faultCacheError?.message || faultCacheError);
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: `${isBreakdown ? 'Breakdown' : 'Incident'} reported successfully`,
        });
        navigation.goBack();
      } else {
        throw new Error(response.Message || 'Failed to create incident');
      }
    } catch (error) {
      console.error('Error creating incident:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to create incident',
      });
    } finally {
      setLoading(false);
    }
  };

  // For mechanics: auto-select the first (and only) breakdown type
  const defaultBreakdownType =
    mechanicUser
      ? incidentTypes.find(
          t =>
            normalizeIncidentComplaintType(t.Code) === 'Breakdown' ||
            normalizeIncidentComplaintType(t.Name) === 'Breakdown'
        ) || { Code: 'B', Name: 'Line Breakdown' }
      : null;

  const initialValues = {
    vehicleNumber: '',
    incidentType: mechanicUser ? (defaultBreakdownType?.Code || 'B') : '',
    driverCode: driverUser ? String(resolvedDriverCode) : '',
    driverName: driverUser ? String(resolvedDriverName) : '',
    odometer: '',
    incidentDate: new Date(),
    incidentTime: formatTime(new Date()),
    priority: 'Medium',
    reportedBy: user?.Name || user?.name || '',
    location: '',
    routeNo: '',
    routeName: '',
    preventiveCategory: '',
    preventiveTaskConfigs: [],
  };

  const handleUseCurrentLocation = () => {
    Toast.show({
      type: 'info',
      text1: 'Location picker disabled',
      text2: 'Please enter location manually for now.',
    });
  };

  if (loadingData) {
    return <Loader />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue }) => (
          <View style={[styles.container, { backgroundColor: colors.light }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formContainer}>
                {/* Simplified Form - Only API Fields */}
                
                {/* Vehicle Number */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>Vehicle Number:
                  </Text>
                  <TouchableOpacity onPress={() => setShowVehicleModal(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={values.vehicleNumber}
                        error={errors.vehicleNumber && touched.vehicleNumber}
                        style={styles.input}
                        placeholder="Select vehicle"
                        right={<TextInput.Icon icon="magnify" />}
                        outlineColor={inputOutlineColor}
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.vehicleNumber && touched.vehicleNumber && (
                    <Text style={styles.errorText}>{errors.vehicleNumber}</Text>
                  )}
                </View>

                {/* Incident Type */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>Incident Type:
                  </Text>
                  {/* Mechanics are locked to Line Breakdown only */}
                  <TouchableOpacity
                    onPress={() => !mechanicUser && setShowIncidentTypeModal(true)}
                    disabled={mechanicUser}
                    activeOpacity={mechanicUser ? 1 : 0.7}
                  >
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={
                          mechanicUser
                            ? (defaultBreakdownType?.Name || 'Line Breakdown')
                            : values.incidentType
                        }
                        error={errors.incidentType && touched.incidentType}
                        style={[styles.input, mechanicUser && { opacity: 0.7 }]}
                        placeholder="Select incident type"
                        right={
                          mechanicUser
                            ? <TextInput.Icon icon="lock" />
                            : <TextInput.Icon icon="chevron-down" />
                        }
                        outlineColor={inputOutlineColor}
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.incidentType && touched.incidentType && (
                    <Text style={styles.errorText}>{errors.incidentType}</Text>
                  )}
                </View>

                {/* Conditional: Route Number (Only for Breakdown) */}
                {values.incidentType?.toLowerCase().includes('breakdown') && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>
                      <Text style={styles.required}>* </Text>Route Number:
                    </Text>
                    <TouchableOpacity onPress={() => setShowRouteModal(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={values.routeName || values.routeNo}
                          error={errors.routeNo && touched.routeNo}
                          style={styles.input}
                          placeholder="Select route"
                          right={<TextInput.Icon icon="magnify" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>
                    {errors.routeNo && touched.routeNo && (
                      <Text style={styles.errorText}>{errors.routeNo}</Text>
                    )}
                  </View>
                )}

                {/* Conditional: Location (Only for Breakdown) */}
                {values.incidentType?.toLowerCase().includes('breakdown') && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>
                      <Text style={styles.required}>* </Text>Location:
                    </Text>
                    <TextInput
                      mode="outlined"
                      value={values.location}
                      onChangeText={handleChange('location')}
                      onBlur={handleBlur('location')}
                      error={errors.location && touched.location}
                      style={styles.input}
                      placeholder="Enter breakdown location"
                      outlineColor={inputOutlineColor}
                    />
                    <TouchableOpacity
                      style={[styles.locationButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}
                      onPress={handleUseCurrentLocation}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="my-location" size={16} color={colors.primary} />
                      <Text style={[styles.locationButtonText, { color: colors.primary }]}>
                        Use Current Location
                      </Text>
                    </TouchableOpacity>
                    {errors.location && touched.location && (
                      <Text style={styles.errorText}>{errors.location}</Text>
                    )}
                  </View>
                )}

                {/* Conditional: Preventive Maintenance Type */}
                {isPreventiveMaintenanceType(values.incidentType) && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>
                      <Text style={styles.required}>* </Text>Preventive Maintenance Type:
                    </Text>
                    <TouchableOpacity onPress={() => setShowPreventiveTypeModal(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={values.preventiveCategory}
                          error={errors.preventiveCategory && touched.preventiveCategory}
                          style={styles.input}
                          placeholder="Select preventive maintenance type"
                          right={<TextInput.Icon icon="chevron-down" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>
                    {errors.preventiveCategory && touched.preventiveCategory && (
                      <Text style={styles.errorText}>{errors.preventiveCategory}</Text>
                    )}
                  </View>
                )}

                {/* Conditional: Preventive Task Configuration (Supervisor only) */}
                {supervisorUser && isPreventiveMaintenanceType(values.incidentType) && values.preventiveCategory ? (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>Preventive Task Parameters:</Text>
                    <Text style={[styles.label, { color: colors.dark }]}>Tasks</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setTempSelectedPreventiveTaskConfigs(values.preventiveTaskConfigs || []);
                        setShowPreventiveTaskModal(true);
                      }}
                    >
                      <View pointerEvents="none" style={{ marginBottom: 8 }}>
                        <TextInput
                          mode="outlined"
                          value={
                            values.preventiveTaskConfigs?.length > 0
                              ? `${values.preventiveTaskConfigs.length} task(s) selected`
                              : ''
                          }
                          style={styles.input}
                          placeholder="Select one or more tasks"
                          right={<TextInput.Icon icon="chevron-down" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>

                    {typeof errors.preventiveTaskConfigs === 'string' && touched.preventiveTaskConfigs && (
                      <Text style={styles.errorText}>{errors.preventiveTaskConfigs}</Text>
                    )}

                    {(values.preventiveTaskConfigs || []).map((taskConfig, taskIndex) => (
                      <View
                        key={`${taskConfig.Task}-${taskIndex}`}
                        style={{
                          backgroundColor: mutedSurfaceColor,
                          padding: 12,
                          borderRadius: 8,
                          borderLeftWidth: 3,
                          borderLeftColor: accentColor,
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={[styles.label, { color: colors.dark, marginBottom: 0 }]}>
                            {taskConfig.Task || `Task ${taskIndex + 1}`}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                              updatedTaskConfigs.splice(taskIndex, 1);
                              setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                              setTempSelectedPreventiveTaskConfigs(updatedTaskConfigs);
                            }}
                          >
                            <MaterialIcons name="close" size={20} color={accentColor} />
                          </TouchableOpacity>
                        </View>

                        <Text style={[styles.label, { color: colors.dark }]}>Repeat Type</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setActivePreventiveTaskIndex(taskIndex);
                            setShowRepeatTypeModal(true);
                          }}
                        >
                          <View pointerEvents="none">
                            <TextInput
                              mode="outlined"
                              value={taskConfig.RepeatType || ''}
                              style={styles.input}
                              placeholder="Select Repeat Type"
                              right={<TextInput.Icon icon="chevron-down" />}
                              outlineColor={inputOutlineColor}
                            />
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                            const currentRepeatOnce = updatedTaskConfigs[taskIndex]?.RepeatOnce === true;
                            updatedTaskConfigs[taskIndex] = {
                              ...updatedTaskConfigs[taskIndex],
                              RepeatOnce: !currentRepeatOnce,
                            };
                            setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10, alignSelf: 'flex-start' }}
                        >
                          <MaterialIcons
                            name={taskConfig?.RepeatOnce ? 'check-box' : 'check-box-outline-blank'}
                            size={22}
                            color={taskConfig?.RepeatOnce ? accentColor : colors.gray}
                          />
                          <Text style={[styles.label, { color: colors.dark, marginBottom: 0, marginLeft: 8 }]}>Repeat Once</Text>
                        </TouchableOpacity>

                        <Text style={[styles.label, { color: colors.dark }]}> 
                          {getRepeatValueLabel(taskConfig.RepeatType, taskConfig?.RepeatOnce)}
                        </Text>
                        <TextInput
                          mode="outlined"
                          value={taskConfig.RepeatValue || ''}
                          onChangeText={(text) => {
                            const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                            updatedTaskConfigs[taskIndex] = {
                              ...updatedTaskConfigs[taskIndex],
                              RepeatValue: text,
                            };
                            setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                          }}
                          style={styles.input}
                          placeholder={getRepeatValueLabel(taskConfig.RepeatType, taskConfig?.RepeatOnce)}
                          keyboardType="numeric"
                          outlineColor={inputOutlineColor}
                        />

                        <Text style={[styles.label, { color: colors.dark }]}>Notify Day</Text>
                        <TextInput
                          mode="outlined"
                          value={String(taskConfig.NotifyDay ?? '')}
                          onChangeText={(text) => {
                            const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                            updatedTaskConfigs[taskIndex] = {
                              ...updatedTaskConfigs[taskIndex],
                              NotifyDay: text,
                            };
                            setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                          }}
                          style={styles.input}
                          placeholder="Notify Day"
                          keyboardType="numeric"
                          outlineColor={inputOutlineColor}
                        />

                        <Text style={[styles.label, { color: colors.dark }]}>Notify KM</Text>
                        <TextInput
                          mode="outlined"
                          value={String(taskConfig.NotifyKM ?? '')}
                          onChangeText={(text) => {
                            const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                            updatedTaskConfigs[taskIndex] = {
                              ...updatedTaskConfigs[taskIndex],
                              NotifyKM: text,
                            };
                            setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                          }}
                          style={styles.input}
                          placeholder="Notify KM"
                          keyboardType="numeric"
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Driver */}
                {!isPreventiveMaintenanceType(values.incidentType) && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>Driver{driverUser ? ':' : ' (Optional):'}</Text>
                    {driverUser ? (
                      <TextInput
                        mode="outlined"
                        value={values.driverName || resolvedDriverName}
                        style={styles.input}
                        editable={false}
                        outlineColor={inputOutlineColor}
                      />
                    ) : (
                      <TouchableOpacity onPress={() => setShowDriverModal(true)}>
                        <View pointerEvents="none">
                          <TextInput
                            mode="outlined"
                            value={values.driverName}
                            style={styles.input}
                            placeholder="Select driver"
                            right={<TextInput.Icon icon="magnify" />}
                            outlineColor={inputOutlineColor}
                          />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Odometer */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>{isPreventiveMaintenanceType(values.incidentType) ? 'Last Service KM:' : 'Odometer Reading:'}
                  </Text>
                  <TextInput
                    mode="outlined"
                    value={values.odometer}
                    onChangeText={handleChange('odometer')}
                    onBlur={handleBlur('odometer')}
                    error={errors.odometer && touched.odometer}
                    style={styles.input}
                    placeholder={isPreventiveMaintenanceType(values.incidentType) ? 'Enter last service km' : 'Enter odometer reading'}
                    keyboardType="numeric"
                    outlineColor={inputOutlineColor}
                  />
                  {errors.odometer && touched.odometer && (
                    <Text style={styles.errorText}>{errors.odometer}</Text>
                  )}
                </View>

                {/* Date */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>{isPreventiveMaintenanceType(values.incidentType) ? 'Last Service Date:' : 'Incident Date:'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={formatDate(values.incidentDate)}
                        error={errors.incidentDate && touched.incidentDate}
                        style={styles.input}
                        right={<TextInput.Icon icon="calendar" />}
                        outlineColor={inputOutlineColor}
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.incidentDate && touched.incidentDate && (
                    <Text style={styles.errorText}>{errors.incidentDate}</Text>
                  )}
                </View>

                {/* Time */}
                {!isPreventiveMaintenanceType(values.incidentType) && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>
                      <Text style={styles.required}>* </Text>Incident Time:
                    </Text>
                    <TouchableOpacity onPress={() => setShowTimePicker(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={values.incidentTime}
                          error={errors.incidentTime && touched.incidentTime}
                          style={styles.input}
                          right={<TextInput.Icon icon="clock" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>
                    {errors.incidentTime && touched.incidentTime && (
                      <Text style={styles.errorText}>{errors.incidentTime}</Text>
                    )}
                  </View>
                )}

                {/* Priority */}
                {!isPreventiveMaintenanceType(values.incidentType) && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>
                      <Text style={styles.required}>* </Text>Priority:
                    </Text>
                    <TouchableOpacity onPress={() => setShowPriorityModal(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={values.priority}
                          error={errors.priority && touched.priority}
                          style={styles.input}
                          placeholder="Select priority"
                          right={<TextInput.Icon icon="chevron-down" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>
                    {errors.priority && touched.priority && (
                      <Text style={styles.errorText}>{errors.priority}</Text>
                    )}
                  </View>
                )}

                {/* Faults (Multi-select) */}
                {!isPreventiveMaintenanceType(values.incidentType) && (
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.dark }]}>Faults (Optional):</Text>
                    <TouchableOpacity onPress={() => {
                      // Initialize temp selected faults from current selection
                      setTempSelectedFaults(selectedFaults);
                      setShowFaultModal(true);
                    }}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={selectedFaults.length > 0 ? `${selectedFaults.length} fault(s) selected` : ''}
                          style={styles.input}
                          placeholder="Select faults"
                          right={<TextInput.Icon icon="plus" />}
                          outlineColor={inputOutlineColor}
                        />
                      </View>
                    </TouchableOpacity>
                    {selectedFaults.length > 0 && (
                      <View style={{ marginTop: 8, gap: 12 }}>
                        {selectedFaults.map((fault, index) => {
                          const sevColor =
                            fault.Severity === 'High' ? '#BB0000'
                            : fault.Severity === 'Medium' ? '#E65100'
                            : fault.Severity === 'Low' ? '#2B7D2B'
                            : accentColor;
                          return (
                          <View key={index} style={{ 
                            backgroundColor: mutedSurfaceColor,
                            padding: 12,
                            borderRadius: 8,
                            borderLeftWidth: 3,
                            borderLeftColor: sevColor || accentColor,
                          }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <Text style={{ fontSize: 14, color: colors.dark, fontWeight: '700', flex: 1 }}>
                                {fault.Fault}
                              </Text>
                              <TouchableOpacity onPress={() => {
                                setSelectedFaults(selectedFaults.filter((_, i) => i !== index));
                              }}>
                                <MaterialIcons name="close" size={20} color={accentColor} />
                              </TouchableOpacity>
                            </View>

                            {/* Severity + Category badges */}
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                              {fault.Severity ? (
                                <View style={{ backgroundColor: sevColor, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
                                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>{fault.Severity}</Text>
                                </View>
                              ) : null}
                              {fault.FaultCategory ? (
                                <View style={{ backgroundColor: '#0070F215', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
                                  <Text style={{ color: '#0070F2', fontSize: 11, fontWeight: '600' }}>{fault.FaultCategory}</Text>
                                </View>
                              ) : null}
                              {fault.Time ? (
                                <View style={{ backgroundColor: '#FF980015', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
                                  <Text style={{ color: '#FF9800', fontSize: 11 }}>⏱ {fault.Time}h</Text>
                                </View>
                              ) : null}
                            </View>

                            {/* Suggested solution (first non-empty) */}
                            {fault.Solutions?.length > 0 && fault.Solutions[0]?.Name ? (
                              <Text style={{ fontSize: 12, color: '#2B7D2B', marginBottom: 6 }}>
                                💡 {fault.Solutions[0].Name}
                              </Text>
                            ) : null}

                            <TextInput
                              mode="outlined"
                              value={fault.Description || ''}
                              onChangeText={(text) => {
                                const updated = [...selectedFaults];
                                updated[index] = { ...updated[index], Description: text };
                                setSelectedFaults(updated);
                              }}
                              placeholder="Additional notes..."
                              multiline
                              numberOfLines={2}
                              style={{ 
                                backgroundColor: mutedSurfaceColor,
                                fontSize: 13 
                              }}
                              outlineColor={inputOutlineColor}
                            />
                          </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {/* Submit Button */}
                <View style={styles.submitSection}>
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={loading}
                    style={[styles.submitButton, { backgroundColor: colors.success }]}
                    contentStyle={styles.submitButtonContent}
                    labelStyle={styles.submitButtonLabel}
                    icon={() => <MaterialIcons name="assignment-turned-in" size={20} color="#fff" />}
                  >
                    Create Incident
                  </Button>
                </View>
              </View>
            </ScrollView>

            {/* Date Picker */}
            {showDatePicker && (
              <DateTimePicker
                value={values.incidentDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setFieldValue('incidentDate', selectedDate);
                  }
                }}
              />
            )}

            {/* Time Picker */}
            {showTimePicker && (
              <DateTimePicker
                value={new Date()}
                mode="time"
                display="default"
                onChange={(event, selectedTime) => {
                  setShowTimePicker(false);
                  if (selectedTime) {
                    const hours = String(selectedTime.getHours()).padStart(2, '0');
                    const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
                    setFieldValue('incidentTime', `${hours}:${minutes}`);
                  }
                }}
              />
            )}

            {/* Modal Selectors */}
            <ModalSelector
              visible={showVehicleModal}
              onClose={() => setShowVehicleModal(false)}
              title="Select Vehicle"
              data={buses}
              displayKey="BusRegistrationNo"
              searchKeys={['BusRegistrationNo', 'BusCode', 'AssignedDepot']}
              onSelect={(item) => {
                console.log('✅ Vehicle selected:', JSON.stringify(item, null, 2));
                setFieldValue('vehicleNumber', item.BusCode);
                setShowVehicleModal(false);
              }}
              renderItem={(item) => (
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
                    {item.BusRegistrationNo || item.BusCode}
                  </Text>
                  {item.AssignedDepot && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                      Depot: {item.AssignedDepot}
                    </Text>                  )}
                  {item.BusCode && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                      Code: {item.BusCode}
                    </Text>
                  )}
                </View>
              )}
            />

            <ModalSelector
              visible={showIncidentTypeModal}
              onClose={() => setShowIncidentTypeModal(false)}
              title="Select Complaint Type"
              data={incidentTypes}
              displayKey="CodeName"
              searchKeys={['CodeName', 'JobType', 'Description']}
              onSelect={(item) => {
                const selectedIncidentType = item.CodeName || item.JobType || '';
                console.log('✅ Complaint type selected:', selectedIncidentType);
                setFieldValue('incidentType', selectedIncidentType);
                if (!isPreventiveMaintenanceType(selectedIncidentType)) {
                  setFieldValue('preventiveCategory', '');
                  setFieldValue('preventiveTaskConfigs', []);
                }
                setShowIncidentTypeModal(false);
              }}
            />

            <ModalSelector
              visible={showDriverModal}
              onClose={() => setShowDriverModal(false)}
              title="Select Driver"
              data={drivers}
              displayKey="DrvName"
              searchKeys={['DrvName', 'DrvCode', 'FirstName']}
              onSelect={(item) => {
                console.log('✅ Driver selected:', item.DrvName || item.FirstName);
                setFieldValue('driverCode', item.DrvCode || item.Code || '');
                setFieldValue('driverName', item.DrvName || item.FirstName || '');
                setShowDriverModal(false);
              }}
              renderItem={(item) => (
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
                    {item.DrvName || item.FirstName || 'Unknown'}
                  </Text>
                  {(item.DrvCode || item.Code) && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                      Code: {item.DrvCode || item.Code}
                    </Text>
                  )}
                </View>
              )}
            />

            <ModalSelector
              visible={showPriorityModal}
              onClose={() => setShowPriorityModal(false)}
              title="Select Priority"
              data={priorityLevels}
              displayKey="Name"
              onSelect={(item) => {
                console.log('✅ Priority selected:', item.Name);
                setFieldValue('priority', item.Name);
                setShowPriorityModal(false);
              }}
            />

            <ModalSelector
              visible={showRouteModal}
              onClose={() => setShowRouteModal(false)}
              title="Select Route"
              data={routes}
              displayKey="RouteNo"
              searchKeys={['RouteNo', 'RouteName']}
              onSelect={(item) => {
                console.log('✅ Route selected:', JSON.stringify(item, null, 2));
                setFieldValue('routeNo', item.RouteNo || '');
                setFieldValue('routeName', item.RouteNo || '');
                setFieldValue('location', item.RouteName || '');
                setShowRouteModal(false);
              }}
              renderItem={(item) => (
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.dark }}>
                    Route No: {item.RouteNo || 'Unknown Route'}
                  </Text>
                  {item.RouteName && (
                    <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>
                      {item.RouteName}
                    </Text>
                  )}
                </View>
              )}
            />

            <ModalSelector
              visible={showPreventiveTypeModal}
              onClose={() => setShowPreventiveTypeModal(false)}
              title="Select Preventive Type"
              data={preventiveMaintenanceTypes}
              displayKey="Name"
              searchKeys={['Name', 'Code']}
              onSelect={(item) => {
                const selectedPreventiveCategory = item.Name || item.Code || '';
                setFieldValue('preventiveCategory', selectedPreventiveCategory);
                setShowPreventiveTypeModal(false);
              }}
            />

            <ModalSelector
              visible={showPreventiveTaskModal}
              onClose={() => {
                setFieldValue('preventiveTaskConfigs', tempSelectedPreventiveTaskConfigs);
                setShowPreventiveTaskModal(false);
              }}
              title="Select Preventive Task"
              data={getPreventiveTaskOptionsByCategory(values.preventiveCategory)}
              displayKey="Name"
              valueKey="Code"
              searchKeys={['Name', 'Code']}
              multiSelect={true}
              selectedItems={mapTaskConfigsToModalSelectedItems(tempSelectedPreventiveTaskConfigs)}
              onSelect={(value, item) => {
                const selectedTaskName = item.Name || item.Code || '';
                const isSelected = tempSelectedPreventiveTaskConfigs.some(
                  (taskConfig) => String(taskConfig?.Task || '').trim() === selectedTaskName,
                );

                let nextSelectedTaskNames;
                if (isSelected) {
                  nextSelectedTaskNames = tempSelectedPreventiveTaskConfigs
                    .filter((taskConfig) => String(taskConfig?.Task || '').trim() !== selectedTaskName)
                    .map((taskConfig) => taskConfig.Task);
                } else {
                  nextSelectedTaskNames = [
                    ...tempSelectedPreventiveTaskConfigs.map((taskConfig) => taskConfig.Task),
                    selectedTaskName,
                  ];
                }

                const mergedConfigs = mergePreventiveTaskConfigs(
                  tempSelectedPreventiveTaskConfigs,
                  nextSelectedTaskNames,
                );
                setTempSelectedPreventiveTaskConfigs(mergedConfigs);
              }}
            />

            <ModalSelector
              visible={showRepeatTypeModal}
              onClose={() => {
                setShowRepeatTypeModal(false);
                setActivePreventiveTaskIndex(-1);
              }}
              title="Select Repeat Type"
              data={repeatTypeOptions}
              displayKey="Name"
              searchKeys={['Name', 'Code']}
              onSelect={(item) => {
                const selectedRepeatType = item.Name || item.Code || 'Monthly';
                if (activePreventiveTaskIndex >= 0) {
                  const updatedTaskConfigs = [...(values.preventiveTaskConfigs || [])];
                  if (updatedTaskConfigs[activePreventiveTaskIndex]) {
                    const repeatTypeLower = String(selectedRepeatType || '').toLowerCase();
                    const isKmType = repeatTypeLower === 'km';
                    updatedTaskConfigs[activePreventiveTaskIndex] = {
                      ...updatedTaskConfigs[activePreventiveTaskIndex],
                      RepeatType: selectedRepeatType,
                      RepeatValue: '1',
                      NotifyDay: isKmType
                        ? '0'
                        : String(updatedTaskConfigs[activePreventiveTaskIndex]?.NotifyDay ?? '1'),
                      NotifyKM: isKmType
                        ? String(updatedTaskConfigs[activePreventiveTaskIndex]?.NotifyKM ?? '200')
                        : '0',
                    };
                    setFieldValue('preventiveTaskConfigs', updatedTaskConfigs);
                  }
                }
                setShowRepeatTypeModal(false);
                setActivePreventiveTaskIndex(-1);
              }}
            />

            <ModalSelector
              visible={showFaultModal}
              onClose={() => {
                // Apply temp selection when modal closes
                setSelectedFaults(tempSelectedFaults);
                setShowFaultModal(false);
              }}
              title="Select Faults"
              data={faults}
              displayKey="Fault"
              searchKeys={['Fault', 'Description', 'FaultCategory']}
              multiSelect={true}
              selectedItems={tempSelectedFaults}
              onSelect={(value, item) => {
                // Toggle fault selection in temp state
                const itemId = item.Fault || '';
                const isSelected = tempSelectedFaults.some(f => 
                  f.Fault === itemId
                );
                
                let updated;
                if (isSelected) {
                  // Remove fault
                  updated = tempSelectedFaults.filter(f => 
                    f.Fault !== itemId
                  );
                  console.log('➖ Removing fault:', itemId);
                } else {
                  // Add fault - check if it exists in current selectedFaults to preserve edited description
                  const existingFault = selectedFaults.find(f => f.Fault === itemId);
                  updated = [...tempSelectedFaults, existingFault || item];
                  console.log('➕ Adding fault:', itemId);
                }
                console.log('📋 Updated faults count:', updated.length);
                setTempSelectedFaults(updated);
              }}
              renderItem={(item) => {
                const sevColor =
                  item.Severity === 'High' ? '#BB0000'
                  : item.Severity === 'Medium' ? '#E65100'
                  : item.Severity === 'Low' ? '#2B7D2B'
                  : '#888';
                return (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#000', flex: 1 }}>
                        {item.Fault || 'Unknown Fault'}
                      </Text>
                      {item.Severity ? (
                        <View style={{ backgroundColor: sevColor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>{item.Severity}</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.FaultCategory ? (
                      <Text style={{ fontSize: 11, color: '#0070F2', marginTop: 2, fontWeight: '600' }}>{item.FaultCategory}</Text>
                    ) : null}
                    {item.Description ? (
                      <Text style={{ fontSize: 12, color: '#666', marginTop: 3 }} numberOfLines={2}>
                        {item.Description}
                      </Text>
                    ) : null}
                    {item.Solutions?.length > 0 && item.Solutions[0]?.Name ? (
                      <Text style={{ fontSize: 11, color: '#2B7D2B', marginTop: 3 }}>
                        💡 {item.Solutions[0].Name}
                        {item.Time ? ` · ${item.Time}h` : ''}
                      </Text>
                    ) : null}
                  </View>
                );
              }}
            />

            {loading && <Loader />}
          </View>
        )}
      </Formik>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formContainer: {
    padding: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  column: {
    flex: 1,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  required: {
    color: COLORS.danger,
    marginRight: 2,
  },
  input: {
    fontSize: 14,
    backgroundColor: COLORS.white,
  },
  locationButton: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  locationButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textArea: {
    fontSize: 14,
    backgroundColor: COLORS.white,
    textAlignVertical: 'top',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    marginTop: 4,
  },
  descriptionSection: {
    marginBottom: SPACING.md,
  },
  textAreaGroup: {
    marginBottom: SPACING.md,
  },
  submitSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.md,
  },
  submitButtonContent: {
    minHeight: 44,
  },
  submitButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default CreateIncidentScreen;

