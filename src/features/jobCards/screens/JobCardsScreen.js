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
import MaterialIcons from '../../../shared/components/AppIcon.js';

import ScreenHeader from '../../../components/ScreenHeader';
import StandardListCard from '../../../shared/components/StandardListCard';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService } from '../../../api/services';
import { getStatusName, formatJobCardDisplayNo, getJobTypeCode, formatTime } from '../../../utils/helpers';

const normalizeJobCardFilter = (filter) => {
  if (filter === 'C') return 'CM';
  if (String(filter || '').trim().toUpperCase() === 'VERIFY') return 'VERIFY';
  return filter || 'All';
};

const isAwaitingVerification = (card) => {
  const status = String(card?.Status ?? card?.WorkStatus ?? card?.FaultStatus ?? '').trim().toUpperCase();
  return ['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(status);
};

const JobCardsScreen = ({ navigation, route }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [jobCards, setJobCards] = useState([]);
  const [filteredJobCards, setFilteredJobCards] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(normalizeJobCardFilter(route?.params?.initialFilter));

  const getBusLabel = (item) => (
    String(
      item?.BusNo
      || item?.Vehicle
      || item?.BusCode
      || item?.BusRegistrationNo
      || item?.RegNo
      || ''
    ).trim() || '-'
  );

  useEffect(() => {
    fetchJobCards();
  }, []);

  useEffect(() => {
    filterJobCards();
  }, [searchQuery, selectedFilter, jobCards]);

  useEffect(() => {
    if (route?.params?.initialFilter) {
      setSelectedFilter(normalizeJobCardFilter(route.params.initialFilter));
    }
    const focusDocEntry = route?.params?.focusDocEntry;
    if (focusDocEntry !== undefined && focusDocEntry !== null && String(focusDocEntry).trim()) {
      setSearchQuery(String(focusDocEntry).trim());
    }
  }, [route?.params?.initialFilter, route?.params?.focusDocEntry]);

  const fetchJobCards = async () => {
    try {
      const response = await jobCardService.getJobCards(dbName || 'MUTSPL_TEST');
      console.log('📋 Job cards response:', response);
      if (response.Success && response.Data) {
        setJobCards(response.Data);
      } else {
        setJobCards([]);
      }
    } catch (error) {
      console.error('Error fetching job cards:', error);
      setJobCards([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobCards();
    setRefreshing(false);
  };

  const filterJobCards = () => {
    let filtered = [...jobCards];

    if (selectedFilter !== 'All') {
      if (selectedFilter === 'VERIFY') {
        filtered = filtered.filter(isAwaitingVerification);
      } else if (selectedFilter === 'CM') {
        filtered = filtered.filter((card) => {
          const status = String(card?.Status || '').trim().toUpperCase();
          return status === 'CM' || status === 'C' || status === 'COMPLETED';
        });
      } else {
        filtered = filtered.filter((card) => String(card?.Status || '').trim().toUpperCase() === selectedFilter);
      }
    }

    if (!searchQuery.trim()) {
      setFilteredJobCards(filtered);
      return;
    }

    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      card =>
        formatJobCardDisplayNo(card).toLowerCase().includes(query) ||
        String(card.JobCardNo || '').toLowerCase().includes(query) ||
        String(card.DocEntry || '').toLowerCase().includes(query) ||
        String(card.BusNo || '').toLowerCase().includes(query) ||
        String(card.ComplaintNo || '').toLowerCase().includes(query) ||
        String(card.ComplaintType || '').toLowerCase().includes(query)
    );
    setFilteredJobCards(filtered);
  };

  const counts = {
    all: jobCards.length,
    open: jobCards.filter((card) => String(card?.Status || '').trim().toUpperCase() === 'O').length,
    progress: jobCards.filter((card) => String(card?.Status || '').trim().toUpperCase() === 'I').length,
    verify: jobCards.filter(isAwaitingVerification).length,
    completed: jobCards.filter((card) => {
      const status = String(card?.Status || '').trim().toUpperCase();
      return status === 'CM' || status === 'C' || status === 'COMPLETED';
    }).length,
  };

  const filters = [
    { key: 'All', label: `All (${counts.all})` },
    { key: 'O', label: `Open (${counts.open})` },
    { key: 'I', label: `In Progress (${counts.progress})` },
    { key: 'VERIFY', label: `Awaiting Verification (${counts.verify})` },
    { key: 'CM', label: `Completed (${counts.completed})` },
  ];

  const getPriorityColor = (priority) => {
    const p = String(priority || '').toLowerCase();
    if (p === 'high' || p === 'critical') return COLORS.danger;
    if (p === 'medium') return COLORS.warning;
    if (p === 'low') return COLORS.success;
    return colors.primary;
  };

  const getStatusColor = (status) => {
    const s = String(status || '').trim().toUpperCase();
    if (s === 'O') return COLORS.statusOpen;
    if (s === 'I') return COLORS.statusInProgress;
    if (['WC', 'WORK COMPLETED', 'AWAITING VERIFICATION'].includes(s)) return '#6D28D9';
    if (s === 'CM' || s === 'C') return COLORS.statusCompleted;
    if (s === 'D') return COLORS.statusDeclined;
    return colors.primary;
  };

  const getDisplayDate = (item) => {
    return item.RegDate || item.ComplaintDate || item.IncidentDate || item.CreateDate || item.DocDate || '';
  };

  const getDisplayTime = (item) => {
    const raw =
      item.RegTime ||
      item.ComplaintTime ||
      item.IncidentTime ||
      item.CreateTime ||
      item.DocTime ||
      item.BrkTime;

    if (!raw) return '';
    const value = String(raw).trim();
    if (!value || value === 'HH12:MI AM') return '';

    const placeholderPattern = /HH(\d{1,2})?:MI\s*(AM|PM)?/i;
    const placeholderMatch = value.match(placeholderPattern);
    if (placeholderMatch) {
      const hours = placeholderMatch[1] ? placeholderMatch[1].padStart(2, '0') : '';
      const amPm = placeholderMatch[2] ? ` ${placeholderMatch[2].toUpperCase()}` : '';
      return hours ? `${hours}:00${amPm}` : '';
    }

    return formatTime(value) || value;
  };

  const renderJobCard = ({ item }) => (
    <StandardListCard
      accentColor={colors.primary}
      onPress={() =>
        navigation.navigate('JobCardDetail', {
          docEntry: item.DocEntry || item.JobCardNo,
          jobCardNo: item.JobCardNo,
          jobType: item.JobType || item.FormType || getJobTypeCode(item),
          complaintNo: item.ComplaintNo,
          busNo: getBusLabel(item),
          depot: item.Depot,
          description: item.Description,
          complaintType: item.ComplaintType,
          regTime: item.RegTime,
          complaintTime: item.ComplaintTime,
          incidentTime: item.IncidentTime,
          dbName: dbName || 'MUTSPL_TEST',
        })
      }
    >
      <View style={styles.cardHeader}>
        <View style={[styles.titleFocusBar, { backgroundColor: colors.light }]}>
          <View style={styles.cardHeaderLeft}>
            <MaterialIcons name="assignment" size={24} color={colors.primary} />
            <View style={{ marginLeft: SPACING.sm }}>
              <Text style={[styles.jobCardNo, { color: colors.dark }]}>
                JC #{formatJobCardDisplayNo(item)}
              </Text>
              <Text style={[styles.busNo, { color: colors.gray, fontSize: 12 }]}>
                Bus #{getBusLabel(item)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        {item.ComplaintType && (
          <View style={styles.infoRow}>
            <MaterialIcons name="build" size={16} color={colors.gray} />
            <Text style={[styles.infoText, { color: colors.gray }]}>
              {item.ComplaintType}
            </Text>
          </View>
        )}

        {item.ComplaintNo && (
          <View style={styles.infoRow}>
            <MaterialIcons name="confirmation-number" size={16} color={colors.gray} />
            <Text style={[styles.infoText, { color: colors.gray }]}>
              Incident #{item.ComplaintNo}
            </Text>
          </View>
        )}

        {item.Depot && (
          <View style={styles.infoRow}>
            <MaterialIcons name="location-city" size={16} color={colors.gray} />
            <Text style={[styles.infoText, { color: colors.gray }]}>{item.Depot}</Text>
          </View>
        )}

        {(item.Description || item.Instructions) && (
          <Text
            style={[styles.instructions, { color: colors.dark }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.Description || item.Instructions}
          </Text>
        )}

        {item.Operations && item.Operations.length > 0 && (
          <View style={styles.tasksContainer}>
            {item.Operations.map((op, index) => (
              <Chip
                key={index}
                mode="flat"
                style={[styles.taskChip, { backgroundColor: colors.light }]}
                textStyle={{ fontSize: 11 }}
              >
                {op.OPName || op.task}
              </Chip>
            ))}
          </View>
        )}

        {item.Tasks && item.Tasks.length > 0 && (
          <View style={styles.tasksContainer}>
            {item.Tasks.map((task, index) => (
              <Chip
                key={index}
                mode="flat"
                style={[styles.taskChip, { backgroundColor: colors.light }]}
                textStyle={{ fontSize: 11 }}
              >
                {task}
              </Chip>
            ))}
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.dateContainer}>
          {getDisplayDate(item) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="calendar-today" size={12} color={colors.gray} />
              <Text style={[styles.date, { color: colors.gray }]}>
                {getDisplayDate(item)}
              </Text>
            </View>
          ) : null}
          {getDisplayTime(item) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
              <MaterialIcons name="access-time" size={12} color={colors.gray} />
              <Text style={[styles.date, { color: colors.gray }]}>
                {getDisplayTime(item)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.footerBadgesRow}>
          {item.TeamStatus && (
            <View
              style={[
                styles.priorityBadge,
                {
                  backgroundColor: `${
                    item.TeamStatus === 'Accepted' ? colors.statusCompleted
                    : item.TeamStatus === 'Rejected' ? colors.statusDeclined
                    : colors.statusInProgress
                  }18`,
                },
              ]}
            >
              <Text
                style={[
                  styles.priorityText,
                  {
                    color:
                      item.TeamStatus === 'Accepted' ? colors.statusCompleted
                      : item.TeamStatus === 'Rejected' ? colors.statusDeclined
                      : colors.statusInProgress,
                  },
                ]}
              >
                Team: {item.TeamStatus}
              </Text>
            </View>
          )}
          {item.Status && (
            <View
              style={[styles.priorityBadge, { backgroundColor: `${getStatusColor(item.Status)}18` }]}
            >
              <Text style={[styles.priorityText, { color: getStatusColor(item.Status) }]}>
                {isAwaitingVerification(item) ? 'Awaiting Verification' : getStatusName(item.Status)}
              </Text>
            </View>
          )}
          {item.Priority && (
            <View
              style={[styles.priorityBadge, styles.priorityFooterBadge, { backgroundColor: `${getPriorityColor(item.Priority)}18` }]}
            >
              <Text style={[styles.priorityText, { color: getPriorityColor(item.Priority) }]}>{item.Priority}</Text>
            </View>
          )}
        </View>
      </View>
    </StandardListCard>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="My Job Cards"
        subtitle="Track job cards and submitted work entries"
        onMenuPress={() => navigation.openDrawer()}
        showNotifications={true}
        useGradient={false}
      />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search by JC no, bus, incident..."
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
                color: selectedFilter === filter.key ? (colors.white || COLORS.white) : colors.gray,
              }}
            >
              {filter.label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredJobCards}
        renderItem={renderJobCard}
        keyExtractor={(item, index) => String(item.DocEntry || `${item.JobCardNo}-${item.JobType || item.FormType || 'D'}-${index}`)}
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
            <Text style={[styles.emptyText, { color: colors.gray }]}>No job cards assigned</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchBar: {
    elevation: 0,
    borderRadius: BORDER_RADIUS.md,
    height: 46,
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: 14,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  filtersContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  filterChip: {
    marginRight: SPACING.xs,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  card: {
    marginBottom: 0,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  titleFocusBar: {
    width: '100%',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  jobCardNo: {
    fontSize: 15,
    fontWeight: '600',
  },
  busNo: {
    fontSize: 12,
  },
  cardBody: {
    marginBottom: SPACING.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: 13,
    marginLeft: SPACING.xs,
    fontWeight: '400',
  },
  instructions: {
    fontSize: 12,
    marginTop: SPACING.xs,
    lineHeight: 17,
  },
  tasksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  taskChip: {
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    marginLeft: SPACING.xs,
    fontWeight: '500',
  },
  footerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityBadge: {
    minHeight: 24,
    paddingHorizontal: SPACING.sm,
    borderRadius: 12,
    justifyContent: 'center',
  },
  priorityFooterBadge: {
    marginLeft: SPACING.xs,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    marginTop: SPACING.md,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default JobCardsScreen;

