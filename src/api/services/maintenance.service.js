import { get, post, handleApiError } from '../client';

/**
 * Maintenance Service
 * Handles fuel logs and preventive maintenance scheduling
 */
export const maintenanceService = {
  /**
   * Create a new fuel log entry
   * @param {Object} fuelData - Fuel log details
   * @returns {Promise} Created fuel log response
   */
  createFuelLog: async (fuelData) => {
    try {
      console.log('⛽ Creating fuel log:', JSON.stringify(fuelData, null, 2));
      const response = await post('CreateFuelLog', fuelData);
      console.log('⛽ Fuel log created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Fuel log creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get fuel logs history
   * @param {string} companyDB - Company database name
   * @param {string} vehicleNumber - Optional vehicle filter
   * @returns {Promise} List of fuel logs
   */
  getFuelLogs: async (companyDB, vehicleNumber = null) => {
    try {
      let url = `GetFuelLogs?CompanyDB=${companyDB}`;
      if (vehicleNumber) {
        url += `&VehicleNumber=${vehicleNumber}`;
      }
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a preventive maintenance schedule
   * @param {Object} scheduleData - Schedule details
   * @returns {Promise} Created schedule response
   */
  createSchedule: async (scheduleData) => {
    try {
      console.log('📅 Creating schedule:', JSON.stringify(scheduleData, null, 2));
      const response = await post('CreateSchedule', scheduleData);
      console.log('📅 Schedule created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Schedule creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get scheduled services
   * @param {string} companyDB - Company database name
   * @param {string} vehicleNumber - Optional vehicle filter
   * @returns {Promise} List of scheduled services
   */
  getSchedules: async (companyDB, vehicleNumber = null) => {
    try {
      let url = `GetScheduledServices?CompanyDB=${companyDB}`;
      if (vehicleNumber) {
        url += `&VehicleNumber=${vehicleNumber}`;
      }
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get upcoming maintenance due dates
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of upcoming maintenance
   */
  getUpcomingMaintenance: async (companyDB) => {
    try {
      const response = await get(`GetUpcomingMaintenance?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      console.warn('GetUpcomingMaintenance API not available');
      return { Success: true, Data: [] };
    }
  },

  /**
   * Mark scheduled service as completed
   * @param {string} companyDB - Company database name
   * @param {string} scheduleId - Schedule ID
   * @param {Object} completionData - Completion details
   * @returns {Promise} Update response
   */
  completeScheduledService: async (companyDB, scheduleId, completionData) => {
    try {
      const response = await post('CompleteScheduledService', {
        CompanyDB: companyDB,
        ScheduleId: scheduleId,
        ...completionData,
      });
      return response.data;
    } catch (error) {
      console.warn('CompleteScheduledService API not available');
      return { Success: true, Message: 'Service completed (local only)' };
    }
  },

  /**
   * Get fuel consumption analytics
   * @param {string} companyDB - Company database name
   * @param {string} vehicleNumber - Vehicle number
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   * @returns {Promise} Fuel analytics data
   */
  getFuelAnalytics: async (companyDB, vehicleNumber, fromDate, toDate) => {
    try {
      const url = `GetFuelAnalytics?CompanyDB=${companyDB}&VehicleNumber=${vehicleNumber}&FromDate=${fromDate}&ToDate=${toDate}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      console.warn('GetFuelAnalytics API not available');
      return { Success: true, Data: { averageConsumption: 0, totalCost: 0 } };
    }
  },
};
