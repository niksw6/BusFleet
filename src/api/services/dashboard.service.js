import { get, handleApiError } from '../client';

/**
 * Dashboard Service
 * Handles analytics, statistics, and reporting
 */
export const dashboardService = {
  /**
   * Get dashboard status with complaints and breakdowns count
   * @param {string} companyDB - Company database name
   * @returns {Promise} Dashboard statistics
   */
  getDashboardStatus: async (companyDB) => {
    try {
      // Use longer timeout for dashboard API (90 seconds)
      const response = await get(`GetDashboardStatus?CompanyDB=${companyDB}`, { 
        timeout: 90000 
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get additional dashboard statistics
   * @param {string} companyDB - Company database name
   * @returns {Promise} Additional stats
   */
  getDashboardStats: async (companyDB) => {
    try {
      const response = await get(`GetDashboardStats?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      console.warn('GetDashboardStats API not available');
      return { Success: true, Data: {} };
    }
  },

  /**
   * Get vehicle inspections data
   * @param {string} companyDB - Company database name
   * @returns {Promise} Inspections data
   */
  getInspections: async (companyDB) => {
    try {
      const response = await get(`GetInspections?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      console.warn('GetInspections API not available');
      return { Success: true, Data: [] };
    }
  },

  /**
   * Get work orders data
   * @param {string} companyDB - Company database name
   * @returns {Promise} Work orders data
   */
  getWorkOrders: async (companyDB) => {
    try {
      const response = await get(`GetWorkOrders?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      console.warn('GetWorkOrders API not available');
      return { Success: true, Data: [] };
    }
  },

  /**
   * Get notifications for current user
   * @param {string} companyDB - Company database name
   * @param {string} userId - User ID
   * @returns {Promise} List of notifications
   */
  getNotifications: async (companyDB, userId) => {
    try {
      const response = await get(`GetNotifications?CompanyDB=${companyDB}&UserId=${userId}`);
      return response.data;
    } catch (error) {
      console.warn('GetNotifications API not available');
      return { Success: true, Data: [] };
    }
  },

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise} Update response
   */
  markNotificationAsRead: async (notificationId) => {
    try {
      const response = await get(`MarkNotificationAsRead?NotificationId=${notificationId}`);
      return response.data;
    } catch (error) {
      console.warn('MarkNotificationAsRead API not available');
      return { Success: true };
    }
  },

  /**
   * Get fleet performance metrics
   * @param {string} companyDB - Company database name
   * @param {string} fromDate - Start date
   * @param {string} toDate - End date
   * @returns {Promise} Performance metrics
   */
  getFleetPerformance: async (companyDB, fromDate, toDate) => {
    try {
      const url = `GetFleetPerformance?CompanyDB=${companyDB}&FromDate=${fromDate}&ToDate=${toDate}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      console.warn('GetFleetPerformance API not available');
      return { 
        Success: true, 
        Data: {
          totalVehicles: 0,
          activeVehicles: 0,
          underMaintenance: 0,
          avgUptime: 0,
        } 
      };
    }
  },

  /**
   * Get cost analysis data
   * @param {string} companyDB - Company database name
   * @param {string} period - Period (monthly, quarterly, yearly)
   * @returns {Promise} Cost analysis
   */
  getCostAnalysis: async (companyDB, period = 'monthly') => {
    try {
      const response = await get(`GetCostAnalysis?CompanyDB=${companyDB}&Period=${period}`);
      return response.data;
    } catch (error) {
      console.warn('GetCostAnalysis API not available');
      return { 
        Success: true, 
        Data: {
          fuelCost: 0,
          maintenanceCost: 0,
          sparepartsCost: 0,
          totalCost: 0,
        } 
      };
    }
  },
};
