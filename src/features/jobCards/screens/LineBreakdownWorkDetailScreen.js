import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image, TouchableOpacity } from 'react-native';
import { Text, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { lineBreakdownService } from '../../../api/services';
import Loader from '../../../shared/components/Loader';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../../../constants/theme';

/**
 * Line Breakdown Work Detail Screen
 * 
 * Handles:
 * 1. Upload photos of the repair work
 * 2. Complete the work entry
 * 3. Route based on repair type:
 *    - Permanent: Route to Supervisor/Team Leader verification
 *    - Temporary: Route to supervisor for depot assignment
 */
const LineBreakdownWorkDetailScreen = ({ route, navigation }) => {
  const {
    complaintNo,
    jobCardDocEntry,
    workEntryDocEntry,
    repairType, // 'P' (Permanent) or 'T' (Temporary)
    busNo,
    depot,
    dbName,
  } = route.params || {};

  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const user = useSelector(state => state.auth.user) || {};
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [finalRemarks, setFinalRemarks] = useState('');

  const handleCompleteWorkEntry = async () => {
    setLoading(true);
    try {
      console.log('\n✅ COMPLETING LINE BREAKDOWN WORK ENTRY');
      console.log(`   Repair Type: ${repairType === 'P' ? 'Permanent' : 'Temporary'}`);
      
      const completePayload = {
        CompanyDB: dbName || 'MUTSPL_TEST',
        WorkEntryDocEntry: Number(workEntryDocEntry) || 0,
        FinalRemarks: finalRemarks || `Work completed by ${user?.FirstName || user?.Name || 'Mechanic'}`,
      };

      const completeResp = await lineBreakdownService.completeLineBreakdownWorkEntry(completePayload);
      
      if (!completeResp?.Success) {
        throw new Error(completeResp?.Message || 'Failed to complete work entry');
      }

      Toast.show({
        type: 'success',
        text1: 'Work Entry Completed',
        text2: `Next: ${repairType === 'P' ? 'Supervisor Verification' : 'Depot Assignment'}`,
      });

      // Route based on repair type
      if (repairType === 'P') {
        // Permanent: Route to verification screen (supervisor/team leader will verify)
        navigation.navigate('ComplaintDetail', {
          complaintNo,
          dbName,
          pendingVerification: true,
          workEntryDocEntry,
        });
      } else {
        // Temporary: Route to supervisor for depot assignment
        navigation.navigate('ComplaintDetail', {
          complaintNo,
          dbName,
          pendingDepotAssignment: true,
          workEntryDocEntry,
        });
      }
    } catch (e) {
      console.error('✅ Error completing work entry:', e.message);
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
            Work Entry Summary
          </Text>
          <Text>Incident: {complaintNo}</Text>
          <Text>Bus: {busNo}</Text>
          <Text>Depot: {depot}</Text>
          <Text style={{ marginTop: 8, fontWeight: '600' }}>
            Repair Type: {repairType === 'P' ? '✅ Permanent' : '⏳ Temporary'}
          </Text>
          {repairType === 'P' && (
            <Text style={{ fontSize: 12, color: colors.gray, marginTop: 4 }}>
              This work will be verified by Supervisor/Team Leader
            </Text>
          )}
          {repairType === 'T' && (
            <Text style={{ fontSize: 12, color: colors.gray, marginTop: 4 }}>
              Bus will be sent to depot for further servicing
            </Text>
          )}
        </View>

        {/* Photo Upload Section */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            Work Photos (Optional)
          </Text>
          <Text style={{ fontSize: 12, color: colors.gray, marginBottom: SPACING.md }}>
            Upload photos of the repair work for documentation
          </Text>

          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, idx) => (
                <View key={idx} style={styles.photoItem}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity
                    onPress={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    style={styles.removePhotoBtn}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '600' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Button
            mode="outlined"
            onPress={() => Toast.show({ type: 'info', text1: 'Camera not yet implemented' })}
            style={styles.photoButton}
          >
            📷 Add Photo
          </Button>
        </View>

        {/* Final Remarks */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>
            Final Remarks
          </Text>
          <TextInput
            mode="outlined"
            placeholder="Any final notes about the repair"
            value={finalRemarks}
            onChangeText={setFinalRemarks}
            multiline
            numberOfLines={4}
            style={styles.input}
          />
        </View>

        {/* Action Buttons */}
        <View style={[styles.section, { backgroundColor: colors.white }]}>
          <Button
            mode="contained"
            onPress={handleCompleteWorkEntry}
            style={styles.submitButton}
            contentStyle={{ paddingVertical: 10 }}
            icon="check-circle"
          >
            Complete Work Entry
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

      <Loader visible={loading} text="Completing work entry..." />
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
  input: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  photoItem: {
    position: 'relative',
    width: '48%',
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoButton: {
    marginBottom: SPACING.md,
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

export default LineBreakdownWorkDetailScreen;
