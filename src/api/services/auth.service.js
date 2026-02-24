import { get, post, handleApiError } from '../client';

/**
 * Authentication Service
 * Handles login, company selection, and session management
 */
export const authService = {
  /**
   * Get list of available company databases
   * @returns {Promise} List of companies
   */
  getCompanyLists: async () => {
    try {
      const response = await get('MGetCompanyLists');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Authenticate user with credentials
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.DBName - Company database name
   * @param {string} credentials.User - Username
   * @param {string} credentials.Password - Password
   * @returns {Promise} User data and auth token
   */
  login: async (credentials) => {
    try {
      const response = await post('MCheckLogin', credentials);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Logout user (if backend endpoint exists)
   * @returns {Promise}
   */
  logout: async () => {
    try {
      // Implement if backend has logout endpoint
      return { success: true };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
