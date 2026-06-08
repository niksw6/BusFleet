import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';

import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

const StandardListCard = ({
  children,
  onPress,
  accentColor,
  style,
  contentStyle,
  activeOpacity = 0.8,
  disabled = false,
}) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const containerStyle = [
    styles.card,
    {
      backgroundColor: colors.white,
      borderLeftColor: accentColor || colors.primary,
      borderColor: isDarkMode ? colors.grayLight : colors.border,
    },
    SHADOWS.sm,
    style,
  ];

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        style={containerStyle}
        onPress={onPress}
        activeOpacity={activeOpacity}
      >
        <View style={contentStyle}>{children}</View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={containerStyle}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
  },
});

export default StandardListCard;
