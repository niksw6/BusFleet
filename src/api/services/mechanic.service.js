import { get, post, handleApiError } from '../client';

/**
 * Mechanic Service — Mechanic / Electrician work module.
 *
 * Confirmed LIVE endpoints (tested against http://116.202.223.120:6069/BMSSystem/):
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
const normalizeJobType = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.includes('breakdown')) return 'Breakdown';
  if (normalized.includes('driver') || normalized.includes('complaint')) return 'Driver Complaint';
  if (normalized === 'b') return 'Breakdown';
  if (normalized === 'd') return 'Driver Complaint';
  return raw;
};

const normalizeDashboardData = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;

  const rawItems = Array.isArray(payload) ? payload : Array.isArray(payload.Data) ? payload.Data : [];
  if (!Array.isArray(rawItems)) return payload;

  const transformed = rawItems.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const resolvedJobType = normalizeJobType(
      item?.JobType
      || item?.FormType
      || item?.ComplaintType
      || item?.IncidentType
      || item?.Type
      || item?.TypeName
      || item?.JobTypeName
    ) || (
      String(item?.BreakdownNo || item?.BreakdownId || item?.ComplaintNo || item?.CmplaintNo || '').trim()
        ? 'Breakdown'
        : 'Driver Complaint'
    );

    return {
      ...item,
      JobType: resolvedJobType,
    };
  });

  if (Array.isArray(payload.Data)) {
    return { ...payload, Data: transformed };
  }

  return transformed;
};

export const mechanicService = {
  getMyJobs: async (companyDB, empCode) => {
    const response = await get(`GetMyJobs?CompanyDB=${companyDB}&EmpCode=${encodeURIComponent(empCode)}`, { suppressErrorLog: true });
    return normalizeDashboardData(response.data);
  },

  rejectWork: async (companyDB, jobCardNo, faultCode, empCode, reason) => {
    const response = await post('RejectWork', { CompanyDB: companyDB, JobCardNo: Number(jobCardNo) || jobCardNo, FaultCode: faultCode, EmpCode: empCode, Reason: reason });
    return response.data;
  },
  /**
   * Mechanic's dashboard — faults available to accept + their active/completed work.
   * @param {string} companyDB
   * @param {string} userCode - Mechanic/Electrician's login code (e.g. "Asok")
   */
  getMechanicDashboard: async (companyDB, userCode) => {
    try {
      const endpoint = `GetMechanicDashboard?CompanyDB=${companyDB}&UserCode=${encodeURIComponent(userCode)}`;
      const fullUrl = `http://116.202.223.120:6069/BMSSystem/${endpoint}`;
      console.log('LOG     🔗 URL:', fullUrl);
      const response = await get(endpoint);
      const normalized = normalizeDashboardData(response.data);
      const items = Array.isArray(normalized?.Data) ? normalized.Data : Array.isArray(normalized) ? normalized : [];
      console.log('LOG     🔧 GetMechanicDashboard count:', items.length);
      console.log('LOG     🔗 URL:', fullUrl);
      console.log('LOG     🔧 GetMechanicDashboard raw response:', JSON.stringify(normalized).replace(/\s+/g, ' '));
      return normalized;
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
    console.log('📤 AcceptFault:', JSON.stringify(payload));
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
    console.log('📤 StartWork:', JSON.stringify(payload));
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
    console.log('📝 CreateWorkEntry:', JSON.stringify(payload));
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
    console.log('📝 UpdateWorkEntry:', JSON.stringify(payload));
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
    console.log('🏁 CompleteWork:', JSON.stringify(payload));
    const response = await post('CompleteWork', payload);
    console.log('🏁 CompleteWork response:', response.data);
    return response.data;
  },
};
