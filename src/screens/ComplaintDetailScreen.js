import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Text, Divider, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { complaintService } from '../api/services';
import { getStatusName } from '../utils/helpers';

const ComplaintDetailScreen = ({ route, navigation }) => {
  const { complaintNo, dbName, complaintType, jobCardNo: routeJobCardNo } = route.params;
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user);
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  
  // Determine if this is a breakdown or complaint
  const isBreakdown = complaintType?.toLowerCase().includes('breakdown');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [complaint, setComplaint] = useState(null);

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

  useEffect(() => {
    fetchComplaintDetail();
  }, [complaintNo]);

  const fetchComplaintDetail = async () => {
    try {
      setLoading(true);
      console.log('📄 Fetching incident detail:', complaintNo, 'Type:', complaintType);
      
      // Use appropriate API based on complaint type
      const response = isBreakdown
        ? await complaintService.getBreakdownDetail(dbName, complaintNo)
        : await complaintService.getComplaintDetail(dbName, complaintNo);
      
      console.log('📄 Incident detail response:', response);
      
      if (response.Success && response.Data) {
        console.log('📄 All available fields in response.Data:', Object.keys(response.Data));
        console.log('📄 Checking for job card fields:');
        console.log('   - JobCardNo:', response.Data.JobCardNo);
        console.log('   - JobCard:', response.Data.JobCard);
        console.log('   - JobCardDocEntry:', response.Data.JobCardDocEntry);
        console.log('   - JobCardEntry:', response.Data.JobCardEntry);
        console.log('   - JobCardStatus:', response.Data.JobCardStatus);
        
        // Normalize complaint/breakdown fields into one incident shape
        let normalizedData = {
          ...response.Data,
          ComplaintNo: response.Data.ComplaintNo || response.Data.DocEntry || response.Data.BreakdownNo,
          BusNo: response.Data.BusNo || response.Data.RegNo,
          ComplaintType: response.Data.ComplaintType || response.Data.JobType || complaintType,
          ComplaintDate: response.Data.ComplaintDate || response.Data.RegDate || response.Data.BreakdownDate || response.Data.ReportDate,
          ComplaintTime: response.Data.ComplaintTime || response.Data.RegTime || response.Data.BreakdownTime || response.Data.ReportTime,
          Description: response.Data.Description || response.Data.Dscrpton || response.Data.BreakdownPlace,
          DriverName: response.Data.DriverName || response.Data.DrvName,
          DriverCode: response.Data.DriverCode || response.Data.DrvCode,
          Odometer: response.Data.Odometer || response.Data.Odometr,
          SupervisorName: response.Data.SupervisorName || response.Data.SprvsrNm,
          SupervisorCode: response.Data.SupervisorCode || response.Data.Supervisr,
          RouteNo: response.Data.RouteNo || response.Data.Route || response.Data.RoutNo,
          BreakdownPlace: response.Data.BrkPlace || response.Data.BreakdownPlace || response.Data.Location,
          JobCardNo: response.Data.JobCardNo || response.Data.JobcardNo || response.Data.JobCard || routeJobCardNo || '',
          JobCardDocEntry: response.Data.JobCardDocEntry || response.Data.JobCardEntry,
          JobCardStatus: response.Data.JobCardStatus,
          JobCardDate: response.Data.JobCardDate || response.Data.JobCardRegDate,
        };
        
        setComplaint(normalizedData);
      }
    } catch (error) {
      console.error('Error fetching complaint detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchComplaintDetail();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.light }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.dark }]}>Loading incident details...</Text>
      </View>
    );
  }

  if (!complaint) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.light }]}>
        <MaterialIcons name="error-outline" size={64} color={colors.gray} />
        <Text style={[styles.errorText, { color: colors.dark }]}>Incident not found</Text>
      </View>
    );
  }

  const linkedJobCardNo = String(complaint?.JobCardNo || complaint?.JobcardNo || routeJobCardNo || '').trim();
  const hasLinkedJobCard = linkedJobCardNo.length > 0;
  const jobTypeCode = String(complaint?.ComplaintType || '').toLowerCase().includes('breakdown') ? 'B' : 'D';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.light }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Header Card */}
      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.complaintNo, { color: colors.dark }]}>Incident #{complaint.ComplaintNo}</Text>
            <Text style={[styles.busNo, { color: colors.primary }]}>
              <MaterialIcons name="directions-bus" size={18} /> Bus {complaint.BusNo}
            </Text>
          </View>
          <View
            style={[styles.priorityBadge, { backgroundColor: getStatusColor(complaint.Status) }]}
          >
            <Text style={styles.priorityText}>{getStatusName(complaint.Status)}</Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.infoRow}>
          <MaterialIcons name="category" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Type:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.ComplaintType}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="flag" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Priority:</Text>
          <View style={[styles.priorityBadge, { 
            backgroundColor: complaint.Priority === 'High' ? '#FF5252' : 
                           complaint.Priority === 'Medium' ? '#FFA726' : '#66BB6A' 
          }]}>
            <Text style={styles.priorityText}>{complaint.Priority}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="event" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Date & Time:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>
            {complaint.ComplaintDate} {complaint.ComplaintTime}
          </Text>
        </View>
      </View>

      {hasLinkedJobCard ? (
        <View style={[styles.card, { backgroundColor: colors.white, marginBottom: 0 }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark, marginBottom: SPACING.sm }]}>
            <MaterialIcons name="assignment" size={20} /> Job Card
          </Text>
          <View style={styles.infoRow}>
            <MaterialIcons name="confirmation-number" size={20} color={colors.primary} />
            <Text style={[styles.infoLabel, { color: colors.gray }]}>Job Card No:</Text>
            <Text style={[styles.infoValue, { color: colors.dark, fontWeight: 'bold' }]}>{linkedJobCardNo}</Text>
          </View>
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={() => navigation.navigate('WorkOrderDetail', {
              docEntry: linkedJobCardNo,
              jobCardNo: linkedJobCardNo,
              jobType: jobTypeCode,
              complaintNo: complaint.ComplaintNo,
              busNo: complaint.BusNo,
              depot: complaint.Depot,
              description: complaint.Description,
              complaintType: complaint.ComplaintType,
              regTime: complaint.RegTime,
              complaintTime: complaint.ComplaintTime,
              incidentTime: complaint.IncidentTime,
              dbName: dbName
            })}
            style={styles.viewJobCardButton}
            contentStyle={{ paddingVertical: 8 }}
          >
            Open Job Card
          </Button>
        </View>
      ) : null}

      {/* Create Job Card Button - show only when not created yet */}
      {!hasLinkedJobCard && (complaint.Status === 'O' || complaint.Status === 'I') ? (
        <View style={[styles.card, { backgroundColor: colors.white, marginTop: 0 }]}>
          <Button
            mode="contained"
            icon="clipboard-text"
            onPress={() => navigation.navigate('CreateJobCard', { 
              complaintNo: complaint.ComplaintNo,
              busNo: complaint.BusNo,
              depot: complaint.Depot,
              faults: complaint.Faults,
              priority: complaint.Priority,
              complaintType: complaint.ComplaintType,
              driverName: complaint.DriverName,
              driverCode: complaint.DriverCode,
              odometer: complaint.Odometer,
              routeNo: complaint.RouteNo,
              breakdownPlace: complaint.BreakdownPlace,
              dbName: dbName
            })}
            style={styles.createJobCardButton}
            contentStyle={{ paddingVertical: 8 }}
          >
            Create Job Card
          </Button>
        </View>
      ) : null}

      {/* Vehicle & Driver Info */}
      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={[styles.sectionTitle, { color: colors.dark }]}>
          <MaterialIcons name="info" size={20} /> Vehicle & Driver Information
        </Text>

        <View style={styles.infoRow}>
          <MaterialIcons name="location-city" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Depot:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.Depot}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="person" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Driver:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>
            {complaint.DriverName} ({complaint.DriverCode})
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="speed" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Odometer:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>{complaint.Odometer} km</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="supervisor-account" size={20} color={colors.gray} />
          <Text style={[styles.infoLabel, { color: colors.gray }]}>Supervisor:</Text>
          <Text style={[styles.infoValue, { color: colors.dark }]}>
            {complaint.SupervisorName} ({complaint.SupervisorCode})
          </Text>
        </View>
      </View>

      {/* Description */}
      {complaint.Description && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            <MaterialIcons name="description" size={20} /> Description
          </Text>
          <Text style={[styles.description, { color: colors.dark }]}>
            {complaint.Description}
          </Text>
        </View>
      )}

      {/* Faults */}
      {complaint.Faults && complaint.Faults.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            <MaterialIcons name="build" size={20} /> Faults
          </Text>
          {complaint.Faults.filter(f => f.Fault && f.Fault.trim() !== '').map((fault, index) => (
            <View key={index} style={[styles.faultItem, { backgroundColor: colors.light }]}>
              <View style={styles.faultHeader}>
                <MaterialIcons name="warning" size={20} color="#FF9800" />
                <Text style={[styles.faultTitle, { color: colors.dark }]}>{fault.Fault}</Text>
              </View>
              {(fault.Description || fault.Dscption || fault.FaultDescription) && (
                <Text style={[styles.faultDescription, { color: colors.gray }]}>
                  {fault.Description || fault.Dscption || fault.FaultDescription}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
  card: {
    margin: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  createJobCardButton: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  viewJobCardButton: {
    borderRadius: BORDER_RADIUS.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  complaintNo: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  busNo: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    marginVertical: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 14,
    marginLeft: SPACING.sm,
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  faultItem: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  faultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  faultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: SPACING.sm,
    flex: 1,
  },
  faultDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 28,
  },
});

export default ComplaintDetailScreen;
