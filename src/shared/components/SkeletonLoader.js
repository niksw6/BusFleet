import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS } from '../../constants/theme';

const SkeletonLoader = ({ width = '100%', height = 20, borderRadius = 8, style }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  
  const animatedValue = new Animated.Value(0);

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.grayLight,
          opacity,
        },
        style,
      ]}
    />
  );
};

export const CardSkeleton = () => {
  return (
    <View style={styles.cardSkeleton}>
      <SkeletonLoader width="60%" height={24} style={{ marginBottom: 12 }} />
      <SkeletonLoader width="100%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonLoader width="80%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonLoader width="40%" height={14} />
    </View>
  );
};

export const ListSkeleton = ({ count = 5 }) => {
  return (
    <View>
      {Array(count).fill(0).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
  cardSkeleton: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    elevation: 2,
  },
});

export default SkeletonLoader;
