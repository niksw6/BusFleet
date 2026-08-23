import React, { useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, RadioButton, ActivityIndicator } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { lineBreakdownService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import ConfirmationModal from '../../../shared/components/ConfirmationModal';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';

/**
 * Line Breakdown Work Entry Screen
 * 
 * Workflow:
 * 1. Mechanic arrives at breakdown location
 * 2. Creates work entry with repair type (Permanent or Temporary)
 * 3. Logs work details and optionally uploads photos
 * 4. Completes work entry
 * 5. Based on repair type:
 *    - Permanent: Routes to Supervisor/Team Leader verification (SV/RW)
 *    - Temporary: Routes to bus depot assignment
 */
const LineBreakdownWorkEntryScreen = ({ route, navigation }) => {
  const {
    complaintNo,
    jobCardDocEntry,
    faultLine = 1,
    busNo,
    depot,
    dbName,
  } = route.params || {};

  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user) || {};
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Repair Type: 'P' (Permanent) or 'T' (Temporary)
  const [repairType, setRepairType] = useState('P');
  
  // Work details
  const [workCode, setWorkCode] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // Photo handling
  const [photos, setPhotos] = useState([]);
  const formikRef = useRef(null);

  const handleCreateWorkEntry = async () => {
    if (!workDone.trim()) {
      Toast.show({ type: 'error', text1: 'Work details required', text2: 'Please describe the work done' });
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create Line Breakdown Work Entry
      const createPayload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        JobCardDocEntry: Number(jobCardDocEntry) || 0,
        FaultLine: Number(faultLine) || 1,
        UserCode: String(user?.Code || user?.code || user?.UserCode || ''),
        RepairType: repairType, // 'P' or 'T'
        FinalRemarks: remarks || '',
        Details: [
          {
            WorkCode: workCode || 'MANUAL',
            WorkDone: workDone,
            OtherDescription: '',
            Remarks: remarks || '',
          },
        ],
      };

      console.log('\n🔧 LINE BREAKDOWN WORK ENTRY CREATION');
      const createResp = await lineBreakdownService.createLineBreakdownWorkEntry(createPayload);
      
      if (!createResp?.Success) {
        throw new Error(createResp?.Message || 'Failed to create work entry');
      }

      const workEntryDocEntry = createResp?.Data?.WorkEntryDocEntry || createResp?.Data?.DocEntry || 0;
      
      Toast.show({
        type: 'success',
        text1: 'Work entry created',
        text2: `Repair Type: ${repairType === 'P' ? 'Permanent' : 'Temporary'}`,
      });

      // Store work entry details for next step
      navigation.navigate('LineBreakdownWorkDetail', {
        complaintNo,
        jobCardDocEntry,
        workEntryDocEntry,
        repairType, // Important for workflow routing
        busNo,
        depot,
        dbName,
      });
    } catch (e) {
      console.error('🔧 Error creating work entry:', e.message);
      Toast.show({ type: 'error', text1: 'Failed', text2: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.light }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollContent}>
        {/* Header Info */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            Line Breakdown Work Entry
          </Text>
          <Text>Incident: {complaintNo}</Text>
          <Text>Bus: {busNo}</Text>
          <Text>Depot: {depot}</Text>
        </View>

        {/* Repair Type Selection */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            Repair Type
          </Text>
          <Text style={styles.hint}>
            Select if this repair is permanent on-site or temporary for depot servicing.
          </Text>

          {/* Permanent Repair Option */}
          <TouchableOpacity
            style={[styles.radioGroup, repairType === 'P' && styles.radioGroupSelected]}
            onPress={() => setRepairType('P')}
          >
            <RadioButton
              value="P"
              status={repairType === 'P' ? 'checked' : 'unchecked'}
              onPress={() => setRepairType('P')}
              color={colors.primary}
            />
            <View style={{ marginLeft: SPACING.md, flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.dark }}>
                Permanent Repair ✅
              </Text>
              <Text style={{ fontSize: 12, color: colors.gray, marginTop: 4 }}>
                On-site repair successful. Bus operational. Routes to Supervisor/TL verification.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Temporary Repair Option */}
          <TouchableOpacity
            style={[styles.radioGroup, repairType === 'T' && styles.radioGroupSelected]}
            onPress={() => setRepairType('T')}
          >
            <RadioButton
              value="T"
              status={repairType === 'T' ? 'checked' : 'unchecked'}
              onPress={() => setRepairType('T')}
              color={colors.primary}
            />
            <View style={{ marginLeft: SPACING.md, flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.dark }}>
                Temporary Repair ⏳
              </Text>
              <Text style={{ fontSize: 12, color: colors.gray, marginTop: 4 }}>
                Temporary fix only. Bus sent to depot. Routes to depot maintenance.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Work Details */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            Work Details
          </Text>

          <Text style={styles.label}>Work Code (optional)</Text>
          <TextInput
            mode="outlined"
            placeholder="e.g., REP001, BRK002"
            value={workCode}
            onChangeText={setWorkCode}
            style={styles.input}
          />

          <Text style={styles.label}>Work Done *</Text>
          <TextInput
            mode="outlined"
            placeholder="Describe the repair work performed"
            value={workDone}
            onChangeText={setWorkDone}
            multiline
            numberOfLines={4}
            style={styles.input}
          />

          <Text style={styles.label}>Remarks (optional)</Text>
          <TextInput
            mode="outlined"
            placeholder="Any additional notes"
            value={remarks}
            onChangeText={setRemarks}
            multiline
            numberOfLines={3}
            style={styles.input}
          />
        </View>

        {/* Action Buttons */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Button
            mode="contained"
            onPress={handleCreateWorkEntry}
            style={styles.submitButton}
            contentStyle={{ paddingVertical: 8 }}
            icon="check"
          >
            Create Work Entry & Continue
          </Button>

          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            contentStyle={{ paddingVertical: 8 }}
          >
            Go Back
          </Button>
        </View>
      </ScrollView>

      <Loader visible={loading} text="Creating work entry..." />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.md },
  section: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  hint: {
    fontSize: 12,
    marginBottom: SPACING.md,
  },
  input: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  radioGroup: {
    flexDirection: 'row',
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'flex-start',
  },
  radioGroupSelected: {
    borderColor: '#0070F2',
    backgroundColor: '#0070F215',
  },
  submitButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  backButton: {
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
});

export default LineBreakdownWorkEntryScreen;
