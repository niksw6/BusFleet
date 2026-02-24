import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';
import { jobCardService } from '../../../api/services';
import { formatDate, getStatusName } from '../../../utils/helpers';

const WorkOrderApiDetailScreen = ({ route }) => {
  const { workOrderDocEntry, dbName: routeDbName } = route.params || {};
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const dbName = useSelector(state => state.auth.dbName) || routeDbName;
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(true);
  const [workOrderDetail, setWorkOrderDetail] = useState(null);

  useEffect(() => {
    fetchWorkOrderDetail();
  }, [workOrderDocEntry]);

  const fetchWorkOrderDetail = async () => {
    try {
      setLoading(true);
      if (!workOrderDocEntry) {
        setWorkOrderDetail(null);
        return;
      }

      const response = await jobCardService.getWorkOrderById(dbName || 'MUTSPL_TEST', workOrderDocEntry);
      if (response?.Success && response?.Data) {
        setWorkOrderDetail(response.Data);
      } else {
        setWorkOrderDetail(null);
      }
    } catch (error) {
      console.error('Error fetching work order detail:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load',
        text2: 'Unable to fetch work order details',
      });
      setWorkOrderDetail(null);
    } finally {
      setLoading(false);
    }
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

  const detailRows = [
    ['DocEntry', workOrderDetail?.DocEntry ?? '-'],
    ['JCDocEnt', workOrderDetail?.JCDocEnt ?? '-'],
    ['JCDocNum', workOrderDetail?.JCDocNum || '-'],
    ['Vehicle', workOrderDetail?.Vehicle || '-'],
    ['Driver', workOrderDetail?.Driver || '-'],
    ['Depot', workOrderDetail?.Depot || '-'],
    ['Priority', workOrderDetail?.Priority || '-'],
    ['Status', getStatusName(workOrderDetail?.Status) || workOrderDetail?.Status || '-'],
    ['AssignBy', workOrderDetail?.AssignBy || '-'],
    ['AssignDt', workOrderDetail?.AssignDt ? formatDate(workOrderDetail.AssignDt) : '-'],
    ['TotalHrs', workOrderDetail?.TotalHrs ?? '-'],
    ['PartsSts', workOrderDetail?.PartsSts || '-'],
  ];

  if (loading) {
    return <Loader />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}> 
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Order Details</Text>
          {detailRows.map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.gray }]}>{label}:</Text>
              <Text style={[styles.detailValue, { color: colors.dark }]}>{String(value)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Mechanics</Text>
          {Array.isArray(workOrderDetail?.Mechanics) && workOrderDetail.Mechanics.length > 0 ? (
            workOrderDetail.Mechanics.map((mech, index) => (
              <View key={`mech-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}> 
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {mech?.MechName || '-'} ({mech?.MechCode || '-'})</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Fault: {mech?.Fault || '-'} | Status: {mech?.Status || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Start: {mech?.StartDt ? formatDate(mech.StartDt) : '-'} {formatStartTime(mech?.StartTm)}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>End: {mech?.EndDt ? formatDate(mech.EndDt) : '-'} {formatStartTime(mech?.EndTm)}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>TotalHrs: {mech?.TotalHrs ?? '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Remarks: {mech?.Remarks || '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="person-outline" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No mechanics found</Text>
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Faults</Text>
          {Array.isArray(workOrderDetail?.Faults) && workOrderDetail.Faults.length > 0 ? (
            workOrderDetail.Faults.map((fault, index) => (
              <View key={`fault-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}> 
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {fault?.FaultCode || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Desc: {fault?.FaultDesc || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Status: {fault?.Status || '-'} | TotalHrs: {fault?.TotalHrs ?? '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>CompDate: {fault?.CompDate ? formatDate(fault.CompDate) : '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="report-problem" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No faults found</Text>
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}> 
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts</Text>
          {Array.isArray(workOrderDetail?.Parts) && workOrderDetail.Parts.length > 0 ? (
            workOrderDetail.Parts.map((part, index) => (
              <View key={`part-${index}`} style={[styles.itemCard, { backgroundColor: colors.light }]}> 
                <Text style={[styles.itemTitle, { color: colors.dark }]}>• {part?.ItemCode || '-'} - {part?.ItemName || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>ReqQty: {part?.ReqQty ?? '-'} | IssQty: {part?.IssQty ?? '-'} | AddQty: {part?.AddQty ?? '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Whs: {part?.Whs || '-'} | Fault: {part?.Fault || '-'}</Text>
                <Text style={[styles.itemMeta, { color: colors.gray }]}>Status: {part?.Status || '-'} | DraftEnt: {part?.DraftEnt ?? '-'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="inventory-2" size={24} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.gray }]}>No parts found</Text>
            </View>
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
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    fontSize: 12,
    flex: 1.4,
    textAlign: 'right',
  },
  itemCard: {
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  emptyText: {
    fontSize: 12,
  },
});

export default WorkOrderApiDetailScreen;
