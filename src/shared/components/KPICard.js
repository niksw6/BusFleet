import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../constants/theme';

/**
 * Modern KPI Card Component - 2026 Design
 * Compact, mobile-optimized with gradient backgrounds
 */
const KPICard = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  iconColor, 
  backgroundColor,
  onPress,
  isDarkMode,
  compact = true
}) => {
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  
  // Modern gradient colors based on icon color
  const getGradient = (color) => {
    const gradients = {
      '#0070F2': ['#0070F2', '#0052CC'],
      '#FF9500': ['#FF9500', '#FF7A00'],
      '#BB0000': ['#BB0000', '#990000'],
      '#9C27B0': ['#9C27B0', '#7B1FA2'],
      '#2B7D2B': ['#2B7D2B', '#1B5E20'],
    };
    return gradients[color] || [color, color];
  };

  const cardContent = (
    <View style={[
      compact ? styles.containerCompact : styles.container,
      { backgroundColor: colors.white },
      styles.shadow
    ]}>
      {/* Icon with gradient background */}
      <View style={styles.row}>
        <LinearGradient
          colors={getGradient(iconColor)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <MaterialIcons name={icon} size={20} color="#FFFFFF" />
        </LinearGradient>
        
        <View style={styles.textSection}>
          <Text style={[styles.titleCompact, { color: colors.gray }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.valueCompact, { color: colors.dark }]}>
            {value}
          </Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity 
        style={compact ? styles.wrapperCompact : styles.wrapper}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return <View style={compact ? styles.wrapperCompact : styles.wrapper}>{cardContent}</View>;
};

const styles = StyleSheet.create({
  wrapperCompact: {
    width: '48%',
    marginBottom: SPACING.sm,
  },
  wrapper: {
    width: '48%',
    marginBottom: SPACING.md,
  },
  containerCompact: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    minHeight: 70,
  },
  container: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    minHeight: 100,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconGradient: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  textSection: {
    flex: 1,
  },
  titleCompact: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  valueCompact: {
    fontSize: 20,
    fontWeight: '700',
  },
});

export default KPICard;
