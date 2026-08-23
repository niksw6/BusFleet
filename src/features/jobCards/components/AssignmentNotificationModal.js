import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal, Text, Button, Provider } from 'react-native-paper';
import PropTypes from 'prop-types';
import { masterService } from '../../../api/services';

const AssignmentNotificationModal = ({ visible, onDismiss, assignment, companyDB, onDecision }) => {
  if (!assignment) return null;

  const handleDecision = async (decision) => {
    try {
      const payload = {
        BreakdownNo: assignment?.BreakdownNo || assignment?.BreakdownId || assignment?.DocEntry || 0,
        TeamCode: assignment?.TeamCode || assignment?.Team || '',
        EmpCode: assignment?.EmpCode || assignment?.UserCode || '',
        Decision: decision === 'accept' ? 'A' : 'R',
        Remarks: decision === 'accept' ? 'Accepted via app' : 'Rejected via app',
      };
      const resp = await masterService.respondBreakdownTeamAssignment(companyDB, payload);
      if (onDecision) onDecision(decision, resp);
    } catch (e) {
      if (onDecision) onDecision(decision, { Success: false, Message: e?.message || e });
    }
  };

  return (
    <Provider>
      <Portal>
        <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
          <Text style={styles.title}>Assignment Notification</Text>
          <Text style={styles.message}>{assignment?.Message || `You have an assignment for breakdown #${assignment?.BreakdownNo || assignment?.DocEntry}`}</Text>

          <View style={styles.actionsRow}>
            <Button mode="contained" onPress={() => handleDecision('accept')}>ACCEPT</Button>
            <Button mode="outlined" onPress={() => handleDecision('reject')}>REJECT</Button>
          </View>
        </Modal>
      </Portal>
    </Provider>
  );
};

AssignmentNotificationModal.propTypes = {
  visible: PropTypes.bool,
  onDismiss: PropTypes.func,
  assignment: PropTypes.object,
  companyDB: PropTypes.string,
  onDecision: PropTypes.func,
};

const styles = StyleSheet.create({
  container: { backgroundColor: 'white', padding: 18, margin: 20, borderRadius: 8 },
  title: { fontWeight: '700', marginBottom: 8 },
  message: { marginBottom: 12 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});

export default AssignmentNotificationModal;
