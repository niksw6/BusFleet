import React, { useEffect } from 'react';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { Provider as ReduxProvider, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
// Removed expo Font and SplashScreen dependencies (use native defaults)

import store from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import { COLORS, DARK_COLORS } from './src/constants/theme';
import { installDiagnosticHandlers, appendDiagnostic } from './src/utils/diagnosticLogger';
import { initLogger } from './src/utils/logger';

// Capture all console output for in-app debug log viewer
initLogger();

// Removed expo splash handling

// Custom light theme
const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    tertiary: COLORS.info,
    error: COLORS.danger,
    success: COLORS.success,
    background: COLORS.light,
    surface: COLORS.white,
    surfaceVariant: COLORS.grayLight,
    outline: COLORS.gray,
    outlineVariant: COLORS.grayLight,
    onSurface: COLORS.dark,
    onSurfaceVariant: COLORS.gray,
  },
};

// Custom dark theme
const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: DARK_COLORS.primary,
    secondary: DARK_COLORS.secondary,
    tertiary: DARK_COLORS.info,
    error: DARK_COLORS.danger,
    success: DARK_COLORS.success,
    background: DARK_COLORS.background,
    surface: DARK_COLORS.surface,
    surfaceVariant: DARK_COLORS.card,
    outline: DARK_COLORS.gray,
    outlineVariant: DARK_COLORS.grayLight,
    onSurface: DARK_COLORS.text,
    onSurfaceVariant: DARK_COLORS.textSecondary,
  },
};

const getLicenseExpiry = () => Constants.expoConfig?.extra?.license?.expiresAt || null;

const LicenseGate = ({ children }) => {
  const expiresAt = getLicenseExpiry();
  const isExpired = expiresAt && Date.now() >= new Date(expiresAt).getTime();

  if (isExpired) {
    return (
      <View style={styles.expiredContainer}>
        <MaterialCommunityIcons name="calendar-remove" size={56} color={COLORS.danger} />
        <Text style={styles.expiredTitle}>Application validity expired</Text>
        <Text style={styles.expiredMessage}>
          This client APK was valid for two months. Please install a renewed APK.
        </Text>
      </View>
    );
  }

  return children;
};

const renderPaperIcon = ({ name, source, color, size, ...rest }) => {
  const resolvedSource = name ?? source;

  if (typeof resolvedSource === 'function') {
    return resolvedSource({ color, size, ...rest });
  }

  const iconName =
    typeof resolvedSource === 'string'
      ? resolvedSource
      : (resolvedSource && typeof resolvedSource === 'object' && typeof resolvedSource.name === 'string'
        ? resolvedSource.name
        : 'help-circle-outline');

  return (
    <MaterialCommunityIcons
      {...rest}
      name={iconName}
      color={color}
      size={size}
    />
  );
};

function AppContent() {
  const isDarkMode = useSelector(state => state?.theme?.isDarkMode ?? false);
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <PaperProvider
      theme={theme}
      settings={{
        icon: renderPaperIcon,
      }}
    >
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <LicenseGate>
        <OfflineBanner />
        <AppNavigator />
      </LicenseGate>
      <Toast />
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  expiredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    backgroundColor: COLORS.light,
  },
  expiredTitle: {
    marginTop: 16,
    color: COLORS.dark,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  expiredMessage: {
    marginTop: 10,
    color: COLORS.gray,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    appendDiagnostic('RENDER_FATAL', error?.stack || error?.message || String(error));
    console.error('App crash captured:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, textAlign: 'center' }}>Something went wrong. Please restart the app.</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    installDiagnosticHandlers();
    appendDiagnostic('INFO', 'App launched');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <AppErrorBoundary>
            <AppContent />
          </AppErrorBoundary>
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
