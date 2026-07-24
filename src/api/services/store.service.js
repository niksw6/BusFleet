import { get, post, handleApiError } from '../client';

/**
 * Store Service — Spare parts request / approval / receipt module.
 *
 * Confirmed LIVE endpoints (tested against http://88.99.68.90:85/BMSSystem/):
 *   POST RequestJobCardParts        (Supervisor requests parts known upfront, per fault line)
 *   GET  GetApprovedJobCardParts?CompanyDB=...&UserCode=...   (Mechanic checks approved parts)
 *   POST ReceiveJobCardParts        (confirm parts physically received)
 *   POST RequestWorkEntryParts      (Mechanic requests parts while doing the work)
 *   GET  GetMechanicPartRequests?CompanyDB=...   (Supervisor sees all pending mechanic requests)
 *   POST ApproveMechanicPartRequest (Supervisor approves/rejects each part line)
 *
 * Flow (per SOP + Driver Complaint Incident Flow):
 *   Parts required by Mechanic/Electrician → Supervisor notified → Supervisor
 *   approves (direct/indirect) → Store issues goods → Mechanic receives parts.
 *   Two entry points into this flow are supported by the backend:
 *     1) Supervisor already knows the parts needed at Job Card creation time
 *        (RequestJobCardParts, tied to FaultLine).
 *     2) Mechanic discovers parts are needed while working (RequestWorkEntryParts,
 *        tied to WorkEntryDocEntry) — these show up in GetMechanicPartRequests for
 *        the Supervisor to approve via ApproveMechanicPartRequest.
 */
export const storeService = {
  /**
   * Supervisor requests parts for one or more faults on a Job Card (known upfront).
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.JobCardDocEntry
   * @param {string} payload.UserCode - Supervisor code
   * @param {Array}  payload.Parts - [{ FaultLine, ItemCode, ItemName, ReqQty, AddQty, Remarks }]
   */
  requestJobCardParts: async (payload) => {
    console.log('📦 RequestJobCardParts:', JSON.stringify(payload, null, 2));
    const response = await post('RequestJobCardParts', payload);
    console.log('📦 RequestJobCardParts response:', response.data);
    return response.data;
  },

  /**
   * Mechanic checks which requested parts have been approved (and are ready to collect).
   * @param {string} companyDB
   * @param {string} userCode - Mechanic's login code
   */
  getApprovedJobCardParts: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetApprovedJobCardParts?CompanyDB=${companyDB}&UserCode=${encodeURIComponent(userCode)}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Confirm parts have been physically received (by mechanic or supervisor).
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.JobCardDocEntry
   * @param {string} payload.UserCode
   * @param {Array}  payload.Parts - [{ PartLine, ReceivedQty }]
   */
  receiveJobCardParts: async (payload) => {
    console.log('📦 ReceiveJobCardParts:', JSON.stringify(payload, null, 2));
    const response = await post('ReceiveJobCardParts', payload);
    console.log('📦 ReceiveJobCardParts response:', response.data);
    return response.data;
  },

  /**
   * Mechanic requests parts discovered as needed while performing a Work Entry.
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.UserCode
   * @param {Array}  payload.Parts - [{ ItemCode, ItemName, ReqQty, Warehouse, Remarks }]
   */
  requestWorkEntryParts: async (payload) => {
    console.log('📦 RequestWorkEntryParts:', JSON.stringify(payload, null, 2));
    const response = await post('RequestWorkEntryParts', payload);
    console.log('📦 RequestWorkEntryParts response:', response.data);
    return response.data;
  },

  /**
   * Supervisor views all pending part requests raised by mechanics from Work Entries.
   * @param {string} companyDB
   */
  getMechanicPartRequests: async (companyDB) => {
    try {
      const response = await get(`GetMechanicPartRequests?CompanyDB=${companyDB}`);
      console.log('📋 GetMechanicPartRequests response:', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Supervisor approves/rejects each part line of a mechanic's part request.
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {number} payload.JobCardDocEntry
   * @param {string} payload.SupervisorCode
   * @param {Array}  payload.Parts - [{ PartLine, ApprovedQty, Approved, StoreWarehouse, Remarks }]
   */
  approveMechanicPartRequest: async (payload) => {
    console.log('✅ ApproveMechanicPartRequest:', JSON.stringify(payload, null, 2));
    const response = await post('ApproveMechanicPartRequest', payload);
    console.log('✅ ApproveMechanicPartRequest response:', response.data);
    return response.data;
  },
};
