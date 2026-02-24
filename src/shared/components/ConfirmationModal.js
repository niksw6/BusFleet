import React from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../constants/theme';

const ConfirmationModal = ({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor,
}) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.white }]}>
          <Text style={[styles.title, { color: colors.dark }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.gray }]}>{message}</Text>
          
          <View style={styles.buttonContainer}>
            <Button
              mode="outlined"
              onPress={onCancel}
              style={styles.button}
              labelStyle={{ color: colors.gray }}
            >
              {cancelText}
            </Button>
            <Button
              mode="contained"
              onPress={onConfirm}
              style={[styles.button, { backgroundColor: confirmColor || colors.primary }]}
            >
              {confirmText}
            </Button>
          </View>
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
    padding: SPACING.md,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: 16,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  button: {
    minWidth: 100,
  },
});

export default ConfirmationModal;
