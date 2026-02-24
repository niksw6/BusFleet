import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

const DashboardCard = ({ title, count, icon, color, onPress }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.cardWrapper}>
      <Card
        style={[
          styles.card,
          { 
            backgroundColor: isDarkMode ? colors.card : colors.white,
            borderLeftColor: color,
            borderLeftWidth: 4,
          },
          SHADOWS.md,
        ]}
      >
        <View style={styles.cardContent}>
          <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
            <MaterialIcons name={icon} size={24} color={color} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.count, { color: isDarkMode ? colors.text : colors.dark }]}>{count || 0}</Text>
            <Text style={[styles.title, { color: isDarkMode ? colors.textSecondary : colors.gray }]} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    width: '31.5%',
    marginHorizontal: '0.75%',
    marginBottom: SPACING.xs,
  },
  card: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    elevation: 1,
  },
  cardContent: {
    padding: SPACING.sm,
    minHeight: 75,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  count: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 13,
  },
});

export default DashboardCard;
