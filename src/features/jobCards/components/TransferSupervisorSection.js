import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import PropTypes from 'prop-types';
import { masterService } from '../../../api/services';

const TransferSupervisorSection = ({ companyDB, visible, onSelectDepot, onSelectSupervisor }) => {
  const [depots, setDepots] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [selectedDepot, setSelectedDepot] = useState(null);
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);

  useEffect(() => {
    if (visible) fetchDepots();
  }, [visible]);

  const fetchDepots = async () => {
    try {
      const resp = await masterService.getDepots(companyDB);
      const data = Array.isArray(resp?.Data) ? resp.Data : [];
      setDepots(data);
    } catch (e) {
      console.warn('getDepots failed', e?.message || e);
      setDepots([]);
    }
  };

  const handleDepotPick = async (depot) => {
    setSelectedDepot(depot);
    if (onSelectDepot) onSelectDepot(depot);
    try {
      const resp = await masterService.getSupervisorsByDepot(companyDB, depot?.Depot || depot?.Code || depot || '');
      const data = Array.isArray(resp?.Data) ? resp.Data : [];
      setSupervisors(data);
    } catch (e) {
      console.warn('getSupervisorsByDepot failed', e?.message || e);
      setSupervisors([]);
    }
  };

  const handleSupervisorPick = (s) => {
    setSelectedSupervisor(s);
    if (onSelectSupervisor) onSelectSupervisor(s);
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transfer to Nearest Supervisor</Text>
      <Text style={styles.hint}>Selecting a depot and depot-head will send a notification: "WE ARE TRANSFERRING THE INCIDENT TO THAT DEPOT HEAD."</Text>

      <View style={styles.buttonsRow}>
        {/* Simple quick-pick buttons for depots (UI can be upgraded to modal selector) */}
        {depots.slice(0, 4).map(d => (
          <Button key={d.Depot || d.Code || d.Name} mode={selectedDepot === d ? 'contained' : 'outlined'} onPress={() => handleDepotPick(d)} style={styles.depotBtn}>
            {d.Depot || d.Code || d.Name}
          </Button>
        ))}
      </View>

      <View style={styles.buttonsRow}>
        {supervisors.slice(0, 6).map(s => (
          <Button key={s.Code || s.EmpCode || s.UserCode} mode={selectedSupervisor === s ? 'contained' : 'outlined'} onPress={() => handleSupervisorPick(s)} style={styles.depotBtn}>
            {s.FirstName || s.Name || s.UserName || s.Code}
          </Button>
        ))}
      </View>

      <View style={{ marginTop: 8 }}>
        <Button mode="contained" onPress={() => {
          if (selectedDepot && selectedSupervisor) {
            // pass back selected objects
            onSelectDepot && onSelectDepot(selectedDepot);
            onSelectSupervisor && onSelectSupervisor(selectedSupervisor);
          }
        }}>Confirm Transfer Target</Button>
      </View>
    </View>
  );
};

TransferSupervisorSection.propTypes = {
  companyDB: PropTypes.string.isRequired,
  visible: PropTypes.bool,
  onSelectDepot: PropTypes.func,
  onSelectSupervisor: PropTypes.func,
};

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  title: { fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 12, color: '#666', marginBottom: 8 },
  buttonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  depotBtn: { marginRight: 8, marginBottom: 8 },
});

export default TransferSupervisorSection;
