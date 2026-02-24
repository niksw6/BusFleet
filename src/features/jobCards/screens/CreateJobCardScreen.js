import React, { useState, useEffect, useRef } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { complaintService, jobCardService, masterService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import ModalSelector from '../../../shared/components/ModalSelector';
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
  assignedMechanics: Yup.array().min(1, 'At least one mechanic must be assigned'),
  instructions: Yup.string().notRequired(),
});

const CreateJobCardScreen = ({ route, navigation }) => {
  const { complaintNo, busNo, depot, faults, priority, complaintType, driverName, driverCode, odometer, routeNo, breakdownPlace, dbName } = route.params;
  
  console.log('🎫 Job Card Screen - Received Complaint Type:', complaintType);
  
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [showMechanicModal, setShowMechanicModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showPartsReceivedModal, setShowPartsReceivedModal] = useState(false);
  const [showOperationsModal, setShowOperationsModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedPartForQty, setSelectedPartForQty] = useState(null);
  const [selectedPartReceivedForQty, setSelectedPartReceivedForQty] = useState(null);
  const [loadingMechanics, setLoadingMechanics] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [tempSelectedMechanics, setTempSelectedMechanics] = useState([]);
  const formikRef = useRef(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoadingData(true);
      console.log('🔍 Fetching all data for CreateJobCard...');
      const [mechanicsRes, routesRes, sparePartsRes] = await Promise.all([
        complaintService.getMechanics(dbName || 'MUTSPL_TEST'),
        complaintService.getRoutes(dbName || 'MUTSPL_TEST'),
        masterService.getSpareParts(dbName || 'MUTSPL_TEST'),
      ]);

      console.log('📊 Mechanics response:', mechanicsRes);
      console.log('📊 Routes response:', routesRes);
      console.log('📊 Spare parts response:', sparePartsRes);

      if (mechanicsRes.Success) {
        console.log('✅ Setting mechanics:', mechanicsRes.Data?.length || 0, 'items');
        setMechanics(mechanicsRes.Data || []);
      }
      if (routesRes.Success) {
        console.log('✅ Setting routes:', routesRes.Data?.length || 0, 'items');
        if (routesRes.Data && routesRes.Data.length > 0) {
          console.log('🚌 First route structure:', JSON.stringify(routesRes.Data[0], null, 2));
        }
        setRoutes(routesRes.Data || []);
      }
      if (sparePartsRes.Success) {
        console.log('✅ Setting spare parts:', sparePartsRes.Data?.length || 0, 'items');
        setSpareParts(sparePartsRes.Data || []);
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
    complaintType: complaintType || 'Mechanical',
    driver: driverCode || '',
    driverName: driverName || '',
    odometer: odometer || '',
    routeNo: routeNo ? String(routeNo) : '',
    routeName: routeNo ? String(routeNo) : '',
    breakdownPlace: breakdownPlace || '',
    assignedMechanics: [],
    instructions: '',
    parts: [],
    partsReceived: [],
    operations: [],
  };

  const handleSubmit = (values) => {
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      // Format current date and time
      const now = new Date();
      const formattedDate = now.toISOString().split('T')[0];
      const formattedHours = now.getHours().toString().padStart(2, '0');
      const formattedMinutes = now.getMinutes().toString().padStart(2, '0');
      const formattedTime = `${formattedHours}:${formattedMinutes}`;
      const formattedDateTime = `${formattedDate}T${formattedHours}:${formattedMinutes}:00`;
      const jobTypeCode = getJobTypeCode(formValues.complaintType || complaintType);

      const jobCardData = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        ComplaintType: formValues.complaintType || 'Mechanical',
        BusNo: busNo || '',
        Depot: depot || '',
        Driver: formValues.driverName || '',
        Description: formValues.instructions || '',
        Priority: priority || 'Medium',
        Status: 'O',
        Odometer: String(formValues.odometer || '0'),
        RegDate: formattedDate,
        RegTime: formattedDateTime,
        ComplaintTime: formattedTime,
        RouteNo: parseInt(formValues.routeNo) || 0,
        BreakdownPlace: formValues.breakdownPlace || '',
        FormType: jobTypeCode,
        JobType: jobTypeCode,
        CmplaintNo: complaintNo || '',
        Branch: '1',
        BranchNm: depot || '',
        Supervisr: user?.Code || user?.code || '',
        SprvsrNm: user?.FirstName || user?.name || '',
        Operations: formValues.operations || [],
        Parts: formValues.parts || [],
        Mechanics: formValues.assignedMechanics && formValues.assignedMechanics.length > 0 
          ? formValues.assignedMechanics.map(m => ({
              Mechanic: m.FirstName || '',
            }))
          : [],
        PartsReceived: formValues.partsReceived || [],
        Faults: faults && faults.length > 0 
          ? faults.map(f => ({
              Fault: f.Fault || '',
              Dscption: f.Description || f.Dscption || f.FaultDescription || '',
            }))
          : [],
        ExtRmk: '',
        IntRmk: '',
      };

      console.log('💼 Creating job card:', JSON.stringify(jobCardData, null, 2));

      const response = await jobCardService.createJobCard(jobCardData);
      
      console.log('✅ Job card created:', response);
      
      if (response.Success) {
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: response.Message || 'Job card created successfully',
        });
        setLoading(false);
        navigation.goBack();
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

              {faults && faults.length > 0 && (
                <View style={styles.faultsContainer}>
                  <Text style={[styles.label, { color: colors.dark }]}>Reported Faults:</Text>
                  {faults.filter(f => f.Fault && f.Fault.trim() !== '').map((fault, index) => (
                    <View key={index} style={[styles.faultChip, { backgroundColor: colors.light }]}>
                      <View style={styles.faultContent}>
                        <View style={styles.faultHeader}>
                          <MaterialIcons name="warning" size={16} color="#FF9800" />
                          <Text style={[styles.faultText, { color: colors.dark, fontWeight: '600' }]}>{fault.Fault}</Text>
                        </View>
                        {(fault.Description || fault.Dscption || fault.FaultDescription) && (
                          <Text style={[styles.faultDescription, { color: colors.gray }]}>
                            {fault.Description || fault.Dscption || fault.FaultDescription}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

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

              <Text style={[styles.label, { color: colors.dark }]}>Assign Mechanics *</Text>
              <TouchableOpacity 
                onPress={() => {
                  // Initialize temp selected mechanics from formik values
                  setTempSelectedMechanics(values.assignedMechanics || []);
                  setShowMechanicModal(true);
                }} 
                activeOpacity={0.7}
              >
                <View pointerEvents="none">
                  <TextInput
                    label="Select Mechanics"
                    mode="outlined"
                    value={values.assignedMechanics.length > 0 
                      ? `${values.assignedMechanics.length} mechanic(s) assigned` 
                      : ''}
                    error={errors.assignedMechanics && touched.assignedMechanics}
                    style={styles.input}
                    placeholder="Tap to select mechanics"
                    editable={false}
                    autoComplete="off"
                    right={<TextInput.Icon icon="account-wrench" />}
                  />
                </View>
              </TouchableOpacity>
              {values.assignedMechanics.length > 0 && (
                <View style={styles.selectedMechanics}>
                  {values.assignedMechanics.map((mechanic, index) => (
                    <Chip
                      key={index}
                      mode="flat"
                      onClose={() => {
                        const updated = values.assignedMechanics.filter((_, i) => i !== index);
                        setFieldValue('assignedMechanics', updated);
                      }}
                      style={styles.mechanicChip}
                    >
                      {mechanic.FirstName}
                    </Chip>
                  ))}
                </View>
              )}
              {errors.assignedMechanics && touched.assignedMechanics && (
                <Text style={styles.errorText}>{errors.assignedMechanics}</Text>
              )}

              {/* Parts Selection */}
              <Text style={[styles.label, { color: colors.dark, marginTop: SPACING.md }]}>Parts</Text>
              <TouchableOpacity onPress={() => setShowPartsModal(true)} activeOpacity={0.7}>
                <View pointerEvents="none">
                  <TextInput
                    label="Select Parts"
                    mode="outlined"
                    value={values.parts.length > 0 ? `${values.parts.length} part(s) selected` : ''}
                    style={styles.input}
                    placeholder="Tap to select parts"
                    editable={false}
                    right={<TextInput.Icon icon="package-variant" />}
                  />
                </View>
              </TouchableOpacity>
              {values.parts.length > 0 && (
                <View style={styles.selectedParts}>
                  {values.parts.map((part, index) => (
                    <View key={index} style={[styles.partCard, { backgroundColor: colors.light, borderColor: colors.gray }]}>
                      <View style={styles.partHeader}>
                        <Text style={[styles.partName, { color: colors.dark }]}>{part.ItemName}</Text>
                        <TouchableOpacity onPress={() => {
                          const updated = values.parts.filter((_, i) => i !== index);
                          setFieldValue('parts', updated);
                        }}>
                          <MaterialIcons name="close" size={20} color={colors.gray} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.partCode, { color: colors.gray }]}>Code: {part.ItemCode}</Text>
                      <View style={styles.qtyInputsRow}>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Req Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.ReqQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.parts];
                              updated[index] = { ...updated[index], ReqQty: parseInt(text) || 0 };
                              setFieldValue('parts', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Add Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.AddQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.parts];
                              updated[index] = { ...updated[index], AddQty: parseInt(text) || 0 };
                              setFieldValue('parts', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Iss Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.IssQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.parts];
                              updated[index] = { ...updated[index], IssQty: parseInt(text) || 0 };
                              setFieldValue('parts', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                      </View>
                      <TextInput
                        label="Warehouse"
                        mode="outlined"
                        value={part.Whs || ''}
                        onChangeText={(text) => {
                          const updated = [...values.parts];
                          updated[index] = { ...updated[index], Whs: text };
                          setFieldValue('parts', updated);
                        }}
                        dense
                        style={[styles.input, { marginTop: 8 }]}
                        placeholder="Enter warehouse code"
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Parts Received Selection */}
              <Text style={[styles.label, { color: colors.dark, marginTop: SPACING.md }]}>Parts Received</Text>
              <TouchableOpacity onPress={() => setShowPartsReceivedModal(true)} activeOpacity={0.7}>
                <View pointerEvents="none">
                  <TextInput
                    label="Select Parts Received"
                    mode="outlined"
                    value={values.partsReceived.length > 0 ? `${values.partsReceived.length} part(s) received` : ''}
                    style={styles.input}
                    placeholder="Tap to select parts received"
                    editable={false}
                    right={<TextInput.Icon icon="package-variant-closed" />}
                  />
                </View>
              </TouchableOpacity>
              {values.partsReceived.length > 0 && (
                <View style={styles.selectedParts}>
                  {values.partsReceived.map((part, index) => (
                    <View key={index} style={[styles.partCard, { backgroundColor: colors.light, borderColor: colors.gray }]}>
                      <View style={styles.partHeader}>
                        <Text style={[styles.partName, { color: colors.dark }]}>{part.ItemName}</Text>
                        <TouchableOpacity onPress={() => {
                          const updated = values.partsReceived.filter((_, i) => i !== index);
                          setFieldValue('partsReceived', updated);
                        }}>
                          <MaterialIcons name="close" size={20} color={colors.gray} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.partCode, { color: colors.gray }]}>Code: {part.ItemCode}</Text>
                      <View style={styles.qtyInputsRow}>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Req Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.ReqQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.partsReceived];
                              updated[index] = { ...updated[index], ReqQty: parseInt(text) || 0 };
                              setFieldValue('partsReceived', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Add Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.AddQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.partsReceived];
                              updated[index] = { ...updated[index], AddQty: parseInt(text) || 0 };
                              setFieldValue('partsReceived', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                        <View style={styles.qtyInput}>
                          <Text style={[styles.qtyLabel, { color: colors.gray }]}>Rcvd Qty</Text>
                          <TextInput
                            mode="outlined"
                            value={String(part.RcvdQty || '')}
                            onChangeText={(text) => {
                              const updated = [...values.partsReceived];
                              updated[index] = { ...updated[index], RcvdQty: parseInt(text) || 0 };
                              setFieldValue('partsReceived', updated);
                            }}
                            keyboardType="numeric"
                            dense
                            style={styles.qtyField}
                          />
                        </View>
                      </View>
                      <TextInput
                        label="Warehouse"
                        mode="outlined"
                        value={part.Whs || ''}
                        onChangeText={(text) => {
                          const updated = [...values.partsReceived];
                          updated[index] = { ...updated[index], Whs: text };
                          setFieldValue('partsReceived', updated);
                        }}
                        dense
                        style={[styles.input, { marginTop: 8 }]}
                        placeholder="Enter warehouse code"
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Operations (Placeholder - API not ready) */}
              <Text style={[styles.label, { color: colors.dark, marginTop: SPACING.md }]}>Operations</Text>
              <View pointerEvents="none">
                <TextInput
                  label="Operations"
                  mode="outlined"
                  value={values.operations.length > 0 ? `${values.operations.length} operation(s) added` : 'Coming soon'}
                  style={styles.input}
                  placeholder="Operations management will be available soon"
                  editable={false}
                  disabled
                  right={<TextInput.Icon icon="tools" />}
                />
              </View>

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

      {/* Parts Selector Modal */}
      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => {
          if (formikRef.current) {
            const currentParts = formikRef.current.values.parts || [];
            // Check if part already selected
            const exists = currentParts.some(p => p.ItemCode === item.ItemCode);
            if (!exists) {
              const newPart = {
                ItemCode: item.ItemCode,
                ItemName: item.ItemName,
                ReqQty: 0,
                AddQty: 0,
                IssQty: 0,
                Whs: '',
              };
              formikRef.current.setFieldValue('parts', [...currentParts, newPart]);
            }
          }
          setShowPartsModal(false);
        }}
        title="Select Spare Parts"
        data={spareParts}
        loading={loadingData}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
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

      {/* Parts Received Selector Modal */}
      <ModalSelector
        visible={showPartsReceivedModal}
        onClose={() => setShowPartsReceivedModal(false)}
        onSelect={(value, item) => {
          if (formikRef.current) {
            const currentPartsReceived = formikRef.current.values.partsReceived || [];
            // Check if part already selected
            const exists = currentPartsReceived.some(p => p.ItemCode === item.ItemCode);
            if (!exists) {
              const newPart = {
                ItemCode: item.ItemCode,
                ItemName: item.ItemName,
                ReqQty: 0,
                AddQty: 0,
                RcvdQty: 0,
                Whs: '',
              };
              formikRef.current.setFieldValue('partsReceived', [...currentPartsReceived, newPart]);
            }
          }
          setShowPartsReceivedModal(false);
        }}
        title="Select Parts Received"
        data={spareParts}
        loading={loadingData}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
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

      <ConfirmationModal
        visible={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
        title="Create Job Card"
        message={`Are you sure you want to create job card for incident #${complaintNo}?`}
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
  selectedParts: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  partCard: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  partHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  partName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  partCode: {
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  qtyInputsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  qtyInput: {
    flex: 1,
  },
  qtyLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  qtyField: {
    backgroundColor: 'transparent',
    fontSize: 14,
  },
  submitButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
});

export default CreateJobCardScreen;
