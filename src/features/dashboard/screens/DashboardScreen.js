import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

import { ListSkeleton } from '../../../shared/components/SkeletonLoader';
import { StatusBadge } from '../../../shared/components/Badge';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { dashboardService, complaintService } from '../../../api/services';
import { formatDate } from '../../../utils/helpers';

/**
 * Work Dashboard Screen - Professional Incident Management
 * Shows KPIs, recent incidents, and quick actions
 * Uses existing complaint and breakdown APIs
 */
const DashboardScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentIncidents, setRecentIncidents] = useState([]);
  
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard statistics
      const statusResponse = await dashboardService.getDashboardStatus(dbName || 'MUTSPL_TEST');
      
      if (statusResponse?.Success && statusResponse?.Data) {
        const data = statusResponse.Data;
        
        // Calculate combined totals
        const totalOpen = (data.DriverComplaints?.Open || 0) + (data.LineBreakdowns?.Open || 0);
        const totalInProgress = (data.DriverComplaints?.InProgress || 0) + (data.LineBreakdowns?.InProgress || 0);
        const totalCompleted = (data.DriverComplaints?.Completed || 0) + (data.LineBreakdowns?.Completed || 0);
        const total = (data.DriverComplaints?.Total || 0) + (data.LineBreakdowns?.Total || 0);
        
        setStats({
          total,
          open: totalOpen,
          inProgress: totalInProgress,
          completed: totalCompleted,
        });
      }
      
      // Fetch recent incidents (complaints + breakdowns)
      await fetchRecentIncidents();
      
    } catch (error) {
      console.error('❌ Error fetching dashboard:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: 'Unable to fetch dashboard data',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentIncidents = async () => {
    try {
      // Fetch all incidents using unified API (no type filter to get both complaints and breakdowns)
      const response = await complaintService.getIncidents(
        dbName || 'MUTSPL_TEST',
        null, // status - fetch all
        null  // type - fetch all types
      );

      if (response?.Success && Array.isArray(response.Data)) {
        // Map incidents with type colors
        const incidents = response.Data.map(item => ({
          ...item,
          type: item.ComplaintType,
          typeColor: item.ComplaintType === 'Breakdown' ? '#EF4444' : '#3B82F6',
          // Normalize field names
          RegDate: item.IncidentDate,
          RegTime: item.IncidentTime,
        }));

        // Sort by date (most recent first) and take last 10
        const sorted = incidents
          .sort((a, b) => {
            const dateA = new Date(a.IncidentDate || 0);
            const dateB = new Date(b.IncidentDate || 0);
            return dateB - dateA;
          })
          .slice(0, 10);

        setRecentIncidents(sorted);
      } else {
        setRecentIncidents([]);
      }
    } catch (error) {
      console.error('❌ Error fetching incidents:', error);
      setRecentIncidents([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const userName = user?.name || user?.Name || user?.FirstName || 'User';

  const renderIncidentItem = ({ item }) => {
    const date = item.RegDate || item.BrkDate;
    const time = item.RegTime || item.BrkTime;
    const busNo = item.BusNo || 'N/A';
    
    return (
      <TouchableOpacity
        style={[styles.incidentCard, { backgroundColor: colors.white }]}
        onPress={() => {
          navigation.navigate('ComplaintDetail', { 
            complaintNo: item.DocEntry,
            dbName: dbName || 'MUTSPL_TEST',
            complaintType: item.ComplaintType
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.incidentHeader}>
          <View style={[styles.typeIndicator, { backgroundColor: item.typeColor }]} />
          <View style={styles.incidentInfo}>
            <View style={styles.incidentTopRow}>
              <Text style={[styles.incidentType, { color: item.typeColor }]}>{item.type}</Text>
              <StatusBadge status={item.Status} />
            </View>
            <Text style={[styles.incidentBus, { color: colors.dark }]}>Vehicle: {busNo}</Text>
          </View>
        </View>
        
        <View style={styles.incidentFooter}>
          <View style={styles.incidentDetail}>
            <MaterialIcons name="calendar-today" size={14} color={colors.gray} />
            <Text style={[styles.incidentDetailText, { color: colors.gray }]}>
              {date ? formatDate(date) : 'N/A'}
            </Text>
          </View>
          {time && (
            <View style={styles.incidentDetail}>
              <MaterialIcons name="access-time" size={14} color={colors.gray} />
              <Text style={[styles.incidentDetailText, { color: colors.gray }]}>{time}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      <ScreenHeader
        title="Fleet Dashboard"
        subtitle=""
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
        {loading ? (
          <View style={styles.content}>
            <ListSkeleton count={4} />
          </View>
        ) : (
          <View style={styles.content}>
            {/* KPI Cards */}
            <View style={styles.kpiSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>Performance Overview</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>Real-time incident tracking</Text>
              </View>
              
              <View style={styles.kpiGrid}>
                {/* Total Incidents */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => navigation.navigate('Complaints')}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <LinearGradient
                      colors={['#6366F1', '#4F46E5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.kpiIconContainer}
                    >
                      <MaterialIcons name="assignment" size={26} color="#fff" />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#6366F1' }]}>{stats.total}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>Total Incidents</Text>
                  <View style={[styles.kpiIndicator, { backgroundColor: '#6366F1' + '15' }]}>
                    <Text style={[styles.kpiIndicatorText, { color: '#6366F1' }]}>All Time</Text>
                  </View>
                </TouchableOpacity>

                {/* Open */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => navigation.navigate('Complaints', { initialFilter: 'O' })}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <LinearGradient
                      colors={['#3B82F6', '#2563EB']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.kpiIconContainer}
                    >
                      <MaterialIcons name="inbox" size={26} color="#fff" />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{stats.open}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>Open</Text>
                  <View style={[styles.kpiIndicator, { backgroundColor: '#3B82F6' + '15' }]}>
                    <Text style={[styles.kpiIndicatorText, { color: '#3B82F6' }]}>Pending</Text>
                  </View>
                </TouchableOpacity>

                {/* In Progress */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => navigation.navigate('Complaints', { initialFilter: 'I' })}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <LinearGradient
                      colors={['#F59E0B', '#D97706']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.kpiIconContainer}
                    >
                      <MaterialIcons name="sync" size={26} color="#fff" />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{stats.inProgress}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>In Progress</Text>
                  <View style={[styles.kpiIndicator, { backgroundColor: '#F59E0B' + '15' }]}>
                    <Text style={[styles.kpiIndicatorText, { color: '#F59E0B' }]}>Active</Text>
                  </View>
                </TouchableOpacity>

                {/* Completed */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => navigation.navigate('Complaints', { initialFilter: 'C' })}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <LinearGradient
                      colors={['#10B981', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.kpiIconContainer}
                    >
                      <MaterialIcons name="check-circle" size={26} color="#fff" />
                    </LinearGradient>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#10B981' }]}>{stats.completed}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>Completed</Text>
                  <View style={[styles.kpiIndicator, { backgroundColor: '#10B981' + '15' }]}>
                    <Text style={[styles.kpiIndicatorText, { color: '#10B981' }]}>Resolved</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>Quick Actions</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>Access key features</Text>
              </View>
              
              <View style={styles.actionsGrid}>
                <TouchableOpacity
                  style={styles.actionCardWrapper}
                  onPress={() => navigation.navigate('Complaints')}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionCard}
                  >
                    <View style={styles.actionIconContainer}>
                      <MaterialIcons name="assignment" size={36} color="#fff" />
                    </View>
                    <Text style={styles.actionLabel}>Incidents</Text>
                    <Text style={styles.actionSubtext}>View & manage</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionCardWrapper}
                  onPress={() => navigation.navigate('WorkOrders')}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#06B6D4', '#0891B2']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionCard}
                  >
                    <View style={styles.actionIconContainer}>
                      <MaterialIcons name="receipt-long" size={36} color="#fff" />
                    </View>
                    <Text style={styles.actionLabel}>Work Orders</Text>
                    <Text style={styles.actionSubtext}>View open work list</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionCardWrapper, styles.actionCardWrapperSingleRow]}
                  onPress={() => navigation.navigate('JobCards')}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionCard}
                  >
                    <View style={styles.actionIconContainer}>
                      <MaterialIcons name="build-circle" size={36} color="#fff" />
                    </View>
                    <Text style={styles.actionLabel}>Job Cards</Text>
                    <Text style={styles.actionSubtext}>Track job cards</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  // Section Headers
  sectionHeader: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  // KPI Section
  kpiSection: {
    marginBottom: SPACING.lg,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  kpiCard: {
    width: '48.5%',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    marginBottom: SPACING.md,
  },
  kpiHeader: {
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  kpiIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  kpiIndicator: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  kpiIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Actions Section
  actionsSection: {
    marginBottom: SPACING.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCardWrapper: {
    width: '48%',
    marginBottom: SPACING.md,
  },
  actionCardWrapperSingleRow: {
    width: '100%',
  },
  actionCard: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  actionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginTop: SPACING.xs,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  actionSubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default DashboardScreen;
