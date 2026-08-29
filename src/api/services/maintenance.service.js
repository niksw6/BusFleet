import { get, post, handleApiError } from '../client';

/**
 * Maintenance Service
 * Handles fuel logs and preventive maintenance scheduling
 */
export const maintenanceService = {
  /**
   * Create service scheduler for preventive maintenance
   * @param {Object} schedulerData
   * @returns {Promise}
   */
  createServiceScheduler: async (schedulerData) => {
    try {
      const normalizedTasks = Array.isArray(schedulerData?.Tasks)
        ? schedulerData.Tasks.map((task) => {
            const repeatTypeRaw = String(task?.RepeatType || '').trim().toLowerCase();
            const repeatTypeCode = repeatTypeRaw === 'o' || repeatTypeRaw === 'once' ? 'O' : 'R';
            const everyKM = Number(task?.EveryKM || 0);
            const everyDay = Number(task?.EveryDay || 0);
            const everyWeek = Number(task?.EveryWeek || 0);
            const everyMonth = Number(task?.EveryMonth || 0);
            const isKmBased = everyKM > 0;
            const notifyKMRaw = Number(task?.NotifyKM || 0);
            const notifyDayRaw = Number(task?.NotifyDay || 0);
            const notifyKM = isKmBased && notifyKMRaw <= 0 ? 200 : notifyKMRaw;
            const notifyDay = !isKmBased && notifyDayRaw <= 0 ? 1 : notifyDayRaw;
            return {
              Task: String(task?.Task || '').trim() || 'General Checkup',
              RepeatType: repeatTypeCode,
              EveryKM: everyKM,
              EveryDay: everyDay,
              EveryWeek: everyWeek,
              EveryMonth: everyMonth,
              NotifyKM: notifyKM,
              NotifyDay: notifyDay,
            };
          })
        : [];

      const normalizedPayload = {
        CompanyDB: String(schedulerData?.CompanyDB || '').trim(),
        BusNo: String(schedulerData?.BusNo || '').trim(),
        LastSrvKM: Number(schedulerData?.LastSrvKM || 0),
        LastSrvDt: String(schedulerData?.LastSrvDt || '').trim(),
        Tasks: normalizedTasks,
      };

      console.log('🛠️ Creating service scheduler:', JSON.stringify(normalizedPayload));
      const response = await post('CreateServiceScheduler', normalizedPayload);
      console.log('🛠️ Service scheduler created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ CreateServiceScheduler error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get scheduler lines by bus number
   * @param {string} companyDB
   * @param {string} busNo
   * @returns {Promise}
   */
  getSchedulerByBus: async (companyDB, busNo) => {
    try {
      const response = await get(`GetSchedulerByBus?CompanyDB=${companyDB}&BusNo=${busNo}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get all service schedulers (headers)
   * @param {string} companyDB
   * @returns {Promise}
   */
  getServiceSchedulers: async (companyDB) => {
    try {
      const response = await get(`GetServiceSchedulers?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get due services
   * @param {string} companyDB
   * @returns {Promise}
   */
  getDueServices: async (companyDB) => {
    try {
      const response = await get(`GetDueServices?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a new fuel log entry
   * @param {Object} fuelData - Fuel log details
   * @returns {Promise} Created fuel log response
   */
  createFuelLog: async (fuelData) => {
    try {
      console.log('⛽ Creating fuel log:', JSON.stringify(fuelData));
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
      console.log('📅 Creating schedule:', JSON.stringify(scheduleData));
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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
    }
  },
};
