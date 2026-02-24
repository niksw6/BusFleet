import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Chip, Divider } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { jobCardService } from '../api/services';
import Loader from '../shared/components/Loader';
import ConfirmationModal from '../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { formatDate, formatTime } from '../utils/helpers';

const workOrderValidationSchema = Yup.object().shape({
  workDescription: Yup.string().required('Work description is required').min(20, 'Description must be at least 20 characters'),
  timeSpent: Yup.number().required('Time spent is required').positive('Must be a positive number').max(24, 'Cannot exceed 24 hours'),
  partsUsed: Yup.string(),
  observations: Yup.string(),
  status: Yup.string().required('Status is required'),
});

const WorkOrderScreen = ({ route, navigation }) => {
  const { docEntry, jobCardNo, complaintNo, busNo, depot, description, complaintType, dbName } = route.params;
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [jobDetails, setJobDetails] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const statusOptions = [
    { key: 'I', label: 'In Progress', color: '#2196F3', icon: 'build' },
    { key: 'C', label: 'Completed', color: '#4CAF50', icon: 'check-circle' },
    { key: 'H', label: 'On Hold', color: '#FF9800', icon: 'pause-circle' },
    { key: 'P', label: 'Need Parts', color: '#FF5722', icon: 'inventory' },
  ];

  // Fetch job card details
  React.useEffect(() => {
    const fetchJobDetails = async () => {
      try {
        setLoading(true);
        console.log('📋 Fetching job card details:', docEntry);
        const response = await jobCardService.getJobCardDetail(dbName || 'MUTSPL_TEST', docEntry);
        
        if (response.Success && response.Data) {
          console.log('✅ Job card details:', response.Data);
          setJobDetails(response.Data);
        }
      } catch (error) {
        console.error('❌ Error fetching job card details:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to load job card details',
        });
      } finally {
        setLoading(false);
      }
    };

    if (docEntry) {
      fetchJobDetails();
    }
  }, [docEntry, dbName]);

  const initialValues = {
    startTime: new Date(),
    endTime: new Date(),
    timeSpent: '',
    workDescription: '',
    partsUsed: '',
    observations: '',
    status: 'I', // In Progress
  };

  const handleSubmit = (values) => {
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      // Format dates
      const formatDateTime = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
      };

      const workOrderData = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        DocEntry: docEntry,
        JobCardNo: jobCardNo,
        ComplaintNo: complaintNo,
        BusNo: busNo,
        Depot: depot,
        MechanicCode: user?.Code || user?.code || 'MECH001',
        MechanicName: user?.FirstName || user?.name || 'Mechanic',
        StartTime: formatDateTime(formValues.startTime),
        EndTime: formatDateTime(formValues.endTime),
        TimeSpent: parseFloat(formValues.timeSpent),
        WorkDescription: formValues.workDescription,
        PartsUsed: formValues.partsUsed || '',
        Observations: formValues.observations || '',
        Status: formValues.status,
        CompletedDate: formValues.status === 'C' ? formatDateTime(new Date()) : null,
      };

      console.log('🔧 Creating work order:', workOrderData);

      // Call API (placeholder - you'll need to implement this endpoint)
      // const response = await complaintService.createWorkOrder(workOrderData);
      
      // For now, just show success
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Work order submitted successfully',
      });

      setLoading(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error creating work order:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to submit work order',
      });
      setLoading(false);
    }
  };

  const handleTimeChange = (event, selectedTime, field, setFieldValue) => {
    if (field === 'startTime') {
      setShowStartTimePicker(false);
    } else {
      setShowEndTimePicker(false);
    }
    
    if (selectedTime) {
      setFieldValue(field, selectedTime);
      
      // Auto-calculate time spent if both times are set
      if (field === 'endTime' && formValues?.startTime) {
        const diff = selectedTime - formValues.startTime;
        const hours = (diff / (1000 * 60 * 60)).toFixed(2);
        setFieldValue('timeSpent', hours > 0 ? hours : '');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.light }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Formik
        initialValues={initialValues}
        validationSchema={workOrderValidationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue }) => {
          // Update formValues for time calculation
          if (!formValues) {
            setFormValues(values);
          }

          return (
            <ScrollView style={styles.scrollContent}>
              {/* Job Card Info */}
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Job Card Information
                </Text>
                
                <View style={styles.infoRow}>
                  <MaterialIcons name="assignment" size={20} color={colors.gray} />
                  <Text style={[styles.infoLabel, { color: colors.gray }]}>Job Card #:</Text>
                  <Text style={[styles.infoValue, { color: colors.dark }]}>{jobCardNo}</Text>
                </View>

                {complaintNo && (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="confirmation-number" size={20} color={colors.gray} />
                    <Text style={[styles.infoLabel, { color: colors.gray }]}>Incident #:</Text>
                    <Text style={[styles.infoValue, { color: colors.dark }]}>{complaintNo}</Text>
                  </View>
                )}

                <View style={styles.infoRow}>
                  <MaterialIcons name="directions-bus" size={20} color={colors.gray} />
                  <Text style={[styles.infoLabel, { color: colors.gray }]}>Bus #:</Text>
                  <Text style={[styles.infoValue, { color: colors.dark }]}>{busNo}</Text>
                </View>

                <View style={styles.infoRow}>
                  <MaterialIcons name="location-city" size={20} color={colors.gray} />
                  <Text style={[styles.infoLabel, { color: colors.gray }]}>Depot:</Text>
                  <Text style={[styles.infoValue, { color: colors.dark }]}>{depot || 'N/A'}</Text>
                </View>

                {complaintType && (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="build" size={20} color={colors.gray} />
                    <Text style={[styles.infoLabel, { color: colors.gray }]}>Type:</Text>
                    <Text style={[styles.infoValue, { color: colors.dark }]}>{complaintType}</Text>
                  </View>
                )}

                {jobDetails?.Mechanics && jobDetails.Mechanics.length > 0 && (
                  <>
                    <Divider style={styles.divider} />
                    <Text style={[styles.label, { color: colors.dark }]}>Assigned Mechanics:</Text>
                    <View style={styles.mechanicsContainer}>
                      {jobDetails.Mechanics.map((mech, index) => (
                        <Chip
                          key={index}
                          mode="flat"
                          style={[styles.mechanicChip, { backgroundColor: colors.light }]}
                          icon="account-wrench"
                        >
                          {mech.Mechanic}
                        </Chip>
                      ))}
                    </View>
                  </>
                )}

                {jobDetails?.Operations && jobDetails.Operations.length > 0 && (
                  <>
                    <Divider style={styles.divider} />
                    <Text style={[styles.label, { color: colors.dark }]}>Assigned Tasks:</Text>
                    {jobDetails.Operations.map((operation, index) => (
                      <View key={index} style={[styles.taskChip, { backgroundColor: colors.light }]}>
                        <MaterialIcons name="build" size={16} color="#FF9800" />
                        <Text style={[styles.taskText, { color: colors.dark }]}>{operation.OPName}</Text>
                      </View>
                    ))}
                  </>
                )}

                {(jobDetails?.Description || description) && (
                  <>
                    <Divider style={styles.divider} />
                    <Text style={[styles.label, { color: colors.dark }]}>Description:</Text>
                    <Text style={[styles.infoValue, { color: colors.gray }]}>{jobDetails?.Description || description}</Text>
                  </>
                )}

                {jobDetails?.Faults && jobDetails.Faults.length > 0 && (
                  <>
                    <Divider style={styles.divider} />
                    <Text style={[styles.label, { color: colors.dark }]}>Reported Faults:</Text>
                    {jobDetails.Faults.map((fault, index) => (
                      <View key={index} style={[styles.faultChipContainer, { backgroundColor: '#FFF3E0' }]}>
                        <View style={styles.faultHeaderRow}>
                          <MaterialIcons name="warning" size={16} color="#FF9800" />
                          <Text style={[styles.taskText, { color: colors.dark, fontWeight: '600' }]}>{fault.Fault}</Text>
                        </View>
                        {(fault.Description || fault.Dscption || fault.FaultDescription) && (
                          <Text style={[styles.faultDesc, { color: '#666' }]}>
                            {fault.Description || fault.Dscption || fault.FaultDescription}
                          </Text>
                        )}
                      </View>
                    ))}
                  </>
                )}
              </View>

              {/* Work Details */}
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Work Details
                </Text>

                {/* Time Tracking */}
                <View style={styles.timeRow}>
                  <View style={styles.timeInput}>
                    <Text style={[styles.label, { color: colors.dark }]}>Start Time *</Text>
                    <TouchableOpacity onPress={() => setShowStartTimePicker(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={formatTime(values.startTime)}
                          style={styles.input}
                          right={<TextInput.Icon icon="clock" />}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.timeInput}>
                    <Text style={[styles.label, { color: colors.dark }]}>End Time *</Text>
                    <TouchableOpacity onPress={() => setShowEndTimePicker(true)}>
                      <View pointerEvents="none">
                        <TextInput
                          mode="outlined"
                          value={formatTime(values.endTime)}
                          style={styles.input}
                          right={<TextInput.Icon icon="clock" />}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                <TextInput
                  label="Time Spent (hours) *"
                  mode="outlined"
                  value={values.timeSpent}
                  onChangeText={handleChange('timeSpent')}
                  onBlur={handleBlur('timeSpent')}
                  keyboardType="decimal-pad"
                  error={errors.timeSpent && touched.timeSpent}
                  style={styles.input}
                  right={<TextInput.Icon icon="timer" />}
                />
                {errors.timeSpent && touched.timeSpent && (
                  <Text style={styles.errorText}>{errors.timeSpent}</Text>
                )}

                <TextInput
                  label="Work Description *"
                  mode="outlined"
                  value={values.workDescription}
                  onChangeText={handleChange('workDescription')}
                  onBlur={handleBlur('workDescription')}
                  multiline
                  numberOfLines={6}
                  error={errors.workDescription && touched.workDescription}
                  style={styles.input}
                  placeholder="Describe the work performed in detail..."
                />
                {errors.workDescription && touched.workDescription && (
                  <Text style={styles.errorText}>{errors.workDescription}</Text>
                )}

                <TextInput
                  label="Parts Used"
                  mode="outlined"
                  value={values.partsUsed}
                  onChangeText={handleChange('partsUsed')}
                  onBlur={handleBlur('partsUsed')}
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                  placeholder="List parts/materials used (optional)"
                />

                <TextInput
                  label="Observations"
                  mode="outlined"
                  value={values.observations}
                  onChangeText={handleChange('observations')}
                  onBlur={handleBlur('observations')}
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                  placeholder="Any observations or recommendations (optional)"
                />
              </View>

              {/* Status Selection */}
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Work Status *
                </Text>
                
                <View style={styles.statusGrid}>
                  {statusOptions.map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.statusCard,
                        { 
                          backgroundColor: values.status === option.key 
                            ? option.color + '15' 
                            : colors.light 
                        },
                        values.status === option.key && { 
                          borderColor: option.color, 
                          borderWidth: 2 
                        }
                      ]}
                      onPress={() => setFieldValue('status', option.key)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons 
                        name={option.icon} 
                        size={32} 
                        color={values.status === option.key ? option.color : colors.gray} 
                      />
                      <Text 
                        style={[
                          styles.statusLabel,
                          { 
                            color: values.status === option.key ? option.color : colors.gray,
                            fontWeight: values.status === option.key ? 'bold' : '600' 
                          }
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.status && touched.status && (
                  <Text style={styles.errorText}>{errors.status}</Text>
                )}
              </View>

              <Button
                mode="contained"
                onPress={handleSubmit}
                style={styles.submitButton}
                contentStyle={{ paddingVertical: 8 }}
                icon="send"
              >
                Submit Work Order
              </Button>

              {/* Time Pickers */}
              {showStartTimePicker && (
                <DateTimePicker
                  value={values.startTime}
                  mode="time"
                  display="default"
                  onChange={(event, date) => handleTimeChange(event, date, 'startTime', setFieldValue)}
                />
              )}

              {showEndTimePicker && (
                <DateTimePicker
                  value={values.endTime}
                  mode="time"
                  display="default"
                  onChange={(event, date) => handleTimeChange(event, date, 'endTime', setFieldValue)}
                />
              )}
            </ScrollView>
          );
        }}
      </Formik>

      <ConfirmationModal
        visible={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirm}
        title="Submit Work Order"
        message={`Are you sure you want to submit this work order for Job Card #${jobCardNo}?`}
      />

      <Loader visible={loading} text="Submitting work order..." />
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
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  divider: {
    marginVertical: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
  },
  taskText: {
    marginLeft: SPACING.sm,
    fontSize: 14,
  },
  faultChipContainer: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
  },
  faultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faultDesc: {
    marginTop: SPACING.xs,
    marginLeft: SPACING.lg + 8,
    fontSize: 13,
    lineHeight: 18,
  },
  mechanicsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  mechanicChip: {
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  timeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  timeInput: {
    flex: 1,
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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  statusCard: {
    width: '47%',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  statusLabel: {
    fontSize: 14,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
  },
});

export default WorkOrderScreen;
