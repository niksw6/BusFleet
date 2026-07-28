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
import { complaintService, jobCardService, maintenanceService, teamService } from '../../../api/services';
import { formatDate } from '../../../utils/helpers';
import { isMechanicUser, isSupervisorUser, isTechnicalHeadUser, isDepotHeadUser, isTeamLeaderUser, isFieldStaffUser, isDriverUser, getUserTeamCode } from '../../../utils/roleAccess';

const extractTeamLeaderJobCards = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const candidateKeys = ['JobCards', 'Jobs', 'List', 'Items', 'Data'];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();

const matchesDriverIncident = (incident, driverCode, driverName) => {
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

  if (codeCandidates.length === 0 && nameCandidates.length === 0) {
    return true;
  }

  return (driverCode && codeCandidates.includes(driverCode)) || (driverName && nameCandidates.includes(driverName));
};

const deriveTeamLeaderStatus = (job) => {
  const raw = String(job?.TeamStatus ?? job?.Status ?? job?.AcceptStatus ?? job?.ApprovalStatus ?? '').trim().toUpperCase();
  if (['A', 'ACCEPTED', 'ACCEPT'].includes(raw)) return 'ACCEPTED';
  if (['R', 'REJECTED', 'REJECT'].includes(raw)) return 'REJECTED';
  return 'PENDING';
};

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
  const technicalHeadUser = isTechnicalHeadUser(user);
  const depotHeadUser = isDepotHeadUser(user);
  const teamLeaderUser = isTeamLeaderUser(user);
  const fieldStaffUser = isFieldStaffUser(user);
  const driverUser = isDriverUser(user);
  const userTeamCode = getUserTeamCode(user);
  // BUG FIX: this used to check only isMechanicUser, so Electricians fell through
  // to the generic Supervisor-style dashboard instead of the Job Cards overview.
  const showMechanicDashboard = fieldStaffUser && !supervisorUser && !technicalHeadUser && !depotHeadUser;
  const driverName = user?.name || user?.Name || user?.FirstName || user?.User || user?.user || 'Driver';
  const alpha = (hexColor, alphaHex = '1A') => (
    typeof hexColor === 'string' && hexColor.startsWith('#') && (hexColor.length === 7 || hexColor.length === 4)
      ? `${hexColor}${alphaHex}`
      : hexColor
  );

  const getBusLabel = (item) => (
    String(
      item?.BusNo
      || item?.Vehicle
      || item?.BusCode
      || item?.BusRegistrationNo
      || item?.RegNo
      || ''
    ).trim() || 'N/A'
  );

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [overdueIncidents, setOverdueIncidents] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  
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

      if (teamLeaderUser) {
        try {
          const teamResponse = await teamService.getMechanicalDashboard(dbName || 'MUTSPL_TEST', user?.User || user?.user || user?.Code || user?.code || user?.name || '');
          const jobCards = extractTeamLeaderJobCards(teamResponse?.Data ?? teamResponse);
          const scoped = userTeamCode
            ? jobCards.filter((c) => !c?.TeamCode || String(c?.TeamCode || '').trim() === userTeamCode)
            : jobCards;

          const pendingCount = scoped.filter(c => deriveTeamLeaderStatus(c) === 'PENDING').length;
          setPendingApprovals(pendingCount);
          setStats({
            total: scoped.length,
            open: pendingCount,
            inProgress: scoped.filter(c => deriveTeamLeaderStatus(c) === 'ACCEPTED').length,
            completed: scoped.filter(c => deriveTeamLeaderStatus(c) === 'REJECTED').length,
          });
        } catch (e) {
          console.warn('Team Leader dashboard fetch failed:', e?.message);
        }
        setRecentIncidents([]);
        return;
      }

      // Driver: scope everything to incidents THEY reported — never show the fleet-wide list.
      if (driverUser) {
        try {
          const companyDb = dbName || 'MUTSPL_TEST';
          const driverCode = String(user?.Code || user?.code || user?.User || user?.user || '').trim().toLowerCase();
          const incidentsResponse = await complaintService.getIncidents(companyDb, null, null);
          const allIncidents = Array.isArray(incidentsResponse?.Data) ? incidentsResponse.Data : [];
          const ownIncidents = allIncidents.filter((item) => {
            return matchesDriverIncident(item, driverCode, driverName.trim().toLowerCase());
          });

          const openCount = ownIncidents.filter(i => String(i?.Status || '').trim().toUpperCase() === 'O').length;
          const inProgressCount = ownIncidents.filter(i => String(i?.Status || '').trim().toUpperCase() === 'I').length;
          const completedCount = ownIncidents.filter((i) => {
            const status = String(i?.Status || '').trim().toUpperCase();
            return status === 'C' || status === 'CM' || status === 'COMPLETED';
          }).length;

          setStats({
            total: ownIncidents.length,
            open: openCount,
            inProgress: inProgressCount,
            completed: completedCount,
          });

          const sortedOwn = ownIncidents
            .map(item => ({
              ...item,
              type: item.ComplaintType,
              typeColor: item.ComplaintType === 'Breakdown' ? colors.danger : colors.primary,
              RegDate: item.IncidentDate,
              RegTime: item.IncidentTime,
            }))
            .sort((a, b) => new Date(b.IncidentDate || 0) - new Date(a.IncidentDate || 0))
            .slice(0, 10);
          setRecentIncidents(sortedOwn);
        } catch (e) {
          console.warn('Driver dashboard fetch failed:', e?.message);
          setStats({ total: 0, open: 0, inProgress: 0, completed: 0 });
          setRecentIncidents([]);
        }
        return;
      }

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

      // Technical Head / Depot Head: fetch overdue incidents
      if (technicalHeadUser || depotHeadUser) {
        try {
          const overdueRes = await jobCardService.getOverdueIncidents(dbName || 'MUTSPL_TEST');
          setOverdueIncidents(Array.isArray(overdueRes?.Data) ? overdueRes.Data : []);
        } catch (e) {
          console.warn('Overdue incidents fetch failed:', e?.message);
        }
      }
      
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
    const busNo = getBusLabel(item);
    
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
        title={driverUser ? 'My Dashboard' : 'Fleet Dashboard'}
        subtitle={driverUser ? `Welcome, ${driverName}` : ''}
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

            {/* ── Team Approvals (Team Leader) ── */}
            {teamLeaderUser && (
              <View style={styles.actionsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>Team Approvals</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
                    Job cards awaiting your accept/reject decision
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.overdueCard,
                    { backgroundColor: colors.white, borderColor: pendingApprovals > 0 ? '#0EA5E940' : colors.border },
                  ]}
                  onPress={() => navigation.navigate('TeamApprovals')}
                  activeOpacity={0.7}
                >
                  <View style={styles.overdueLeft}>
                    <View style={[styles.overdueDot, { backgroundColor: pendingApprovals > 0 ? '#0EA5E9' : colors.gray }]} />
                    <View>
                      <Text style={[styles.overdueTitle, { color: colors.dark }]}>
                        {pendingApprovals > 0 ? `${pendingApprovals} job card(s) pending` : 'No pending job cards'}
                      </Text>
                      <Text style={[styles.overdueSub, { color: colors.gray }]}>
                        Tap to accept, reject, or assign your team
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── My Work (Mechanic / Electrician self-accept queue) ── */}
            {fieldStaffUser && (
              <View style={styles.actionsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>My Work</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
                    Accept faults, log work entries, request parts
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.overdueCard, { backgroundColor: colors.white, borderColor: '#0EA5E940' }]}
                  onPress={() => navigation.navigate('MechanicDashboard')}
                  activeOpacity={0.7}
                >
                  <View style={styles.overdueLeft}>
                    <View style={[styles.overdueDot, { backgroundColor: '#0EA5E9' }]} />
                    <View>
                      <Text style={[styles.overdueTitle, { color: colors.dark }]}>Go to My Work Queue</Text>
                      <Text style={[styles.overdueSub, { color: colors.gray }]}>
                        New, In Progress, and Completed faults
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Parts Requests (Supervisor) ── */}
            {supervisorUser && (
              <View style={styles.actionsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts Requests</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
                    Approve mechanics' mid-work parts requests
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.overdueCard, { backgroundColor: colors.white, borderColor: '#EA580C40' }]}
                  onPress={() => navigation.navigate('PartsApproval')}
                  activeOpacity={0.7}
                >
                  <View style={styles.overdueLeft}>
                    <View style={[styles.overdueDot, { backgroundColor: '#EA580C' }]} />
                    <View>
                      <Text style={[styles.overdueTitle, { color: colors.dark }]}>Review Parts Requests</Text>
                      <Text style={[styles.overdueSub, { color: colors.gray }]}>
                        Approve or reject requested quantities
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.gray} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Overdue Incidents (Technical Head / Depot Head) ── */}
            {(technicalHeadUser || depotHeadUser) && (
              <View style={styles.actionsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: '#BB0000' }]}>Overdue Incidents</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
                    {overdueIncidents.length > 0
                      ? `${overdueIncidents.length} overdue`
                      : 'No overdue incidents'}
                  </Text>
                </View>
                {overdueIncidents.length === 0 ? (
                  <View style={[styles.actionCard, { backgroundColor: colors.white, borderColor: colors.border, width: '100%', minHeight: 60, alignItems: 'flex-start', padding: SPACING.md }]}>
                    <Text style={[styles.actionSubtext, { color: colors.gray }]}>All incidents are within SLA. API pending — will populate once GetOverdueIncidents is live.</Text>
                  </View>
                ) : (
                  overdueIncidents.map((incident, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.overdueCard, { backgroundColor: colors.white, borderColor: '#BB000040' }]}
                      onPress={() => navigation.navigate('ComplaintDetail', {
                        complaintNo: incident.DocEntry || incident.ComplaintNo,
                        dbName: dbName || 'MUTSPL_TEST',
                        complaintType: incident.ComplaintType,
                      })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.overdueLeft}>
                        <View style={[styles.overdueDot, { backgroundColor: '#BB0000' }]} />
                        <View>
                          <Text style={[styles.overdueTitle, { color: colors.dark }]}>
                            #{incident.DocEntry || incident.ComplaintNo} — {getBusLabel(incident)}
                          </Text>
                          <Text style={[styles.overdueSub, { color: colors.gray }]}>
                            {incident.ComplaintType} · {incident.Priority || 'Medium'}
                          </Text>
                          {incident.OverdueDays && (
                            <Text style={[styles.overdueDay, { color: '#BB0000' }]}>
                              Overdue by {incident.OverdueDays} day{incident.OverdueDays !== 1 ? 's' : ''}
                            </Text>
                          )}
                        </View>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={colors.gray} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Quick Actions */}
            <View style={styles.actionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.dark }]}>Quick Actions</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>Access key features</Text>
              </View>
              
              <View style={styles.actionsGrid}>
                {!showMechanicDashboard && !teamLeaderUser && (
                  <TouchableOpacity
                    style={styles.actionCardWrapper}
                    onPress={() => navigation.navigate('Complaints')}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionCard, { backgroundColor: colors.white, borderColor: colors.border }]}> 
                      <View style={[styles.actionIconContainer, { backgroundColor: alpha(colors.primary, '14') }]}>
                        <MaterialIcons name="assignment" size={30} color={colors.primary} />
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.dark }]}>{driverUser ? 'My Incidents' : 'Incidents'}</Text>
                      <Text style={[styles.actionSubtext, { color: colors.gray }]}>{driverUser ? 'View what you reported' : 'View & manage'}</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {!driverUser && (
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
                )}

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
      {showMechanicDashboard && (
        <FAB
          icon="add"
          onPress={() => navigation.navigate('CreateIncident', { type: 'breakdown' })}
        />
      )}
      {driverUser && (
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
  // Overdue Incidents (TechnicalHead / DepotHead)
  overdueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    elevation: 1,
  },
  overdueLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  overdueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: SPACING.sm,
  },
  overdueTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  overdueSub: {
    fontSize: 12,
    marginTop: 2,
  },
  overdueDay: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});

export default DashboardScreen;

