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
  // Team Leader workflow (SOP: accept/reject job card, assign Mechanic/Electrician)
  GET_MAINTENANCE_TEAMS: 'GetMaintenanceTeams',
  GET_TEAM_MEMBERS: 'GetTeamMembers',
  ASSIGN_TEAM: 'AssignTeam',
  UPDATE_JOB_CARD: 'UpdateJobCard',
  CANCEL_JOB_CARD: 'CancelJobCard',
  GET_JOB_CARD_HISTORY: 'GetJobCardHistory',
  // Line Breakdown dispatch (API 23-25)
  GET_AVAILABLE_TEAMS: 'GetAvailableTeams',
  ASSIGN_BREAKDOWN_TEAM: 'AssignBreakdownTeam',
  CLOSE_BREAKDOWN: 'CloseBreakdown',
  GET_FAULT_MASTER: 'GetFaultMaster',

  // ── Team Leader module (confirmed live endpoints) ──
  GET_MECHANICAL_DASHBOARD: 'GetMechanicalDashboard',
  GET_MY_TEAM_MEMBERS: 'GetMyTeamMembers',
  GET_JOB_CARD_FAULTS: 'GetJobCardFaults',
  UPDATE_TEAM_STATUS: 'UpdateTeamStatus',

  // ── Mechanic module (confirmed live endpoints) ──
  GET_MECHANIC_DASHBOARD: 'GetMechanicDashboard',
  ACCEPT_FAULT: 'AcceptFault',
  START_WORK: 'StartWork',
  CREATE_WORK_ENTRY: 'CreateWorkEntry',
  UPDATE_WORK_ENTRY: 'UpdateWorkEntry',
  COMPLETE_WORK: 'CompleteWork',

  // ── Store / Parts module (confirmed live endpoints) ──
  REQUEST_JOB_CARD_PARTS: 'RequestJobCardParts',
  GET_APPROVED_JOB_CARD_PARTS: 'GetApprovedJobCardParts',
  RECEIVE_JOB_CARD_PARTS: 'ReceiveJobCardParts',
  REQUEST_WORK_ENTRY_PARTS: 'RequestWorkEntryParts',
  GET_MECHANIC_PART_REQUESTS: 'GetMechanicPartRequests',
  APPROVE_MECHANIC_PART_REQUEST: 'ApproveMechanicPartRequest',
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
  ELECTRICIAN: 'Electrician',
  TEAM_LEADER: 'TeamLeader',
  TECHNICAL_HEAD: 'TechnicalHead',
  DEPOT_HEAD: 'DepotHead',
  ADMIN: 'Admin',
};

// Team Leader decision on a Job Card (SOP Section 2: accept / reject the incident for the mapped team)
export const TEAM_STATUS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
};

// Real UpdateTeamStatus API uses single-letter codes, not full words.
export const TEAM_STATUS_CODE = {
  ACCEPT: 'A',
  REJECT: 'R',
};

// Mechanic fault/work lifecycle (derived from GetMechanicDashboard / GetMechanicalDashboard status fields).
// Backend appears to use short codes; we defensively accept both codes and full words throughout the UI.
export const FAULT_WORK_STATUS = {
  PENDING: 'PENDING',       // Fault assigned to team, not yet accepted by a mechanic
  ACCEPTED: 'ACCEPTED',     // Mechanic accepted the fault (AcceptFault)
  IN_PROGRESS: 'IN_PROGRESS', // StartWork called / work entry open
  COMPLETED: 'COMPLETED',   // CompleteWork called
};

// Mechanic part-request approval lifecycle (ApproveMechanicPartRequest)
export const MECH_PART_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
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

export const PART_REQUEST_STATUS = {
  PENDING: 'P',       // Mechanic requested
  APPROVED: 'A',      // Supervisor approved
  ISSUED: 'I',        // Store issued
  RECEIVED: 'R',      // Mechanic received
  REJECTED: 'X',      // Supervisor rejected
  NAMES: {
    P: 'Pending Approval',
    A: 'Approved',
    I: 'Issued by Store',
    R: 'Received',
    X: 'Rejected',
  },
};

export const JOB_ACCEPT_STATUS = {
  PENDING: 'P',   // Assigned, not yet accepted
  ACCEPTED: 'A',  // Mechanic accepted
  REJECTED: 'R',  // Mechanic rejected
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
