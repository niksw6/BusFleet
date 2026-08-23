import { get, post, handleApiError } from '../client';

/**
 * Master Data Service
 * Handles all master data: buses, drivers, mechanics, supervisors, routes, faults
 */
export const masterService = {
  /**
   * Get list of active buses/vehicles
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of buses
   */
  getActiveBuses: async (companyDB) => {
    try {
      const response = await get(`GetActiveBusMasters?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of job types
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of job types
   */
  getJobTypes: async (companyDB) => {
    try {
      const response = await get(`GetJobTypes?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of supervisors
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of supervisors
   */
  getSupervisors: async (companyDB) => {
    try {
      const response = await get(`GetSupervisors?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of drivers
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of drivers
   */
  getDrivers: async (companyDB) => {
    try {
      const response = await get(`GetDrivers?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of mechanics
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of mechanics
   */
  getMechanics: async (companyDB) => {
    try {
      const response = await get(`GetMechanics?CompanyDB=${companyDB}`);
      console.log('🔧 GetMechanics API response:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get fault details master — includes DueHours per fault code
   * Expected response: { Success, Data: [{ FaultCode, FaultName, DueHours, ... }] }
   * @param {string} companyDB
   */
  getFaultDetails: async (companyDB) => {
    try {
      const response = await get(`GetFaultDetails?CompanyDB=${companyDB}`);
      console.log('🔧 Fault details response:', JSON.stringify(response.data?.Data?.[0], null, 2));
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get fault master — rich fault data with category, severity, and solutions.
   * API: GET GetFaultMaster?CompanyDB=...
   * Response: { Success, Data: [{ Code, Name, Descriptions, FaultCategory, Severity, Solutions[], Time }] }
   * @param {string} companyDB
   */
  getFaultMaster: async (companyDB) => {
    try {
      const response = await get(`GetFaultMaster?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get Work List — dropdown options for mechanic work entry description.
   * Expected: { Success, Data: [{ Code, Name/Description }] }
   * @param {string} companyDB
   */
  getWorkList: async (companyDB) => {
    try {
      const response = await get(`GetWorkList?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Work options / repair guidance configured for one fault.
   * API: GET GetFaultByCode?CompanyDB=...&FaultCode=...
   */
  getFaultByCode: async (companyDB, faultCode) => {
    try {
      const response = await get(
        `GetFaultByCode?CompanyDB=${companyDB}&FaultCode=${encodeURIComponent(faultCode)}`,
        { suppressErrorLog: true },
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of routes
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of routes
   */
  getRoutes: async (companyDB) => {
    try {
      const response = await get(`GetRoutes?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get stops for a specific route
   * @param {string} companyDB - Company database name
   * @param {string} routeNo - Route number
   * @returns {Promise} List of stops
   */
  getStopsByRoute: async (companyDB, routeNo) => {
    try {
      const response = await get(`GetStopsByRoute?CompanyDB=${companyDB}&RouteNo=${routeNo}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get spare parts list
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of spare parts
   */
  getSpareParts: async (companyDB) => {
    try {
      const response = await get(`GetSpareParts?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get warehouses list
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of warehouses
   */
  getWarehouses: async (companyDB) => {
    try {
      const response = await get(`GetWarehouses?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get Maintenance Teams — depot-wise teams (Team Leader + Mechanic + Electrician + Helper).
   * API 14 (New): GET GetMaintenanceTeams?CompanyDB=...
   * This is the foundation of the Team Leader accept/reject workflow (SOP §1.3).
   * Response: { Success, Data: [{ TeamCode, TeamName, Depot, TeamLeaderCode, TeamLeaderName }] }
   * @param {string} companyDB
   */
  getMaintenanceTeams: async (companyDB) => {
    try {
      const response = await get(`GetMaintenanceTeams?CompanyDB=${companyDB}`, { suppressErrorLog: true });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get members of a Maintenance Team (Mechanics/Electricians/Helper mapped to a Team Leader).
   * API 15 (New): GET GetTeamMembers?CompanyDB=...&TeamCode=...
   * Used to scope the mechanic/electrician picker to the accepting Team Leader's own team.
   * Response: { Success, Data: [{ Code, FirstName, Role/Designation }] }
   * @param {string} companyDB
   * @param {string} teamCode
   */
  getTeamMembers: async (companyDB, teamCode) => {
    try {
      const response = await get(`GetTeamMembers?CompanyDB=${companyDB}&TeamCode=${teamCode}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get breakdown teams for a specific line breakdown entry
   * API: GET GetBreakdownTeams?CompanyDB=...&DocEntry=...
   */
  getBreakdownTeams: async (companyDB, docEntry) => {
    try {
      const url = `GetBreakdownTeams?CompanyDB=${companyDB}&DocEntry=${encodeURIComponent(docEntry)}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get mechanics available / mapped to a breakdown entry.
   * API: GET GetMechanicsByBreakdown?CompanyDB=...&DocEntry=...
   */
  getMechanicsByBreakdown: async (companyDB, docEntry) => {
    try {
      const url = `GetMechanicsByBreakdown?CompanyDB=${companyDB}&DocEntry=${encodeURIComponent(docEntry)}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Respond to a breakdown team assignment (Accept/Reject)
   * POST RespondBreakdownTeamAssignment { CompanyDB, BreakdownNo, TeamCode, EmpCode, Decision, Remarks }
   */
  respondBreakdownTeamAssignment: async (companyDB, payload) => {
    try {
      const body = {
        CompanyDB: companyDB,
        ...payload,
      };
      console.log('📤 RespondBreakdownTeamAssignment payload:', JSON.stringify(body, null, 2));
      const response = await post('RespondBreakdownTeamAssignment', body);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get depots list
   */
  getDepots: async (companyDB) => {
    try {
      const response = await get(`GetDepots?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get supervisors mapped to a depot
   */
  getSupervisorsByDepot: async (companyDB, depot) => {
    try {
      const response = await get(`GetSupervisorsByDepot?CompanyDB=${companyDB}&Depot=${encodeURIComponent(depot)}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
