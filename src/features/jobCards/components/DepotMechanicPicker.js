import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import PropTypes from 'prop-types';
import { complaintService, masterService } from '../../../api/services';

const DepotMechanicPicker = ({ companyDB, depotCode, onAssign }) => {
  const [loading, setLoading] = useState(false);
  const [mechanics, setMechanics] = useState([]);

  useEffect(() => {
    if (companyDB && depotCode) fetchMechanics();
  }, [companyDB, depotCode]);

  const fetchMechanics = async () => {
    try {
      setLoading(true);
      const all = await complaintService.getMechanics(companyDB);
      const rows = Array.isArray(all?.Data) ? all.Data : [];
      // Filter by depot key presence
      const filtered = rows.filter(r => {
        const rDepot = (r.Depot || r.AssignedDepot || r.Branch || r.BranchNm || '').toString();
        return String(rDepot).toLowerCase().includes(String(depotCode).toLowerCase());
      });
      setMechanics(filtered.length > 0 ? filtered : rows);
    } catch (e) {
      console.warn('Failed getMechanics', e?.message || e);
      setMechanics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (mechanic) => {
    if (!mechanic) return;
    try {
      setLoading(true);
      // Build minimal payload for RespondBreakdownTeamAssignment
      const payload = {
        BreakdownNo: 0,
        TeamCode: '',
        EmpCode: mechanic.Code || mechanic.EmpCode || mechanic.UserCode || '',
        Decision: 'A',
        Remarks: 'Assigned by supervisor via UI',
      };
      const resp = await masterService.respondBreakdownTeamAssignment(companyDB, payload);
      if (onAssign) onAssign(mechanic, resp);
    } catch (e) {
      console.warn('RespondBreakdownTeamAssignment failed', e?.message || e);
      if (onAssign) onAssign(mechanic, { Success: false, Message: e?.message || 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator animating style={{ margin: 10 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Depot Mechanics</Text>
      <FlatList
        data={mechanics}
        keyExtractor={(i, idx) => String(i.Code || i.EmpCode || i.UserCode || idx)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.FirstName || item.Name || item.EmpName || 'Unnamed'}</Text>
              {item.Code ? <Text style={styles.meta}>Code: {item.Code}</Text> : null}
              {item.Depot ? <Text style={styles.meta}>Depot: {item.Depot}</Text> : null}
            </View>
            <Button mode="outlined" compact onPress={() => handleAssign(item)}>Assign</Button>
          </View>
        )}
        ListEmptyComponent={() => <Text style={{ margin: 12 }}>No mechanics found</Text>}
      />
    </View>
  );
};

DepotMechanicPicker.propTypes = {
  companyDB: PropTypes.string.isRequired,
  depotCode: PropTypes.string,
  onAssign: PropTypes.func,
};

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  title: { fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  name: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666' },
});

export default DepotMechanicPicker;
