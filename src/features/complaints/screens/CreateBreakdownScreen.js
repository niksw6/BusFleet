import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, Divider } from 'react-native-paper';
import { Formik } from 'formik';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { lineBreakdownValidationSchema } from '../../../utils/validations';
import { complaintService } from '../../../api/services';
import { addBreakdown } from '../../../store/slices/dataSlice';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatTime, formatVehicleNumber } from '../../../utils/helpers';
import { PRIORITY_LEVELS } from '../../../constants/config';

const CreateBreakdownScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const initialValues = {
    vehicleNumber: '',
    routeNumber: '',
    breakdownLocation: '',
    breakdownDate: new Date(),
    breakdownTime: formatTime(new Date()),
    priority: 'High',
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

      const breakdownData = {
        ...formValues,
        breakdownDate: formatDate(formValues.breakdownDate),
      };

      const response = await complaintService.createBreakdown(breakdownData);

      if (response && response.success) {
        dispatch(addBreakdown(response.data));
        
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Breakdown reported successfully',
        });

        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.message || 'Failed to report breakdown',
        });
      }
    } catch (error) {
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Formik
          initialValues={initialValues}
          validationSchema={lineBreakdownValidationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => (
            <View>
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Vehicle & Route Information
                </Text>
                
                <TextInput
                  label="Vehicle Number *"
                  mode="outlined"
                  value={values.vehicleNumber}
                  onChangeText={(text) => {
                    const formatted = formatVehicleNumber(text);
                    setFieldValue('vehicleNumber', formatted);
                  }}
                  onBlur={handleBlur('vehicleNumber')}
                  error={errors.vehicleNumber && touched.vehicleNumber}
                  placeholder="AA 00 AA 0000"
                  autoCapitalize="characters"
                  maxLength={13}
                  style={styles.input}
                />
                {errors.vehicleNumber && touched.vehicleNumber && (
                  <Text style={styles.errorText}>{errors.vehicleNumber}</Text>
                )}

                <TextInput
                  label="Route Number *"
                  mode="outlined"
                  value={values.routeNumber}
                  onChangeText={handleChange('routeNumber')}
                  onBlur={handleBlur('routeNumber')}
                  error={errors.routeNumber && touched.routeNumber}
                  style={styles.input}
                />
                {errors.routeNumber && touched.routeNumber && (
                  <Text style={styles.errorText}>{errors.routeNumber}</Text>
                )}

                <TextInput
                  label="Breakdown Location *"
                  mode="outlined"
                  value={values.breakdownLocation}
                  onChangeText={handleChange('breakdownLocation')}
                  onBlur={handleBlur('breakdownLocation')}
                  error={errors.breakdownLocation && touched.breakdownLocation}
                  placeholder="Enter location in India"
                  style={styles.input}
                />
                {errors.breakdownLocation && touched.breakdownLocation && (
                  <Text style={styles.errorText}>{errors.breakdownLocation}</Text>
                )}
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Breakdown Details
                </Text>

                <TextInput
                  label="Breakdown Date *"
                  mode="outlined"
                  value={formatDate(values.breakdownDate)}
                  onFocus={() => setShowDatePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="calendar" />}
                />

                <TextInput
                  label="Breakdown Time *"
                  mode="outlined"
                  value={values.breakdownTime}
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
                        buttonColor={
                          values.priority === priority && priority === 'High'
                            ? colors.danger
                            : undefined
                        }
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

                    <TextInput
                      label="Fault Type *"
                      mode="outlined"
                      value={fault.faultType}
                      onChangeText={handleChange(`faults[${index}].faultType`)}
                      style={styles.input}
                    />

                    <TextInput
                      label="Fault Description *"
                      mode="outlined"
                      value={fault.faultDescription}
                      onChangeText={handleChange(`faults[${index}].faultDescription`)}
                      multiline
                      numberOfLines={3}
                      style={styles.input}
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
                  style={[styles.button, { backgroundColor: colors.danger }]}
                >
                  Report Breakdown
                </Button>
              </View>
            </View>
          )}
        </Formik>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={new Date()}
          mode="time"
          display="default"
          onChange={(event, time) => {
            setShowTimePicker(false);
          }}
        />
      )}

      <ConfirmationModal
        visible={showConfirmation}
        title="Confirm Breakdown Report"
        message="Are you sure you want to report this breakdown? This will be flagged as high priority."
        confirmText="Report"
        confirmColor={colors.danger}
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />

      <Loader visible={loading} text="Reporting breakdown..." />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
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
  },
  button: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
  },
});

export default CreateBreakdownScreen;
