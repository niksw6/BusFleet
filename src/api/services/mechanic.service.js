import { get, post, handleApiError } from '../client';

/**
 * Mechanic Service — Mechanic / Electrician work module.
 *
 * Confirmed LIVE endpoints (tested against http://88.99.68.90:85/BMSSystem/):
 *   GET  GetMechanicDashboard?CompanyDB=...&UserCode=...
 *   POST AcceptFault      { CompanyDB, DocEntry, FaultLine, UserCode }
 *   POST StartWork        { CompanyDB, DocEntry, FaultLine, UserCode }
 *   POST CreateWorkEntry  { CompanyDB, JobCardDocEntry, FaultLine, UserCode, FinalRemarks, Details:[{WorkCode,WorkDone,OtherDescription,Remarks}] }
 *   POST UpdateWorkEntry  { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks, Details:[...] }
 *   POST CompleteWork     { CompanyDB, WorkEntryDocEntry, UserCode, FinalRemarks }
 *
 * Flow (per SOP + Driver Complaint Incident Flow):
 *   Once the Team Leader accepts a Job Card, its faults become visible to the
 *   team's Mechanics/Electricians on their own dashboard. A mechanic self-accepts
 *   a fault line (AcceptFault), starts work (StartWork), logs work performed via
 *   one or more Work Entries (Create then Update to append more Details as work
 *   progresses), requests parts if needed (see store.service.js), and finally
 *   closes it out with CompleteWork once done.
 */
export const mechanicService = {
  /**
   * Mechanic's dashboard — faults available to accept + their active/completed work.
   * @param {string} companyDB
   * @param {string} userCode - Mechanic/Electrician's login code (e.g. "Asok")
   */
  getMechanicDashboard: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetMechanicDashboard?CompanyDB=${companyDB}&UserCode=${encodeURIComponent(userCode)}`
      );
      console.log('🔧 GetMechanicDashboard response:', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      console.warn('GetMechanicDashboard failed:', error?.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Mechanic accepts a fault line on a Job Card.
   * @param {string} companyDB
   * @param {string|number} docEntry - Job Card DocEntry
   * @param {string|number} faultLine
   * @param {string} userCode
   */
  acceptFault: async (companyDB, docEntry, faultLine, userCode) => {
    const payload = {
      CompanyDB: companyDB,
      DocEntry: Number(docEntry) || docEntry,
      FaultLine: Number(faultLine) || 0,
      UserCode: userCode,
    };
    console.log('📤 AcceptFault:', JSON.stringify(payload, null, 2));
    const response = await post('AcceptFault', payload);
    return response.data;
  },

  /**
   * Mechanic starts work on an accepted fault.
   * @param {string} companyDB
   * @param {string|number} docEntry - Job Card DocEntry
   * @param {string|number} faultLine
   * @param {string} userCode
   */
  startWork: async (companyDB, docEntry, faultLine, userCode) => {
    const payload = {
      CompanyDB: companyDB,
      DocEntry: Number(docEntry) || docEntry,
      FaultLine: Number(faultLine) || 0,
      UserCode: userCode,
    };
    console.log('📤 StartWork:', JSON.stringify(payload, null, 2));
    const response = await post('StartWork', payload);
    return response.data;
  },

  /**
   * Create a new Work Entry for a fault (first log of work performed).
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.JobCardDocEntry
   * @param {number} payload.FaultLine
   * @param {string} payload.UserCode
   * @param {string} payload.FinalRemarks
   * @param {Array}  payload.Details - [{ WorkCode, WorkDone, OtherDescription, Remarks }]
   */
  createWorkEntry: async (payload) => {
    console.log('📝 CreateWorkEntry:', JSON.stringify(payload, null, 2));
    const response = await post('CreateWorkEntry', payload);
    console.log('📝 CreateWorkEntry response:', response.data);
    return response.data;
  },

  /**
   * Append more Details / update remarks on an existing Work Entry.
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.UserCode
   * @param {string} payload.FinalRemarks
   * @param {Array}  payload.Details
   */
  updateWorkEntry: async (payload) => {
    console.log('📝 UpdateWorkEntry:', JSON.stringify(payload, null, 2));
    const response = await post('UpdateWorkEntry', payload);
    console.log('📝 UpdateWorkEntry response:', response.data);
    return response.data;
  },

  /**
   * Mark a Work Entry (and its fault) as complete.
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.UserCode
   * @param {string} payload.FinalRemarks
   */
  completeWork: async (payload) => {
    console.log('🏁 CompleteWork:', JSON.stringify(payload, null, 2));
    const response = await post('CompleteWork', payload);
    console.log('🏁 CompleteWork response:', response.data);
    return response.data;
  },
};
