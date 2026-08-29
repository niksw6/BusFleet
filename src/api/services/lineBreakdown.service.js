import { get, post, handleApiError } from '../client';

/**
 * Line Breakdown Service
 * Handles Line Breakdown-specific workflows: incident creation, team assignment, work entry, repair completion
 */
export const lineBreakdownService = {
  /**
   * Get Line Breakdown Details
   * GET /GetLineBreakdownDetail?CompanyDB={CompanyDB}&DocEntry={DocEntry}
   */
  getLineBreakdownDetail: async (companyDB, docEntry) => {
    try {
      const response = await get(
        `GetLineBreakdownDetail?CompanyDB=${companyDB}&DocEntry=${docEntry}`
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create Line Breakdown Work Entry
   * POST /CreateLineBreakdownWorkEntry
   * 
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.JobCardDocEntry
   * @param {number} payload.FaultLine
   * @param {string} payload.UserCode
   * @param {string} payload.RepairType - 'P' (Permanent) or 'T' (Temporary)
   * @param {string} payload.FinalRemarks
   * @param {Array} payload.Details - [{ WorkCode, WorkDone, OtherDescription, Remarks }]
   */
  createLineBreakdownWorkEntry: async (payload) => {
    try {
      console.log('🔧 Creating Line Breakdown Work Entry:', JSON.stringify(payload));
      const response = await post('CreateLineBreakdownWorkEntry', payload);
      console.log('🔧 Work Entry created:', response.data);
      return response.data;
    } catch (error) {
      console.error('🔧 Error creating work entry:', error.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Complete Line Breakdown Work Entry
   * POST /CompleteLineBreakdownWorkEntry
   * 
   * Determines next workflow based on stored RepairType:
   * - Permanent (P): Routes to Supervisor/Team Leader verification
   * - Temporary (T): Routes to bus depot assignment
   * 
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.FinalRemarks
   */
  completeLineBreakdownWorkEntry: async (payload) => {
    try {
      console.log('✅ Completing Line Breakdown Work Entry:', JSON.stringify(payload));
      const response = await post('CompleteLineBreakdownWorkEntry', payload);
      console.log('✅ Work Entry completed:', response.data);
      return response.data;
    } catch (error) {
      console.error('✅ Error completing work entry:', error.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Verify Line Breakdown Work Entry (Permanent Repair only)
   * POST /VerifyLineBreakdownWorkEntry
   * 
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.UserCode - Supervisor or Team Leader code
   * @param {string} payload.Status - 'SV' (Approved) or 'RW' (Rework)
   * @param {string} payload.Remarks
   */
  verifyLineBreakdownWorkEntry: async (payload) => {
    try {
      const normalizedStatus = String(payload?.Status || '').trim().toUpperCase();
      if (!['SV', 'RW'].includes(normalizedStatus)) {
        throw new Error(`Invalid status. Use 'SV' (Approved) or 'RW' (Rework), got '${normalizedStatus}'`);
      }

      const normalizedPayload = { ...payload, Status: normalizedStatus };
      console.log('🔍 Verifying Line Breakdown Work Entry:', JSON.stringify(normalizedPayload));
      const response = await post('VerifyLineBreakdownWorkEntry', normalizedPayload);
      console.log('🔍 Work Entry verified:', response.data);
      return response.data;
    } catch (error) {
      console.error('🔍 Error verifying work entry:', error.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Upload Image (used for both work entry and supervisor verification photos)
   * POST /UploadImage
   * 
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {string} payload.ImageData - Base64 encoded image
   * @param {string} payload.FileName
   */
  uploadImage: async (payload) => {
    try {
      console.log('📸 Uploading image:', payload.FileName);
      const response = await post('UploadImage', payload);
      console.log('📸 Image uploaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('📸 Error uploading image:', error.message);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Save Work Entry Image
   * POST /SaveWorkEntryImage
   * 
   * @param {Object} payload
   * @param {string} payload.CompanyDB
   * @param {number} payload.WorkEntryDocEntry
   * @param {string} payload.ImageKey - Returned from UploadImage
   * @param {string} payload.ImageDescription
   */
  saveWorkEntryImage: async (payload) => {
    try {
      console.log('🖼️  Saving work entry image:', JSON.stringify(payload));
      const response = await post('SaveWorkEntryImage', payload);
      console.log('🖼️  Image saved:', response.data);
      return response.data;
    } catch (error) {
      console.error('🖼️  Error saving image:', error.message);
      throw new Error(handleApiError(error));
    }
  },
};
