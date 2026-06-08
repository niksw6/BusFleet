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
import MaterialIcons from '../../../components/AppIcon.js';
import Toast from 'react-native-toast-message';

import { ListSkeleton } from '../../../shared/components/SkeletonLoader';
import { StatusBadge } from '../../../shared/components/Badge';
import FAB from '../../../shared/components/FAB';
import ScreenHeader from '../../../components/ScreenHeader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { complaintService, jobCardService, maintenanceService } from '../../../api/services';
import { formatDate } from '../../../utils/helpers';
import { isMechanicUser, isSupervisorUser } from '../../../utils/roleAccess';

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
  const mechanicUser = isMechanicUser(user);
  const supervisorUser = isSupervisorUser(user);
  const showMechanicDashboard = mechanicUser && !supervisorUser;
  const alpha = (hexColor, alphaHex = '1A') => (
    typeof hexColor === 'string' && hexColor.startsWith('#') && (hexColor.length === 7 || hexColor.length === 4)
      ? `${hexColor}${alphaHex}`
      : hexColor
  );

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

      if (showMechanicDashboard) {
        const jobCardsResponse = await jobCardService.getJobCards(dbName || 'MUTSPL_TEST', null);
        const jobCards = Array.isArray(jobCardsResponse?.Data) ? jobCardsResponse.Data : [];

        const openCount = jobCards.filter((card) => {
          const status = String(card?.Status || '').trim().toUpperCase();
          return status === 'O' || status === 'OPEN';
        }).length;

        const inProgressCount = jobCards.filter((card) => {
          const status = String(card?.Status || '').trim().toUpperCase();
          return status === 'I' || status === 'IN PROGRESS' || status === 'INPROGRESS';
        }).length;

        const completedCount = jobCards.filter((card) => {
          const status = String(card?.Status || '').trim().toUpperCase();
          return status === 'C' || status === 'CM' || status === 'COMPLETED';
        }).length;

        setStats({
          total: jobCards.length,
          open: openCount,
          inProgress: inProgressCount,
          completed: completedCount,
        });

        setRecentIncidents([]);
        return;
      }

      const companyDb = dbName || 'MUTSPL_TEST';
      const [incidentsResponse, serviceSchedulersResponse] = await Promise.all([
        complaintService.getIncidents(companyDb, null, null),
        maintenanceService.getServiceSchedulers(companyDb),
      ]);

      const incidents = Array.isArray(incidentsResponse?.Data) ? incidentsResponse.Data : [];
      const preventive = Array.isArray(serviceSchedulersResponse?.Data)
        ? serviceSchedulersResponse.Data.map((schedulerItem) => ({
            Status: String(schedulerItem.Active || '').toUpperCase() === 'Y' ? 'O' : 'D',
          }))
        : [];

      const allIncidents = [...incidents, ...preventive];
      const openCount = allIncidents.filter(item => String(item?.Status || '').trim().toUpperCase() === 'O').length;
      const inProgressCount = allIncidents.filter(item => String(item?.Status || '').trim().toUpperCase() === 'I').length;
      const completedCount = allIncidents.filter((item) => {
        const status = String(item?.Status || '').trim().toUpperCase();
        return status === 'C' || status === 'CM' || status === 'COMPLETED';
      }).length;

      setStats({
        total: allIncidents.length,
        open: openCount,
        inProgress: inProgressCount,
        completed: completedCount,
      });
      
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
          typeColor: item.ComplaintType === 'Breakdown' ? colors.danger : colors.primary,
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
        useGradient={false}
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
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>
                  {showMechanicDashboard ? 'Job Cards Overview' : 'Performance Overview'}
                </Text>
                <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
                  {showMechanicDashboard ? 'Real-time job card tracking' : 'Real-time incident tracking'}
                </Text>
              </View>
              
              <View style={styles.kpiGrid}>
                {/* Total Incidents */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => {
                    if (showMechanicDashboard) {
                      navigation.navigate('JobCards');
                      return;
                    }
                    navigation.navigate('Complaints');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="assignment" size={26} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.dark }]}>{stats.total}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>
                    {showMechanicDashboard ? 'Total Job Cards' : 'Total Incidents'}
                  </Text>
                </TouchableOpacity>

                {/* Open */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => {
                    if (showMechanicDashboard) {
                      navigation.navigate('JobCards');
                      return;
                    }
                    navigation.navigate('Complaints', { initialFilter: 'O' });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="inbox" size={26} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.dark }]}>{stats.open}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>Open</Text>
                </TouchableOpacity>

                {/* In Progress */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => {
                    if (showMechanicDashboard) {
                      navigation.navigate('JobCards');
                      return;
                    }
                    navigation.navigate('Complaints', { initialFilter: 'I' });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="sync" size={26} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.dark }]}>{stats.inProgress}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>In Progress</Text>
                </TouchableOpacity>

                {/* Completed */}
                <TouchableOpacity
                  style={[styles.kpiCard, { backgroundColor: colors.white }]}
                  onPress={() => {
                    if (showMechanicDashboard) {
                      navigation.navigate('JobCards');
                      return;
                    }
                    navigation.navigate('Complaints', { initialFilter: 'CM' });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.kpiHeader}>
                    <View style={[styles.kpiIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="check-circle" size={26} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: colors.dark }]}>{stats.completed}</Text>
                  <Text style={[styles.kpiLabel, { color: colors.gray }]}>Completed</Text>
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
                {!showMechanicDashboard && (
                  <TouchableOpacity
                    style={styles.actionCardWrapper}
                    onPress={() => navigation.navigate('Complaints')}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionCard, { backgroundColor: colors.white, borderColor: colors.border }]}> 
                      <View style={[styles.actionIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                        <MaterialIcons name="assignment" size={30} color={colors.primary} />
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.dark }]}>Incidents</Text>
                      <Text style={[styles.actionSubtext, { color: colors.gray }]}>View & manage</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionCardWrapper}
                  onPress={() => navigation.navigate('JobCards')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionCard, { backgroundColor: colors.white, borderColor: colors.border }]}> 
                    <View style={[styles.actionIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="build-circle" size={30} color={colors.primary} />
                    </View>
                    <Text style={[styles.actionLabel, { color: colors.dark }]}>Job Cards</Text>
                    <Text style={[styles.actionSubtext, { color: colors.gray }]}>Track job cards</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionCardWrapper,
                      !showMechanicDashboard && styles.actionCardWrapperSingleRow,
                  ]}
                  onPress={() => navigation.navigate('WorkOrders')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionCard, { backgroundColor: colors.white, borderColor: colors.border }]}> 
                    <View style={[styles.actionIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                      <MaterialIcons name="receipt-long" size={30} color={colors.primary} />
                    </View>
                    <Text style={[styles.actionLabel, { color: colors.dark }]}>Work Orders</Text>
                    <Text style={[styles.actionSubtext, { color: colors.gray }]}>View open work list</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {supervisorUser && (
        <FAB
          icon="add"
          onPress={() => navigation.navigate('CreateIncident', { type: 'complaint' })}
        />
      )}
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
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
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
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '500',
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  actionSubtext: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default DashboardScreen;

