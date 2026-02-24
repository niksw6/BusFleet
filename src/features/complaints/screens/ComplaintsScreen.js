import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Text, Searchbar, Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';

import { PriorityBadge } from '../../../shared/components/Badge';
import FAB from '../../../shared/components/FAB';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, truncateText, getStatusName, getComplaintTypeBadge } from '../../../utils/helpers';
import { complaintService } from '../../../api/services';

const ComplaintsScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [complaints, setComplaints] = useState([]);
  const [filteredComplaints, setFilteredComplaints] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(route.params?.initialFilter || 'All');
  const [dataType, setDataType] = useState(route.params?.type || 'all'); // Default to 'all'

  useEffect(() => {
    fetchComplaints();
  }, []); // Only fetch once on mount

  useEffect(() => {
    // Update navigation title based on type
    navigation.setOptions({
      title: 'Incidents',
    });
  }, [dataType, navigation]);

  // Update filter and type when route params change
  useEffect(() => {
    if (route.params?.initialFilter) {
      setSelectedFilter(route.params.initialFilter);
    }
    if (route.params?.type) {
      setDataType(route.params.type);
    }
  }, [route.params?.initialFilter, route.params?.type]);

  useEffect(() => {
    filterComplaints();
  }, [searchQuery, selectedFilter, complaints, dataType]); // Added dataType

  const fetchComplaints = async () => {
    try {
      // Fetch all incidents (no type filter - get both complaints and breakdowns)
      const response = await complaintService.getIncidents(
        dbName || 'MUTSPL_TEST',
        null, // status (fetch all, filter locally)
        null  // type (fetch all, filter locally)
      );
      
      console.log('📋 Incidents API Response:', response);
      
      if (response.Success && Array.isArray(response.Data)) {
        // Normalize field names from GetIncidents API to match component expectations
        const normalizedData = response.Data.map(item => ({
          ...item,
          ComplaintNo: item.DocEntry,           // Map DocEntry to ComplaintNo
          ComplaintDate: item.IncidentDate,     // Map IncidentDate to ComplaintDate
          ComplaintTime: item.IncidentTime,     // Map IncidentTime to ComplaintTime
          JobCardNo: item.JobCardNo || item.JobcardNo || '',
        }));
        setComplaints(normalizedData);
      } else if (Array.isArray(response)) {
        setComplaints(response);
      } else {
        setComplaints([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setComplaints([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchComplaints();
    setRefreshing(false);
  };

  const filterComplaints = () => {
    let filtered = complaints;

    // Filter by type (breakdowns or complaints)
    if (dataType === 'breakdowns') {
      filtered = filtered.filter(c => c.ComplaintType === 'Breakdown');
    } else if (dataType === 'complaints') {
      filtered = filtered.filter(c => c.ComplaintType === 'Driver Complaints');
    }
    // If dataType is 'all' or unset, show everything

    // Filter by status
    if (selectedFilter !== 'All') {
      filtered = filtered.filter(c => c.Status === selectedFilter);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.BusNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.ComplaintType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.Priority?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredComplaints(filtered);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'O': return '#0070F2'; // Blue - Open
      case 'I': return '#FF9500'; // Orange - In Progress
      case 'C': return '#2B7D2B'; // Green - Completed
      case 'CM': return '#2B7D2B'; // Green - Completed
      case 'D': return '#BB0000'; // Red - Declined
      default: return '#6A6D70'; // Gray
    }
  };

  const getIncidentTypeCode = (complaintType) => {
    const value = String(complaintType || '').toLowerCase();
    if (value.includes('breakdown')) return 'B';
    if (value.includes('driver')) return 'D';
    return 'D';
  };

  const renderComplaintCard = ({ item }) => {
    const typeBadge = getComplaintTypeBadge(item.ComplaintType);
    const incidentTypeCode = getIncidentTypeCode(item.ComplaintType);
    
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.white, borderLeftColor: typeBadge.color, borderLeftWidth: 4 }]}
        onPress={() => navigation.navigate('ComplaintDetail', { 
          complaintNo: item.ComplaintNo, 
          dbName: dbName || 'MUTSPL_TEST',
          complaintType: item.ComplaintType,
          jobCardNo: item.JobCardNo || item.JobcardNo || ''
        })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.incidentTitleBar, { backgroundColor: typeBadge.color + '15' }]}>
            <Text style={[styles.incidentTitleText, { color: colors.dark }]}>
              Incident #{incidentTypeCode}-{item.ComplaintNo || '-'}
            </Text>
            <Text style={[styles.incidentSubtitleText, { color: colors.gray }]}>Bus #{item.BusNo || '-'}</Text>
          </View>
        </View>

        {/* Complaint Type Badge */}
        <View style={styles.typeRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeBadge.color + '15' }]}>
            <MaterialIcons name={typeBadge.icon} size={14} color={typeBadge.color} />
            <Text style={[styles.typeText, { color: typeBadge.color }]}>
              {typeBadge.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.dateContainer}>
            <MaterialIcons name="calendar-today" size={14} color={colors.gray} />
            <Text style={[styles.date, { color: colors.gray }]}>
              {item.ComplaintDate} {item.ComplaintTime}
            </Text>
          </View>
          <View style={styles.footerBadgesRow}>
            <View style={[styles.priorityBadge, { backgroundColor: getStatusColor(item.Status) }]}>
              <Text style={styles.priorityText}>{getStatusName(item.Status)}</Text>
            </View>
            <View style={[styles.priorityBadge, styles.footerPriorityBadge, { backgroundColor: item.Priority === 'High' ? '#BB0000' : item.Priority === 'Medium' ? '#FF9500' : '#2B7D2B' }]}>
              <Text style={styles.priorityText}>{item.Priority}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filters = [
    { key: 'All', label: 'All' },
    { key: 'O', label: 'Open' },
    { key: 'I', label: 'In Progress' },
    { key: 'CM', label: 'Completed' },
    { key: 'D', label: 'Declined' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="Incidents"
        subtitle={`${filteredComplaints.length} ${
          dataType === 'breakdowns' ? 'Breakdown' : 
          dataType === 'complaints' ? 'Complaint' : 
          'Incident'
        }${filteredComplaints.length !== 1 ? 's' : ''}`}
        onMenuPress={() => navigation.openDrawer()}
        onNotificationPress={() => navigation.navigate('Notifications')}
        showNotifications={true}
        useGradient={true}
      />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search incidents..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      {/* Type Filter - All / Complaints / Breakdowns */}
      <View style={styles.typeFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip
            selected={dataType === 'all'}
            onPress={() => setDataType('all')}
            style={[
              styles.typeChip,
              dataType === 'all' && { backgroundColor: colors.primary },
            ]}
            textStyle={{
              color: dataType === 'all' ? '#fff' : colors.dark,
              fontWeight: dataType === 'all' ? '600' : '400',
            }}
          >
            All Incidents
          </Chip>
          <Chip
            selected={dataType === 'complaints'}
            onPress={() => setDataType('complaints')}
            style={[
              styles.typeChip,
              dataType === 'complaints' && { backgroundColor: '#3B82F6' },
            ]}
            textStyle={{
              color: dataType === 'complaints' ? '#fff' : colors.dark,
              fontWeight: dataType === 'complaints' ? '600' : '400',
            }}
          >
            Driver Complaints
          </Chip>
          <Chip
            selected={dataType === 'breakdowns'}
            onPress={() => setDataType('breakdowns')}
            style={[
              styles.typeChip,
              dataType === 'breakdowns' && { backgroundColor: '#EF4444' },
            ]}
            textStyle={{
              color: dataType === 'breakdowns' ? '#fff' : colors.dark,
              fontWeight: dataType === 'breakdowns' ? '600' : '400',
            }}
          >
            Breakdowns
          </Chip>
        </ScrollView>
      </View>

      {/* Status Filter */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((filter) => (
            <Chip
              key={filter.key}
              selected={selectedFilter === filter.key}
              onPress={() => setSelectedFilter(filter.key)}
              style={[
                styles.filterChip,
                selectedFilter === filter.key && { backgroundColor: colors.primary },
              ]}
              textStyle={{
                color: selectedFilter === filter.key ? '#fff' : colors.gray,
              }}
            >
              {filter.label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredComplaints}
        renderItem={renderComplaintCard}
        keyExtractor={(item, index) => `${item.DocEntry}-${item.ComplaintType}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="inbox" size={64} color={colors.gray} />
            <Text style={[styles.emptyText, { color: colors.gray }]}>
              No {dataType === 'breakdowns' ? 'breakdowns' : dataType === 'complaints' ? 'complaints' : 'incidents'} found
            </Text>
          </View>
        }
      />

      <FAB
        icon="add"
        onPress={() => navigation.navigate('CreateIncident', { type: dataType === 'breakdowns' ? 'breakdown' : 'complaint' })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: SPACING.sm,
  },
  searchBar: {
    elevation: 2,
    borderRadius: 10,
  },
  typeFilterContainer: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  typeChip: {
    marginRight: SPACING.xs,
    height: 36,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  filterChip: {
    marginRight: SPACING.xs,
  },
  listContent: {
    padding: SPACING.sm,
    paddingBottom: 100,
  },
  card: {
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  incidentTitleBar: {
    width: '100%',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  incidentTitleText: {
    fontSize: 16,
    fontWeight: '700',
  },
  incidentSubtitleText: {
    fontSize: 12,
    marginTop: 2,
  },
  vehicleNumber: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  complaintNo: {
    fontSize: 12,
    marginTop: 2,
  },
  typeRow: {
    marginBottom: SPACING.xs,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  subject: {
    fontSize: 16,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  date: {
    fontSize: 12,
    marginLeft: 4,
  },
  priorityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  footerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerPriorityBadge: {
    marginLeft: SPACING.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
});

export default ComplaintsScreen;
