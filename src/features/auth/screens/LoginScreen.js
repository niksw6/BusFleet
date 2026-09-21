import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { Formik } from 'formik';
import { useDispatch, useSelector } from 'react-redux';
import MaterialIcons from '../../../shared/components/AppIcon.js';
import { Picker } from '@react-native-picker/picker';
import Toast from 'react-native-toast-message';

import { loginStart, loginSuccess, loginFailure } from '../../../store/slices/authSlice';
import { setUnreadCount } from '../../../store/slices/notificationSlice';
import { authService, dashboardService } from '../../../api/services';
import { storeDBName, storeUserData, getLastCompany, storeLastCompany } from '../../../utils/storage';
import { loginValidationSchema } from '../../../utils/validations';
import { mapUsertypeToRole } from '../../../utils/roleAccess';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';

const LoginScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const { loading } = useSelector(state => state.auth);

  const [companies, setCompanies] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [lastCompany, setLastCompany] = useState('');

  useEffect(() => {
    fetchCompanies();
    loadLastCompany();
  }, []);

  const loadLastCompany = async () => {
    const company = await getLastCompany();
    if (company) {
      setLastCompany(company);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      const response = await authService.getCompanyLists();
      setCompanies(response || []);
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load companies',
      });
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleLogin = async (values) => {
    try {
      dispatch(loginStart());

      const credentials = {
        DBName: values.company,
        User: values.username,
        Password: values.password,
      };

      console.log('Login attempt with:', {
        ...credentials,
        Password: '***'
      });

      const response = await authService.login(credentials);
      
      console.log('Login response:', response);

      // Handle different response formats - API returns Status: true/false
      if (response && (response.Status === true || response.success === true || response.Success === true)) {
        console.log('Login successful!');
        // MCheckLogin response shape: { Success:true, Data:{ Role, Depot, TeamCode, ... } }
        const userFromApi = response.Data || response.data || response.user || response.User || response || { name: values.username };
        const detectedRole =
          mapUsertypeToRole(response?.Usertype || userFromApi?.Usertype || userFromApi?.usertype)
          || userFromApi?.role
          || userFromApi?.Role;
        const mechanicCode = userFromApi?.UserCode || userFromApi?.EmpCode || userFromApi?.Code || userFromApi?.code || userFromApi?.User || values.username;
        const numericEmpId = Number(userFromApi?.EmpID || userFromApi?.EmployeeID || userFromApi?.ID || userFromApi?.id || 0);
        const user = {
          ...userFromApi,
          User: values.username,
          username: values.username,
          Code: mechanicCode,
          code: mechanicCode,
          UserCode: userFromApi?.UserCode || userFromApi?.EmpCode || userFromApi?.Code || userFromApi?.code || mechanicCode,
          EmpCode: userFromApi?.EmpCode || userFromApi?.UserCode || userFromApi?.Code || userFromApi?.code || mechanicCode,
          id: numericEmpId || null,
          EmpID: numericEmpId || null,
          Usertype: response?.Usertype || userFromApi?.Usertype || userFromApi?.usertype || null,
          role: detectedRole || userFromApi?.role || userFromApi?.Role || 'Supervisor',
          // Maintenance team mapping — foundation of Team Leader accept/reject routing (SOP §1.3)
          TeamCode: userFromApi?.TeamCode || userFromApi?.teamCode || userFromApi?.Team || null,
          Depot: response?.Depot || response?.depot || userFromApi?.Depot || userFromApi?.depot || null,
        };
        const token = response.token || response.Token || response.accessToken || 'mock-token';
        
        await storeDBName(values.company);
        await storeUserData(user);
        await storeLastCompany(values.company);

        dispatch(loginSuccess({
          user: user,
          dbName: values.company,
          token: token,
        }));

        // Fetch notification count immediately after login so badge shows before user opens notifications
        dashboardService.getNotificationCount(values.company, values.username)
          .then(res => { if (res?.Success) dispatch(setUnreadCount(Number(res?.Data) || 0)); })
          .catch(() => {});

        Toast.show({
          type: 'success',
          text1: 'Login Successful',
          text2: response.Message || `Welcome back, ${user?.name || user?.Name || 'User'}!`,
        });

        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else {
        const errorMsg = response?.message || response?.Message || response?.error || 'Invalid credentials';
        console.log('Login failed:', errorMsg, 'Status:', response?.Status);
        dispatch(loginFailure(errorMsg));
        Toast.show({
          type: 'error',
          text1: 'Login Failed',
          text2: errorMsg,
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      dispatch(loginFailure(error.message));
      Toast.show({
        type: 'error',
        text1: 'Login Error',
        text2: error.message || 'Something went wrong',
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.light }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.brandWrap, { backgroundColor: colors.white, borderColor: colors.border }]}>
            <View style={[styles.brandBadge, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="directions-bus" size={34} color={colors.white} />
            </View>
            <View style={styles.brandWordmark}>
              <Text style={[styles.brandWord, { color: colors.secondary }]}>M</Text>
              <Text style={[styles.brandWord, { color: colors.primary }]}>U</Text>
              <Text style={[styles.brandWord, { color: colors.primary }]}>T</Text>
            </View>
          </View>
          <Text style={[styles.companyName, { color: colors.primary }]}>Mateshwari Urban Transport</Text>
          <Text style={[styles.subtitle, { color: colors.gray }]}>Sign in to manage maintenance work safely and efficiently</Text>
        </View>

        <View style={[styles.formContainer, { backgroundColor: colors.white, borderColor: colors.border }]}>
          <Formik
            initialValues={{
              company: lastCompany,
              username: '',
              password: '',
            }}
            validationSchema={loginValidationSchema}
            onSubmit={handleLogin}
          >
            {({ handleChange, handleBlur, handleSubmit, values, errors, touched, setFieldValue }) => (
              <View>
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.dark }]}>Company</Text>
                  <View style={[styles.pickerContainer, { backgroundColor: colors.grayLight }]}>
                    <Picker
                      selectedValue={values.company}
                      onValueChange={(value) => setFieldValue('company', value)}
                      style={styles.picker}
                      enabled={!loadingCompanies}
                    >
                      <Picker.Item label="Select Company" value="" />
                      {companies.map((company, index) => (
                        <Picker.Item
                          key={index}
                          label={company.CompanyDatabaseName}
                          value={company.CompanyDatabaseName}
                        />
                      ))}
                    </Picker>
                  </View>
                  {errors.company && touched.company && (
                    <Text style={styles.errorText}>{errors.company}</Text>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <TextInput
                    label="Username"
                    mode="outlined"
                    value={values.username}
                    onChangeText={handleChange('username')}
                    onBlur={handleBlur('username')}
                    error={errors.username && touched.username}
                    left={<TextInput.Icon icon="account" />}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  {errors.username && touched.username && (
                    <Text style={styles.errorText}>{errors.username}</Text>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <TextInput
                    label="Password"
                    mode="outlined"
                    value={values.password}
                    onChangeText={handleChange('password')}
                    onBlur={handleBlur('password')}
                    error={errors.password && touched.password}
                    secureTextEntry={!showPassword}
                    left={<TextInput.Icon icon="lock" />}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword(!showPassword)}
                      />
                    }
                    style={styles.input}
                  />
                  {errors.password && touched.password && (
                    <Text style={styles.errorText}>{errors.password}</Text>
                  )}
                </View>

                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  style={[styles.loginButton, { backgroundColor: colors.primary }]}
                  contentStyle={styles.loginButtonContent}
                  labelStyle={styles.loginButtonLabel}
                  disabled={loading || loadingCompanies}
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>
                <Text style={[styles.signInHint, { color: colors.gray }]}>Use your assigned company and login credentials</Text>
              </View>
            )}
          </Formik>
        </View>
      </ScrollView>

      <Loader visible={loading} text="Logging in..." />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  brandWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  brandBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#D73D3D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  brandWordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWord: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 36,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
  },
  formContainer: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  pickerContainer: {
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  picker: {
    height: 56,
  },
  input: {
    backgroundColor: 'transparent',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
  loginButton: {
    marginTop: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonContent: {
    height: 52,
  },
  loginButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  signInHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});

export default LoginScreen;

