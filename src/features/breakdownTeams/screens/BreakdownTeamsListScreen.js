import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { masterService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { useSelector } from 'react-redux';

const BreakdownTeamsListScreen = ({ route, navigation }) => {
  const { docEntry } = route.params || {};
  const dbName = useSelector(s => s.auth.dbName);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await masterService.getBreakdownTeams(dbName || 'MUTSPL_TEST', docEntry || 0);
        if (resp?.Success) setTeams(resp.Data || []);
      } catch (e) {
        console.warn('Failed to load breakdown teams:', e?.message || e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbName, docEntry]);

  if (loading) return <Loader />;

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <FlatList
        data={teams}
        keyExtractor={(item, i) => String(item?.TeamCode || item?.Code || i)}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 10 }}>
            <Card.Title title={item.Name || item.TeamName || item.FirstName} subtitle={`${item.Area || ''} • ${item.Depot || ''}`} />
            <Card.Content>
              <Text>Phone: {item.PhoneNumber || item.Phone || item.Mobile || '-'}</Text>
              <Text>Complaint Bus: {item.ComplaintBusNumber || item.BusNo || '-'}</Text>
              <Text>Current Location: {item.CurrentLocation || item.Location || '-'}</Text>
              <Text>Remarks: {item.Remarks || item.Note || '-'}</Text>
              <Text>Status: {item.AvailabilityStatus || item.Status || '-'}</Text>
            </Card.Content>
            <Card.Actions>
              <Button onPress={() => navigation.navigate('BreakdownPortal', { teamCode: item.TeamCode || item.Code })}>Open Portal</Button>
            </Card.Actions>
          </Card>
        )}
      />
    </View>
  );
};

export default BreakdownTeamsListScreen;
