import React from 'react';
import { View, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS } from '../constants/theme';

const Loader = ({ visible, text = 'Loading...' }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.white }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.text, { color: colors.dark }]}>{text}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 200,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default Loader;
