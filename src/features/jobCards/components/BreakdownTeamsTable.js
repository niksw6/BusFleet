import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import PropTypes from 'prop-types';
import { masterService, complaintService } from '../../../api/services';
import { useSelector } from 'react-redux';

const columns = [
  'Area', 'Name', 'Phone Number', 'Complaint Bus Number', 'Depot', 'Current Location', 'Remarks', 'Availability Status'
];

const BreakdownTeamsTable = ({ companyDB, docEntry, onAssigned }) => {
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const user = useSelector(state => state.auth.user);

  useEffect(() => {
    if (companyDB && docEntry) fetchTeams();
  }, [companyDB, docEntry]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const resp = await masterService.getBreakdownTeams(companyDB, docEntry);
      const data = Array.isArray(resp?.Data) ? resp.Data : [];
      setTeams(data);
    } catch (e) {
      console.warn('Failed to fetch breakdown teams', e?.message || e);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (team) => {
    try {
      setLoading(true);
      const supervisorCode = String(user?.Code || user?.code || user?.UserCode || '').trim();
      const teamCode = team?.TeamCode || team?.Code || team?.teamCode || '';
      const resp = await complaintService.assignBreakdownTeam(companyDB, docEntry, supervisorCode, teamCode);
      if (onAssigned) onAssigned(team, resp);
    } catch (e) {
      console.warn('Assign breakdown team failed', e?.message || e);
      if (onAssigned) onAssigned(team, { Success: false, Message: e?.message || 'Assign failed' });
    } finally {
      setLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerRow}>
      {columns.map(col => (
        <Text key={col} style={[styles.headerCell]} numberOfLines={1}>{col}</Text>
      ))}
      <Text style={[styles.headerCell]}>Action</Text>
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <Text style={styles.cell} numberOfLines={1}>{item.Area || item.AreaName || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.Name || item.TeamName || item.TeamLeaderName || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.Phone || item.PhoneNo || item.Contact || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.ComplaintBusNo || item.BusNo || item.Bus || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.Depot || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.CurrentLocation || item.Location || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.Remarks || item.Rmk || ''}</Text>
      <Text style={styles.cell} numberOfLines={1}>{item.AvailabilityStatus || item.Status || ''}</Text>
      <View style={styles.actionCell}>
        <Button mode="contained" compact onPress={() => handleAssign(item)}>Assign</Button>
      </View>
    </View>
  );

  if (loading) return <ActivityIndicator animating={true} style={{ margin: 12 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Area Breakdown Teams</Text>
      {renderHeader()}
      <FlatList
        data={teams}
        keyExtractor={(it, idx) => `${it.TeamCode || it.Code || idx}`}
        renderItem={renderItem}
        ListEmptyComponent={() => <Text style={{ margin: 12 }}>No breakdown teams available</Text>}
      />
    </View>
  );
};

BreakdownTeamsTable.propTypes = {
  companyDB: PropTypes.string.isRequired,
  docEntry: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onAssigned: PropTypes.func,
};

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  title: { fontWeight: '700', marginBottom: 8 },
  headerRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#EEE' },
  headerCell: { flex: 1, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
  cell: { flex: 1, fontSize: 13 },
  actionCell: { width: 90, alignItems: 'flex-end' },
});

export default BreakdownTeamsTable;
