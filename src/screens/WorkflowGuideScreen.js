import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

/**
 * Workflow Guide Screen
 * Shows users how the Fleet Management app works
 */
const WorkflowGuideScreen = ({ navigation }) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const workflowSteps = [
    {
      step: 1,
      title: 'Report Incident',
      icon: 'report-problem',
      color: ['#EF4444', '#DC2626'],
      description: 'Driver or supervisor reports a complaint or breakdown',
      details: [
        'Navigate to "Incidents" from dashboard',
        'Tap on "Report Incident" button',
        'Select incident type (Complaint/Breakdown/Preventive Maintenance)',
        'Fill in vehicle details, odometer, and incident description',
        'Add fault details and images if needed',
        'Submit the incident report'
      ]
    },
    {
      step: 2,
      title: 'Review Incident',
      icon: 'visibility',
      color: ['#F59E0B', '#D97706'],
      description: 'Supervisor reviews the reported incident',
      details: [
        'Supervisor receives notification',
        'Opens incident from "Incidents" list',
        'Reviews all details: vehicle, fault, priority',
        'Verifies odometer reading and location',
        'Can decline if invalid or duplicate',
        'Approves incident for job card creation'
      ]
    },
    {
      step: 3,
      title: 'Create Job Card',
      icon: 'assignment',
      color: ['#3B82F6', '#2563EB'],
      description: 'Supervisor creates job card from approved incident',
      details: [
        'Tap "Create Job Card" from incident detail',
        'Vehicle and incident details auto-filled',
        'Assign mechanics to the job',
        'Add operations/tasks to be performed',
        'Request spare parts if needed',
        'Set priority and instructions',
        'Submit job card'
      ]
    },
    {
      step: 4,
      title: 'Work on Job',
      icon: 'build',
      color: ['#8B5CF6', '#7C3AED'],
      description: 'Assigned mechanic performs the work',
      details: [
        'Mechanic sees job in "Job Cards"',
        'Opens job card to view details',
        'Updates status to "In Progress"',
        'Performs assigned operations/tasks',
        'Records parts used and labor time',
        'Adds work notes and observations',
        'Completes each task'
      ]
    },
    {
      step: 5,
      title: 'Complete & Close',
      icon: 'check-circle',
      color: ['#10B981', '#059669'],
      description: 'Finalize job card and update status',
      details: [
        'Mechanic marks all tasks complete',
        'Supervisor reviews completed work',
        'Verifies all operations done correctly',
        'Confirms parts used and labor hours',
        'Vehicle tested and ready for service',
        'Job card status changed to "Completed"',
        'Incident is resolved'
      ]
    }
  ];

  const renderWorkflowCard = (workflow) => (
    <View key={workflow.step} style={[styles.workflowCard, { backgroundColor: colors.white }]}>
      {/* Step Number Badge */}
      <LinearGradient
        colors={workflow.color}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.stepBadge}
      >
        <Text style={styles.stepNumber}>{workflow.step}</Text>
      </LinearGradient>

      {/* Icon Container */}
      <LinearGradient
        colors={workflow.color}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconContainer}
      >
        <MaterialIcons name={workflow.icon} size={40} color="#fff" />
      </LinearGradient>

      {/* Title & Description */}
      <Text style={[styles.workflowTitle, { color: colors.dark }]}>{workflow.title}</Text>
      <Text style={[styles.workflowDescription, { color: colors.gray }]}>{workflow.description}</Text>

      {/* Detailed Steps */}
      <View style={styles.detailsContainer}>
        {workflow.details.map((detail, index) => (
          <View key={index} style={styles.detailRow}>
            <MaterialIcons name="check" size={16} color={workflow.color[0]} />
            <Text style={[styles.detailText, { color: colors.dark }]}>{detail}</Text>
          </View>
        ))}
      </View>

      {/* Connector Arrow */}
      {workflow.step < workflowSteps.length && (
        <View style={styles.connectorContainer}>
          <MaterialIcons name="arrow-downward" size={32} color={colors.gray} />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.light }]}>
      {/* Header */}
      <LinearGradient
        colors={['#1E293B', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <MaterialIcons name="info" size={32} color="#fff" />
          <Text style={styles.headerTitle}>App Workflow Guide</Text>
          <Text style={styles.headerSubtitle}>How Fleet Management Works</Text>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Introduction */}
        <View style={[styles.introCard, { backgroundColor: colors.white }]}>
          <MaterialIcons name="lightbulb" size={28} color="#F59E0B" />
          <Text style={[styles.introTitle, { color: colors.dark }]}>
            Complete Incident Management Workflow
          </Text>
          <Text style={[styles.introText, { color: colors.gray }]}>
            Follow these 5 simple steps to efficiently manage vehicle incidents from reporting to resolution. 
            Each step ensures proper tracking, accountability, and timely resolution.
          </Text>
        </View>

        {/* Workflow Steps */}
        {workflowSteps.map(workflow => renderWorkflowCard(workflow))}

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: '#10B981' }]}>
          <MaterialIcons name="verified" size={32} color="#fff" />
          <Text style={styles.summaryTitle}>Ready to Get Started!</Text>
          <Text style={styles.summaryText}>
            Use the dashboard to access all features. Report incidents, manage job cards, and track work progress seamlessly.
          </Text>
          <TouchableOpacity
            style={styles.dashboardButton}
            onPress={() => navigation.navigate('Main')}
          >
            <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#10B981" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  introCard: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  introText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  workflowCard: {
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    position: 'relative',
  },
  stepBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.md,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  workflowTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  workflowDescription: {
    fontSize: 14,
    marginBottom: SPACING.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsContainer: {
    marginTop: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  detailText: {
    fontSize: 13,
    marginLeft: SPACING.sm,
    flex: 1,
    lineHeight: 20,
  },
  connectorContainer: {
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: -SPACING.lg,
  },
  summaryCard: {
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  summaryText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  dashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  dashboardButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
});

export default WorkflowGuideScreen;
