import { get, post, handleApiError } from '../client';
import { API_BASE_URL } from '../../constants/config';
import { getDBName, getSessionCookie } from '../../utils/storage';

const extractXmlValue = (xml, tagName) => {
  const match = String(xml || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.trim() || '';
};

/**
 * Work Entry Service
 * Handles mechanic work entries, parts requests, approvals, and receipts.
 *
 * Workflow:
 *   Mechanic adds work entry → Mechanic requests parts → Supervisor approves →
 *   SAP STORE issues → Mechanic clicks "Part Received" → Mechanic completes work
 */
export const workEntryService = {
  getWorkEntry: async (companyDB, workEntryDocEntry) => {
    try {
      const response = await get(
        `GetWorkEntry?CompanyDB=${companyDB}&WorkEntryDocEntry=${workEntryDocEntry}`,
        { suppressErrorLog: true }
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Supervisor verifies or sends a work entry for rework.
   * Status values include: SV (Supervisor Verified), RW (Rework).
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number|string} payload.WorkEntryDocEntry
   * @param {string} payload.UserCode
   * @param {string} payload.Status
   * @param {string} payload.Remarks
   */
  verifyWorkEntry: async (payload) => {
    try {
      const rawStatus = String(payload?.Status || '').trim().toUpperCase();
      const statusMap = {
        A: 'SV',
        APPROVE: 'SV',
        APPROVED: 'SV',
        ACCEPT: 'SV',
        ACCEPTED: 'SV',
        SV: 'SV',
        R: 'RW',
        RW: 'RW',
        REWORK: 'RW',
        REJECT: 'RW',
        REJECTED: 'RW',
        DENY: 'RW',
        DENIED: 'RW',
      };
      const normalizedStatus = statusMap[rawStatus] || rawStatus;

      if (!['SV', 'RW'].includes(normalizedStatus)) {
        throw new Error(`VerifyWorkEntry status '${rawStatus || '(empty)'}' is invalid. Use SV (approve) or RW (rework).`);
      }

      const normalizedPayload = {
        ...payload,
        Status: normalizedStatus,
      };
      console.log('VerifyWorkEntry payload:', JSON.stringify(normalizedPayload));
      const response = await post('VerifyWorkEntry', normalizedPayload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getWorkHistory: async (companyDB, jobCardNo) => {
    return { Success: true, Data: [] };
  },

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
  * Description can come from the fault-details dropdown or manual (WorkListCode = 'OTHER').
   *
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.DocEntry       - Work Order DocEntry
   * @param {string} payload.MechanicCode
  * @param {string} payload.WorkListCode   - Code from GetFaultDetails, or 'OTHER'
   * @param {string} payload.Description    - Manual text when WorkListCode = 'OTHER'
   * @param {string} payload.Remarks
   */
  addWorkEntry: async (payload) => {
    try {
      console.log('📝 AddWorkEntry:', JSON.stringify(payload));
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
      console.log('🔩 RequestParts:', JSON.stringify(payload));
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
      console.log('✅ ApprovePartRequest:', JSON.stringify(payload));
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
      console.log('📦 MarkPartReceived:', JSON.stringify(payload));
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

  /**
   * Upload up to 2 images via multipart/form-data.
   * API: POST UploadImage (form field name: Image)
   * Returns XML with FileName list.
   */
  uploadImages: async (images = []) => {
    try {
      const files = Array.isArray(images) ? images.filter(Boolean) : [];
      if (files.length === 0) {
        throw new Error('Select at least one image to upload.');
      }

      const dbName = await getDBName();
      const sessionCookie = await getSessionCookie();
      const headers = {
        Accept: 'application/xml,text/xml,*/*',
      };
      if (dbName) headers.DBName = dbName;
      if (sessionCookie) headers.Cookie = sessionCookie;

      const formData = new FormData();
      files.forEach((image, index) => {
        const uri = image?.uri || image?.fileUri;
        if (!uri) return;
        const inferredName = image?.name || image?.fileName || `work-entry-${Date.now()}-${index + 1}.jpg`;
        const inferredType = image?.mimeType || image?.type || 'image/jpeg';
        formData.append('Image', {
          uri,
          name: inferredName,
          type: inferredType,
        });
      });

      const response = await fetch(`${API_BASE_URL}UploadImage`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`UploadImage failed (${response.status})`);
      }

      const success = /^true$/i.test(extractXmlValue(responseText, 'Success'));
      const fileNameCsv = extractXmlValue(responseText, 'FileName');
      const message = extractXmlValue(responseText, 'Message');
      const filePath = extractXmlValue(responseText, 'FilePath');
      const fileNames = fileNameCsv
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        Success: success,
        Status: success,
        Message: message,
        FileName: fileNameCsv,
        FileNames: fileNames,
        FilePath: filePath,
      };
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Save one uploaded image metadata against a work entry + fault line.
   */
  saveWorkEntryImage: async (payload) => {
    try {
      const response = await post('SaveWorkEntryImage', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get image content as base64 by uploaded file name.
   */
  getWorkEntryImageBase64: async (fileName) => {
    try {
      const response = await get(`GetWorkEntryImageBase64?fileName=${encodeURIComponent(fileName)}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
