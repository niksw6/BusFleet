import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { masterService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { useSelector } from 'react-redux';

const BreakdownTeamPortalScreen = ({ route, navigation }) => {
  const { teamCode } = route.params || {};
  const dbName = useSelector(s => s.auth.dbName);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Backend contract: GetBreakdownTeams with team filter may return assignments
        const resp = await masterService.getBreakdownTeams(dbName || 'MUTSPL_TEST', 0);
        if (resp?.Success) {
          const rows = (resp.Data || []).filter(r => String(r.TeamCode || r.Code || '').trim() === String(teamCode || '').trim());
          setAssignments(rows);
        }
      } catch (e) {
        console.warn('Failed to load portal assignments:', e?.message || e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbName, teamCode]);

  if (loading) return <Loader />;

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Text style={{ marginBottom: 8 }}>Team Code: {teamCode}</Text>
      <FlatList
        data={assignments}
        keyExtractor={(item, i) => String(item?.AssignmentId || item?.DocEntry || i)}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Card.Title title={item.ComplaintBusNumber || item.BusNo || 'Assignment'} subtitle={`${item.Depot || ''} • ${item.Area || ''}`} />
            <Card.Content>
              <Text>Location: {item.CurrentLocation || item.Location || '-'}</Text>
              <Text>Remarks: {item.Remarks || '-'}</Text>
              <Text>Status: {item.AvailabilityStatus || item.Status || '-'}</Text>
            </Card.Content>
            <Card.Actions>
              <Button mode="contained" onPress={async () => {
                try {
                  await masterService.respondBreakdownTeamAssignment(dbName || 'MUTSPL_TEST', { BreakdownNo: item.DocEntry || item.BreakdownNo, TeamCode: teamCode, EmpCode: item.EmpCode || '' , Decision: 'Accepted' });
                  navigation.goBack();
                } catch (e) {
                  console.warn('Respond failed:', e?.message || e);
                }
              }}>Accept</Button>
              <Button onPress={async () => {
                try {
                  await masterService.respondBreakdownTeamAssignment(dbName || 'MUTSPL_TEST', { BreakdownNo: item.DocEntry || item.BreakdownNo, TeamCode: teamCode, EmpCode: item.EmpCode || '' , Decision: 'Rejected' });
                  navigation.goBack();
                } catch (e) {
                  console.warn('Respond failed:', e?.message || e);
                }
              }}>Reject</Button>
            </Card.Actions>
          </Card>
        )}
      />
    </View>
  );
};

export default BreakdownTeamPortalScreen;
