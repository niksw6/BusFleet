import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, Searchbar, Chip } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';

import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService } from '../../../api/services';
import { getStatusName, formatJobCardDisplayNo, getJobTypeCode } from '../../../utils/helpers';

const JobCardsScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [jobCards, setJobCards] = useState([]);
  const [filteredJobCards, setFilteredJobCards] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchJobCards();
  }, []);

  useEffect(() => {
    filterJobCards();
  }, [searchQuery, jobCards]);

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
    if (!searchQuery.trim()) {
      setFilteredJobCards(jobCards);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = jobCards.filter(
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

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return '#FF5252';
      case 'Medium':
        return '#FFA726';
      case 'Low':
        return '#66BB6A';
      default:
        return colors.gray;
    }
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

    if (/^\d{3,4}$/.test(value)) {
      const normalized = value.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }

    const isoMatch = value.match(/T(\d{2}:\d{2})(:\d{2})?/);
    if (isoMatch?.[1]) {
      return isoMatch[1];
    }

    const hhMmSsMatch = value.match(/^(\d{2}:\d{2}):\d{2}$/);
    if (hhMmSsMatch?.[1]) {
      return hhMmSsMatch[1];
    }

    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
    }

    return value;
  };

  const renderJobCard = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.white }]}
      onPress={() =>
        navigation.navigate('WorkOrderDetail', {
          docEntry: item.DocEntry || item.JobCardNo,
          jobCardNo: item.JobCardNo,
          jobType: item.JobType || item.FormType || getJobTypeCode(item),
          complaintNo: item.ComplaintNo,
          busNo: item.BusNo,
          depot: item.Depot,
          description: item.Description,
          complaintType: item.ComplaintType,
          regTime: item.RegTime,
          complaintTime: item.ComplaintTime,
          incidentTime: item.IncidentTime,
          dbName: dbName || 'MUTSPL_TEST',
        })
      }
      activeOpacity={0.7}
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
                Bus #{item.BusNo}
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
          {item.Status && (
            <View
              style={[styles.priorityBadge, { backgroundColor: getStatusColor(item.Status) }]}
            >
              <Text style={styles.priorityText}>{getStatusName(item.Status)}</Text>
            </View>
          )}
          {item.Priority && (
            <View
              style={[styles.priorityBadge, styles.priorityFooterBadge, { backgroundColor: getPriorityColor(item.Priority) }]}
            >
              <Text style={styles.priorityText}>{item.Priority}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="My Job Cards"
        subtitle="Your assigned work orders"
        onMenuPress={() => navigation.openDrawer()}
        showNotifications={false}
        useGradient={false}
      />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search job cards..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
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
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  card: {
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    elevation: 2,
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
    fontSize: 16,
    fontWeight: 'bold',
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
  },
  instructions: {
    fontSize: 13,
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  tasksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  taskChip: {
    height: 28,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    marginLeft: SPACING.xs,
  },
  footerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priorityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityFooterBadge: {
    marginLeft: SPACING.xs,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
});

export default JobCardsScreen;
