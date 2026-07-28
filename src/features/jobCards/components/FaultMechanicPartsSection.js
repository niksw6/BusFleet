import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, Chip, TextInput } from 'react-native-paper';
import MaterialIcons from '../../../components/AppIcon.js';
import ModalSelector from '../../../shared/components/ModalSelector';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';

/**
 * FaultMechanicPartsSection
 *
 * Per-fault card used in CreateJobCardScreen.
 * Each fault has its own mechanics assignment and parts list.
 *
 * Props:
 *   fault        {object}   - { Fault, Dscption/Description, DueHours }
 *   faultIndex   {number}
 *   mechanics    {array}    - Full mechanics list from API
 *   spareParts   {array}    - Full spare parts list from API
 *   isDarkMode   {boolean}
 *   onChange     {function} - Called with (faultIndex, { mechanics, parts })
 *   value        {object}   - { mechanics: [], parts: [] }
 */
const FaultMechanicPartsSection = ({
  fault,
  faultIndex,
  mechanics = [],
  spareParts = [],
  isDarkMode = false,
  onChange,
  value = { mechanics: [], parts: [] },
  hideMechanics = false,
  customHeaderContent = null,
}) => {
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [expanded, setExpanded] = useState(true);
  const [showMechanicModal, setShowMechanicModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [tempMechanics, setTempMechanics] = useState(value.mechanics || []);
  const [partQtyInputs, setPartQtyInputs] = useState({});

  const selectedMechanics = value.mechanics || [];
  const selectedParts = value.parts || [];

  const handleMechanicToggle = (item) => {
    const key = item.Code || item.FirstName;
    const isSelected = tempMechanics.some(m => (m.Code || m.FirstName) === key);
    setTempMechanics(
      isSelected
        ? tempMechanics.filter(m => (m.Code || m.FirstName) !== key)
        : [...tempMechanics, item]
    );
  };

  const commitMechanics = () => {
    onChange(faultIndex, { mechanics: tempMechanics, parts: selectedParts });
    setShowMechanicModal(false);
  };

  const addPart = (item) => {
    const key = item.ItemCode || item.Code;
    const alreadyAdded = selectedParts.some(p => (p.ItemCode || p.Code) === key);
    if (alreadyAdded) {
      setShowPartsModal(false);
      return;
    }
    const newPart = {
      ItemCode: item.ItemCode || item.Code || '',
      ItemName: item.ItemName || item.Name || item.Dscription || '',
      Qty: '1',
      UoM: item.UoM || item.InvntryUom || 'Nos',
    };
    onChange(faultIndex, { mechanics: selectedMechanics, parts: [...selectedParts, newPart] });
    setShowPartsModal(false);
  };

  const removePart = (itemCode) => {
    onChange(faultIndex, {
      mechanics: selectedMechanics,
      parts: selectedParts.filter(p => (p.ItemCode || p.Code) !== itemCode),
    });
  };

  const updatePartQty = (itemCode, qty) => {
    const updated = selectedParts.map(p =>
      (p.ItemCode || p.Code) === itemCode ? { ...p, Qty: qty } : p
    );
    onChange(faultIndex, { mechanics: selectedMechanics, parts: updated });
  };

  const removeMechanic = (key) => {
    const updated = selectedMechanics.filter(m => (m.Code || m.FirstName) !== key);
    setTempMechanics(updated);
    onChange(faultIndex, { mechanics: updated, parts: selectedParts });
  };

  const faultCode = String(fault?.FaultCode || fault?.Fault || fault?.FaultName || '').trim();
  const faultDesc = String(fault?.Description || fault?.Dscption || fault?.FaultDescription || '').trim();
  const faultName = faultCode && faultDesc ? `${faultCode} - ${faultDesc}` : (faultDesc || faultCode);
  const dueHours = fault?.DueHours || fault?.dueHours || null;
  const severity = fault?.Severity || '';
  const faultCategory = fault?.FaultCategory || '';
  const solutions = Array.isArray(fault?.Solutions) ? fault.Solutions.filter(s => s?.Name) : [];

  const sevColor =
    severity === 'High' ? '#BB0000'
    : severity === 'Medium' ? '#E65100'
    : severity === 'Low' ? '#2B7D2B'
    : '#FF9800';

  const hasMechanics = selectedMechanics.length > 0;
  const hasParts = selectedParts.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border || '#E0E0E0' }]}>
      {/* Fault Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.faultBadge, { backgroundColor: sevColor + '20' }]}>
            <MaterialIcons name="warning" size={16} color={sevColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.faultName, { color: colors.dark }]}>{faultName}</Text>
            {/* Severity + Category inline badges */}
            {(severity || faultCategory) ? (
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                {severity ? (
                  <View style={{ backgroundColor: sevColor, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{severity}</Text>
                  </View>
                ) : null}
                {faultCategory ? (
                  <View style={{ backgroundColor: '#0070F220', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#0070F2', fontSize: 10, fontWeight: '600' }}>{faultCategory}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {faultDesc ? (
              <Text style={[styles.faultDesc, { color: colors.gray }]} numberOfLines={1}>
                {faultDesc}
              </Text>
            ) : null}
            {dueHours ? (
              <Text style={[styles.dueHours, { color: '#E65100' }]}>
                Due: {dueHours}h
              </Text>
            ) : null}
            {solutions.length > 0 && solutions[0]?.Name ? (
              <Text style={{ fontSize: 11, color: '#2B7D2B', marginTop: 2 }}>
                💡 {solutions[0].Name}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          {hasMechanics && (
            <View style={[styles.summaryBadge, { backgroundColor: '#0070F220' }]}>
              <MaterialIcons name="engineering" size={12} color="#0070F2" />
              <Text style={[styles.summaryBadgeText, { color: '#0070F2' }]}>{selectedMechanics.length}</Text>
            </View>
          )}
          {hasParts && (
            <View style={[styles.summaryBadge, { backgroundColor: '#2B7D2B20' }]}>
              <MaterialIcons name="settings" size={12} color="#2B7D2B" />
              <Text style={[styles.summaryBadgeText, { color: '#2B7D2B' }]}>{selectedParts.length}</Text>
            </View>
          )}
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={24}
            color={colors.gray}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContent}>
          {customHeaderContent}

          {/* ── Mechanics Section (hidden when mechanics self-accept faults) ── */}
          {!hideMechanics && (
          <View style={styles.subSection}>
            <View style={styles.subSectionHeader}>
              <MaterialIcons name="engineering" size={16} color="#0070F2" />
              <Text style={[styles.subSectionTitle, { color: colors.dark }]}>Mechanics</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: '#0070F210', borderColor: '#0070F2' }]}
                onPress={() => {
                  setTempMechanics(selectedMechanics);
                  setShowMechanicModal(true);
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={14} color="#0070F2" />
                <Text style={[styles.addButtonText, { color: '#0070F2' }]}>Assign</Text>
              </TouchableOpacity>
            </View>

            {selectedMechanics.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.gray }]}>No mechanics assigned</Text>
            ) : (
              <View style={styles.chipsRow}>
                {selectedMechanics.map((m, i) => (
                  <Chip
                    key={i}
                    mode="flat"
                    onClose={() => removeMechanic(m.Code || m.FirstName)}
                    style={[styles.chip, { backgroundColor: '#0070F210' }]}
                    textStyle={{ color: '#0070F2', fontSize: 12 }}
                    icon="account-wrench"
                  >
                    {m.FirstName || m.Name || 'Mechanic'}
                  </Chip>
                ))}
              </View>
            )}
          </View>
          )}

          {/* ── Parts Section ── */}
          <View style={[styles.subSection, { marginTop: SPACING.sm }]}>
            <View style={styles.subSectionHeader}>
              <MaterialIcons name="settings" size={16} color="#2B7D2B" />
              <Text style={[styles.subSectionTitle, { color: colors.dark }]}>Parts Required</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: '#2B7D2B10', borderColor: '#2B7D2B' }]}
                onPress={() => setShowPartsModal(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={14} color="#2B7D2B" />
                <Text style={[styles.addButtonText, { color: '#2B7D2B' }]}>Add Part</Text>
              </TouchableOpacity>
            </View>

            {selectedParts.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.gray }]}>No parts added</Text>
            ) : (
              <View>
                {selectedParts.map((part, i) => {
                  const key = part.ItemCode || part.Code;
                  return (
                    <View key={i} style={[styles.partRow, { borderColor: colors.border || '#E0E0E0' }]}>
                      <View style={styles.partInfo}>
                        <Text style={[styles.partName, { color: colors.dark }]} numberOfLines={1}>
                          {part.ItemName || part.Name || key}
                        </Text>
                        <Text style={[styles.partCode, { color: colors.gray }]}>{key}</Text>
                      </View>
                      <View style={styles.partQtyRow}>
                        <Text style={[styles.uomText, { color: colors.gray }]}>{part.UoM}</Text>
                        <RNTextInput
                          value={String(part.Qty || '1')}
                          onChangeText={(v) => updatePartQty(key, v)}
                          keyboardType="numeric"
                          style={[
                            styles.qtyInput,
                            { color: colors.dark, borderColor: colors.border || '#CCC' },
                          ]}
                          selectTextOnFocus
                        />
                        <TouchableOpacity onPress={() => removePart(key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name="close" size={18} color="#BB0000" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Mechanic Selector Modal */}
      {!hideMechanics && (
      <ModalSelector
        visible={showMechanicModal}
        onClose={commitMechanics}
        onSelect={(value, item) => handleMechanicToggle(item)}
        title={`Assign Mechanics — ${faultName}`}
        data={mechanics}
        loading={false}
        searchPlaceholder="Search mechanics..."
        displayKey="FirstName"
        valueKey="FirstName"
        multiSelect
        selectedItems={tempMechanics}
        searchKeys={['FirstName', 'Code']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.FirstName || 'Unknown'}
            </Text>
            {item.Code ? (
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Code: {item.Code}</Text>
            ) : null}
          </View>
        )}
      />
      )}

      {/* Parts Selector Modal */}
      <ModalSelector
        visible={showPartsModal}
        onClose={() => setShowPartsModal(false)}
        onSelect={(value, item) => addPart(item)}
        title={`Add Part — ${faultName}`}
        data={spareParts}
        loading={false}
        searchPlaceholder="Search parts..."
        displayKey="ItemName"
        valueKey="ItemCode"
        searchKeys={['ItemName', 'ItemCode', 'Code', 'Name', 'Dscription']}
        renderItem={(item) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
              {item.ItemName || item.Name || item.Dscription || 'Unknown Part'}
            </Text>
            {(item.ItemCode || item.Code) ? (
              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                {item.ItemCode || item.Code}
                {item.UoM || item.InvntryUom ? ` · ${item.UoM || item.InvntryUom}` : ''}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  faultBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  faultName: {
    fontSize: 14,
    fontWeight: '700',
  },
  faultDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  dueHours: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: SPACING.sm,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
  },
  expandedContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  subSection: {
    marginTop: SPACING.sm,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  chip: {
    marginBottom: 4,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: 4,
  },
  partInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  partName: {
    fontSize: 13,
    fontWeight: '600',
  },
  partCode: {
    fontSize: 11,
    marginTop: 1,
  },
  partQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  uomText: {
    fontSize: 11,
    minWidth: 28,
    textAlign: 'center',
  },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 13,
    width: 44,
    textAlign: 'center',
  },
});

export default FaultMechanicPartsSection;
