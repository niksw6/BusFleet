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
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import Toast from 'react-native-toast-message';

import { loginStart, loginSuccess, loginFailure } from '../../../store/slices/authSlice';
import { authService } from '../../../api/services';
import { storeDBName, storeUserData, getLastCompany, storeLastCompany } from '../../../utils/storage';
import { loginValidationSchema } from '../../../utils/validations';
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
        const user = response.user || response.User || response.data || { name: values.username };
        const token = response.token || response.Token || response.accessToken || 'mock-token';
        
        await storeDBName(values.company);
        await storeUserData(user);
        await storeLastCompany(values.company);

        dispatch(loginSuccess({
          user: user,
          dbName: values.company,
          token: token,
        }));

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
          <View style={[styles.logoContainer, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="local-shipping" size={64} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.dark }]}>Fleet Data Management</Text>
          <Text style={[styles.subtitle, { color: colors.gray }]}>
            Sign in to continue
          </Text>
        </View>

        <View style={[styles.formContainer, { backgroundColor: colors.white }]}>
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
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  formContainer: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
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
    borderRadius: BORDER_RADIUS.md,
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
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  loginButtonContent: {
    height: 56,
  },
  loginButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
