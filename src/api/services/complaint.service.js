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
      console.log('📤 Closing incident:', JSON.stringify(payload, null, 2));
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
      console.log('📤 Creating incident - Full Payload:', JSON.stringify(incidentData, null, 2));
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
      console.log('📤 Creating complaint:', JSON.stringify(complaintData, null, 2));
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
  getIncidents: async (companyDB, status = null, type = null) => {
    try {
      let url = `GetIncidents?CompanyDB=${companyDB}`;
      if (status) {
        url += `&Status=${status}`;
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
  getComplaints: async (companyDB, status = null) => {
    return complaintService.getIncidents(companyDB, status, 'Driver Complaints');
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
      console.log('📤 Creating breakdown:', JSON.stringify(breakdownData, null, 2));
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
  getBreakdowns: async (companyDB, status = null) => {
    return complaintService.getIncidents(companyDB, status, 'Breakdown');
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
      const normalizedStatus = String(status || '').toUpperCase();

      if (normalizedStatus === 'CM' || normalizedStatus === 'C') {
        try {
          const closeResponse = await complaintService.closeIncident(
            companyDB,
            docEntry,
            formType === 'B' ? 'B' : 'D',
          );

          return {
            ...closeResponse,
            Synced: false,
            ClosedByFallback: true,
          };
        } catch (closeError) {
          console.warn('UpdateComplaintStatus and CloseIncident both failed:', closeError?.message || closeError);
          return {
            Success: false,
            Synced: false,
            Message: 'Unable to update incident status',
          };
        }
      }

      return {
        Success: false,
        Synced: false,
        Message: 'UpdateComplaintStatus API not available',
      };
    }
  },

  // Master data helpers (delegated to masterService)
  getActiveBuses: (companyDB) => masterService.getActiveBuses(companyDB),
  getJobTypes: (companyDB) => masterService.getJobTypes(companyDB),
  getDrivers: (companyDB) => masterService.getDrivers(companyDB),
  getMechanics: (companyDB) => masterService.getMechanics(companyDB),
  getSupervisors: (companyDB) => masterService.getSupervisors(companyDB),
  getRoutes: (companyDB) => masterService.getRoutes(companyDB),
  getFaultDetails: (companyDB) => masterService.getFaultDetails(companyDB),
  getStopsByRoute: (companyDB, routeNo) => masterService.getStopsByRoute(companyDB, routeNo),
};
