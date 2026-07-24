import { get, post, handleApiError } from '../client';

/**
 * Team Service — Team Leader module.
 *
 * Confirmed LIVE endpoints (tested against http://88.99.68.90:85/BMSSystem/):
 *   GET  GetMechanicalDashboard?CompanyDB=...&UserCode=...
 *   GET  GetMyTeamMembers?CompanyDB=...&UserCode=...
 *   GET  GetJobCardFaults?CompanyDB=...&DocEntry=...
 *   POST UpdateTeamStatus  { CompanyDB, DocEntry, UserCode, Status: 'A'|'R', Remarks }
 *
 * Flow (per SOP + Driver Complaint Incident Flow):
 *   Supervisor creates Job Card for a Maintenance Team → Team Leader sees it on
 *   the Mechanical Dashboard → Accepts ('A') or Rejects ('R', with Remarks) via
 *   UpdateTeamStatus → once accepted, the team's Mechanics/Electricians self-accept
 *   individual faults (see mechanic.service.js) — the Team Leader does not manually
 *   assign faults, the team pulls work themselves.
 */
export const teamService = {
  /**
   * Team Leader's dashboard — summary + list of job cards for their team(s).
   * @param {string} companyDB
   * @param {string} userCode - Team Leader's login code (e.g. "Vishal")
   */
  getMechanicalDashboard: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetMechanicalDashboard?CompanyDB=${companyDB}&UserCode=${encodeURIComponent(userCode)}`
      );
      console.log('👷 GetMechanicalDashboard response:', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      console.warn('GetMechanicalDashboard failed:', error?.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List of Mechanics/Electricians/Helpers in the Team Leader's own team.
   * @param {string} companyDB
   * @param {string} userCode - Team Leader's login code
   */
  getMyTeamMembers: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetMyTeamMembers?CompanyDB=${companyDB}&UserCode=${encodeURIComponent(userCode)}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Fault list for a specific Job Card (read-only view for Team Leader —
   * mechanics self-accept individual fault lines from their own dashboard).
   * @param {string} companyDB
   * @param {string|number} docEntry - Job Card DocEntry
   */
  getJobCardFaults: async (companyDB, docEntry) => {
    try {
      const response = await get(
        `GetJobCardFaults?CompanyDB=${companyDB}&DocEntry=${docEntry}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Team Leader accepts or rejects a Job Card assigned to their team.
   * @param {string} companyDB
   * @param {string|number} docEntry - Job Card DocEntry
   * @param {string} userCode - Team Leader's login code
   * @param {'A'|'R'} status
   * @param {string} remarks - Required when rejecting
   */
  updateTeamStatus: async (companyDB, docEntry, userCode, status, remarks = '') => {
    const payload = {
      CompanyDB: companyDB,
      DocEntry: Number(docEntry) || docEntry,
      UserCode: userCode,
      Status: status,
      Remarks: remarks || '',
    };
    console.log('📤 UpdateTeamStatus:', JSON.stringify(payload, null, 2));
    const response = await post('UpdateTeamStatus', payload);
    console.log('📥 UpdateTeamStatus response:', response.data);
    return response.data;
  },
};
