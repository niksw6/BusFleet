export const COLORS = {
  // SAP Fiori inspired colors
  primary: '#0070F2',      // SAP Blue
  primaryDark: '#0854A0',
  primaryLight: '#D1EFFF',
  secondary: '#FF9500',    // SAP Orange
  success: '#2B7D2B',      // SAP Green
  danger: '#BB0000',       // SAP Red
  warning: '#FF9500',      // SAP Orange
  info: '#0070F2',
  light: '#F5F6F7',
  dark: '#32363A',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#6A6D70',
  grayLight: '#EDEFF0',
  grayDark: '#32363A',
  text: '#32363A',
  textSecondary: '#6A6D70',
  background: '#F5F6F7',
  card: '#FFFFFF',
  border: '#D9DCDD',
  
  // Status colors with better visibility
  statusOpen: '#0070F2',        // Blue - Open
  statusInProgress: '#FF9500',  // Orange - In Progress
  statusCompleted: '#2B7D2B',   // Green - Completed
  statusDeclined: '#BB0000',    // Red - Declined
  statusCancelled: '#6A6D70',   // Gray - Cancelled
  
  // Priority colors
  priorityLow: '#2B7D2B',
  priorityMedium: '#FF9500',
  priorityHigh: '#BB0000',
  priorityCritical: '#8B0000',
  
  // Complaint Type colors
  typeComplaint: '#0070F2',     // Blue - General complaint/Mechanical
  typeBreakdown: '#BB0000',     // Red - breakdown (critical)
  typePreventive: '#2B7D2B',    // Green - preventive maintenance
  typeMechanical: '#00689E',    // Teal - mechanical
};

export const DARK_COLORS = {
  primary: '#4A9EFF',
  primaryDark: '#0066CC',
  secondary: '#FF8C5A',
  success: '#4CAF50',
  danger: '#F44336',
  warning: '#FFB300',
  info: '#29B6F6',
  light: '#1C1C1E',
  dark: '#FFFFFF',
  white: '#1C1C1E',
  black: '#FFFFFF',
  gray: '#8E8E93',
  grayLight: '#2C2C2E',
  grayDark: '#E5E5EA',
  background: '#000000',
  surface: '#1C1C1E',
  card: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  light: 'System',
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  huge: 32,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
};
