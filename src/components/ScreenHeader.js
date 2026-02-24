import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING } from '../constants/theme';

/**
 * Reusable Screen Header Component
 * Provides consistent header with hamburger menu across all screens
 * 
 * @param {Object} props
 * @param {string} props.title - Main header title
 * @param {string} props.subtitle - Optional subtitle text
 * @param {Function} props.onMenuPress - Callback for hamburger menu press
 * @param {Function} props.onNotificationPress - Optional callback for notification button
 * @param {boolean} props.showNotifications - Show notification button (default: true)
 * @param {boolean} props.useGradient - Use gradient background (default: true)
 */
const ScreenHeader = ({
  title,
  subtitle,
  onMenuPress,
  onNotificationPress,
  showNotifications = true,
  useGradient = true,
}) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const headerContent = (
    <View style={styles.headerContent}>
      <TouchableOpacity
        onPress={onMenuPress}
        style={styles.menuButton}
      >
        <MaterialIcons name="menu" size={28} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && (
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        )}
      </View>
      
      {showNotifications ? (
        <TouchableOpacity
          onPress={onNotificationPress}
          style={styles.notificationButton}
        >
          <MaterialIcons name="notifications" size={24} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );

  if (useGradient) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#1E293B' }}>
        <LinearGradient
          colors={['#1E293B', '#334155']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {headerContent}
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.primary }}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        {headerContent}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  notificationButton: {
    padding: 4,
  },
});

export default ScreenHeader;
