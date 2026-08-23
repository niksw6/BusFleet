﻿﻿﻿﻿/**
 * WorkOrderRenderers.js
 * Rich, interactive tab renderers for WorkOrderDetailScreen.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Clipboard } from 'react-native';
import MaterialIcons from '../../../components/AppIcon.js';
import { SPACING, BORDER_RADIUS, COLORS, DARK_COLORS } from '../../../constants/theme';
import { getJobTypeCode, formatDate, formatTime } from '../../../utils/helpers';

export const KeyValue = ({ label, value, copyable, theme, icon, fullWidth }) => {
  const colors = theme.colors;
  const display = (value === null || value === undefined || value === '') ? '\u2014' : String(value);
  const handleCopy = useCallback(() => {
    if (!copyable || display === '\u2014') return;
    try { Clipboard.setString(display); } catch (_) {}
  }, [copyable, display]);
  return (
    <TouchableOpacity
      activeOpacity={copyable ? 0.6 : 1}
      onPress={handleCopy}
      style={[kvStyles.row, fullWidth && kvStyles.rowFull, { borderBottomColor: colors.border || '#EEE' }]}
    >
      <View style={kvStyles.labelCol}>
        {icon ? <MaterialIcons name={icon} size={14} color={colors.gray} style={kvStyles.icon} /> : null}
        <Text style={[kvStyles.label, { color: colors.gray }]} numberOfLines={1}>{label}</Text>
      </View>
      <View style={kvStyles.valueCol}>
        <Text style={[kvStyles.value, { color: colors.dark }]} numberOfLines={2}>{display}</Text>
        {copyable && display !== '\u2014' ? (
          <MaterialIcons name="content-copy" size={12} color={colors.gray} style={kvStyles.copyHint} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const kvStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 40, alignItems: 'center' },
  rowFull: { flexDirection: 'column', alignItems: 'flex-start' },
  labelCol: { flexDirection: 'row', alignItems: 'center', width: 130, flexShrink: 0 },
  icon: { marginRight: 4 },
  label: { fontSize: 13, fontWeight: '500' },
  valueCol: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  value: { fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  copyHint: { marginLeft: 6, opacity: 0.6 },
});

export const SectionHeader = ({ title, count, theme, icon, action }) => {
  const colors = theme.colors;
  return (
    <View style={shStyles.row}>
      <View style={shStyles.left}>
        {icon ? <MaterialIcons name={icon} size={18} color={colors.primary} style={shStyles.icon} /> : null}
        <Text style={[shStyles.title, { color: colors.dark }]}>{title}</Text>
        {typeof count === 'number' && count > 0 ? (
          <View style={[shStyles.badge, { backgroundColor: colors.primary }]}>
            <Text style={shStyles.badgeText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
};

const shStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, marginBottom: SPACING.xs, paddingHorizontal: SPACING.md },
  left: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 6 },
  title: { fontSize: 15, fontWeight: '700' },
  badge: { marginLeft: 8, minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});

const STATUS_PALETTE = {
  O:  { bg: '#FFF3CD', fg: '#856404', label: 'Open' },
  I:  { bg: '#D1ECF1', fg: '#0C5460', label: 'In Progress' },
  CM: { bg: '#D4EDDA', fg: '#155724', label: 'Completed' },
  C:  { bg: '#D4EDDA', fg: '#155724', label: 'Closed' },
  D:  { bg: '#F8D7DA', fg: '#721C24', label: 'Declined' },
  R:  { bg: '#F8D7DA', fg: '#721C24', label: 'Rejected' },
  A:  { bg: '#D4EDDA', fg: '#155724', label: 'Accepted' },
  P:  { bg: '#E2E3E5', fg: '#383D41', label: 'Pending' },
  SV: { bg: '#D4EDDA', fg: '#155724', label: 'Verified' },
  RW: { bg: '#FFF3CD', fg: '#856404', label: 'Rework' },
  RQ: { bg: '#E2E3E5', fg: '#383D41', label: 'Requested' },
  AP: { bg: '#D1ECF1', fg: '#0C5460', label: 'Approved' },
  IS: { bg: '#D4EDDA', fg: '#155724', label: 'Issued' },
  RC: { bg: '#D4EDDA', fg: '#155724', label: 'Received' },
  PR: { bg: '#FFF3CD', fg: '#856404', label: 'Partial' },
  PS: { bg: '#FFF3CD', fg: '#856404', label: 'Partial Issue' },
  RJ: { bg: '#F8D7DA', fg: '#721C24', label: 'Rejected' },
};

export const StatusPill = ({ status, theme, size }) => {
  size = size || 'md';
  const colors = theme.colors;
  const code = String(status || '').trim().toUpperCase();
  const cfg = STATUS_PALETTE[code] || { bg: '#E2E3E5', fg: '#383D41', label: code || 'Unknown' };
  const pad = size === 'sm' ? { paddingVertical: 2, paddingHorizontal: 6, fontSize: 11 } : { paddingVertical: 4, paddingHorizontal: 10, fontSize: 12 };
  return (
    <View style={[spStyles.pill, { backgroundColor: cfg.bg }, { paddingVertical: pad.paddingVertical, paddingHorizontal: pad.paddingHorizontal }]}>
      <Text style={[spStyles.text, { color: cfg.fg }, { fontSize: pad.fontSize }]}>{cfg.label}</Text>
    </View>
  );
};

const spStyles = StyleSheet.create({
  pill: { borderRadius: 12, alignSelf: 'flex-start' },
  text: { fontWeight: '700' },
});

export const EmptyState = ({ message, icon, theme }) => {
  const colors = theme.colors;
  return (
    <View style={esStyles.box}>
      {icon ? <MaterialIcons name={icon} size={36} color={colors.gray} /> : null}
      <Text style={[esStyles.text, { color: colors.gray }]}>{message || 'Nothing here yet.'}</Text>
    </View>
  );
};

const esStyles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg },
  text: { fontSize: 13, marginTop: SPACING.sm, textAlign: 'center' },
});

export const CollapsibleCard = ({ title, subtitle, badge, theme, defaultOpen, children, headerRight }) => {
  const colors = theme.colors;
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <View style={[ccStyles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen((v) => !v)} style={ccStyles.header}>
        <View style={{ flex: 1 }}>
          <View style={ccStyles.titleRow}>
            <Text style={[ccStyles.title, { color: colors.dark }]} numberOfLines={1}>{title}</Text>
            {badge}
          </View>
          {subtitle ? <Text style={[ccStyles.subtitle, { color: colors.gray }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {headerRight ? <View style={{ marginRight: 8 }}>{headerRight}</View> : null}
        <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color={colors.gray} />
      </TouchableOpacity>
      {open ? <View style={ccStyles.body}>{children}</View> : null}
    </View>
  );
};

const ccStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  subtitle: { fontSize: 12, marginTop: 2 },
  body: { paddingBottom: SPACING.xs },
});

export const buildTheme = (isDarkMode) => {
  const colors = isDarkMode ? DARK_COLORS : COLORS;
  return { colors, isDarkMode };
};

const safeStr = (v) => (v === null || v === undefined || v === '') ? '' : String(v).trim();
const fmtDateTime = (date, time) => {
  const d = safeStr(date); const t = safeStr(time);
  if (!d && !t) return '';
  // Use helpers so /Date(...)/ and ISO formats are recognized
  const datePart = d ? (formatDate(d) || d) : '';
  const timePart = t ? (formatTime(t) || t) : '';
  return [datePart, timePart].filter(Boolean).join(' ');
};
const fmtQty = (n) => { const num = Number(n); if (!isFinite(num)) return '0'; return num.toLocaleString(); };

export const renderDetailsTab = ({ workOrder, theme }) => {
  if (!workOrder) return <EmptyState icon="description" message="No job card details available." theme={theme} />;
  const wo = workOrder || {};
  const status = safeStr(wo.Status);
  const jcDisplay = safeStr(wo.JobCardNo);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
      <SectionHeader title="Identification" theme={theme} icon="fingerprint" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Job Card No" value={jcDisplay} copyable theme={theme} icon="tag" />
        <KeyValue label="Doc Entry" value={safeStr(wo.DocEntry) || safeStr(wo.JobCardDocEntry)} copyable theme={theme} icon="key" />
        <KeyValue label="Job Type" value={safeStr(getJobTypeCode(wo) || wo.JobType)} theme={theme} icon="category" />
        <KeyValue label="Status" value={status} theme={theme} icon="flag" />
      </View>
      {status ? (
        <View style={{ paddingHorizontal: SPACING.md, marginTop: -SPACING.xs, marginBottom: SPACING.sm }}>
          <StatusPill status={status} theme={theme} />
        </View>
      ) : null}

      <SectionHeader title="Schedule" theme={theme} icon="schedule" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Created Date" value={fmtDateTime(wo.CreateDate, wo.CreateTime)} theme={theme} icon="event" />
        <KeyValue label="Doc Date" value={fmtDateTime(wo.DocDate, wo.DocTime)} theme={theme} icon="today" />
        <KeyValue label="Due Date" value={safeStr(wo.DueDate) || safeStr(wo.RequiredDate)} theme={theme} icon="alarm" />
        <KeyValue label="Start Date" value={safeStr(wo.StartDate)} theme={theme} icon="play-arrow" />
        <KeyValue label="Finish Date" value={fmtDateTime(wo.FinishDate, wo.FinishTime)} theme={theme} icon="check-circle" />
        <KeyValue label="Closed Date" value={fmtDateTime(wo.CloseDate, wo.CloseTime)} theme={theme} icon="lock" />
      </View>

      <SectionHeader title="Vehicle" theme={theme} icon="directions-bus" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Bus No" value={safeStr(wo.BusNo) || safeStr(wo.VehicleNo) || safeStr(wo.RegNo)} copyable theme={theme} icon="directions-bus" />
        <KeyValue label="Bus Code" value={safeStr(wo.BusCode) || safeStr(wo.ItemCode)} copyable theme={theme} icon="qr-code" />
        <KeyValue label="Plate / Reg" value={safeStr(wo.PlateNo) || safeStr(wo.RegistrationNo)} theme={theme} icon="confirmation-number" />
      </View>

      <SectionHeader title="Location & Team" theme={theme} icon="place" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Depot" value={safeStr(wo.Depot) || safeStr(wo.DepotName) || safeStr(wo.Branch)} theme={theme} icon="store" />
        <KeyValue label="Route" value={safeStr(wo.RouteCode) || safeStr(wo.RouteName)} theme={theme} icon="alt-route" />
        <KeyValue label="Location" value={safeStr(wo.Location) || safeStr(wo.Site) || safeStr(wo.Station)} theme={theme} icon="location-on" />
        <KeyValue label="Team" value={safeStr(wo.TeamCode) || safeStr(wo.TeamName)} theme={theme} icon="groups" />
        <KeyValue label="Supervisor" value={safeStr(wo.SupervisorName) || safeStr(wo.Supervisor) || safeStr(wo.SupervisorCode)} theme={theme} icon="supervisor-account" />
      </View>

      <SectionHeader title="Priority & Type" theme={theme} icon="priority-high" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Priority" value={safeStr(wo.Priority) || safeStr(wo.Urgency)} theme={theme} icon="priority-high" />
        <KeyValue label="Complaint Type" value={safeStr(wo.ComplaintType)} theme={theme} icon="report-problem" />
        <KeyValue label="Origin" value={safeStr(wo.Origin) || safeStr(wo.Source)} theme={theme} icon="source" />
        <KeyValue label="Shift" value={safeStr(wo.Shift)} theme={theme} icon="access-time" />
      </View>

      <SectionHeader title="Customer / Reference" theme={theme} icon="link" />
      <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <KeyValue label="Complaint No" value={safeStr(wo.ComplaintNo) || safeStr(wo.IncidentNo)} copyable theme={theme} icon="report" />
        <KeyValue label="Customer Code" value={safeStr(wo.CustomerCode) || safeStr(wo.CardCode)} copyable theme={theme} icon="person" />
        <KeyValue label="Customer Name" value={safeStr(wo.CustomerName) || safeStr(wo.CardName)} theme={theme} icon="badge" />
        <KeyValue label="Reference" value={safeStr(wo.RefNo) || safeStr(wo.Reference)} copyable theme={theme} icon="bookmark" />
      </View>

      {wo.Remarks || wo.Notes || wo.Description ? (
        <>
          <SectionHeader title="Remarks" theme={theme} icon="notes" />
          <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
            <Text style={[panelStyles.remarks, { color: theme.colors.dark }]}>{safeStr(wo.Remarks) || safeStr(wo.Notes) || safeStr(wo.Description)}</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
};

const panelStyles = StyleSheet.create({
  panel: { marginHorizontal: SPACING.md, borderWidth: 1, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  remarks: { fontSize: 14, lineHeight: 20, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
});

export const renderMechanicsTab = ({ mechanics, theme }) => {
  if (!mechanics || mechanics.length === 0) {
    return <EmptyState icon="engineering" message="No mechanics assigned to this job card." theme={theme} />;
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: SPACING.sm, paddingBottom: SPACING.lg }}>
      <SectionHeader title="Assigned Mechanics" count={mechanics.length} theme={theme} icon="engineering" />
      {mechanics.map((m, idx) => {
        const name = safeStr(m.MechanicName || m.Name || m.MechName || m.UserName) || ('Mechanic #' + (idx + 1));
        const code = safeStr(m.MechanicCode || m.MechCode || m.UserCode || m.Code);
        const team = safeStr(m.TeamName || m.TeamCode);
        const trade = safeStr(m.Trade || m.Role || m.Skill);
        const phone = safeStr(m.Phone || m.Mobile || m.Contact);
        const status = safeStr(m.Status);
        const faults = Array.isArray(m.Faults) ? m.Faults : [];
        return (
          <CollapsibleCard
            key={(code || name) + '-' + idx}
            theme={theme}
            defaultOpen={false}
            title={name}
            subtitle={[code ? ('#' + code) : '', team, trade].filter(Boolean).join(' \u00b7 ')}
            badge={status ? <StatusPill status={status} theme={theme} size="sm" /> : null}
          >
            <KeyValue label="Code" value={code} copyable theme={theme} icon="qr-code" />
            <KeyValue label="Team" value={team} theme={theme} icon="groups" />
            <KeyValue label="Trade" value={trade} theme={theme} icon="build" />
            <KeyValue label="Phone" value={phone} copyable theme={theme} icon="phone" />
            {faults.length > 0 ? (
              <>
                <SectionHeader title="Assigned Faults" count={faults.length} theme={theme} icon="bug-report" />
                <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0', marginTop: 0 }]}>
                  {faults.map((f, fi) => {
                    const fdesc = safeStr(f.FaultDesc || f.Dscption || f.Description || f.FaultName) || ('Fault #' + (fi + 1));
                    const fcode = safeStr(f.FaultCode || f.Code);
                    const fstatus = safeStr(f.Status);
                    return (
                      <View key={(fcode || fdesc) + '-' + fi} style={{ paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border || '#EEE' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ color: theme.colors.dark, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>{fdesc}</Text>
                          {fstatus ? <StatusPill status={fstatus} theme={theme} size="sm" /> : null}
                        </View>
                        {fcode ? <Text style={{ color: theme.colors.gray, fontSize: 12, marginTop: 2 }}>{'Code: ' + fcode}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </CollapsibleCard>
        );
      })}
    </ScrollView>
  );
};

﻿export const renderPartsTab = ({ parts, theme, mechanicPartRequests }) => {
  const woParts = Array.isArray(parts) ? parts : [];
  const reqParts = Array.isArray(mechanicPartRequests) ? mechanicPartRequests : [];
  const merged = [...woParts, ...reqParts];
  try { console.log('[PARTS_TAB_DIAG] woParts=', woParts.length, 'reqParts=', reqParts.length); woParts.forEach((p,i) => console.log('[PARTS_TAB_DIAG] woParts['+i+'].Status=', JSON.stringify(p.Status), 'itemCode=', p.ItemCode)); reqParts.forEach((p,i) => console.log('[PARTS_TAB_DIAG] reqParts['+i+'].Status=', JSON.stringify(p.Status), 'itemCode=', p.ItemCode)); } catch (_) {}
  if (merged.length === 0) {
    return <EmptyState icon="build" message="No parts requested for this job card." theme={theme} />;
  }
  const totalReq = merged.reduce((s, p) => s + Number(p.ReqQty ?? p.RequestedQty ?? p.Qty ?? 0), 0);
  const totalIss = merged.reduce((s, p) => s + Number(p.IssQty ?? p.IssuedQty ?? 0), 0);
  const totalRec = merged.reduce((s, p) => s + Number(p.RecQty ?? p.ReceivedQty ?? 0), 0);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
      <SectionHeader title="Parts Summary" theme={theme} icon="build" />
      <View style={[psStyles.summaryRow, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
        <View style={psStyles.summaryCell}>
          <Text style={[psStyles.summaryNum, { color: theme.colors.primary }]}>{fmtQty(totalReq)}</Text>
          <Text style={[psStyles.summaryLbl, { color: theme.colors.gray }]}>Requested</Text>
        </View>
        <View style={[psStyles.divider, { backgroundColor: theme.colors.border || '#E0E0E0' }]} />
        <View style={psStyles.summaryCell}>
          <Text style={[psStyles.summaryNum, { color: theme.colors.info || '#0C5460' }]}>{fmtQty(totalIss)}</Text>
          <Text style={[psStyles.summaryLbl, { color: theme.colors.gray }]}>Issued</Text>
        </View>
        <View style={[psStyles.divider, { backgroundColor: theme.colors.border || '#E0E0E0' }]} />
        <View style={psStyles.summaryCell}>
          <Text style={[psStyles.summaryNum, { color: theme.colors.success || '#155724' }]}>{fmtQty(totalRec)}</Text>
          <Text style={[psStyles.summaryLbl, { color: theme.colors.gray }]}>Received</Text>
        </View>
      </View>

      {woParts.length > 0 ? (
        <>
          <SectionHeader title="Parts on Job Card" count={woParts.length} theme={theme} icon="list" />
          {woParts.map((p, idx) => renderPartCard(p, idx, theme))}
        </>
      ) : null}

      {reqParts.length > 0 ? (
        <>
          <SectionHeader title="Mechanic Part Requests" count={reqParts.length} theme={theme} icon="engineering" />
          {reqParts.map((p, idx) => renderPartCard(p, woParts.length + idx, theme))}
        </>
      ) : null}
    </ScrollView>
  );
};

const renderPartCard = (p, idx, theme) => {
  // DIAG: log incoming part status
  try { console.log('[PART_DIAG] status=', JSON.stringify(p.Status), 'code=', p.ItemCode); } catch (_) {}

  const code = safeStr(p.ItemCode);
  const name = safeStr(p.ItemName || p.Dscription || p.Name) || (code ? ('Item ' + code) : ('Item #' + (idx + 1)));
  const req = Number(p.ReqQty ?? p.RequestedQty ?? p.Qty ?? 0);
  const iss = Number(p.IssQty ?? p.IssuedQty ?? 0);
  const rec = Number(p.RecQty ?? p.ReceivedQty ?? 0);
  const wh = safeStr(p.Warehouse || p.WhsCode || p.StoreWarehouse);
  const status = safeStr(p.Status);
  const partLine = safeStr(p.PartLine);
  const reqDate = fmtDateTime(p.ReqDate);
  const remarks = safeStr(p.Remarks);
  const vehicle = safeStr(p.Vehicle);
  const mechName = safeStr(p.MechanicName);
  const mechCode = safeStr(p.MechanicCode);
  const jcNo = safeStr(p.JobCardNo);
  const jcDoc = safeStr(p.JobCardDocEntry || p.JCDocEnt);
  const weDoc = safeStr(p.WorkEntryDocEntry);
  const subtitle = [code ? '#' + code : '', wh, mechName ? ('by ' + mechName) : ''].filter(Boolean).join(' ');
  return (
    <CollapsibleCard
      key={(code || name || 'part') + '-' + idx}
      theme={theme}
      defaultOpen={false}
      title={name}
      subtitle={subtitle}
      badge={status ? <StatusPill status={status} theme={theme} size="sm" /> : null}
    >
      <KeyValue label="Item Code" value={code} copyable theme={theme} icon="qr-code" />
      {partLine ? <KeyValue label="Part Line" value={partLine} theme={theme} icon="tag" /> : null}
      <KeyValue label="Requested Qty" value={fmtQty(req)} theme={theme} icon="add-shopping-cart" />
      <KeyValue label="Issued Qty" value={fmtQty(iss)} theme={theme} icon="outbox" />
      <KeyValue label="Received Qty" value={fmtQty(rec)} theme={theme} icon="inventory" />
      <KeyValue label="Warehouse" value={wh} theme={theme} icon="store" />
      {p.UnitPrice || p.Price ? (
        <KeyValue label="Unit Price" value={safeStr(p.UnitPrice || p.Price)} theme={theme} icon="payments" />
      ) : null}
      {p.LineTotal || p.Total ? (
        <KeyValue label="Line Total" value={safeStr(p.LineTotal || p.Total)} theme={theme} icon="calculate" />
      ) : null}
      <KeyValue label="Request Date" value={reqDate} theme={theme} icon="event" />
      {(mechName || mechCode) ? (
        <>
          <KeyValue label="Requested By" value={mechName || '-'} theme={theme} icon="engineering" />
          <KeyValue label="Mechanic Code" value={mechCode} copyable theme={theme} icon="badge" />
        </>
      ) : null}
      {vehicle ? <KeyValue label="Vehicle" value={vehicle} copyable theme={theme} icon="directions-bus" /> : null}
      {jcNo ? (
        <KeyValue label="Job Card No" value={jcNo} copyable theme={theme} icon="description" />
      ) : null}
      {jcDoc ? (
        <KeyValue label="Job Card DocEntry" value={jcDoc} copyable theme={theme} icon="key" />
      ) : null}
      {weDoc ? (
        <KeyValue label="Work Entry DocEntry" value={weDoc} copyable theme={theme} icon="assignment-turned-in" />
      ) : null}
      {remarks ? <KeyValue label="Remarks" value={remarks} theme={theme} icon="notes" fullWidth /> : null}
    </CollapsibleCard>
  );
};


const psStyles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', marginHorizontal: SPACING.md, borderWidth: 1, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs },
  summaryNum: { fontSize: 18, fontWeight: '800' },
  summaryLbl: { fontSize: 11, marginTop: 2 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});

export const renderWorkEntriesTab = ({ entries, theme }) => {
  if (!entries || entries.length === 0) {
    return <EmptyState icon="assignment-turned-in" message="No work entries submitted yet." theme={theme} />;
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
      <SectionHeader title="Work Entries" count={entries.length} theme={theme} icon="assignment-turned-in" />
      {entries.map((e, idx) => {
        const id = safeStr(e.WorkEntryDocEntry || e.DocEntry || e.DocNum) || ('entry-' + idx);
        const desc = safeStr(e.WorkDoneDetails || e.WorkDone || e.Remarks || e.Description) || ('Work Entry #' + (idx + 1));
        const mechanic = safeStr(e.MechanicName || e.UserName);
        const hours = safeStr(e.Hours || e.WorkHours || e.Duration);
        const status = safeStr(e.Status);
        const date = fmtDateTime(e.CreateDate || e.DocDate, e.CreateTime || e.DocTime);
        const details = Array.isArray(e.Details) ? e.Details : [];
        const parts = Array.isArray(e.Parts) ? e.Parts : [];
        const images = Array.isArray(e.Images) ? e.Images : [];
        return (
          <CollapsibleCard
            key={id + '-' + idx}
            theme={theme}
            defaultOpen={false}
            title={desc}
            subtitle={[mechanic, date, hours ? (hours + 'h') : ''].filter(Boolean).join(' \u00b7 ')}
            badge={status ? <StatusPill status={status} theme={theme} size="sm" /> : null}
          >
            <KeyValue label="Entry ID" value={id} copyable theme={theme} icon="tag" />
            <KeyValue label="Mechanic" value={mechanic} theme={theme} icon="engineering" />
            <KeyValue label="Hours" value={hours ? (hours + ' h') : ''} theme={theme} icon="schedule" />
            <KeyValue label="Created" value={date} theme={theme} icon="event" />
            {e.FinalRemarks || e.Remarks ? (
              <KeyValue label="Final Remarks" value={safeStr(e.FinalRemarks || e.Remarks)} theme={theme} icon="notes" fullWidth />
            ) : null}

            {details.length > 0 ? (
              <>
                <SectionHeader title="Work Details" count={details.length} theme={theme} icon="build-circle" />
                <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0', marginTop: 0 }]}>
                  {details.map((d, di) => {
                    const wname = safeStr(d.WorkName || d.WorkDone || d.Description || d.WorkCode);
                    const wcode = safeStr(d.WorkCode);
                    const remarks = safeStr(d.Remarks || d.OtherDescription);
                    return (
                      <View key={(wcode || wname) + '-' + di} style={{ paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border || '#EEE' }}>
                        <Text style={{ color: theme.colors.dark, fontWeight: '600' }} numberOfLines={2}>{wname || ('Detail #' + (di + 1))}</Text>
                        {wcode ? <Text style={{ color: theme.colors.gray, fontSize: 12, marginTop: 2 }}>{'Code: ' + wcode}</Text> : null}
                        {remarks ? <Text style={{ color: theme.colors.dark, fontSize: 12, marginTop: 4 }}>{remarks}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {parts.length > 0 ? (
              <>
                <SectionHeader title="Parts Used" count={parts.length} theme={theme} icon="build" />
                <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0', marginTop: 0 }]}>
                  {parts.map((pp, pi) => {
                    const pname = safeStr(pp.ItemName || pp.Dscription || pp.ItemCode) || ('Part #' + (pi + 1));
                    const pcode = safeStr(pp.ItemCode);
                    const qty = safeStr(pp.Qty || pp.Quantity);
                    return (
                      <View key={(pcode || pname) + '-' + pi} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border || '#EEE' }}>
                        <Text style={{ color: theme.colors.dark, fontWeight: '600', flex: 1 }} numberOfLines={1}>{pname}</Text>
                        <Text style={{ color: theme.colors.gray, fontSize: 12 }}>{qty ? ('\u00d7 ' + qty) : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {images.length > 0 ? (
              <>
                <SectionHeader title="Attachments" count={images.length} theme={theme} icon="image" />
                <View style={[panelStyles.panel, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0', marginTop: 0, padding: SPACING.md }]}>
                  <Text style={{ color: theme.colors.gray, fontSize: 12 }}>{images.length + ' image' + (images.length === 1 ? '' : 's') + ' attached'}</Text>
                </View>
              </>
            ) : null}
          </CollapsibleCard>
        );
      })}
    </ScrollView>
  );
};

export const renderHistoryTab = ({ history, loading, theme, onRefresh }) => {
  if (loading) {
    return (
      <View style={{ paddingVertical: SPACING.xl, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.gray, marginTop: SPACING.sm }}>Loading history\u2026</Text>
      </View>
    );
  }
  if (!history || history.length === 0) {
    return <EmptyState icon="history" message="No activity history available for this job card." theme={theme} />;
  }
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: SPACING.lg }}
      refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : null}
    >
      <SectionHeader title="Activity Timeline" count={history.length} theme={theme} icon="history" />
      {history.map((h, idx) => {
        const action = safeStr(h.Action || h.Event || h.Activity || h.Type) || ('Event #' + (idx + 1));
        const user = safeStr(h.UserName || h.User || h.CreatedBy || h.UpdatedBy);
        const date = fmtDateTime(h.CreateDate || h.Date || h.DocDate, h.CreateTime || h.Time);
        const status = safeStr(h.Status || h.NewStatus);
        const remarks = safeStr(h.Remarks || h.Comments || h.Description);
        const isLast = idx === history.length - 1;
        return (
          <View key={(action + '-' + date + '-' + idx)} style={htStyles.row}>
            <View style={htStyles.gutter}>
              <View style={[htStyles.dot, { backgroundColor: theme.colors.primary }]} />
              {!isLast ? <View style={[htStyles.line, { backgroundColor: theme.colors.border || '#E0E0E0' }]} /> : null}
            </View>
            <View style={[htStyles.content, { backgroundColor: theme.colors.white, borderColor: theme.colors.border || '#E0E0E0' }]}>
              <View style={htStyles.head}>
                <Text style={[htStyles.action, { color: theme.colors.dark }]} numberOfLines={1}>{action}</Text>
                {status ? <StatusPill status={status} theme={theme} size="sm" /> : null}
              </View>
              {user ? <Text style={[htStyles.user, { color: theme.colors.gray }]} numberOfLines={1}>{user}</Text> : null}
              {date ? <Text style={[htStyles.date, { color: theme.colors.gray }]}>{date}</Text> : null}
              {remarks ? <Text style={[htStyles.remarks, { color: theme.colors.dark }]}>{remarks}</Text> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const htStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: SPACING.md, marginBottom: SPACING.xs },
  gutter: { width: 24, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: SPACING.md + 2 },
  line: { flex: 1, width: 2, marginTop: 2 },
  content: { flex: 1, marginLeft: SPACING.sm, marginBottom: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderRadius: BORDER_RADIUS.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: SPACING.sm },
  user: { fontSize: 12, marginTop: 2 },
  date: { fontSize: 11, marginTop: 2 },
  remarks: { fontSize: 13, marginTop: SPACING.xs, lineHeight: 18 },
});

export const renderTabContent = (activeTab, ctx) => {
  const { theme, workOrder, mechanics, parts, mechanicPartRequests, workOrderEntries, history, historyLoading, onRefreshHistory } = ctx;
  switch (activeTab) {
    case 'Details': return renderDetailsTab({ workOrder, theme });
    case 'Mechanics': return renderMechanicsTab({ mechanics, theme });
    case 'PartDetails': return renderPartsTab({ parts, theme, mechanicPartRequests });
    case 'WorkEntry': return renderWorkEntriesTab({ entries: workOrderEntries, theme });
    case 'History': return renderHistoryTab({ history, loading: historyLoading, theme, onRefresh: onRefreshHistory });
    default: return <EmptyState icon="help" message="No content." theme={theme} />;
  }
};
