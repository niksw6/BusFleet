import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, HelperText } from 'react-native-paper';
import { Formik } from 'formik';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { scheduleValidationSchema } from '../../../utils/validations';
import { maintenanceService } from '../../../api/services';
import { addSchedule } from '../../../store/slices/dataSlice';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatVehicleNumber } from '../../../utils/helpers';

const CreateScheduleScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const initialValues = {
    vehicleNumber: '',
    serviceType: 'Battery Check',
    scheduleType: 'KM',
    intervalKM: '',
    intervalDays: '',
    nextServiceDate: new Date(),
    notes: '',
  };

  const handleSubmit = (values) => {
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      const scheduleData = {
        ...formValues,
        nextServiceDate: formatDate(formValues.nextServiceDate),
      };

      const response = await maintenanceService.createSchedule(scheduleData);

      if (response && response.success) {
        dispatch(addSchedule(response.data));
        
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Schedule created successfully',
        });

        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.message || 'Failed to create schedule',
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

  const serviceTypes = [
    'Battery Check',
    'Oil Change',
    'Tire Rotation',
    'Brake Inspection',
    'General Maintenance',
    'Engine Service',
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.light }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Formik
          initialValues={initialValues}
          validationSchema={scheduleValidationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => (
            <View>
              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Vehicle Information
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
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Service Type
                </Text>
                
                <View style={styles.serviceTypeContainer}>
                  {serviceTypes.map((type) => (
                    <Button
                      key={type}
                      mode={values.serviceType === type ? 'contained' : 'outlined'}
                      onPress={() => setFieldValue('serviceType', type)}
                      style={styles.serviceTypeButton}
                      compact
                    >
                      {type}
                    </Button>
                  ))}
                </View>
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Schedule Configuration
                </Text>

                <Text style={[styles.label, { color: colors.dark }]}>
                  Schedule Type *
                </Text>
                <SegmentedButtons
                  value={values.scheduleType}
                  onValueChange={(value) => setFieldValue('scheduleType', value)}
                  buttons={[
                    { value: 'KM', label: 'By Kilometers' },
                    { value: 'Days', label: 'By Days' },
                  ]}
                  style={styles.segmentedButtons}
                />

                {values.scheduleType === 'KM' ? (
                  <>
                    <TextInput
                      label="Interval (KM) *"
                      mode="outlined"
                      value={values.intervalKM}
                      onChangeText={handleChange('intervalKM')}
                      onBlur={handleBlur('intervalKM')}
                      keyboardType="numeric"
                      error={errors.intervalKM && touched.intervalKM}
                      style={styles.input}
                      placeholder="e.g., 5000"
                    />
                    {errors.intervalKM && touched.intervalKM && (
                      <Text style={styles.errorText}>{errors.intervalKM}</Text>
                    )}
                    <HelperText type="info">
                      Service will be scheduled after every specified kilometers
                    </HelperText>
                  </>
                ) : (
                  <>
                    <TextInput
                      label="Interval (Days) *"
                      mode="outlined"
                      value={values.intervalDays}
                      onChangeText={handleChange('intervalDays')}
                      onBlur={handleBlur('intervalDays')}
                      keyboardType="numeric"
                      error={errors.intervalDays && touched.intervalDays}
                      style={styles.input}
                      placeholder="e.g., 30"
                    />
                    {errors.intervalDays && touched.intervalDays && (
                      <Text style={styles.errorText}>{errors.intervalDays}</Text>
                    )}
                    <HelperText type="info">
                      Service will be scheduled after every specified days
                    </HelperText>
                  </>
                )}

                <TextInput
                  label="Next Service Date *"
                  mode="outlined"
                  value={formatDate(values.nextServiceDate)}
                  onFocus={() => setShowDatePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="calendar" />}
                />
                {errors.nextServiceDate && touched.nextServiceDate && (
                  <Text style={styles.errorText}>{errors.nextServiceDate}</Text>
                )}
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Additional Notes
                </Text>

                <TextInput
                  label="Notes (Optional)"
                  mode="outlined"
                  value={values.notes}
                  onChangeText={handleChange('notes')}
                  onBlur={handleBlur('notes')}
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                  placeholder="Add any additional notes or reminders..."
                />
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
                  style={[styles.button, { backgroundColor: colors.success }]}
                >
                  Create Schedule
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

      <ConfirmationModal
        visible={showConfirmation}
        title="Confirm Schedule"
        message="Are you sure you want to create this maintenance schedule?"
        confirmText="Create"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />

      <Loader visible={loading} text="Creating schedule..." />
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  serviceTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  serviceTypeButton: {
    flex: 1,
    minWidth: '45%',
    marginBottom: SPACING.sm,
  },
  segmentedButtons: {
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

export default CreateScheduleScreen;
