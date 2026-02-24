import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, Switch, HelperText } from 'react-native-paper';
import { Formik } from 'formik';
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';
import DateTimePicker from '@react-native-community/datetimepicker';

import { fuelLogValidationSchema } from '../../../utils/validations';
import { maintenanceService } from '../../../api/services';
import { addFuelLog } from '../../../store/slices/dataSlice';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, formatTime, formatVehicleNumber } from '../../../utils/helpers';

const CreateFuelLogScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isElectric, setIsElectric] = useState(false);

  const initialValues = {
    vehicleNumber: '',
    odometer: '',
    fuelQuantity: '',
    fuelType: 'Diesel',
    fuelDate: new Date(),
    fuelTime: formatTime(new Date()),
    fuelStation: '',
    cost: '',
  };

  const handleSubmit = (values) => {
    setFormValues(values);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    try {
      setShowConfirmation(false);
      setLoading(true);

      const fuelData = {
        ...formValues,
        fuelDate: formatDate(formValues.fuelDate),
      };

      const response = await maintenanceService.createFuelLog(fuelData);

      if (response && response.success) {
        dispatch(addFuelLog(response.data));
        
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Fuel log created successfully',
        });

        navigation.goBack();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.message || 'Failed to create fuel log',
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
          validationSchema={!isElectric ? fuelLogValidationSchema : null}
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

                <TextInput
                  label="Odometer Reading (KM) *"
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
                <HelperText type="info">
                  Enter the current odometer reading. Must be greater than previous reading.
                </HelperText>
              </View>

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <View style={styles.switchContainer}>
                  <Text style={[styles.label, { color: colors.dark }]}>
                    Electric Vehicle
                  </Text>
                  <Switch
                    value={isElectric}
                    onValueChange={setIsElectric}
                    color={colors.primary}
                  />
                </View>
                <HelperText type="info">
                  Enable this if the vehicle is electric (skip fuel entry)
                </HelperText>
              </View>

              {!isElectric && (
                <View style={[styles.section, { backgroundColor: colors.white }]}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                    Fuel Details
                  </Text>

                  <View style={styles.fuelTypeContainer}>
                    <Text style={[styles.label, { color: colors.dark }]}>Fuel Type *</Text>
                    <View style={styles.fuelTypeButtons}>
                      {['Diesel', 'Petrol', 'CNG'].map((type) => (
                        <Button
                          key={type}
                          mode={values.fuelType === type ? 'contained' : 'outlined'}
                          onPress={() => setFieldValue('fuelType', type)}
                          style={styles.fuelTypeButton}
                          compact
                        >
                          {type}
                        </Button>
                      ))}
                    </View>
                  </View>

                  <TextInput
                    label="Fuel Quantity (Liters) *"
                    mode="outlined"
                    value={values.fuelQuantity}
                    onChangeText={handleChange('fuelQuantity')}
                    onBlur={handleBlur('fuelQuantity')}
                    keyboardType="decimal-pad"
                    error={errors.fuelQuantity && touched.fuelQuantity}
                    style={styles.input}
                  />
                  {errors.fuelQuantity && touched.fuelQuantity && (
                    <Text style={styles.errorText}>{errors.fuelQuantity}</Text>
                  )}

                  <TextInput
                    label="Fuel Station *"
                    mode="outlined"
                    value={values.fuelStation}
                    onChangeText={handleChange('fuelStation')}
                    onBlur={handleBlur('fuelStation')}
                    error={errors.fuelStation && touched.fuelStation}
                    style={styles.input}
                  />
                  {errors.fuelStation && touched.fuelStation && (
                    <Text style={styles.errorText}>{errors.fuelStation}</Text>
                  )}

                  <TextInput
                    label="Total Cost (₹) *"
                    mode="outlined"
                    value={values.cost}
                    onChangeText={handleChange('cost')}
                    onBlur={handleBlur('cost')}
                    keyboardType="decimal-pad"
                    error={errors.cost && touched.cost}
                    style={styles.input}
                    left={<TextInput.Icon icon="currency-inr" />}
                  />
                  {errors.cost && touched.cost && (
                    <Text style={styles.errorText}>{errors.cost}</Text>
                  )}
                </View>
              )}

              <View style={[styles.section, { backgroundColor: colors.white }]}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  Date & Time
                </Text>

                <TextInput
                  label="Date *"
                  mode="outlined"
                  value={formatDate(values.fuelDate)}
                  onFocus={() => setShowDatePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="calendar" />}
                />

                <TextInput
                  label="Time *"
                  mode="outlined"
                  value={values.fuelTime}
                  onFocus={() => setShowTimePicker(true)}
                  showSoftInputOnFocus={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="clock" />}
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
                  style={[styles.button, { backgroundColor: colors.info }]}
                >
                  Save Fuel Log
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
        title="Confirm Fuel Log"
        message="Are you sure you want to save this fuel log?"
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />

      <Loader visible={loading} text="Saving fuel log..." />
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  fuelTypeContainer: {
    marginBottom: SPACING.md,
  },
  fuelTypeButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  fuelTypeButton: {
    flex: 1,
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

export default CreateFuelLogScreen;
