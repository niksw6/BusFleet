import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Chip } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import { complaintService, jobCardService, masterService, storeService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import ModalSelector from '../../../shared/components/ModalSelector';
import FaultMechanicPartsSection from '../components/FaultMechanicPartsSection';
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
  if (!normalized) return 'Driver Complaints';

  if (normalized === 'b' || normalized.includes('breakdown')) {
    return 'Breakdown';
  }

  if (normalized.includes('driver complaint') || normalized === 'd' || normalized === 'complaint') {
    return 'Driver Complaints';
  }

  if (normalized.includes('preventive')) {
    return 'Preventive Maintenance';
  }

  if (normalized.includes('mechanical')) {
    // Backend JC series is typically keyed for Driver Complaints/Breakdown.
    // Map mechanical labels to driver-complaint series to avoid unsupported JC series.
    return 'Driver Complaints';
  }

  // Default all other non-breakdown values to Driver Complaints for stable series mapping.
  return 'Driver Complaints';
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
  const [selectedTeam, setSelectedTeam] = useState(null); // { TeamCode, TeamName }
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

  const fetchAllData = async () => {
    try {
      setLoadingData(true);
      console.log('🔍 Fetching all data for CreateJobCard...');
      const [mechanicsResult, routesResult, sparePartsResult, teamsResult] = await Promise.allSettled([
        complaintService.getMechanics(dbName || 'MUTSPL_TEST'),
        complaintService.getRoutes(dbName || 'MUTSPL_TEST'),
        masterService.getSpareParts(dbName || 'MUTSPL_TEST'),
        masterService.getMaintenanceTeams(dbName || 'MUTSPL_TEST'),
      ]);

      const mechanicsRes = mechanicsResult.status === 'fulfilled' ? mechanicsResult.value : null;
      const routesRes = routesResult.status === 'fulfilled' ? routesResult.value : null;
      const sparePartsRes = sparePartsResult.status === 'fulfilled' ? sparePartsResult.value : null;
      const teamsRes = teamsResult.status === 'fulfilled' ? teamsResult.value : null;

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
        console.warn('⚠️ Maintenance teams fetch failed:', teamsResult.reason?.message || teamsResult.reason);
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
      const complaintTypeForApi = normalizeJobCardComplaintType(formValues.complaintType || complaintType);
      const normalizedOperations = (formValues.operations || []).map(operation => ({
        ...operation,
        U_RTime: formatToHHMM(operation?.U_RTime, formattedTimeHHMM),
      }));
      const jobTypeCode = getJobTypeCode(complaintTypeForApi);

      const createJobCardPayload = (payloadComplaintType) => ({
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
        FormType: jobTypeCode,
        JobType: jobTypeCode,
        CmplaintNo: complaintNo || '',
        ComplaintNo: complaintNo || '',
        Branch: '1',
        BranchNm: depot || '',
        Supervisr: user?.Code || user?.code || '',
        SprvsrNm: user?.FirstName || user?.name || '',
        // Maintenance Team mapping — routes the Job Card to the correct Team Leader for accept/reject (SOP §1.3, §2)
        TeamCode: selectedTeam?.TeamCode || '',
        TeamName: selectedTeam?.TeamName || '',
        TeamStatus: 'Pending',
        Operations: normalizedOperations,
        Parts: [],
        Mechanics: (function() {
          if (effectiveFaultEntries.length > 0) {
            // Derive unique mechanics from all per-fault assignments
            const all = effectiveFaultEntries.flatMap(({ assignmentKey }) => (faultAssignments[assignmentKey]?.mechanics || []));
            const unique = all.filter((m, i, arr) => arr.findIndex(x => (x.Code || x.FirstName) === (m.Code || m.FirstName)) === i);
            return unique.map(m => ({ Mechanic: m.FirstName || '' }));
          }
          return (formValues.assignedMechanics || []).map(m => ({ Mechanic: m.FirstName || '' }));
        }()),
        PartsReceived: [],
        Faults: effectiveFaultEntries.length > 0
          ? effectiveFaultEntries.map(({ fault: f, assignmentKey }) => {
              const faultData = faultAssignments[assignmentKey] || { mechanics: [], parts: [] };
              const mappedFaultName = String(f?.Fault || f?.FaultName || f?.FaultCode || f?.FaultDescription || '').trim();
              const mappedFaultDesc = String(f?.Description || f?.Dscption || f?.FaultDescription || f?.FaultDesc || '').trim();
              return {
                Fault: mappedFaultName,
                Dscption: mappedFaultDesc,
                // Per-fault mechanics assigned by supervisor
                Mechanics: faultData.mechanics.map(m => ({
                  MechanicCode: m.Code || '',
                  MechanicName: m.FirstName || m.Name || '',
                })),
                // Per-fault parts required
                Parts: faultData.parts.map(p => ({
                  ItemCode: p.ItemCode || p.Code || '',
                  ItemName: p.ItemName || p.Name || '',
                  Qty: parseFloat(p.Qty) || 1,
                  UoM: p.UoM || 'Nos',
                })),
              };
            })
          : [],
        ExtRmk: '',
        IntRmk: '',
      });

      const complaintTypeCandidates = [complaintTypeForApi];
      if (jobTypeCode === 'D') {
        ['Driver Complaints', 'Mechanical', 'Driver Complaint'].forEach((candidate) => {
          if (!complaintTypeCandidates.includes(candidate)) {
            complaintTypeCandidates.push(candidate);
          }
        });
      }

      let response;
      let lastCreateError;

      for (let attempt = 0; attempt < complaintTypeCandidates.length; attempt += 1) {
        const attemptComplaintType = complaintTypeCandidates[attempt];
        const attemptPayload = createJobCardPayload(attemptComplaintType);

        console.log('💼 Creating job card:', JSON.stringify(attemptPayload, null, 2));
        console.log('🔍 ComplaintType (API):', attemptComplaintType, '| Input:', formValues.complaintType || complaintType, '| Attempt:', attempt + 1);

        try {
          response = await jobCardService.createJobCard(attemptPayload);
          if (response?.Success) {
            break;
          }

          const responseMessage = String(response?.Message || '');
          if (isJobCardSeriesNotFoundError({ message: responseMessage })) {
            throw new Error(getSeriesErrorMessage(responseMessage));
          }

          if (!isJobCardSeriesNotFoundError({ message: responseMessage })) {
            break;
          }

          lastCreateError = new Error(responseMessage);
        } catch (createError) {
          lastCreateError = createError;
          if (isJobCardSeriesNotFoundError(createError)) {
            throw new Error(getSeriesErrorMessage(createError?.message));
          }

          if (attempt === complaintTypeCandidates.length - 1) {
            throw createError;
          }
          console.warn('⚠️ Retrying CreateJobCard with fallback ComplaintType due to backend series error.');
        }
      }

      if (!response?.Success && lastCreateError) {
        throw lastCreateError;
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
        const incidentFormType = complaintTypeForApi === 'Breakdown' ? 'B' : 'D';
        try {
          const statusSyncResponse = await complaintService.updateComplaintStatus(
            dbName || 'MUTSPL_TEST',
            Number(complaintNo) || complaintNo,
            'I',
            incidentFormType,
          );

          if (statusSyncResponse?.Success && statusSyncResponse?.Synced) {
            console.log('✅ Incident status updated to In Progress for complaint:', complaintNo);
          } else {
            console.log('ℹ️ Incident status sync skipped:', statusSyncResponse?.Message || 'UpdateComplaintStatus API not available');
          }
        } catch (statusError) {
          console.log('ℹ️ Incident status sync skipped:', statusError?.message || statusError);
        }

        // Best-effort: forward any parts the Supervisor already knows are needed
        // per fault to the Store module (RequestJobCardParts), keyed by FaultLine
        // (1-based, matching the order faults were sent in the Faults[] array above).
        if (createdJobCardDocEntry > 0) {
          const partsPayload = effectiveFaultEntries
            .map(({ assignmentKey, faultLine }) => ({ faultLine, parts: (faultAssignments[assignmentKey]?.parts || []) }))
            .filter(({ parts }) => parts.length > 0)
            .flatMap(({ faultLine, parts }) => parts.map(p => ({
              FaultLine: faultLine,
              ItemCode: p.ItemCode || p.Code || '',
              ItemName: p.ItemName || p.Name || '',
              ReqQty: parseFloat(p.Qty) || 1,
              AddQty: 0,
              Remarks: '',
            })));

          if (partsPayload.length > 0) {
            try {
              await storeService.requestJobCardParts({
                CompanyDB: dbName || 'MUTSPL_TEST',
                JobCardDocEntry: createdJobCardDocEntry,
                UserCode: user?.Code || user?.code || '',
                Parts: partsPayload,
              });
              console.log('✅ RequestJobCardParts sent for', partsPayload.length, 'part line(s)');
            } catch (partsError) {
              console.warn('⚠️ RequestJobCardParts failed (non-blocking):', partsError?.message || partsError);
            }
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: response.Message || 'Job card created successfully',
        });

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

              {/* Incident Type - Readonly */}
              <Text style={[styles.label, { color: colors.dark }]}>Incident Type *</Text>
              <TextInput
                label="Incident Type"
                mode="outlined"
                value={values.complaintType}
                style={styles.input}
                editable={false}
                disabled
                right={<TextInput.Icon icon="file-document" />}
              />

              {/* Driver - Readonly */}
              <Text style={[styles.label, { color: colors.dark }]}>Driver *</Text>
              <TextInput
                label="Driver Name"
                mode="outlined"
                value={values.driverName}
                style={styles.input}
                editable={false}
                disabled
                right={<TextInput.Icon icon="account" />}
              />

              {/* Odometer - Readonly */}
              <TextInput
                label="Odometer Reading *"
                mode="outlined"
                value={String(values.odometer)}
                style={styles.input}
                editable={false}
                disabled
                right={<TextInput.Icon icon="counter" />}
              />

              {/* Maintenance Team — routes Job Card to a Team Leader for accept/reject (SOP §1.3, §2) */}
              {maintenanceTeamsAvailable && maintenanceTeams.length > 0 && (
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

              {/* Route Number & Breakdown Place - Only for Breakdown */}
              {values.complaintType && values.complaintType.toLowerCase().includes('breakdown') && (
                <>
                  <Text style={[styles.label, { color: colors.dark }]}>Route Number *</Text>
                  <TouchableOpacity onPress={() => {}} activeOpacity={1}>
                    <View pointerEvents="none">
                      <TextInput
                        label="Select Route"
                        mode="outlined"
                        value={values.routeName}
                        error={errors.routeNo && touched.routeNo}
                        style={styles.input}
                        placeholder="Route number"
                        right={<TextInput.Icon icon="routes" />}
                        editable={false}
                        disabled
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.routeNo && touched.routeNo && (
                    <Text style={styles.errorText}>{errors.routeNo}</Text>
                  )}

                  {/* Breakdown Place */}
                  <TextInput
                    label="Breakdown Place *"
                    mode="outlined"
                    value={values.breakdownPlace}
                    onChangeText={() => {}}
                    onBlur={() => {}}
                    error={errors.breakdownPlace && touched.breakdownPlace}
                    style={styles.input}
                    placeholder="Breakdown location"
                    right={<TextInput.Icon icon="map-marker" />}
                    editable={false}
                    disabled
                  />
                  {errors.breakdownPlace && touched.breakdownPlace && (
                    <Text style={styles.errorText}>{errors.breakdownPlace}</Text>
                  )}
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
          // Apply temp selection to formik when modal closes
          if (formikRef.current) {
            formikRef.current.setFieldValue('assignedMechanics', tempSelectedMechanics);
          }
          setShowMechanicModal(false);
        }}
        onSelect={(value, item) => {
          // Toggle mechanic selection in temp state
          const isSelected = tempSelectedMechanics.some(m => m.FirstName === item.FirstName);
          
          let updated;
          if (isSelected) {
            // Remove mechanic
            updated = tempSelectedMechanics.filter(m => m.FirstName !== item.FirstName);
            console.log('➖ Removing mechanic:', item.FirstName);
          } else {
            // Add mechanic
            updated = [...tempSelectedMechanics, item];
            console.log('➕ Adding mechanic:', item.FirstName);
          }
          console.log('📋 Updated mechanics count:', updated.length);
          setTempSelectedMechanics(updated);
        }}
        title="Select Mechanics"
        data={mechanics}
        loading={loadingMechanics}
        searchPlaceholder="Search mechanics..."
        displayKey="FirstName"
        valueKey="FirstName"
        multiSelect={true}
        selectedItems={tempSelectedMechanics}
        searchKeys={['FirstName']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
              {item.FirstName || 'Unknown'}
            </Text>
            {item.Code && (
              <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                Code: {item.Code}
              </Text>
            )}
          </View>
        )}
      />

      {/* Route Selector Modal - Only for Breakdown */}
      <ModalSelector
        visible={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        onSelect={(value, item) => {
          console.log('✅ Route selected - item:', JSON.stringify(item, null, 2));
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
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
        title="Create Job Card"
        message={`Are you sure you want to create job card for incident #${complaintNo}?`}
      />

      {/* Maintenance Team Selector */}
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

