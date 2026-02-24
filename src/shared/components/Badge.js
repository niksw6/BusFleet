import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING } from '../../constants/theme';
import { getPriorityColor, getStatusColor } from '../../utils/helpers';

export const PriorityBadge = ({ priority, style }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const color = getPriorityColor(priority, isDarkMode);

  return (
    <Chip
      mode="flat"
      style={[styles.badge, { backgroundColor: color + '20' }, style]}
      textStyle={{ color, fontSize: 12, fontWeight: '600' }}
    >
      {priority}
    </Chip>
  );
};

export const StatusBadge = ({ status, statusName, style }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  
  // Map status to colors with better visibility
  const getStatusStyle = (status) => {
    const statusMap = {
      'O': { bg: '#0070F2', text: '#fff', label: 'Open' },          // Blue
      'I': { bg: '#FF9500', text: '#fff', label: 'In Progress' },   // Orange
      'CM': { bg: '#2B7D2B', text: '#fff', label: 'Completed' },    // Green
      'C': { bg: '#2B7D2B', text: '#fff', label: 'Completed' },     // Green
      'D': { bg: '#BB0000', text: '#fff', label: 'Declined' },      // Red
    };
    return statusMap[status] || { bg: '#6A6D70', text: '#fff', label: status };
  };
  
  const statusStyle = getStatusStyle(status);
  const displayText = statusName || statusStyle.label;

  return (
    <Chip
      mode="flat"
      style={[styles.statusBadge, { backgroundColor: statusStyle.bg }, style]}
      textStyle={{ color: statusStyle.text, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 }}
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
