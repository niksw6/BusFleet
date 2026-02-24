import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Divider } from 'react-native-paper';
import { Formik } from 'formik';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { driverComplaintValidationSchema } from '../../../utils/validations';
import { complaintService, masterService } from '../../../api/services';
import { addComplaint } from '../../../store/slices/dataSlice';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatTime } from '../../../utils/helpers';
import { PRIORITY_LEVELS } from '../../../constants/config';

const CreateComplaintScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  
  // Modal selector states
  const [buses, setBuses] = useState([]);
  const [jobTypes, setJobTypes] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [faultDetails, setFaultDetails] = useState([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showJobTypeModal, setShowJobTypeModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [selectedFaultIndex, setSelectedFaultIndex] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  
  // Ref to store Formik's setFieldValue
  const formikRef = useRef(null);

  // Fetch buses and job types on mount
  useEffect(() => {
    console.log('🔷 CreateComplaint useEffect started, dbName:', dbName);
    const fetchData = async () => {
      try {
        setLoadingData(true);
        console.log('🔷 Fetching data from 6 APIs...');
        const [busesResponse, jobTypesResponse, supervisorsResponse, driversResponse, faultDetailsResponse] = await Promise.all([
          complaintService.getActiveBuses(dbName || 'MUTSPL_TEST'),
          complaintService.getJobTypes(dbName || 'MUTSPL_TEST'),
          complaintService.getSupervisors(dbName || 'MUTSPL_TEST'),
          complaintService.getDrivers(dbName || 'MUTSPL_TEST'),
          complaintService.getFaultDetails(dbName || 'MUTSPL_TEST'),
        ]);
        
        console.log('🔷 API Responses received:');
        console.log('  - Buses:', busesResponse);
        console.log('  - JobTypes:', jobTypesResponse);
        console.log('  - Supervisors:', supervisorsResponse);
        console.log('  - Drivers:', driversResponse);
        
        if (busesResponse.Success) {
          setBuses(busesResponse.Data || []);
          console.log('✅ Buses set, count:', (busesResponse.Data || []).length);
        } else {
          console.log('❌ Buses response not successful');
        }
        
        if (jobTypesResponse.Success) {
          setJobTypes(jobTypesResponse.Data || []);
          console.log('✅ JobTypes set, count:', (jobTypesResponse.Data || []).length);
        } else {
          console.log('❌ JobTypes response not successful');
        }
        
        if (supervisorsResponse.Success) {
          setSupervisors(supervisorsResponse.Data || []);
          console.log('✅ Supervisors set, count:', (supervisorsResponse.Data || []).length);
        } else {
          console.log('❌ Supervisors response not successful');
        }
        
        if (driversResponse.Success) {
          setDrivers(driversResponse.Data || []);
          console.log('✅ Drivers set, count:', (driversResponse.Data || []).length);
        } else {
          console.log('❌ Drivers response not successful');
        }
        
        if (faultDetailsResponse.Success) {
          setFaultDetails(faultDetailsResponse.Data || []);
          console.log('✅ FaultDetails set, count:', (faultDetailsResponse.Data || []).length);
        } else {
          console.log('❌ FaultDetails response not successful');
        }
      } catch (error) {
        console.error('❌ Error fetching data:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to load form data',
        });
      } finally {
        setLoadingData(false);
        console.log('🔷 Loading complete, loadingData set to false');
      }
    };
    
    fetchData();
  }, [dbName]);

  const initialValues = {
    vehicleNumber: '',
    busRegistrationNo: '',
    driverName: '',
    driverCode: '',
    complaintDate: new Date(),
    complaintTime: formatTime(new Date()),
    odometer: '',
    jobType: '',
    depot: 'Central Depot',
    supervisorCode: 'SUP001',
    supervisorName: user?.name || user?.Name || user?.FirstName || 'Manager',
    priority: 'Medium',
    description: '',
    faults: [{ faultType: '', faultDescription: '' }],
  };

  const handleSubmit = (values) => {
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      // Format date to YYYY-MM-DDTHH:mm:ss as required by API
      const dateObj = new Date(formValues.complaintDate);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}T00:00:00`;
      
      // Format time to HHMM (24-hour format without colon)
      const timeStr = formValues.complaintTime; // Already in HH:mm format
      const formattedTime = timeStr.replace(':', ''); // Convert "19:21" to "1921"

      // Format data according to actual API requirements
      const complaintData = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        ComplaintType: formValues.jobType, // Changed from JobType to ComplaintType
        Supervisr: formValues.supervisorCode,
        SprvsrNm: formValues.supervisorName,
        Depot: formValues.depot,
        BusNo: formValues.vehicleNumber, // Changed from RegNo to BusNo, use BusCode
        DrvCode: formValues.driverCode,
        DrvName: formValues.driverName,
        Odometr: String(formValues.odometer), // Convert to string as per API requirement
        RegDate: formattedDate, // Full datetime format
        RegTime: formattedTime, // HHMM format
        Dscrpton: formValues.description,
        Status: 'O', // Open
        Priority: formValues.priority,
        Faults: formValues.faults
          .filter(fault => fault.faultType && fault.faultType.trim() !== '') // Filter out empty faults
          .map(fault => ({
            Fault: fault.faultType,
            Dscption: fault.faultDescription || '',
          })),
      };

      // Validate we have at least one fault
      if (complaintData.Faults.length === 0) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'At least one fault is required',
        });
        setLoading(false);
        return;
      }

      console.log('Sending complaint data:', JSON.stringify(complaintData, null, 2));
      console.log('Faults array:', JSON.stringify(complaintData.Faults, null, 2));
      
      // Generate curl command for testing
      const curlCommand = `curl -X POST "http://88.99.68.90:85/BMSSystem/CreateDriverComplaint" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -H "DBName: ${complaintData.CompanyDB}" \\
  -d '${JSON.stringify(complaintData, null, 2)}'`;
      
      console.log('🔧 CURL Command for Postman/Testing:');
      console.log(curlCommand);

      const response = await complaintService.createComplaint(complaintData);

      console.log('Complaint response:', JSON.stringify(response, null, 2));

      // Handle different API response formats
      if (response && (response.Success === true || response.success === true)) {
        dispatch(addComplaint(response.Data || response.data || complaintData));
        
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: response.Message || response.message || 'Complaint submitted successfully',
        });

        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response?.Message || response?.message || 'Failed to submit complaint',
        });
      }
    } catch (error) {
      console.error('Complaint error:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Something went wrong',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.light }]}
    >
      {loadingData ? (
        <Loader visible={true} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Formik
          initialValues={initialValues}
          validationSchema={driverComplaintValidationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => {
            // Store setFieldValue in ref for modal access
            formikRef.current = { setFieldValue };
            
            return (
            <View>
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Vehicle Information
                </Text>
                
                <TouchableOpacity 
                  onPress={() => {
                    console.log('🔵 Vehicle selector pressed, current buses count:', buses.length);
                    console.log('🔵 Buses array:', buses);
                    setShowVehicleModal(true);
                    console.log('🔵 showVehicleModal set to true');
                  }} 
                  activeOpacity={0.7}
                >
                  <View pointerEvents="none">
                    <TextInput
                      label="Bus Number *"
                      mode="outlined"
                      value={values.vehicleNumber}
                      error={errors.vehicleNumber && touched.vehicleNumber}
                      style={styles.input}
                      placeholder="Select bus"
                      editable={false}
                      autoComplete="off"
                      right={<TextInput.Icon icon="car" />}
                    />
                  </View>
                </TouchableOpacity>
                {errors.vehicleNumber && touched.vehicleNumber && (
                  <Text style={styles.errorText}>{errors.vehicleNumber}</Text>
                )}

                <TextInput
                  label="Depot *"
                  mode="outlined"
                  value={values.depot}
                  onChangeText={handleChange('depot')}
                  onBlur={handleBlur('depot')}
                  error={errors.depot && touched.depot}
                  style={styles.input}
                  editable={false}
                  autoComplete="off"
                />
                {errors.depot && touched.depot && (
                  <Text style={styles.errorText}>{errors.depot}</Text>
                )}

                <Text style={[styles.label, { color: colors.dark }]}>Driver *</Text>
                <TouchableOpacity 
                  onPress={() => {
                    console.log('🔵 Driver selector pressed, current drivers count:', drivers.length);
                    setShowDriverModal(true);
                    console.log('🔵 showDriverModal set to true');
                  }} 
                  activeOpacity={0.7}
                >
                  <View pointerEvents="none">
                    <TextInput
                      label="Select Driver"
                      mode="outlined"
                      value={values.driverName ? `${values.driverCode} - ${values.driverName}` : ''}
                      error={(errors.driverCode && touched.driverCode) || (errors.driverName && touched.driverName)}
                      style={styles.input}
                      placeholder="Select driver"
                      editable={false}
                      autoComplete="off"
                      right={<TextInput.Icon icon="account" />}
                    />
                  </View>
                </TouchableOpacity>
                {((errors.driverCode && touched.driverCode) || (errors.driverName && touched.driverName)) && (
                  <Text style={styles.errorText}>{errors.driverCode || errors.driverName}</Text>
                )}

                <TextInput
                  label="Odometer Reading *"
                  mode="outlined"
                  value={values.odometer}
                  onChangeText={handleChange('odometer')}
                  onBlur={handleBlur('odometer')}
                  keyboardType="numeric"
                  error={errors.odometer && touched.odometer}
                  style={styles.input}
                />
                {errors.odometer && touched.odometer && (
                  <Text style={styles.errorText}>{errors.odometer}</Text>
                )}

                <View style={styles.priorityContainer}>
                  <Text style={[styles.label, { color: colors.dark }]}>Complaint Type *</Text>
                  <TouchableOpacity 
                    onPress={() => {
                      console.log('🔵 Complaint Type selector pressed, current types count:', jobTypes.length);
                      setShowJobTypeModal(true);
                      console.log('🔵 showJobTypeModal set to true');
                    }} 
                    activeOpacity={0.7}
                  >
                    <View pointerEvents="none">
                      <TextInput
                        label="Select Complaint Type"
                        mode="outlined"
                        value={values.jobType}
                        style={styles.input}
                        editable={false}
                        autoComplete="off"
                        right={<TextInput.Icon icon="briefcase" />}
                      />
                    </View>
                  </TouchableOpacity>
                  {errors.jobType && touched.jobType && (
                    <Text style={styles.errorText}>{errors.jobType}</Text>
                  )}
                </View>

                <Text style={[styles.label, { color: colors.dark }]}>Supervisor *</Text>
                <TextInput
                  label="Supervisor"
                  mode="outlined"
                  value={values.supervisorName ? `${values.supervisorCode} - ${values.supervisorName}` : ''}
                  style={styles.input}
                  editable={false}
                  disabled
                  right={<TextInput.Icon icon="account-supervisor" />}
                />
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Complaint Details
                </Text>

                <TextInput
                  label="Complaint Date *"
                  mode="outlined"
                  value={formatDate(values.complaintDate)}
                  onFocus={() => setShowDatePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="calendar" />}
                />

                <TextInput
                  label="Complaint Time *"
                  mode="outlined"
                  value={values.complaintTime}
                  onFocus={() => setShowTimePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="clock" />}
                />

                <View style={styles.priorityContainer}>
                  <Text style={[styles.label, { color: colors.dark }]}>Priority *</Text>
                  <View style={styles.priorityButtons}>
                    {Object.values(PRIORITY_LEVELS).map((priority) => (
                      <Button
                        key={priority}
                        mode={values.priority === priority ? 'contained' : 'outlined'}
                        onPress={() => setFieldValue('priority', priority)}
                        style={styles.priorityButton}
                        compact
                      >
                        {priority}
                      </Button>
                    ))}
                  </View>
                </View>

                <TextInput
                  label="Description *"
                  mode="outlined"
                  value={values.description}
                  onChangeText={handleChange('description')}
                  onBlur={handleBlur('description')}
                  multiline
                  numberOfLines={4}
                  error={errors.description && touched.description}
                  style={styles.input}
                />
                {errors.description && touched.description && (
                  <Text style={styles.errorText}>{errors.description}</Text>
                )}
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <View style={styles.faultsHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                    Faults
                  </Text>
                  <Button
                    mode="contained"
                    onPress={() => {
                      setFieldValue('faults', [
                        ...values.faults,
                        { faultType: '', faultDescription: '' },
                      ]);
                    }}
                    icon="plus"
                    compact
                  >
                    Add Fault
                  </Button>
                </View>

                {values.faults.map((fault, index) => (
                  <View key={index} style={styles.faultItem}>
                    <View style={styles.faultHeader}>
                      <Text style={[styles.faultLabel, { color: colors.dark }]}>
                        Fault {index + 1}
                      </Text>
                      {values.faults.length > 1 && (
                        <Button
                          mode="text"
                          onPress={() => {
                            const newFaults = values.faults.filter((_, i) => i !== index);
                            setFieldValue('faults', newFaults);
                          }}
                          textColor={colors.danger}
                          compact
                        >
                          Remove
                        </Button>
                      )}
                    </View>

                    <TouchableOpacity onPress={() => setSelectedFaultIndex(index)} activeOpacity={0.7}>
                      <View pointerEvents="none">
                        <TextInput
                          label="Select Fault Type *"
                          mode="outlined"
                          value={fault.faultType}
                          style={styles.input}
                          placeholder="Select fault"
                          editable={false}
                          autoComplete="off"
                          right={<TextInput.Icon icon="alert-circle" />}
                        />
                      </View>
                    </TouchableOpacity>

                    <TextInput
                      label="Fault Description *"
                      mode="outlined"
                      value={fault.faultDescription}
                      onChangeText={handleChange(`faults[${index}].faultDescription`)}
                      multiline
                      numberOfLines={3}
                      style={styles.input}
                      editable={false}
                    />

                    {index < values.faults.length - 1 && (
                      <Divider style={styles.divider} />
                    )}
                  </View>
                ))}
              </View>

              <View style={styles.submitContainer}>
                <Button
                  mode="outlined"
                  onPress={() => navigation.goBack()}
                  style={styles.button}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  style={[styles.button, { backgroundColor: colors.primary }]}
                >
                  Submit
                </Button>
              </View>
            </View>
            );
          }}
        </Formik>
      </ScrollView>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date && formikRef.current?.setFieldValue) {
              setSelectedDate(date);
              formikRef.current.setFieldValue('complaintDate', date);
            }
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="default"
          onChange={(event, time) => {
            setShowTimePicker(false);
            if (time && formikRef.current?.setFieldValue) {
              setSelectedTime(time);
              formikRef.current.setFieldValue('complaintTime', formatTime(time));
            }
          }}
        />
      )}

      <ConfirmationModal
        visible={showConfirmation}
        title="Confirm Submission"
        message="Are you sure you want to submit this complaint?"
        confirmText="Submit"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />

      <ModalSelector
        visible={showVehicleModal}
        onClose={() => setShowVehicleModal(false)}
        onSelect={(value, item) => {
          console.log('🟢 Vehicle selected:', item);
          console.log('🟢 formikRef.current exists:', !!formikRef.current);
          setShowVehicleModal(false);
          if (formikRef.current?.setFieldValue) {
            console.log('🟢 Setting vehicleNumber to:', item.BusCode);
            console.log('🟢 BusRegistrationNo:', item.BusRegistrationNo);
            console.log('🟢 Setting depot to:', item.AssignedDepot);
            
            // Store both BusCode and registration number
            formikRef.current.setFieldValue('vehicleNumber', item.BusCode);
            // Use registration number if available, otherwise warn user
            if (item.BusRegistrationNo && item.BusRegistrationNo.trim() !== '') {
              formikRef.current.setFieldValue('busRegistrationNo', item.BusRegistrationNo);
            } else {
              // No registration number available, use BusCode but show warning
              formikRef.current.setFieldValue('busRegistrationNo', item.BusCode);
              Toast.show({
                type: 'info',
                text1: 'Note',
                text2: 'This bus has no registration number on file',
                position: 'bottom',
              });
            }
            formikRef.current.setFieldValue('depot', item.AssignedDepot);
          } else {
            console.log('❌ formikRef.current.setFieldValue not available');
          }
        }}
        title="Select Vehicle"
        data={buses}
        loading={loadingData}
        searchPlaceholder="Search by bus code, registration no or depot..."
        searchKeys={['BusCode', 'BusRegistrationNo', 'AssignedDepot']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{item.BusCode}</Text>
            {item.BusRegistrationNo && (
              <Text style={{ fontSize: 14, color: '#333', marginTop: 2 }}>
                Reg: {item.BusRegistrationNo}
              </Text>
            )}
            <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>
              Depot: {item.AssignedDepot}
            </Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showJobTypeModal}
        onClose={() => setShowJobTypeModal(false)}
        onSelect={(value, item) => {
          if (formikRef.current?.setFieldValue) {
            formikRef.current.setFieldValue('jobType', item.CodeName);
          }
          setShowJobTypeModal(false);
        }}
        title="Select Complaint Type"
        data={jobTypes}
        loading={loadingData}
        searchPlaceholder="Search complaint types..."
        displayKey="CodeName"
        valueKey="CodeName"
      />

      <ModalSelector
        visible={showSupervisorModal}
        onClose={() => setShowSupervisorModal(false)}
        onSelect={(value, item) => {
          if (formikRef.current?.setFieldValue) {
            formikRef.current.setFieldValue('supervisorCode', item.Code);
            formikRef.current.setFieldValue('supervisorName', item.FirstName);
          }
          setShowSupervisorModal(false);
        }}
        title="Select Supervisor"
        data={supervisors}
        loading={loadingData}
        searchPlaceholder="Search by code or name..."
        searchKeys={['Code', 'FirstName']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{item.FirstName}</Text>
            <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>Code: {item.Code}</Text>
          </View>
        )}
      />

      <ModalSelector
        visible={showDriverModal}
        onClose={() => setShowDriverModal(false)}
        onSelect={(value, item) => {
          if (formikRef.current?.setFieldValue) {
            formikRef.current.setFieldValue('driverCode', item.Code);
            formikRef.current.setFieldValue('driverName', item.FirstName);
          setShowDriverModal(false);
          }
        }}
        title="Select Driver"
        data={drivers}
        loading={loadingData}
        searchPlaceholder="Search by code or name..."
        searchKeys={['Code', 'FirstName']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{item.FirstName}</Text>
            <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>Code: {item.Code}</Text>
          </View>
        )}
      />

      <ModalSelector
        visible={selectedFaultIndex !== null}
        onClose={() => setSelectedFaultIndex(null)}
        onSelect={(value, item) => {
          if (formikRef.current?.setFieldValue && selectedFaultIndex !== null) {
            formikRef.current.setFieldValue(`faults[${selectedFaultIndex}].faultType`, item.Fault);
            formikRef.current.setFieldValue(`faults[${selectedFaultIndex}].faultDescription`, item.Description);
          }
          setSelectedFaultIndex(null);
        }}
        title="Select Fault"
        data={faultDetails}
        loading={loadingData}
        searchPlaceholder="Search by fault or description..."
        searchKeys={['Fault', 'Description']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{item.Fault}</Text>
            {item.Description && (
              <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>{item.Description}</Text>
            )}
          </View>
        )}
      />

      <Loader visible={loading} text="Submitting complaint..." />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 100,
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
  input: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  priorityContainer: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  priorityButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  priorityButton: {
    flex: 1,
    minWidth: 70,
  },
  faultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  faultItem: {
    marginBottom: SPACING.md,
  },
  faultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  faultLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    marginVertical: SPACING.md,
  },
  submitContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  button: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
  },
  menu: {
    marginTop: 50,
    maxHeight: 400,
  },
});

export default CreateComplaintScreen;
