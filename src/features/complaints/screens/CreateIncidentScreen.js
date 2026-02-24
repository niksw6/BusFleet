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
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { complaintService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatTime } from '../../../utils/helpers';

/**
 * Simplified Incident Creation Screen - Matches API Fields Exactly
 * Only includes fields that are in the CreateDriverComplaint API
 */

const validationSchema = Yup.object().shape({
  vehicleNumber: Yup.string().required('Vehicle number is required'),
  incidentType: Yup.string().required('Incident type is required'),
  incidentDate: Yup.date().required('Date is required'),
  incidentTime: Yup.string().required('Time is required'),
  odometer: Yup.string().required('Odometer reading is required'),
  priority: Yup.string().required('Priority is required'),
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
});

const CreateIncidentScreen = ({ route, navigation }) => {
  const incidentTypeParam = route.params?.type || 'complaint';
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

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

  const priorityLevels = [
    { Code: 'Low', Name: 'Low' },
    { Code: 'Medium', Name: 'Medium' },
    { Code: 'High', Name: 'High' },
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
        complaintService.getFaultDetails(dbName || 'MUTSPL_TEST'),
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
        setIncidentTypes(jobTypesResponse.Data || []);
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
        setFaults(faultsResponse.Data || []);
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

      // Format date as YYYY-MM-DD (as per CreateIncidents payload contract)
      const dateObj = new Date(values.incidentDate);
      const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      // Get selected vehicle details for Depot
      const selectedBus = buses.find(b => b.BusCode === values.vehicleNumber);

      // Prepare fault data from selected faults with their descriptions
      const faultsData = selectedFaults.length > 0 
        ? selectedFaults.map(fault => ({
            Fault: fault.Fault || 'General Issue',
            Dscption: fault.Description || '',
          }))
        : [{
            Fault: values.incidentType || 'General Issue',
            Dscption: '',
          }];

      // Check if it's a breakdown incident
      const isBreakdown = values.incidentType?.toLowerCase().includes('breakdown');

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
        ComplaintType: values.incidentType,
        Supervisr: user?.UserCode || user?.Code || 'SUP001',
        SprvsrNm: user?.Name || user?.name || 'Supervisor',
        Depot: selectedBus?.AssignedDepot || selectedBus?.Depot || 'Central Depot',
        BusNo: values.vehicleNumber,
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

      console.log('📤 Sending incident data:', JSON.stringify(incidentData, null, 2));
      console.log('🔍 Incident Type:', isBreakdown ? 'Breakdown' : 'Driver Complaint');
      console.log('🔍 Date format:', formattedDate);
      console.log('🔍 Time format:', formattedTime);
      console.log('🔍 Odometer values - Original:', values.odometer, 'Parsed:', odometerFinal);

      const response = await complaintService.createIncident(incidentData);

      if (response.Success) {
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

  const initialValues = {
    vehicleNumber: '',
    incidentType: '',
    driverCode: '',
    driverName: '',
    odometer: '',
    incidentDate: new Date(),
    incidentTime: formatTime(new Date()),
    priority: 'Medium',
    reportedBy: user?.Name || user?.name || '',
    location: '',
    routeNo: '',
    routeName: '',
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
                        outlineColor="#D0D0D0"
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
                  <TouchableOpacity onPress={() => setShowIncidentTypeModal(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={values.incidentType}
                        error={errors.incidentType && touched.incidentType}
                        style={styles.input}
                        placeholder="Select incident type"
                        right={<TextInput.Icon icon="chevron-down" />}
                        outlineColor="#D0D0D0"
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
                          outlineColor="#D0D0D0"
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
                      outlineColor="#D0D0D0"
                    />
                    {errors.location && touched.location && (
                      <Text style={styles.errorText}>{errors.location}</Text>
                    )}
                  </View>
                )}

                {/* Driver */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>Driver (Optional):</Text>
                  <TouchableOpacity onPress={() => setShowDriverModal(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={values.driverName}
                        style={styles.input}
                        placeholder="Select driver"
                        right={<TextInput.Icon icon="magnify" />}
                        outlineColor="#D0D0D0"
                      />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Odometer */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>Odometer Reading:
                  </Text>
                  <TextInput
                    mode="outlined"
                    value={values.odometer}
                    onChangeText={handleChange('odometer')}
                    onBlur={handleBlur('odometer')}
                    error={errors.odometer && touched.odometer}
                    style={styles.input}
                    placeholder="Enter odometer reading"
                    keyboardType="numeric"
                    outlineColor="#D0D0D0"
                  />
                  {errors.odometer && touched.odometer && (
                    <Text style={styles.errorText}>{errors.odometer}</Text>
                  )}
                </View>

                {/* Date */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    <Text style={styles.required}>* </Text>Incident Date:
                  </Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        mode="outlined"
                        value={formatDate(values.incidentDate)}
                        error={errors.incidentDate && touched.incidentDate}
                        style={styles.input}
                        right={<TextInput.Icon icon="calendar" />}
                        outlineColor="#D0D0D0"
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.incidentDate && touched.incidentDate && (
                    <Text style={styles.errorText}>{errors.incidentDate}</Text>
                  )}
                </View>

                {/* Time */}
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
                        outlineColor="#D0D0D0"
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.incidentTime && touched.incidentTime && (
                    <Text style={styles.errorText}>{errors.incidentTime}</Text>
                  )}
                </View>

                {/* Priority */}
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
                        outlineColor="#D0D0D0"
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.priority && touched.priority && (
                    <Text style={styles.errorText}>{errors.priority}</Text>
                  )}
                </View>

                {/* Faults (Multi-select) */}
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
                        outlineColor="#D0D0D0"
                      />
                    </View>
                  </TouchableOpacity>
                  {selectedFaults.length > 0 && (
                    <View style={{ marginTop: 8, gap: 12 }}>
                      {selectedFaults.map((fault, index) => (
                        <View key={index} style={{ 
                          backgroundColor: '#F5F5F5',
                          padding: 12,
                          borderRadius: 8,
                          borderLeftWidth: 3,
                          borderLeftColor: '#1976D2'
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: 14, color: '#1976D2', fontWeight: '600', flex: 1 }}>
                              {fault.Fault}
                            </Text>
                            <TouchableOpacity onPress={() => {
                              setSelectedFaults(selectedFaults.filter((_, i) => i !== index));
                            }}>
                              <MaterialIcons name="close" size={20} color="#1976D2" />
                            </TouchableOpacity>
                          </View>
                          <TextInput
                            mode="outlined"
                            value={fault.Description || ''}
                            onChangeText={(text) => {
                              const updated = [...selectedFaults];
                              updated[index] = { ...updated[index], Description: text };
                              setSelectedFaults(updated);
                            }}
                            placeholder={
                              fault.Fault?.toLowerCase().includes('other') 
                                ? "Enter description for this fault..." 
                                : "Description is auto-filled"
                            }
                            multiline
                            numberOfLines={3}
                            style={{ 
                              backgroundColor: fault.Fault?.toLowerCase().includes('other') ? '#FFFFFF' : '#F0F0F0',
                              fontSize: 13 
                            }}
                            outlineColor="#D0D0D0"
                            disabled={!fault.Fault?.toLowerCase().includes('other')}
                            editable={fault.Fault?.toLowerCase().includes('other')}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Submit Button */}
                <View style={styles.submitSection}>
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={loading}
                    style={[styles.submitButton, { backgroundColor: '#8BC34A' }]}
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
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
                    {item.BusRegistrationNo || item.BusCode}
                  </Text>
                  {item.AssignedDepot && (
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                      Depot: {item.AssignedDepot}
                    </Text>                  )}
                  {item.BusCode && (
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
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
                console.log('✅ Complaint type selected:', item.CodeName || item.JobType);
                setFieldValue('incidentType', item.CodeName || item.JobType);
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
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
                    {item.DrvName || item.FirstName || 'Unknown'}
                  </Text>
                  {(item.DrvCode || item.Code) && (
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
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
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
                    Route No: {item.RouteNo || 'Unknown Route'}
                  </Text>
                  {item.RouteName && (
                    <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>
                      {item.RouteName}
                    </Text>
                  )}
                </View>
              )}
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
              searchKeys={['Fault', 'Description']}
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
              renderItem={(item) => (
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>
                    {item.Fault || 'Unknown Fault'}
                  </Text>
                  {item.Description && (
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                      {item.Description}
                    </Text>
                  )}
                </View>
              )}
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
    color: '#FF0000',
    marginRight: 2,
  },
  input: {
    fontSize: 14,
    backgroundColor: '#fff',
  },
  textArea: {
    fontSize: 14,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#FF0000',
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
    paddingVertical: 8,
  },
  submitButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CreateIncidentScreen;
