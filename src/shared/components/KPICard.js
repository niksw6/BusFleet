import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialIcons from './AppIcon.js';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../constants/theme';

/**
 * KPI Card Component
 * Compact, simple and classy flat design
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
  const accent = iconColor || colors.primary;
  const alpha = (hexColor, alphaHex = '14') => (
    typeof hexColor === 'string' && hexColor.startsWith('#') && (hexColor.length === 7 || hexColor.length === 4)
      ? `${hexColor}${alphaHex}`
      : hexColor
  );

  const cardContent = (
    <View style={[
      compact ? styles.containerCompact : styles.container,
      { backgroundColor: colors.white, borderColor: colors.border || COLORS.border },
      styles.shadow
    ]}>
      <View style={styles.row}>
        <View style={[styles.iconGradient, { backgroundColor: alpha(accent, '14') }]}>
          <MaterialIcons name={icon} size={20} color={accent} />
        </View>
        
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
    borderWidth: 1,
    padding: SPACING.sm,
    minHeight: 70,
  },
  container: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
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

