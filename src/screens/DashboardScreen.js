import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import DashboardCard from '../components/DashboardCard';
import { ListSkeleton } from '../components/SkeletonLoader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { dashboardService } from '../services/api';

const DashboardScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const dbName = useSelector(state => state.auth.dbName);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    TotalComplaints: 0,
    OpenComplaints: 0,
    InProgressComplaints: 0,
    DeclinedComplaints: 0,
    CompletedComplaints: 0,
    TotalBreakdowns: 0,
    OpenBreakdowns: 0,
    InProgressBreakdowns: 0,
    DeclinedBreakdowns: 0,
    CompletedBreakdowns: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      console.log('📊 Fetching dashboard data for:', dbName || 'MUTSPL_TEST');
      const response = await dashboardService.getDashboardStatus(dbName || 'MUTSPL_TEST');
      console.log('📊 Dashboard API response:', JSON.stringify(response, null, 2));
      
      if (response && response.Success && response.Data) {
        // Transform the nested API response to flat structure
        const transformedData = {
          TotalComplaints: response.Data.DriverComplaints?.Total || 0,
          OpenComplaints: response.Data.DriverComplaints?.Open || 0,
          InProgressComplaints: response.Data.DriverComplaints?.InProgress || 0,
          DeclinedComplaints: response.Data.DriverComplaints?.Declined || 0,
          CompletedComplaints: response.Data.DriverComplaints?.Completed || 0,
          TotalBreakdowns: response.Data.LineBreakdowns?.Total || 0,
          OpenBreakdowns: response.Data.LineBreakdowns?.Open || 0,
          InProgressBreakdowns: response.Data.LineBreakdowns?.InProgress || 0,
          DeclinedBreakdowns: response.Data.LineBreakdowns?.Declined || 0,
          CompletedBreakdowns: response.Data.LineBreakdowns?.Completed || 0,
        };
        console.log('📊 Transformed data:', transformedData);
        setStats(transformedData);
      } else {
        console.log('⚠️ Invalid dashboard response:', response);
        Toast.show({
          type: 'warning',
          text1: 'No Data',
          text2: 'Unable to load dashboard statistics',
        });
      }
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: error.message?.includes('timeout') 
          ? 'Server is taking too long. Please try again.' 
          : 'Unable to fetch dashboard data',
      });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const complaintsData = [
    {
      title: 'Open',
      count: stats.OpenComplaints,
      icon: 'report-problem',
      color: '#0070F2', // SAP Blue
      filter: 'O',
    },
    {
      title: 'In Progress',
      count: stats.InProgressComplaints,
      icon: 'sync',
      color: '#FF9500', // SAP Orange
      filter: 'I',
    },
    {
      title: 'Completed',
      count: stats.CompletedComplaints,
      icon: 'check-circle-outline',
      color: '#2B7D2B', // SAP Green
      filter: 'CM',
    },
  ];

  const breakdownsData = [
    {
      title: 'Open',
      count: stats.OpenBreakdowns,
      icon: 'build',
      color: '#0070F2', // SAP Blue
      filter: 'O',
    },
    {
      title: 'In Progress',
      count: stats.InProgressBreakdowns,
      icon: 'engineering',
      color: '#FF9500', // SAP Orange
      filter: 'I',
    },
    {
      title: 'Completed',
      count: stats.CompletedBreakdowns,
      icon: 'done-all',
      color: '#2B7D2B', // SAP Green
      filter: 'CM',
    },
  ];

  // Capitalize first letter of username
  const userName = user?.name || user?.Name || user?.FirstName || 'User';
  const capitalizedName = typeof userName === 'string'
    ? userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase()
    : 'User';

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      {/* Blue Header */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.primary }]}>
        <View style={styles.headerTop}>
          <View style={styles.greetingSection}>
            <Text style={[styles.greeting, { color: 'rgba(255,255,255,0.9)' }]}>
              Hello, {capitalizedName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            style={styles.profileButton}
          >
            <MaterialIcons name="account-circle" size={40} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            placeholder="Search vehicles, routes, complaints..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: isDarkMode ? colors.text : '#333' }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <MaterialIcons name="close" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>

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
        {/* Stats Cards */}
        <View style={styles.content}>
          {loading ? (
            <ListSkeleton count={3} />
          ) : (
            <>
              {/* Complaints Section */}
              <View style={[styles.sectionCard, { backgroundColor: colors.white }]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <View style={[styles.sectionIconBg, { backgroundColor: colors.primary + '20' }]}>
                      <MaterialIcons name="assignment" size={20} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Driver Complaints</Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>Tap to view details</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.viewAllBtn, { backgroundColor: colors.primary + '15' }]}
                    onPress={() => navigation.navigate('Tasks', { type: 'complaints' })}
                  >
                    <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
                    <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.statsGrid}>
                  {complaintsData.map((card, index) => (
                    <DashboardCard
                      key={index}
                      title={card.title}
                      count={card.count}
                      icon={card.icon}
                      color={card.color}
                      onPress={() => {
                        navigation.navigate('Tasks', { initialFilter: card.filter, type: 'complaints' });
                      }}
                    />
                  ))}
                </View>
              </View>

              {/* Breakdowns Section */}
              <View style={[styles.sectionCard, { backgroundColor: colors.white }]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <View style={[styles.sectionIconBg, { backgroundColor: '#E91E63' + '20' }]}>
                      <MaterialIcons name="warning" size={20} color="#E91E63" />
                    </View>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.dark }]}>Line Breakdowns</Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>Real-time breakdown status</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.statsGrid}>
                  {breakdownsData.map((card, index) => (
                    <DashboardCard
                      key={index}
                      title={card.title}
                      count={card.count}
                      icon={card.icon}
                      color={card.color}
                      onPress={() => {
                        navigation.navigate('Tasks', { initialFilter: card.filter, type: 'breakdowns' });
                      }}
                    />
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Quick Actions */}
          <View style={[styles.quickActionsCard, { backgroundColor: colors.white }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? colors.text : colors.dark }]}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary + '15' }]}
                onPress={() => navigation.navigate('Tasks')}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="assignment" size={28} color="#fff" />
                </View>
                <Text style={[styles.actionText, { color: isDarkMode ? colors.text : colors.dark }]}>Incidents</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#9C27B0' + '15' }]}
                onPress={() => navigation.navigate('JobCards')}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#9C27B0' }]}>
                  <MaterialIcons name="build-circle" size={28} color="#fff" />
                </View>
                <Text style={[styles.actionText, { color: isDarkMode ? colors.text : colors.dark }]}>Job Cards</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyHeader: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  greetingSection: {
    flex: 1,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '500',
  },
  profileButton: {
    padding: SPACING.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 46,
    marginTop: SPACING.xs,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearButton: {
    padding: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
  },
  sectionCard: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 11,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  quickActionsCard: {
    marginTop: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '31%',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 95,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
});

export default DashboardScreen;
