import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING } from '../../constants/theme';

export const PriorityBadge = ({ priority, style }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const accent = colors.primary;

  return (
    <Chip
      mode="flat"
      style={[styles.badge, { backgroundColor: `${accent}18` }, style]}
      textStyle={{ color: accent, fontSize: 12, fontWeight: '600' }}
    >
      {priority}
    </Chip>
  );
};

export const StatusBadge = ({ status, statusName, style }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const accent = colors.primary;
  const statusLabelMap = {
    O: 'Open',
    I: 'In Progress',
    CM: 'Completed',
    C: 'Completed',
    D: 'Declined',
  };
  const displayText = statusName || statusLabelMap[status] || status;

  return (
    <Chip
      mode="flat"
      style={[styles.statusBadge, { backgroundColor: `${accent}18` }, style]}
      textStyle={{ color: accent, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 }}
    >
      {displayText}
    </Chip>
  );
};

const styles = StyleSheet.create({
  badge: {
    margin: 0,
    height: 32,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    margin: 0,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default { PriorityBadge, StatusBadge };
