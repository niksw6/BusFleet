import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Text, Button, DataTable } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import KPICard from '../../../shared/components/KPICard';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService } from '../../../api/services';
import { formatDate, formatJobCardDisplayNo, getJobTypeCode } from '../../../utils/helpers';

/**
 * Work Orders Dashboard Screen
 * Mimics HeavyVehicleInspection.com Workorder interface
 * Shows KPI cards and work order list with tabs (Open, Completed, Archive)
 */
const WorkOrdersDashboardScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Open');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  
  const [workOrders, setWorkOrders] = useState([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState([]);
  
  const [stats, setStats] = useState({
    total: 0,
    mediumPriority: 0,
    highPriority: 0,
    critical: 0,
    overdue: 0,
  });

  useEffect(() => {
    fetchDashboardData(activeTab);
  }, [activeTab]);

  useEffect(() => {
    filterWorkOrders();
  }, [searchQuery, activeTab, priorityFilter, workOrders]);

  const fetchDashboardData = async (tab = 'Open') => {
    try {
      setLoading(true);

      const statusByTab = {
        Open: 'O',
        Completed: 'CM',
        Archive: null,
      };

      const response = await jobCardService.getWorkOrders(
        dbName || 'MUTSPL_TEST',
        statusByTab[tab] || null
      );
      
      if (response.Success && response.Data) {
        const data = response.Data;

        const enrichedData = await Promise.all(
          data.map(async (entry) => {
            const workOrderDocEntry = Number(entry?.DocEntry || 0);
            if (!workOrderDocEntry) {
              return {
                ...entry,
                AssignedMechanics: String(entry?.MechName || '').trim(),
                MechanicStartDt: entry?.StartDt || null,
                MechanicStartTm: entry?.StartTm || null,
                MechanicsTotalHrs: entry?.TotalHrs ?? null,
                WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || '').trim(),
              };
            }

            try {
              const detailResponse = await jobCardService.getWorkOrderById(dbName || 'MUTSPL_TEST', workOrderDocEntry);
              const detailData = detailResponse?.Success ? detailResponse?.Data : null;
              if (!detailData) {
                return {
                  ...entry,
                  AssignedMechanics: String(entry?.MechName || '').trim(),
                  MechanicStartDt: entry?.StartDt || null,
                  MechanicStartTm: entry?.StartTm || null,
                  MechanicsTotalHrs: entry?.TotalHrs ?? null,
                  WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || '').trim(),
                };
              }

              const mechanics = Array.isArray(detailData?.Mechanics) ? detailData.Mechanics : [];
              const mechanicNames = mechanics
                .map(m => String(m?.MechName || '').trim())
                .filter(Boolean);
              const firstMechanicWithStart = mechanics.find(m => m?.StartDt || m?.StartTm);
              const remarks = mechanics
                .map(m => String(m?.Remarks || '').trim())
                .filter(Boolean);
              const totalFromMechanics = mechanics
                .reduce((sum, m) => sum + (Number(m?.TotalHrs) || 0), 0);

              return {
                ...entry,
                AssignedMechanics: mechanicNames.join(', '),
                MechanicStartDt: firstMechanicWithStart?.StartDt || detailData?.AssignDt || null,
                MechanicStartTm: firstMechanicWithStart?.StartTm || null,
                MechanicsTotalHrs: detailData?.TotalHrs ?? totalFromMechanics ?? null,
                WorkDoneDetails: remarks.join(', ') || String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || '').trim(),
              };
            } catch (detailError) {
              console.error('Error fetching work order detail:', detailError);
              return {
                ...entry,
                AssignedMechanics: String(entry?.MechName || '').trim(),
                MechanicStartDt: entry?.StartDt || null,
                MechanicStartTm: entry?.StartTm || null,
                MechanicsTotalHrs: entry?.TotalHrs ?? null,
                WorkDoneDetails: String(entry?.Remarks || entry?.WorkDone || entry?.WorkDesc || entry?.Description || '').trim(),
              };
            }
          })
        );

        setWorkOrders(enrichedData);
        
        // Calculate statistics
        const total = enrichedData.length;
        const mediumPriority = enrichedData.filter(w => w.Priority === 'Medium').length;
        const highPriority = enrichedData.filter(w => w.Priority === 'High').length;
        const critical = enrichedData.filter(w => w.Priority === 'Critical').length;
        
        // Calculate overdue (jobs with past due dates that aren't completed)
        const today = new Date();
        const overdue = enrichedData.filter(w => {
          if (w.Status === 'C' || w.Status === 'CM' || w.Status === 'Completed') return false;
          if (!w.DueDate) return false;
          const dueDate = new Date(w.DueDate);
          return dueDate < today;
        }).length;
        
        setStats({
          total,
          mediumPriority,
          highPriority,
          critical,
          overdue,
        });
      }
    } catch (error) {
      console.error('Error fetching work orders:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: 'Unable to fetch work order data',
      });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(activeTab);
    setRefreshing(false);
  };

  const filterWorkOrders = () => {
    let filtered = workOrders;

    // Filter by tab (status)
    if (activeTab === 'Open') {
      filtered = filtered.filter(w => 
        w.Status === 'O' || w.Status === 'I' || w.Status === 'P' || 
        w.Status === 'Pending' || w.Status === 'In Progress' || w.Status === 'Assigned'
      );
    } else if (activeTab === 'Completed') {
      filtered = filtered.filter(w => 
        w.Status === 'C' || w.Status === 'CM' || w.Status === 'Completed'
      );
    } else if (activeTab === 'Archive') {
      filtered = filtered.filter(w => 
        w.Status === 'X' || w.Status === 'Cancelled' || w.Status === 'Archived'
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        String(w.DocNum || w.WorkOrderNo || '').toLowerCase().includes(query) ||
        String(w.JCDocNum || w.JobCardNo || '').toLowerCase().includes(query) ||
        String(w.DocEntry || '').toLowerCase().includes(query) ||
        String(w.JCDocEnt || '').toLowerCase().includes(query) ||
        String(w.Vehicle || w.BusNo || '').toLowerCase().includes(query) ||
        String(w.Depot || '').toLowerCase().includes(query) ||
        String(w.Driver || '').toLowerCase().includes(query) ||
        String(w.AssignDate || w.AssignDt || '').toLowerCase().includes(query) ||
        String(w.AssignedMechanics || '').toLowerCase().includes(query) ||
        String(w.WorkDoneDetails || '').toLowerCase().includes(query)
      );
    }

    // Filter by priority
    if (priorityFilter !== 'All') {
      filtered = filtered.filter(
        w => String(w.Priority || '').toLowerCase() === priorityFilter.toLowerCase()
      );
    }

    setFilteredWorkOrders(filtered);
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      'O': 'Open',
      'I': 'In Progress',
      'C': 'Completed',
      'CM': 'Completed',
      'P': 'Pending',
      'H': 'On Hold',
      'X': 'Cancelled',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'O':
        return '#0070F2';
      case 'I':
        return '#FF9500';
      case 'C':
      case 'CM':
        return '#2B7D2B';
      case 'D':
      case 'X':
        return '#BB0000';
      default:
        return '#6A6D70';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return '#BB0000'; // Red
      case 'high':
        return '#E91E63'; // Pink/Red
      case 'medium':
        return '#FF9500'; // Orange
      case 'low':
        return '#2B7D2B'; // Green
      default:
        return colors.gray;
    }
  };

  const getDisplayTime = (item) => {
    const raw = item?.RegTime || item?.ComplaintTime || item?.IncidentTime || item?.CreateTime || item?.DocTime || item?.BrkTime;
    if (!raw) return '-';

    const value = String(raw).trim();
    if (!value || value === 'HH12:MI AM') return '-';

    if (/^\d{3,4}$/.test(value)) {
      const normalized = value.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }

    const isoMatch = value.match(/T(\d{2}:\d{2})(:\d{2})?/);
    if (isoMatch?.[1]) return isoMatch[1];

    const hhMmSsMatch = value.match(/^(\d{2}:\d{2}):\d{2}$/);
    if (hhMmSsMatch?.[1]) return hhMmSsMatch[1];

    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
    }

    return value;
  };

  const formatStartTime = (raw) => {
    if (!raw && raw !== 0) return '-';
    const value = String(raw).trim();
    if (!value) return '-';
    if (/^\d{3,4}$/.test(value)) {
      const normalized = value.padStart(4, '0');
      return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
    }
    const hhMmMatch = value.match(/^(\d{2}):(\d{2})/);
    if (hhMmMatch) return `${hhMmMatch[1]}:${hhMmMatch[2]}`;
    return value;
  };

  const renderWorkOrderCard = ({ item }) => (
    <TouchableOpacity
      style={[styles.workOrderCard, { backgroundColor: colors.white }]}
      onPress={() => navigation.navigate('WorkOrderApiDetail', {
        workOrderDocEntry: item.DocEntry,
        dbName,
      })}
      activeOpacity={0.8}
    >
      {/* Compact Header: WO + Status + Priority */}
      <View style={styles.cardHeader}>
        <View style={styles.woNumberCompact}>
          <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
          <Text style={[styles.woNumberTextCompact, { color: colors.dark }]}>
            {item.DocNum || item.WorkOrderNo || (item.DocEntry ? `WO-${item.DocEntry}` : formatJobCardDisplayNo(item))}
          </Text>
        </View>
        <View style={styles.badgesRow}>
          {item.Priority && (
            <View style={[
              styles.priorityChip,
              { backgroundColor: getPriorityColor(item.Priority) }
            ]}>
              <Text style={styles.priorityChipText}>{item.Priority}</Text>
            </View>
          )}
          <View style={[
            styles.statusChip,
            { backgroundColor: getStatusColor(item.Status) }
          ]}>
            <Text style={styles.statusChipText}>{getStatusLabel(item.Status)}</Text>
          </View>
        </View>
      </View>

      {/* Info Row: Vehicle + Date + Time */}
      <View style={styles.infoRowCompact}>
        <View style={styles.infoItemCompact}>
          <MaterialIcons name="directions-bus" size={14} color={colors.gray} />
          <Text style={[styles.infoTextCompact, { color: colors.dark }]}>
            {item.Vehicle || item.BusNo || 'N/A'}
          </Text>
        </View>
        
        <View style={styles.datesDivider} />
        
        <View style={styles.infoItemCompact}>
          <MaterialIcons name="calendar-today" size={14} color={colors.gray} />
          <Text style={[styles.infoTextCompact, { color: colors.dark }]}>
            {item.AssignDate ? formatDate(item.AssignDate) : (item.AssignDt ? formatDate(item.AssignDt) : (item.RegDate || '-'))}
          </Text>
        </View>
        
        <View style={styles.datesDivider} />
        
        <View style={styles.infoItemCompact}>
          <MaterialIcons name="access-time" size={14} color={colors.gray} />
          <Text style={[styles.infoTextCompact, { color: colors.dark }]}>
            {getDisplayTime(item)}
          </Text>
        </View>
      </View>

      {/* Mechanics or Supervisor Info */}
      {(item.AssignedMechanics || item.SprvsrNm || item.AssignedTo) && (
        <View style={styles.mechanicsRow}>
          <MaterialIcons name="person" size={14} color={colors.primary} />
          <Text style={[styles.mechanicsText, { color: colors.dark }]} numberOfLines={1}>
            {item.AssignedMechanics || item.SprvsrNm || item.AssignedTo}
          </Text>
        </View>
      )}

      {(item.MechanicStartDt || item.MechanicStartTm || item.MechanicsTotalHrs !== null && item.MechanicsTotalHrs !== undefined) && (
        <View style={styles.mechanicsRow}>
          <MaterialIcons name="play-arrow" size={14} color={colors.primary} />
          <Text style={[styles.mechanicsText, { color: colors.dark }]} numberOfLines={1}>
            Start: {item.MechanicStartDt ? formatDate(item.MechanicStartDt) : '-'} {formatStartTime(item.MechanicStartTm)} | Hrs: {item.MechanicsTotalHrs ?? '-'}
          </Text>
        </View>
      )}

      {item.WorkDoneDetails ? (
        <View style={styles.memoCompact}>
          <Text style={[styles.memoTextCompact, { color: colors.gray }]} numberOfLines={2}>
            Work Done: {item.WorkDoneDetails}
          </Text>
        </View>
      ) : null}

      {/* Memo Preview (if exists) */}
      {item.Memo && !item.WorkDoneDetails && (
        <View style={styles.memoCompact}>
          <Text style={[styles.memoTextCompact, { color: colors.gray }]} numberOfLines={1}>
            {item.Memo}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="Work Orders"
        subtitle={`${stats.total} Total Orders`}
        onMenuPress={() => navigation.openDrawer()}
        onNotificationPress={() => navigation.navigate('Notifications')}
        showNotifications={true}
        useGradient={true}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* KPI Cards - Modern Compact Design */}
        <View style={styles.kpiContainer}>
          <KPICard
            title="Total WOs"
            value={stats.total}
            icon="edit"
            iconColor="#6366F1"
            isDarkMode={isDarkMode}
            compact={true}
          />
          
          <KPICard
            title="Medium"
            value={stats.mediumPriority}
            icon="warning"
            iconColor="#FF9500"
            isDarkMode={isDarkMode}
            compact={true}
          />
          
          <KPICard
            title="High"
            value={stats.highPriority}
            icon="priority-high"
            iconColor="#E91E63"
            isDarkMode={isDarkMode}
            compact={true}
          />
          
          <KPICard
            title="Critical"
            value={stats.critical}
            icon="error"
            iconColor="#BB0000"
            isDarkMode={isDarkMode}
            compact={true}
          />
          
          <KPICard
            title="Overdue"
            value={stats.overdue}
            icon="schedule"
            iconColor="#9C27B0"
            isDarkMode={isDarkMode}
            compact={true}
          />
        </View>

        {/* Workorder Status Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Workorder Status</Text>
          
          {/* Tabs */}
          <View style={styles.tabContainer}>
            {['Open', 'Completed', 'Archive'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tab,
                  activeTab === tab && styles.activeTab,
                  activeTab === tab && { borderBottomColor: colors.primary }
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[
                  styles.tabText,
                  { color: colors.gray },
                  activeTab === tab && { color: colors.primary, fontWeight: 'bold' }
                ]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action Bar - Mobile Optimized */}
          <View style={styles.actionBarContainer}>
            <View style={styles.actionBarTop}>
              <View style={[styles.searchBox, { backgroundColor: colors.white, borderColor: colors.border }]}>
                <MaterialIcons name="search" size={20} color={colors.gray} />
                <TextInput
                  placeholder="Search work orders..."
                  placeholderTextColor={colors.gray}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={[styles.searchInput, { color: colors.dark }]}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialIcons name="close" size={18} color={colors.gray} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <View style={styles.filterRow}>
              <View style={styles.filterTitleWrap}>
                <MaterialIcons name="filter-list" size={18} color={colors.gray} />
                <Text style={[styles.filterTitle, { color: colors.gray }]}>Filter</Text>
              </View>

              <View style={styles.filterChipsWrap}>
                {['All', 'Critical', 'High', 'Medium', 'Low'].map(priority => {
                  const active = priorityFilter === priority;
                  return (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.filterChip,
                        { borderColor: colors.border, backgroundColor: colors.white },
                        active && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }
                      ]}
                      onPress={() => setPriorityFilter(priority)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        { color: colors.gray },
                        active && { color: colors.primary, fontWeight: '700' }
                      ]}>
                        {priority}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Work Order Cards List */}
          {filteredWorkOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="inbox" size={48} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No Data</Text>
            </View>
          ) : (
            <FlatList
              data={filteredWorkOrders}
              renderItem={renderWorkOrderCard}
              keyExtractor={(item, index) => String(item.DocEntry || `${item.JobCardNo}-${item.JobType || item.FormType || 'D'}-${index}`)}
              scrollEnabled={false}
              contentContainerStyle={styles.cardsList}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  section: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: SPACING.sm,
  },
  tab: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionBarContainer: {
    marginBottom: SPACING.sm,
  },
  actionBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  filterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  filterTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.xs,
    fontSize: 14,
  },
  iconButton: {
    padding: SPACING.xs,
  },
  cardsList: {
    paddingTop: SPACING.sm,
  },
  workOrderCard: {
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  // Compact Card Styles
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  woNumberCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  woNumberTextCompact: {
    fontSize: 15,
    fontWeight: '700',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityChipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  infoRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.xs,
  },
  infoItemCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoTextCompact: {
    fontSize: 12,
    fontWeight: '500',
  },
  datesDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#E0E0E0',
  },
  mechanicsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  mechanicsText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  memoCompact: {
    backgroundColor: '#FFFBF0',
    borderLeftWidth: 2,
    borderLeftColor: '#FF9500',
    padding: SPACING.xs,
    borderRadius: 4,
    marginTop: SPACING.xs,
  },
  memoTextCompact: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    marginTop: SPACING.sm,
    fontSize: 14,
  },
});

export default WorkOrdersDashboardScreen;
