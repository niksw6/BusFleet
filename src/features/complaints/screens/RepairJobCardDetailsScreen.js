import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import MaterialIcons from '../../../shared/components/AppIcon.js';

import { repairService, workEntryService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING } from '../../../constants/theme';
import { formatDate } from '../../../utils/helpers';

const unwrapJobCard = (response) => {
  const data = response?.Data ?? response?.data ?? response;
  if (Array.isArray(data)) return data[0] || null;
  if (!data || typeof data !== 'object') return null;
  for (const key of ['JobCard', 'JobCardDetails', 'RepairJobCard', 'Result']) {
    if (data[key]) return unwrapJobCard(data[key]);
  }
  return data;
};

const getWorkEntryImages = (entry) => {
  const images = [
    ...(Array.isArray(entry?.Images) ? entry.Images : []),
    ...(Array.isArray(entry?.WorkEntryImages) ? entry.WorkEntryImages : []),
    ...(Array.isArray(entry?.WorkImages) ? entry.WorkImages : []),
    ...(Array.isArray(entry?.ImageList) ? entry.ImageList : []),
  ];
  const seen = new Set();
  return images.map(image => ({
    ...image,
    fileName: String(image?.ImgPath || image?.ImagePath || image?.FileName || image?.fileName || '').trim(),
    imageType: String(image?.ImgType || image?.ImageType || image?.Phase || '').trim(),
  })).filter(image => {
    if (!image.fileName || seen.has(image.fileName)) return false;
    seen.add(image.fileName);
    return true;
  });
};

const extractBase64Image = (response) => {
  const queue = [response?.Data ?? response];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === 'string') {
      const value = current.trim();
      const xmlContent = value.match(/<(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>([\s\S]*?)<\/(?:Base64|ImageBase64|FileBase64|Content|Data|Result)>/i)?.[1]?.trim();
      if (xmlContent) return xmlContent;
      if (value.startsWith('data:image/')) return value;
      if (value.length > 100) return value;
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      for (const [key, value] of Object.entries(current)) {
        if (typeof value === 'string' && value.trim() && /base64|imagedata|imgdata|content/i.test(key)) return value.trim();
        queue.push(value);
      }
    }
  }
  return '';
};

const getStatusLabel = (value) => {
  const status = String(value || '').trim().toUpperCase();
  const labels = {
    O: 'Open',
    A: 'Accepted',
    P: 'Pending',
    I: 'In Progress',
    IP: 'In Progress',
    J: 'Job Card Created',
    C: 'Completed',
    CM: 'Completed',
    CL: 'Closed',
    SV: 'Supervisor Verified',
    RQ: 'Requested',
    AP: 'Approved',
    IS: 'Issued',
    RC: 'Received',
    RT: 'Returned',
    RJ: 'Rejected',
  };
  return labels[status] || String(value || '-');
};

const formatRepairDateTime = (dateValue, timeValue) => {
  const date = (formatDate(dateValue) || String(dateValue || '').trim().split(' ')[0]).replace(/-/g, ':');
  const rawTime = String(timeValue || '').trim();
  const compactTime = rawTime.replace(/\s/g, '');
  let time = '';

  if (/^\d{3,4}$/.test(compactTime)) {
    const normalized = compactTime.padStart(4, '0');
    time = formatRepairClock(Number(normalized.slice(0, 2)), Number(normalized.slice(2)));
  } else {
    const match = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const period = match[3]?.toUpperCase();
      time = formatRepairClock(hours, minutes, period);
    }
  }

  return [date, time || rawTime].filter(Boolean).join(' ') || '-';
};

const formatRepairClock = (hours, minutes, period) => {
  const normalizedPeriod = period || (hours >= 12 ? 'PM' : 'AM');
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${normalizedPeriod}`;
};

const getStatusColors = (value) => {
  const status = String(value || '').trim().toUpperCase();
  if (['C', 'CM', 'CL', 'SV', 'RC', 'RT', 'RETURNED', 'COMPLETED', 'CLOSED'].includes(status)) {
    return { text: '#166534', background: '#DCFCE7' };
  }
  if (['RJ', 'D', 'REJECTED', 'DENIED'].includes(status)) {
    return { text: '#991B1B', background: '#FEE2E2' };
  }
  if (['RQ', 'AP', 'P', 'PENDING'].includes(status)) {
    return { text: '#92400E', background: '#FEF3C7' };
  }
  return { text: '#075985', background: '#E0F2FE' };
};

const StatusBadge = ({ value }) => {
  const tone = getStatusColors(value);
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.background }]}>
      <Text style={[styles.statusBadgeText, { color: tone.text }]}>{getStatusLabel(value)}</Text>
    </View>
  );
};

const TableCell = ({ children, width, header = false, colors }) => (
  <View style={[styles.tableCell, { width }, header && { backgroundColor: colors.light }]}>
    <Text style={[header ? styles.tableHeaderText : styles.tableText, { color: header ? colors.gray : colors.dark }]} numberOfLines={header ? 2 : 3}>
      {children}
    </Text>
  </View>
);

const TableStatusCell = ({ value, width }) => (
  <View style={[styles.tableCell, styles.tableStatusCell, { width }]}>
    <StatusBadge value={value} />
  </View>
);

const InfoRow = ({ label, value, colors }) => (
  <View style={styles.infoRow}>
    <Text style={[styles.infoLabel, { color: colors.gray }]}>{label}</Text>
    <Text style={[styles.infoValue, { color: colors.dark }]}>{value || '-'}</Text>
  </View>
);

const RepairJobCardDetailsScreen = ({ route }) => {
  const dbName = useSelector(state => state.auth.dbName) || route.params?.dbName || 'MUTSPL_TEST';
  const colors = useSelector(state => state.theme.isDarkMode) ? DARK_COLORS : COLORS;
  const jobCardEntry = String(route.params?.jobCardEntry || route.params?.JobCardEntry || route.params?.docEntry || '').trim();
  const [jobCard, setJobCard] = useState(null);
  const [imageUris, setImageUris] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobCard = useCallback(async () => {
    if (!jobCardEntry) {
      setJobCard(null);
      setLoading(false);
      return;
    }
    try {
      const response = await repairService.getRepairJobCard(dbName, jobCardEntry);
      const record = unwrapJobCard(response);
      setJobCard(record);
      const imageRecords = (Array.isArray(record?.WorkEntries) ? record.WorkEntries : []).flatMap(getWorkEntryImages);
      const imageResults = await Promise.allSettled(imageRecords.map(async image => {
        const imageResponse = await workEntryService.getWorkEntryImageBase64(image.fileName);
        const base64 = extractBase64Image(imageResponse);
        if (!base64) throw new Error('Image content was not returned.');
        const contentType = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(base64)?.[1] || 'image/jpeg';
        const cleanBase64 = base64.replace(/^data:[^;]+;base64,/i, '');
        return [image.fileName, `data:${contentType};base64,${cleanBase64}`];
      }));
      setImageUris(Object.fromEntries(imageResults.map((result, index) => (
        result.status === 'fulfilled'
          ? result.value
          : [imageRecords[index].fileName, '']
      ))));
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Unable to load repair job card', text2: error?.message || 'Please try again.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbName, jobCardEntry]);

  useEffect(() => { loadJobCard(); }, [loadJobCard]);

  const refresh = async () => {
    setRefreshing(true);
    await loadJobCard();
  };

  if (loading) return <Loader />;

  if (!jobCard) {
    return (
      <View style={[styles.container, styles.emptyContainer, { backgroundColor: colors.light }]}>
        <Text style={{ color: colors.gray }}>Repair job card details are unavailable.</Text>
      </View>
    );
  }

  const mechanics = Array.isArray(jobCard.Mechanics) ? jobCard.Mechanics : [];
  const parts = Array.isArray(jobCard.Parts) ? jobCard.Parts : [];
  const workEntries = Array.isArray(jobCard.WorkEntries) ? jobCard.WorkEntries : [];
  const getWorkEntryMechanic = (entry) => mechanics.find(mechanic => (
    (entry?.EmpID && Number(mechanic?.EmpID) === Number(entry.EmpID))
    || [entry?.UserCode, entry?.MechanicCode].filter(Boolean).some(code => (
      [mechanic?.UserCode, mechanic?.EmpCode, mechanic?.Code].some(value => String(value || '').trim().toLowerCase() === String(code).trim().toLowerCase())
    ))
  ));

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.light }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={[styles.hero, { backgroundColor: colors.card || colors.white }]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: colors.gray }]}>ASSEMBLY REPAIR</Text>
            <Text style={[styles.heroTitle, { color: colors.dark }]}>Job Card #{jobCard.DocNum || jobCard.JobCardNumber || jobCardEntry}</Text>
            <Text style={[styles.heroAssembly, { color: colors.primary }]}>{jobCard.AssemblyName || jobCard.AssemblyDescription || jobCard.Assembly || 'Assembly'}</Text>
            <Text style={[styles.heroCode, { color: colors.gray }]}>Assembly code {jobCard.Assembly || jobCard.AssemblyCode || jobCard.AssemblyNo || '-'}</Text>
          </View>
          <StatusBadge value={jobCard.Status || jobCard.JobCardStatus} />
        </View>
        <View style={[styles.metricStrip, { borderTopColor: colors.border || '#D9E0E8' }]}>
          {[
            { label: 'MECHANICS', value: mechanics.length },
            { label: 'PARTS', value: parts.length },
            { label: 'WORK ENTRIES', value: workEntries.length },
          ].map(metric => (
            <View key={metric.label} style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.dark }]}>{metric.value}</Text>
              <Text style={[styles.metricLabel, { color: colors.gray }]}>{metric.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="information-outline" size={19} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Job Card Summary</Text>
        </View>
        <View style={styles.summaryGrid}>
          <InfoRow label="Incident" value={jobCard.IncidentNum || jobCard.IncidentEntry || jobCard.IncidentDocEntry} colors={colors} />
          <InfoRow label="Depot" value={jobCard.Depot || jobCard.DepotName} colors={colors} />
          <InfoRow label="Created" value={formatRepairDateTime(jobCard.CreateDt || jobCard.CreatedDate, jobCard.CreateTm || jobCard.CreatedTime)} colors={colors} />
          <InfoRow label="Assembly status" value={getStatusLabel(jobCard.AssemblyStatus)} colors={colors} />
          <InfoRow label="Store person" value={jobCard.StorePersonID || jobCard.StorePerson || jobCard.StoreCode} colors={colors} />
          <InfoRow label="Supervisor" value={jobCard.SupName || jobCard.SupervisorName || jobCard.Supervisor} colors={colors} />
        </View>
        {jobCard.Remarks || jobCard.Description ? (
          <View style={styles.remarksBlock}>
            <Text style={[styles.remarksLabel, { color: colors.gray }]}>JOB CARD REMARKS</Text>
            <Text style={[styles.remarksText, { color: colors.dark }]}>{jobCard.Remarks || jobCard.Description}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="account-hard-hat" size={19} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Mechanics</Text>
          <Text style={[styles.sectionCount, { color: colors.gray }]}>{mechanics.length}</Text>
        </View>
        {mechanics.length === 0 ? <Text style={[styles.emptyText, { color: colors.gray }]}>No mechanics assigned.</Text> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader, { borderColor: colors.border || '#D9E0E8' }]}>
                <TableCell width={190} header colors={colors}>Mechanic</TableCell>
                <TableCell width={115} header colors={colors}>Employee ID</TableCell>
                <TableCell width={135} header colors={colors}>Status</TableCell>
              </View>
              {mechanics.map((mechanic, index) => (
                <View key={`${mechanic.EmpID || mechanic.EmpCode || index}`} style={[styles.tableRow, { borderColor: colors.border || '#D9E0E8' }]}>
                  <TableCell width={190} colors={colors}>{mechanic.EmpName || mechanic.MechanicName || mechanic.UserCode || mechanic.EmpCode || 'Mechanic'}</TableCell>
                  <TableCell width={115} colors={colors}>{mechanic.EmpID || mechanic.EmpCode || '-'}</TableCell>
                  <TableStatusCell width={135} value={mechanic.Status || mechanic.MechanicStatus} />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="package-variant-closed" size={19} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Parts</Text>
          <Text style={[styles.sectionCount, { color: colors.gray }]}>{parts.length}</Text>
        </View>
        {parts.length === 0 ? <Text style={[styles.emptyText, { color: colors.gray }]}>No parts linked to this job card.</Text> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={[styles.table, styles.partsTable]}>
              <View style={[styles.tableRow, styles.tableHeader, { borderColor: colors.border || '#D9E0E8' }]}>
                <TableCell width={210} header colors={colors}>Part</TableCell>
                <TableCell width={105} header colors={colors}>Status</TableCell>
                <TableCell width={74} header colors={colors}>Req.</TableCell>
                <TableCell width={74} header colors={colors}>Appr.</TableCell>
                <TableCell width={74} header colors={colors}>Issued</TableCell>
                <TableCell width={82} header colors={colors}>Received</TableCell>
                <TableCell width={82} header colors={colors}>Returned</TableCell>
              </View>
              {parts.map((part, index) => (
                <View key={`${part.LineId || index}-${part.ItemCode || ''}`} style={[styles.tableRow, { borderColor: colors.border || '#D9E0E8' }]}>
                  <TableCell width={210} colors={colors}>{`${part.ItemName || part.ItemCode || 'Part'}\n${part.ItemCode || ''}`}</TableCell>
                  <TableStatusCell width={105} value={part.IssueStatus || part.Status} />
                  <TableCell width={74} colors={colors}>{part.ReqQty ?? 0}</TableCell>
                  <TableCell width={74} colors={colors}>{part.ApprovedQty ?? 0}</TableCell>
                  <TableCell width={74} colors={colors}>{part.IssuedQty ?? 0}</TableCell>
                  <TableCell width={82} colors={colors}>{part.ReceivedQty ?? 0}</TableCell>
                  <TableCell width={82} colors={colors}>{part.ReturnedQty ?? 0}</TableCell>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        {parts.some(part => part.Remarks) ? (
          <View style={styles.partRemarks}>
            {parts.filter(part => part.Remarks).map((part, index) => (
              <Text key={`${part.LineId || index}-remarks`} style={[styles.partRemarksText, { color: colors.gray }]}>
                {part.ItemName || part.ItemCode}: {part.Remarks}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="clipboard-text-clock-outline" size={19} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Work Entries</Text>
          <Text style={[styles.sectionCount, { color: colors.gray }]}>{workEntries.length}</Text>
        </View>
        {workEntries.length === 0 ? <Text style={[styles.emptyText, { color: colors.gray }]}>No work entries yet.</Text> : workEntries.map((entry, index) => (
          <View key={`${entry.WorkEntryDocEntry || entry.DocEntry || index}`} style={[styles.workEntry, { borderColor: colors.border || '#D9E0E8' }]}>
            {(() => {
              const mechanic = getWorkEntryMechanic(entry);
              const entryParts = Array.isArray(entry.Parts) ? entry.Parts : [];
              const entryImages = getWorkEntryImages(entry);
              return (
                <>
            <View style={styles.workEntryHeader}>
              <View style={styles.workEntryHeading}>
                <Text style={[styles.workEntryTitle, { color: colors.dark }]}>Work Entry #{entry.WorkEntryDocNum || entry.DocNum || entry.WorkEntryDocEntry || entry.DocEntry || index + 1}</Text>
                <Text style={[styles.workEntryMeta, { color: colors.gray }]}>{entry.MechanicName || entry.MechName || mechanic?.EmpName || entry.UserCode || mechanic?.UserCode || entry.EmpID || 'Mechanic'}</Text>
              </View>
              <StatusBadge value={entry.Status || entry.WorkStatus} />
            </View>
            <View style={styles.workEntryDates}>
              <InfoRow label="Started" value={formatRepairDateTime(entry.StartDt || entry.StartDate, entry.StartTm || entry.StartTime)} colors={colors} />
              <InfoRow label="Completed" value={formatRepairDateTime(entry.EndDt || entry.CompleteDate, entry.EndTm || entry.CompleteTime)} colors={colors} />
            </View>
            {entry.Remarks ? <Text style={[styles.workRemarks, { color: colors.gray }]}>{entry.Remarks}</Text> : null}
            {entryParts.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray }]}>PARTS FOR THIS WORK ENTRY</Text>
                {entryParts.map((part, partIndex) => (
                  <View key={`entry-part-${part.LineId || partIndex}-${part.ItemCode || ''}`} style={[styles.entryPartRow, { borderColor: colors.border || '#D9E0E8' }]}>
                    <View style={styles.entryPartCopy}>
                      <Text style={[styles.workDetailType, { color: colors.dark }]}>{part.ItemName || part.ItemCode || 'Part'}</Text>
                      <Text style={[styles.workEntryMeta, { color: colors.gray }]}>{part.ItemCode || '-'}</Text>
                      <Text style={[styles.workEntryMeta, { color: colors.gray }]}>Req {part.ReqQty ?? 0} | Issued {part.IssuedQty ?? 0} | Received {part.ReceivedQty ?? 0} | Returned {part.ReturnedQty ?? 0}</Text>
                    </View>
                    <StatusBadge value={part.IssueStatus || part.Status} />
                  </View>
                ))}
              </View>
            ) : null}
            {(Array.isArray(entry.WorkDetails) ? entry.WorkDetails : []).length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray }]}>WORK DETAILS</Text>
                {entry.WorkDetails.map((detail, detailIndex) => (
                  <View key={`${detail.LineId || detailIndex}`} style={[styles.workDetailRow, { borderColor: colors.border || '#D9E0E8' }]}>
                    <Text style={[styles.workDetailType, { color: colors.dark }]}>{detail.WorkType || 'Work detail'}</Text>
                    <Text style={[styles.workDetailDescription, { color: colors.dark }]}>{detail.Description || detail.WorkDone || '-'}</Text>
                    {detail.Remarks ? <Text style={[styles.workEntryMeta, { color: colors.gray }]}>{detail.Remarks}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
            {(Array.isArray(entry.SpecialTools) ? entry.SpecialTools : []).length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray }]}>SPECIAL TOOLS</Text>
                {entry.SpecialTools.map((tool, toolIndex) => (
                  <View key={`tool-${tool.LineId || toolIndex}`} style={styles.toolRow}>
                    <View style={styles.toolCopy}>
                      <Text style={[styles.workDetailType, { color: colors.dark }]}>{tool.ToolName || tool.ToolCode || 'Special tool'}</Text>
                      <Text style={[styles.workEntryMeta, { color: colors.gray }]}>Code {tool.ToolCode || '-'}</Text>
                    </View>
                    <StatusBadge value={tool.Status || tool.ToolStatus} />
                  </View>
                ))}
              </View>
            ) : null}
            {entryImages.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray }]}>WORK IMAGES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageStrip}>
                  {entryImages.map((image, imageIndex) => {
                    const uri = imageUris[image.fileName];
                    return (
                      <TouchableOpacity
                        key={`${image.fileName}-${imageIndex}`}
                        style={[styles.imageTile, { borderColor: colors.border || '#D9E0E8' }]}
                        onPress={() => uri && setPreviewImage({ uri, title: image.imageType || `Work image ${imageIndex + 1}` })}
                        disabled={!uri}
                        activeOpacity={0.8}
                      >
                        {uri ? <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" /> : (
                          <View style={[styles.thumbnail, styles.imagePlaceholder, { backgroundColor: colors.light }]}>
                            <MaterialIcons name="image-off-outline" size={22} color={colors.gray} />
                            <Text style={[styles.imageCaption, { color: colors.gray }]}>Unavailable</Text>
                          </View>
                        )}
                        <Text style={[styles.imageCaption, { color: colors.gray }]} numberOfLines={1}>{image.imageType || `Image ${imageIndex + 1}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
                </>
              );
            })()}
          </View>
        ))}
      </View>

      <Modal visible={Boolean(previewImage)} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setPreviewImage(null)} />
          <View style={[styles.previewPanel, { backgroundColor: colors.card || colors.white }]}>
            <Text style={[styles.previewTitle, { color: colors.dark }]}>{previewImage?.title || 'Work image'}</Text>
            {previewImage?.uri ? <Image source={{ uri: previewImage.uri }} style={styles.previewImage} resizeMode="contain" /> : null}
            <Button onPress={() => setPreviewImage(null)}>Close</Button>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  emptyContainer: { justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  hero: { padding: SPACING.md, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#0E7490', marginBottom: SPACING.lg },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroCopy: { flex: 1, marginRight: SPACING.sm },
  eyebrow: { fontSize: 11, fontWeight: '700', marginBottom: 5 },
  heroTitle: { fontSize: 21, fontWeight: '700', marginBottom: 4 },
  heroAssembly: { fontSize: 15, fontWeight: '600' },
  heroCode: { fontSize: 12, marginTop: 3 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  metricStrip: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: SPACING.md, paddingTop: SPACING.sm },
  metric: { flex: 1 },
  metricValue: { fontSize: 19, fontWeight: '700' },
  metricLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  section: { marginBottom: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionCount: { marginLeft: 'auto', fontSize: 13, fontWeight: '600' },
  summaryGrid: { padding: SPACING.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9E0E8', borderRadius: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  infoLabel: { width: 112, fontSize: 12 },
  infoValue: { flex: 1, flexShrink: 1, fontSize: 13, fontWeight: '500' },
  remarksBlock: { marginTop: SPACING.sm, padding: SPACING.sm, borderLeftWidth: 3, borderLeftColor: '#0E7490' },
  remarksLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  remarksText: { fontSize: 13, lineHeight: 19 },
  emptyText: { fontSize: 13, paddingVertical: SPACING.sm },
  table: { minWidth: 440, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9E0E8', borderRadius: 8, overflow: 'hidden' },
  partsTable: { minWidth: 701 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  tableHeader: { minHeight: 40 },
  tableCell: { justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#D9E0E8' },
  tableStatusCell: { alignItems: 'flex-start' },
  tableHeaderText: { fontSize: 10, fontWeight: '700' },
  tableText: { fontSize: 12, lineHeight: 16 },
  partRemarks: { marginTop: SPACING.sm },
  partRemarksText: { fontSize: 11, lineHeight: 16, marginBottom: 3 },
  workEntry: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9E0E8', borderRadius: 8, padding: SPACING.sm, marginBottom: SPACING.sm },
  workEntryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SPACING.xs },
  workEntryHeading: { flex: 1, marginRight: SPACING.sm },
  workEntryTitle: { fontSize: 14, fontWeight: '700' },
  workEntryMeta: { fontSize: 11, lineHeight: 16 },
  workEntryDates: { marginTop: 2 },
  workRemarks: { fontSize: 12, lineHeight: 17, marginTop: SPACING.xs },
  subsection: { marginTop: SPACING.sm },
  subsectionTitle: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  workDetailRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  workDetailType: { fontSize: 12, fontWeight: '700' },
  workDetailDescription: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  entryPartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  entryPartCopy: { flex: 1, marginRight: SPACING.sm },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#D9E0E8', paddingVertical: 7 },
  toolCopy: { flex: 1, marginRight: SPACING.sm },
  imageStrip: { gap: SPACING.sm, paddingVertical: 4 },
  imageTile: { width: 104, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: 'hidden' },
  thumbnail: { width: 102, height: 76, backgroundColor: '#E5E7EB' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  imageCaption: { paddingHorizontal: 5, paddingVertical: 4, fontSize: 10 },
  previewOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.md, backgroundColor: 'rgba(0,0,0,0.7)' },
  previewPanel: { width: '100%', maxHeight: '90%', padding: SPACING.md, borderRadius: 8 },
  previewTitle: { fontSize: 15, fontWeight: '700', marginBottom: SPACING.sm },
  previewImage: { width: '100%', height: 420, marginBottom: SPACING.sm },
});

export default RepairJobCardDetailsScreen;