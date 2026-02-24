import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { Provider as ReduxProvider, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { MaterialIcons } from '@expo/vector-icons';

import store from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import { COLORS, DARK_COLORS } from './src/constants/theme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

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

function AppContent() {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <PaperProvider theme={theme}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <OfflineBanner />
      <AppNavigator />
      <Toast />
    </PaperProvider>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts
        await Font.loadAsync({
          ...MaterialIcons.font,
        });
      } catch (e) {
        console.warn('Error loading fonts:', e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <AppContent />
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
