import { get, post, handleApiError } from '../client';

/**
 * Work Entry Service
 * Handles mechanic work entries, parts requests, approvals, and receipts.
 *
 * Workflow:
 *   Mechanic adds work entry → Mechanic requests parts → Supervisor approves →
 *   SAP STORE issues → Mechanic clicks "Part Received" → Mechanic completes work
 */
export const workEntryService = {

  /**
   * Get all work entries for a work order.
   * @param {string} companyDB
   * @param {string|number} workOrderDocEntry
   */
  getWorkEntries: async (companyDB, workOrderDocEntry) => {
    try {
      const response = await get(
        `GetWorkEntries?CompanyDB=${companyDB}&DocEntry=${workOrderDocEntry}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Add a work entry by mechanic.
   * Description can come from WorkList dropdown or manual (WorkListCode = 'OTHER').
   *
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.DocEntry       - Work Order DocEntry
   * @param {string} payload.MechanicCode
   * @param {string} payload.WorkListCode   - Code from GetWorkList, or 'OTHER'
   * @param {string} payload.Description    - Manual text when WorkListCode = 'OTHER'
   * @param {string} payload.Remarks
   */
  addWorkEntry: async (payload) => {
    try {
      console.log('📝 AddWorkEntry:', JSON.stringify(payload, null, 2));
      const response = await post('AddWorkEntry', payload);
      console.log('📝 AddWorkEntry response:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Request spare parts for a work order (by Mechanic or Supervisor).
   * Supervisor will approve / SAP Store will issue.
   *
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.DocEntry       - Work Order DocEntry
   * @param {string} payload.RequestedBy    - MechanicCode or SupervisorCode
   * @param {Array}  payload.Parts          - [{ ItemCode, ItemName, Qty, UoM, Remarks }]
   */
  requestParts: async (payload) => {
    try {
      console.log('🔩 RequestParts:', JSON.stringify(payload, null, 2));
      const response = await post('RequestParts', payload);
      console.log('🔩 RequestParts response:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get parts requests for a work order.
   */
  getPartsRequests: async (companyDB, workOrderDocEntry) => {
    try {
      const response = await get(
        `GetPartsRequests?CompanyDB=${companyDB}&DocEntry=${workOrderDocEntry}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Supervisor approves or rejects a parts request.
   *
   * @param {string} companyDB
   * @param {string} requestCode  - Part request code
   * @param {string} status       - 'A' (Approve) or 'X' (Reject)
   * @param {string} supervisorCode
   * @param {string} remarks
   */
  approvePartRequest: async (companyDB, requestCode, status, supervisorCode, remarks = '') => {
    try {
      const payload = {
        CompanyDB: companyDB,
        RequestCode: requestCode,
        Status: status,
        ApprovedBy: supervisorCode,
        Remarks: remarks,
        ActionDate: new Date().toISOString(),
      };
      console.log('✅ ApprovePartRequest:', JSON.stringify(payload, null, 2));
      const response = await post('ApprovePartRequest', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Mechanic confirms part has been received from store.
   *
   * @param {string} companyDB
   * @param {string} requestCode
   * @param {string} mechanicCode
   */
  markPartReceived: async (companyDB, requestCode, mechanicCode) => {
    try {
      const payload = {
        CompanyDB: companyDB,
        RequestCode: requestCode,
        MechanicCode: mechanicCode,
        ReceivedAt: new Date().toISOString(),
      };
      console.log('📦 MarkPartReceived:', JSON.stringify(payload, null, 2));
      const response = await post('MarkPartReceived', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get items already issued by the SAP Store for a job card.
   * These are items that were approved + issued — mechanic can assign them to a fault.
   *
   * API: GET GetIssuedItems?CompanyDB=MUTSPL_TEST&JobCardNo=1
   * Response: { Success, Data: [{ IssuedQty, ItemCode, ItemName, JCLine, Warehouse }] }
   *
   * @param {string} companyDB
   * @param {string|number} jobCardNo  - Job card number (not DocEntry)
   */
  getIssuedItems: async (companyDB, jobCardNo) => {
    try {
      const response = await get(
        `GetIssuedItems?CompanyDB=${companyDB}&JobCardNo=${jobCardNo}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
