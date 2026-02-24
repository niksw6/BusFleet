import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SHADOWS } from '../constants/theme';

const FAB = ({ icon = 'add', onPress, style, color, size = 56 }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: color || colors.primary,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        SHADOWS.lg,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialIcons name={icon} size={24} color="#fff" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
});

export default FAB;
