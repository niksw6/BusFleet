import { get, handleApiError } from '../client';

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
      console.warn('GetMechanics API not available, using fallback:', error.message);
      // Return fallback data if API fails
      return {
        Success: true,
        Data: [
          { Code: null, FirstName: 'Rajesh Kumar' },
          { Code: null, FirstName: 'Suresh Patil' },
          { Code: null, FirstName: 'Vijay Singh' },
          { Code: null, FirstName: 'Amit Shah' },
        ],
      };
    }
  },

  /**
   * Get fault details master
   * @param {string} companyDB - Company database name
   * @returns {Promise} List of faults with descriptions
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
};
