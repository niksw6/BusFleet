import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Text, Searchbar, Chip, Menu } from 'react-native-paper';
import { useSelector } from 'react-redux';
import MaterialIcons from '../../../shared/components/AppIcon.js';

import { PriorityBadge } from '../../../shared/components/Badge';
import FAB from '../../../shared/components/FAB';
import StandardListCard from '../../../shared/components/StandardListCard';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { formatDate, truncateText, getStatusName, getComplaintTypeBadge } from '../../../utils/helpers';
import { complaintService, maintenanceService } from '../../../api/services';
import { isSupervisorUser, isDriverUser } from '../../../utils/roleAccess';

const normalizeStatusFilter = (filter) => {
  if (filter === 'C') return 'CM';
  return filter || 'All';
};

const normalizeDataType = (type) => {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return 'all';
  if (normalized.includes('breakdown')) return 'breakdowns';
  if (normalized.includes('preventive')) return 'preventive';
  if (normalized.includes('complaint')) return 'complaints';
  if (normalized === 'all') return 'all';
  return 'all';
};

const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();

const getSortableIncidentTimestamp = (item) => {
  const dateCandidates = [
    item?.IncidentDate,
    item?.ComplaintDate,
    item?.RegDate,
    item?.Date,
    item?.CreatedDate,
  ];
  const timeCandidates = [
    item?.IncidentTime,
    item?.ComplaintTime,
    item?.RegTime,
    item?.Time,
    item?.CreatedTime,
  ];

  const rawDate = String(dateCandidates.find(Boolean) || '').trim();
  const rawTime = String(timeCandidates.find(Boolean) || '').trim();

  if (!rawDate) return 0;

  const cleanedDate = rawDate.replace(/\//g, '-');
  const match = cleanedDate.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return 0;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const digitsOnly = String(rawTime).replace(/\D/g, '');
  const hour = Number(digitsOnly.slice(0, 2) || '0');
  const minute = Number(digitsOnly.slice(2, 4) || '0');

  const ts = Date.UTC(year, month - 1, day, hour, minute, 0);
  return Number.isFinite(ts) ? ts : 0;
};

const matchesDriverIncident = (incident, driverIdentity, driverDisplayName) => {
  const codeCandidates = [
    incident?.DrvCode,
    incident?.DriverCode,
    incident?.Driver,
    incident?.DriverId,
    incident?.CreatedByCode,
    incident?.CreatedBy,
    incident?.UserCode,
    incident?.User,
    incident?.ReportedByCode,
    incident?.RegBy,
  ].map(normalizeIdentity).filter(Boolean);

  const nameCandidates = [
    incident?.DrvName,
    incident?.DriverName,
    incident?.Driver,
    incident?.CreatedByName,
    incident?.ReportedBy,
    incident?.UserName,
    incident?.CreatedBy,
  ].map(normalizeIdentity).filter(Boolean);

  // Backend sometimes returns user-scoped incident rows without explicit driver fields.
  // In that case, keep the record rather than dropping valid "My Incidents" rows.
  const hasIdentityFields = codeCandidates.length > 0 || nameCandidates.length > 0;
  if (!hasIdentityFields) {
    return true;
  }

  const codeMatch = driverIdentity && codeCandidates.includes(driverIdentity);
  const nameMatch = driverDisplayName && nameCandidates.includes(driverDisplayName);
  return Boolean(codeMatch || nameMatch);
};

const mapSchedulerDateTime = (lastServiceDate) => {
  if (!lastServiceDate) {
    return { date: '-', time: '' };
  }

  const parsedDate = new Date(lastServiceDate);
  if (Number.isNaN(parsedDate.getTime())) {
    const raw = String(lastServiceDate);
    const split = raw.split(' ');
    return {
      date: split[0] || raw,
      time: split.length > 1 ? split.slice(1).join(' ') : '',
    };
  }

  const date = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
  const hours = parsedDate.getHours();
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
  const amPm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return {
    date,
    time: `${hour12}:${minutes} ${amPm}`,
  };
};

const ComplaintsScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  const supervisorUser = isSupervisorUser(user);
  const driverUser = isDriverUser(user);
  const driverIdentity = String(user?.Code || user?.code || user?.User || user?.user || '').trim().toLowerCase();
  const driverDisplayName = String(user?.name || user?.Name || user?.FirstName || '').trim().toLowerCase();
  const selectedChipTextColor = colors.white || COLORS.white;

  const [complaints, setComplaints] = useState([]);
  const [preventiveMaintenances, setPreventiveMaintenances] = useState([]);
  const [filteredComplaints, setFilteredComplaints] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(normalizeStatusFilter(route.params?.initialFilter));
  const [dataType, setDataType] = useState(normalizeDataType(route.params?.type));
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);

  const typeOptions = [
    { key: 'all', label: 'All Incidents' },
    { key: 'complaints', label: 'Driver Complaints' },
    { key: 'breakdowns', label: 'Breakdown' },
    { key: 'preventive', label: 'Preventive Maintenance' },
  ];

  const selectedTypeLabel = typeOptions.find(option => option.key === dataType)?.label || 'All Incidents';

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
      setSelectedFilter(normalizeStatusFilter(route.params.initialFilter));
    }
    if (Object.prototype.hasOwnProperty.call(route.params || {}, 'type')) {
      setDataType(normalizeDataType(route.params?.type));
    }
  }, [route.params?.initialFilter, route.params?.type]);

  useEffect(() => {
    filterComplaints();
  }, [searchQuery, selectedFilter, complaints, preventiveMaintenances, dataType]);

  const fetchComplaints = async () => {
    try {
      const companyDb = dbName || 'MUTSPL_TEST';
      const shouldFetchSchedulers = !driverUser;

      const [incidentsResponse, serviceSchedulersResponse] = await Promise.all([
        complaintService.getIncidents(
          companyDb,
          null,
          null,
        ),
        shouldFetchSchedulers
          ? maintenanceService.getServiceSchedulers(companyDb)
          : Promise.resolve({ Success: true, Data: [] }),
      ]);

      console.log('📋 Incidents API Response:', incidentsResponse);
      console.log('🛠️ ServiceSchedulers API Response:', serviceSchedulersResponse);

      if (incidentsResponse?.Success && Array.isArray(incidentsResponse.Data)) {
        // Normalize field names from GetIncidents API to match component expectations
        const normalizedData = incidentsResponse.Data.map(item => ({
          ...item,
          ComplaintNo: item.DocEntry,           // Map DocEntry to ComplaintNo
          ComplaintDate: item.IncidentDate,     // Map IncidentDate to ComplaintDate
          ComplaintTime: item.IncidentTime,     // Map IncidentTime to ComplaintTime
          JobCardNo: item.JobCardNo || item.JobcardNo || '',
        }));
        setComplaints(normalizedData);
      } else if (Array.isArray(incidentsResponse)) {
        setComplaints(incidentsResponse);
      } else {
        setComplaints([]);
      }

      if (serviceSchedulersResponse?.Success && Array.isArray(serviceSchedulersResponse.Data)) {
        const normalizedPreventiveList = serviceSchedulersResponse.Data.map((schedulerItem, index) => {
          const { date, time } = mapSchedulerDateTime(schedulerItem.LastSrvDt);
          return {
            ComplaintNo: schedulerItem.Code || schedulerItem.BusNo || `M-${index + 1}`,
            ComplaintType: 'Preventive Maintenance',
            ComplaintDate: date,
            ComplaintTime: time,
            BusNo: schedulerItem.BusNo || schedulerItem.Code || '-',
            Priority: 'Medium',
            Status: String(schedulerItem.Active || '').toUpperCase() === 'Y' ? 'O' : 'D',
            JobCardNo: '',
            Active: schedulerItem.Active,
            LastSrvDt: schedulerItem.LastSrvDt,
            LastSrvKM: schedulerItem.LastSrvKM,
            _source: 'scheduler',
          };
        });
        setPreventiveMaintenances(normalizedPreventiveList);
      } else {
        setPreventiveMaintenances([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setComplaints([]);
      setPreventiveMaintenances([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchComplaints();
    setRefreshing(false);
  };

  const filterComplaints = () => {
    let filtered = [];

    if (driverUser) {
      filtered = [...complaints];
      filtered = filtered.filter((c) => matchesDriverIncident(c, driverIdentity, driverDisplayName));
    } else {
      filtered = dataType === 'preventive'
        ? [...preventiveMaintenances]
        : [...complaints, ...preventiveMaintenances];
    }

    if (dataType === 'breakdowns') {
      filtered = filtered.filter(c => String(c.ComplaintType || '').toLowerCase().includes('breakdown'));
    } else if (dataType === 'preventive') {
      filtered = filtered.filter(c => String(c.ComplaintType || '').toLowerCase().includes('preventive'));
    } else if (dataType === 'complaints') {
      filtered = filtered.filter(c => {
        const complaintType = String(c.ComplaintType || '').toLowerCase();
        return complaintType === 'driver complaints' || complaintType.includes('driver complaint');
      });
    }

    if (selectedFilter !== 'All') {
      if (selectedFilter === 'CM') {
        filtered = filtered.filter(c => c.Status === 'CM' || c.Status === 'C');
      } else {
        filtered = filtered.filter(c => c.Status === selectedFilter);
      }
    }

    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.BusNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(c.ComplaintNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.ComplaintType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.Priority?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    filtered.sort((a, b) => getSortableIncidentTimestamp(b) - getSortableIncidentTimestamp(a));
    setFilteredComplaints(filtered);
  };

  const getStatusColor = () => colors.primary;

  const getPriorityColor = () => colors.primary;

  const getIncidentTypeCode = (complaintType) => {
    const value = String(complaintType || '').toLowerCase();
    if (value.includes('breakdown')) return 'B';
    if (value.includes('preventive')) return 'M';
    if (value.includes('driver')) return 'D';
    return 'D';
  };

  const renderComplaintCard = ({ item }) => {
    const typeBadge = getComplaintTypeBadge(item.ComplaintType);
    const incidentTypeCode = getIncidentTypeCode(item.ComplaintType);
    
    return (
      <StandardListCard
        accentColor={colors.primary}
        onPress={() => {
          navigation.navigate('ComplaintDetail', {
            complaintNo: item.ComplaintNo,
            dbName: dbName || 'MUTSPL_TEST',
            complaintType: item.ComplaintType,
            jobCardNo: item.JobCardNo || item.JobcardNo || '',
            source: item._source || 'incident',
            busNo: item.BusNo || '',
            lastSrvDt: item.LastSrvDt || '',
            lastSrvKM: item.LastSrvKM || 0,
            active: item.Active || 'Y',
          });
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.incidentTitleBar}>
            <Text style={[styles.incidentTitleText, { color: colors.dark }]}>
              Incident #{incidentTypeCode}-{item.ComplaintNo || '-'}
            </Text>
            <Text style={[styles.incidentSubtitleText, { color: colors.gray }]}>Bus #{item.BusNo || '-'}</Text>
          </View>
        </View>

        {/* Complaint Type Badge */}
        <View style={styles.typeRow}>
          <View style={[styles.typeBadge, { backgroundColor: `${colors.primary}12` }]}>
            <MaterialIcons name={typeBadge.icon} size={14} color={colors.primary} />
            <Text style={[styles.typeText, { color: colors.primary }]}>
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
            <View style={[styles.priorityBadge, { backgroundColor: `${getStatusColor(item.Status)}15` }]}>
              <Text style={[styles.priorityText, { color: colors.primary }]}>{getStatusName(item.Status)}</Text>
            </View>
            <View style={[styles.priorityBadge, styles.footerPriorityBadge, { backgroundColor: `${getPriorityColor(item.Priority)}15` }]}>
              <Text style={[styles.priorityText, { color: colors.primary }]}>{item.Priority}</Text>
            </View>
          </View>
        </View>
      </StandardListCard>
    );
  };

  const filters = [
    { key: 'All', label: 'All' },
    { key: 'O', label: 'Open' },
    { key: 'I', label: 'In Progress' },
    { key: 'CM', label: 'Completed' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title={driverUser ? 'My Incidents' : 'Incidents'}
        subtitle={`${filteredComplaints.length} ${
          dataType === 'breakdowns' ? 'Breakdown' : 
          dataType === 'preventive' ? 'Preventive Maintenance' :
          dataType === 'complaints' ? 'Complaint' : 
          'Incident'
        }${filteredComplaints.length !== 1 ? 's' : ''}`}
        onMenuPress={() => navigation.openDrawer()}
        onNotificationPress={() => navigation.navigate('Notifications')}
        showNotifications={true}
        useGradient={false}
      />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search by bus, incident no, type..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="search"
          clearIcon="close"
          onClearIconPress={() => setSearchQuery('')}
          inputStyle={styles.searchInput}
          style={[
            styles.searchBar,
            { backgroundColor: colors.white, borderColor: colors.border || COLORS.border, borderWidth: 1 },
          ]}
        />
      </View>

      {/* Type Filter Dropdown */}
      <View style={[styles.typeFilterContainer, { borderBottomColor: colors.border || COLORS.border }]}>
        <View style={styles.typeFilterRow}>
          <Text style={[styles.typeFilterLabel, { color: colors.gray }]}>Type</Text>
          <Menu
            visible={typeMenuVisible}
            onDismiss={() => setTypeMenuVisible(false)}
            anchor={
              <TouchableOpacity
                style={[styles.typeDropdownButton, { backgroundColor: colors.white, borderColor: colors.border || COLORS.border }]}
                onPress={() => setTypeMenuVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeDropdownText, { color: colors.dark }]} numberOfLines={1}>
                  {selectedTypeLabel}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={20} color={colors.gray} />
              </TouchableOpacity>
            }
          >
            {typeOptions.map((option) => (
              <Menu.Item
                key={option.key}
                title={option.label}
                onPress={() => {
                  setDataType(option.key);
                  setTypeMenuVisible(false);
                }}
              />
            ))}
          </Menu>
        </View>
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
                { backgroundColor: colors.white, borderColor: colors.border || COLORS.border },
                selectedFilter === filter.key && { backgroundColor: colors.primary },
              ]}
              textStyle={{
                color: selectedFilter === filter.key ? selectedChipTextColor : colors.gray,
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
              No {dataType === 'breakdowns' ? 'breakdowns' : dataType === 'preventive' ? 'preventive maintenance incidents' : dataType === 'complaints' ? 'complaints' : 'incidents'} found
            </Text>
          </View>
        }
      />

      {supervisorUser && (
        <FAB
          icon="add"
          onPress={() => navigation.navigate('CreateIncident', {
            type: dataType === 'breakdowns'
              ? 'breakdown'
              : dataType === 'preventive'
                ? 'preventive'
                : 'complaint',
          })}
        />
      )}
      {driverUser && (
        <FAB
          icon="add"
          onPress={() => navigation.navigate('CreateIncident', { type: 'breakdown' })}
        />
      )}
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
    elevation: 0,
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: 14,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  typeFilterContainer: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  typeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeFilterLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  typeDropdownButton: {
    minWidth: 200,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeDropdownText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: SPACING.xs,
  },
  typeChip: {
    marginRight: SPACING.xs,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  filtersContainer: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  filterChip: {
    marginRight: SPACING.xs,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  listContent: {
    padding: SPACING.sm,
    paddingBottom: 100,
  },
  card: {
    padding: SPACING.sm,
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
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 12,
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
    fontWeight: '500',
  },
  priorityBadge: {
    minHeight: 24,
    paddingHorizontal: SPACING.sm,
    borderRadius: 12,
    justifyContent: 'center',
  },
  priorityText: {
    color: COLORS.white,
    fontSize: 10,
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
    fontSize: 15,
    marginTop: SPACING.md,
    fontWeight: '500',
  },
});

export default ComplaintsScreen;

