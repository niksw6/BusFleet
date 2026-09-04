import { get, post, handleApiError } from '../client';
import { masterService } from './master.service';

/**
 * Complaint Service
 * Handles driver complaints and breakdowns
 */
export const complaintService = {
  /**
   * Close incident (complaint/breakdown) via new API
   * @param {string} companyDB - Company database name
   * @param {string|number} docEntry - Incident document entry
   * @param {'B'|'D'} formType - B for breakdown, D for driver complaint
   * @returns {Promise} Close response
   */
  closeIncident: async (companyDB, docEntry, formType = 'D') => {
    try {
      const payload = {
        CompanyDB: companyDB,
        DocEntry: Number(docEntry) || docEntry,
        FormType: formType,
      };
      console.log('📤 Closing incident:', JSON.stringify(payload));
      const response = await post('CloseIncident', payload);
      console.log('📥 Close incident response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Close incident error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a new incident (unified API for complaints and breakdowns)
   * @param {Object} incidentData - Incident details
   * @returns {Promise} Created incident response
   */
  createIncident: async (incidentData) => {
    try {
      console.log('📤 Creating incident - Full Payload:', JSON.stringify(incidentData));
      console.log('📤 Payload Keys:', Object.keys(incidentData));
      
      // Log different fields based on incident type
      if (incidentData.ComplaintType?.toLowerCase().includes('breakdown')) {
        console.log('📤 Breakdown fields:');
        console.log('   - ComplaintDate:', incidentData.ComplaintDate);
        console.log('   - BrkDate:', incidentData.BrkDate);
        console.log('   - BrkTime:', incidentData.BrkTime, '(integer HHMM)');
        console.log('   - ComplaintTime:', incidentData.ComplaintTime, '(integer HHMM)');
        console.log('   - RouteNo:', incidentData.RouteNo);
        console.log('   - BrkPlace:', incidentData.BrkPlace);
      } else {
        console.log('📤 Driver Complaint fields:');
        console.log('   - RegDate:', incidentData.RegDate);
        console.log('   - RegTime:', incidentData.RegTime, '(integer HHMM)');
        console.log('   - Dscrpton:', incidentData.Dscrpton);
      }
      
      console.log('📤 Odometr type:', typeof incidentData.Odometr, 'value:', incidentData.Odometr);
      console.log('📤 Making POST request to CreateIncidents endpoint...');
      
      const response = await post('CreateIncidents', incidentData);
      console.log('📥 Incident created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Incident creation error - Full error object:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
        console.error('❌ Response status:', error.response.status);
      } else {
        console.error('❌ No response received - likely network or timeout issue');
      }
      
      throw error;
    }
  },

  /**
   * Create a new driver complaint
   * @param {Object} complaintData - Complaint details
   * @returns {Promise} Created complaint response
   */
  createComplaint: async (complaintData) => {
    try {
      console.log('📤 Creating complaint:', JSON.stringify(complaintData));
      const response = await post('CreateDriverComplaint', complaintData);
      console.log('📥 Complaint created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Complaint creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of all incidents (unified complaints and breakdowns)
   * @param {string} companyDB - Company database name
   * @param {string} status - Optional status filter (O, I, CM, D)
   * @param {string} type - Optional type filter ('Driver Complaints', 'Breakdown', or null for all)
   * @returns {Promise} List of incidents
   */
  getIncidents: async (companyDB, status = null, type = null, depot = '') => {
    try {
      let url = `GetIncidents?CompanyDB=${companyDB}`;
      if (status) {
        url += `&Status=${status}`;
      }
        if (depot) {
          url += `&Depot=${encodeURIComponent(depot)}`;
        }
      const response = await get(url);
      
      // Filter by type if specified
      if (type && response.data?.Data) {
        response.data.Data = response.data.Data.filter(item => item.ComplaintType === type);
      }
      
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of all complaints (legacy - use getIncidents instead)
   * @param {string} companyDB - Company database name
   * @param {string} status - Optional status filter (O, I, CM, D)
   * @returns {Promise} List of complaints
   */
  getComplaints: async (companyDB, status = null, depot = '') => {
    return complaintService.getIncidents(companyDB, status, 'Driver Complaints', depot);
  },

  /**
   * Get detailed information for a specific complaint
   * @param {string} companyDB - Company database name
   * @param {string} docEntry - Document entry number
   * @returns {Promise} Complaint details
   */
  getComplaintDetail: async (companyDB, docEntry) => {
    try {
      const response = await get(`GetDriverComplaintDetail?CompanyDB=${companyDB}&DocEntry=${docEntry}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a new line breakdown report
   * @param {Object} breakdownData - Breakdown details
   * @returns {Promise} Created breakdown response
   */
  createBreakdown: async (breakdownData) => {
    try {
      console.log('📤 Creating breakdown:', JSON.stringify(breakdownData));
      const response = await post('CreateLineBreakdown', breakdownData);
      console.log('📥 Breakdown created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Breakdown creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of all breakdowns (legacy - use getIncidents instead)
   * @param {string} companyDB - Company database name
   * @param {string} status - Optional status filter
   * @returns {Promise} List of breakdowns
   */
  getBreakdowns: async (companyDB, status = null, depot = '') => {
    return complaintService.getIncidents(companyDB, status, 'Breakdown', depot);
  },

  /**
   * Get detailed information for a specific breakdown
   * @param {string} companyDB - Company database name
   * @param {string} docEntry - Document entry number
   * @returns {Promise} Breakdown details
   */
  getBreakdownDetail: async (companyDB, docEntry) => {
    try {
      const response = await get(`GetLineBreakdownDetail?CompanyDB=${companyDB}&DocEntry=${docEntry}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update complaint status
   * @param {string} companyDB - Company database name
   * @param {string} docEntry - Document entry number
   * @param {string} status - New status (O, I, CM, D)
   * @returns {Promise} Update response
   */
  updateComplaintStatus: async (companyDB, docEntry, status, formType = 'D') => {
    try {
      const response = await post('UpdateComplaintStatus', {
        CompanyDB: companyDB,
        DocEntry: docEntry,
        Status: status,
      }, {
        suppressErrorLog: true,
      });

      if (response?.data?.Success && (status === 'CM' || status === 'C')) {
        try {
          await complaintService.closeIncident(companyDB, docEntry, formType === 'B' ? 'B' : 'D');
        } catch (closeError) {
          console.warn('CloseIncident failed after status update:', closeError?.message || closeError);
        }
      }

      return {
        ...response.data,
        Synced: true,
      };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  // Master data helpers (delegated to masterService)
  getActiveBuses: (companyDB, depot) => masterService.getActiveBuses(companyDB, depot),
  getJobTypes: (companyDB) => masterService.getJobTypes(companyDB),
  getDrivers: (companyDB, depot) => masterService.getDrivers(companyDB, depot),
  getMechanics: (companyDB, depot) => masterService.getMechanics(companyDB, depot),
  getSupervisors: (companyDB, depot) => masterService.getSupervisors(companyDB, depot),
  getRoutes: (companyDB) => masterService.getRoutes(companyDB),
  getFaultDetails: (companyDB) => masterService.getFaultDetails(companyDB),
  getFaultMaster: (companyDB) => masterService.getFaultMaster(companyDB),
  getStopsByRoute: (companyDB, routeNo) => masterService.getStopsByRoute(companyDB, routeNo),
  getMaintenanceTeams: (companyDB) => masterService.getMaintenanceTeams(companyDB),
  getTeamMembers: (companyDB, teamCode) => masterService.getTeamMembers(companyDB, teamCode),

  /**
   * Get maintenance teams available for breakdown dispatch, with live Available/Assigned status.
   * API 23 (New): GET GetAvailableTeams?CompanyDB=...&Depot=...
   * SOP §3: Supervisor picks a responder based on location + live team status.
   * Response: { Success, Data: [{ TeamCode, TeamName, Status ('Available'|'Assigned'), Depot }] }
   */
  getAvailableTeams: async (companyDB, depot) => {
    try {
      const url = depot
        ? `GetAvailableTeams?CompanyDB=${companyDB}&Depot=${encodeURIComponent(depot)}`
        : `GetAvailableTeams?CompanyDB=${companyDB}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Assign a Maintenance Team (or individual mechanic) to a Line Breakdown.
   * API 24 (New): POST AssignBreakdownTeam — notifies Team Leader.
   * @param {string} companyDB
   * @param {string|number} breakdownNo
   * @param {string} supervisorCode
   * @param {string} supervisorCode
   * @param {string} teamCode
   * @param {string} remarks
   */
  assignBreakdownTeam: async (companyDB, breakdownDocEntry, supervisorCode, teamCode, remarks = '') => {
    try {
      const docEntry = Number(breakdownDocEntry) || breakdownDocEntry;

      const payload = {
        CompanyDB: companyDB,
        BreakdownDocEntry: docEntry,
        TeamCode: teamCode || '',
        Remarks: remarks || 'Please attend the breakdown immediately.',
      };
      console.log('📤 Assigning breakdown team:', JSON.stringify(payload));
      const response = await post('AssignBreakdownTeam', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Send a flexible supervisor notification. Backend mapping service may not be available,
   * so this helper attempts to use AssignBreakdownTeam as a transport when a supervisorId is provided,
   * and falls back to returning a local structured payload so the UI can display/send an in-app notification.
   * @param {string} companyDB
   * @param {string|number} docEntry
   * @param {string} supervisorId
   * @param {string} message
   */
  notifySupervisor: async (companyDB, docEntry, supervisorId, message) => {
    try {
      const payload = {
        CompanyDB: companyDB,
        BreakdownNo: Number(docEntry) || docEntry,
        Supervisor: supervisorId || '',
        TeamCode: '',
        Message: message || '',
      };
      console.log('🔔 notifySupervisor payload:', JSON.stringify(payload));
      // Try AssignBreakdownTeam as a notification transport if available
      try {
        const response = await post('AssignBreakdownTeam', payload);
        return response.data;
      } catch (e) {
        console.warn('AssignBreakdownTeam used as notification failed:', e?.message || e);
        // Return payload to UI layer so it can show in-app notification
        return { Success: false, Message: 'Notification API not available; returned payload for local handling', Data: payload };
      }
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Close a completed Line Breakdown.
   * API 25 (New): POST CloseBreakdown
   * @param {string} companyDB
   * @param {string|number} breakdownNo
   * @param {string} remarks
   */
  closeBreakdown: async (companyDB, breakdownNo, remarks = '') => {
    try {
      const payload = {
        CompanyDB: companyDB,
        BreakdownNo: Number(breakdownNo) || breakdownNo,
        Remarks: remarks,
      };
      const response = await post('CloseBreakdown', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
