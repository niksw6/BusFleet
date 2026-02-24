export const API_BASE_URL = 'http://88.99.68.90:85/BMSSystem/';

export const API_ENDPOINTS = {
  GET_COMPANY_LISTS: 'MGetCompanyLists',
  CHECK_LOGIN: 'MCheckLogin',
  GET_ACTIVE_BUS_MASTERS: 'GetActiveBusMasters',
  GET_JOB_TYPES: 'GetJobTypes',
  GET_SUPERVISORS: 'GetSupervisors',
  GET_DRIVERS: 'GetDrivers',
  GET_MECHANICS: 'GetMechanics',
  GET_FAULT_DETAILS: 'GetFaultDetails',
  GET_ROUTES: 'GetRoutes',
  GET_STOPS_BY_ROUTE: 'GetStopsByRoute',
  CREATE_DRIVER_COMPLAINT: 'CreateDriverComplaint',
  GET_DRIVER_COMPLAINTS: 'GetDriverComplaints',
  GET_DRIVER_COMPLAINT_DETAIL: 'GetDriverComplaintDetail',
  CREATE_INCIDENTS: 'CreateIncidents',
  GET_INCIDENTS: 'GetIncidents',
  CREATE_LINE_BREAKDOWN: 'CreateLineBreakdown',
  GET_LINE_BREAKDOWNS: 'GetLineBreakdowns',
  GET_LINE_BREAKDOWN_DETAIL: 'GetLineBreakdownDetail',
  GET_DASHBOARD_STATUS: 'GetDashboardStatus',
  GET_INSPECTIONS: 'GetInspections',
  GET_WORK_ORDERS: 'GetWorkOrders',
  GET_FUEL_LOGS: 'GetFuelLogs',
  CREATE_FUEL_LOG: 'CreateFuelLog',
  GET_SCHEDULED_SERVICES: 'GetScheduledServices',
  CREATE_SCHEDULE: 'CreateSchedule',
  GET_NOTIFICATIONS: 'GetNotifications',
  GET_DASHBOARD_STATS: 'GetDashboardStats',
  CREATE_JOB_CARD: 'CreateJobCard',
  GET_JOB_CARDS: 'GetJobCards',
  GET_JOB_CARD_DETAIL: 'GetJobCardDetail',
  GET_SPARE_PARTS: 'GetSpareParts',
};

export const STORAGE_KEYS = {
  DB_NAME: '@fleet_db_name',
  USER_DATA: '@fleet_user_data',
  AUTH_TOKEN: '@fleet_auth_token',
  SESSION_COOKIE: '@fleet_session_cookie',
  THEME_MODE: '@fleet_theme_mode',
  LAST_COMPANY: '@fleet_last_company',
};

export const USER_ROLES = {
  DRIVER: 'Driver',
  SUPERVISOR: 'Supervisor',
  MECHANIC: 'Mechanic',
  ADMIN: 'Admin',
};

export const PRIORITY_LEVELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const JOB_TYPES = {
  MECHANICAL: 'Mechanical',
  ELECTRICAL: 'Electrical',
  BODY_WORK: 'Body Work',
  TYRE: 'Tyre',
  AC: 'AC',
  OTHER: 'Other',
};

export const STATUS = {
  OPEN: 'O',
  IN_PROGRESS: 'I',
  COMPLETED: 'CM',
  DECLINED: 'D',
  // For display
  NAMES: {
    'O': 'Open',
    'I': 'In Progress',
    'CM': 'Completed',
    'D': 'Declined',
  },
};
