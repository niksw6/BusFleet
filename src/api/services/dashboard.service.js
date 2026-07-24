import { get, post, handleApiError } from '../client';

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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get notifications for current user
   * @param {string} companyDB - Company database name
   * @param {string} userId - User ID
   * @returns {Promise} List of notifications
   */
  getNotifications: async (companyDB, userId) => {
    console.log(`[Notifications] getNotifications called - CompanyDB: "${companyDB}" User: "${userId}"`);
    try {
      const response = await get(`GetNotifications?CompanyDB=${companyDB}&User=${userId}`);
      console.log(`[Notifications] getNotifications response:`, JSON.stringify(response.data).slice(0, 200));
      return response.data;
    } catch (error) {
      console.error(`[Notifications] getNotifications FAILED - CompanyDB: "${companyDB}" User: "${userId}" Error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get notification count for current user
   * @param {string} companyDB - Company database name
   * @param {string} userId - User ID
   * @returns {Promise} Unread count response
   */
  getNotificationCount: async (companyDB, userId) => {
    console.log(`[Notifications] getNotificationCount called - CompanyDB: "${companyDB}" User: "${userId}"`);
    try {
      const response = await get(`GetNotificationCount?CompanyDB=${companyDB}&User=${userId}`);
      console.log(`[Notifications] getNotificationCount response:`, JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      console.error(`[Notifications] getNotificationCount FAILED - CompanyDB: "${companyDB}" User: "${userId}" Error: ${error.message}`);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise} Update response
   */
  markNotificationAsRead: async (notificationId) => {
    try {
      const response = await post('MarkNotificationRead', notificationId);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
    }
  },
};
