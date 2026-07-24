import { get, post, handleApiError } from '../client';

/**
 * Job Card Service
 * Handles job card creation, assignment, and tracking
 */
export const jobCardService = {
  /**
   * Close incident/job card via new API
   */
  closeIncident: async (companyDB, docEntry, formType = 'J') => {
    try {
      const payload = {
        CompanyDB: companyDB,
        DocEntry: Number(docEntry) || docEntry,
        FormType: formType,
      };
      console.log('📤 Closing via CloseIncident:', JSON.stringify(payload, null, 2));
      const response = await post('CloseIncident', payload);
      console.log('📥 CloseIncident response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ CloseIncident error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create a new job card.
   * Payload supports per-fault Mechanics and Parts:
   * Faults: [{ Fault, Dscption, Mechanics: [{MechanicCode, MechanicName}], Parts: [{ItemCode, ItemName, Qty, UoM}] }]
   */
  createJobCard: async (jobCardData) => {
    try {
      console.log('📋 Creating job card:', JSON.stringify(jobCardData, null, 2));
      const response = await post('CreateJobCard', jobCardData);
      console.log('📋 Job card created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Job card creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update an existing job card (same payload shape as CreateJobCard).
   * Supports updating per-fault Mechanics and Parts.
   * Notifies assigned mechanics + technical head after update.
   */
  updateJobCard: async (jobCardData) => {
    try {
      console.log('📝 Updating job card:', JSON.stringify(jobCardData, null, 2));
      const response = await post('UpdateJobCard', jobCardData);
      console.log('📝 Job card updated:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create work order from job card detail workflow
   */
  createWorkOrder: async (workOrderData) => {
    try {
      console.log('🛠️ Creating work order:', JSON.stringify(workOrderData, null, 2));
      const response = await post('CreateWorkOrder', workOrderData);
      console.log('🛠️ Work order created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Work order creation error:', error);
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Mechanic accepts an assigned job.
   * Once accepted, notifies Supervisor, Technical Head, Depot Head.
   * @param {string} companyDB
   * @param {string|number} docEntry  - Work order DocEntry
   * @param {string} mechanicCode
   * @param {string} mechanicName
   */
  acceptJob: async (companyDB, docEntry, mechanicCode, mechanicName) => {
    try {
      const payload = {
        CompanyDB: companyDB,
        DocEntry: Number(docEntry) || docEntry,
        MechanicCode: mechanicCode,
        MechanicName: mechanicName,
        AcceptDate: new Date().toISOString().slice(0, 10),
        AcceptTime: new Date().toTimeString().slice(0, 5).replace(':', ''),
      };
      console.log('✅ Accepting job:', JSON.stringify(payload, null, 2));
      const response = await post('AcceptJob', payload);
      console.log('✅ AcceptJob response:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Mechanic marks work as complete.
   * Supervisor receives notification to inspect and close the incident.
   */
  completeWork: async (companyDB, docEntry, mechanicCode, remarks = '') => {
    try {
      const payload = {
        CompanyDB: companyDB,
        DocEntry: Number(docEntry) || docEntry,
        MechanicCode: mechanicCode,
        Remarks: remarks,
        CompletedAt: new Date().toISOString(),
      };
      console.log('🏁 CompleteWork:', JSON.stringify(payload, null, 2));
      const response = await post('CompleteWork', payload);
      console.log('🏁 CompleteWork response:', response.data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get overdue incidents — used on Technical Head dashboard.
   */
  getOverdueIncidents: async (companyDB) => {
    try {
      const response = await get(`GetOverdueIncidents?CompanyDB=${companyDB}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of all job cards
   */
  getJobCards: async (companyDB, status = null) => {
    try {
      let url = `GetJobCards?CompanyDB=${companyDB}`;
      if (status) url += `&Status=${status}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get list of all work orders
   */
  getWorkOrders: async (companyDB, status = null) => {
    try {
      let url = `GetWorkOrders?CompanyDB=${companyDB}`;
      if (status) url += `&Status=${status}`;
      const response = await get(url);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get detailed information for a specific job card
   */
  getJobCardDetail: async (companyDB, docEntry) => {
    try {
      const response = await get(`GetJobCardDetail?CompanyDB=${companyDB}&DocEntry=${docEntry}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get detailed information for a specific work order
   */
  getWorkOrderById: async (companyDB, docEntry) => {
    try {
      const response = await get(`GetWorkOrderById?CompanyDB=${companyDB}&DocEntry=${docEntry}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Assign mechanic to job card
   */
  assignMechanic: async (companyDB, docEntry, mechanicCode) => {
    throw new Error('AssignMechanic endpoint is not available in current backend contract. Team members should self-accept faults via GetMechanicDashboard -> AcceptFault.');
  },

  /**
   * Update job card status
   */
  updateJobCardStatus: async (companyDB, docEntry, status) => {
    try {
      const response = await post('UpdateJobCardStatus', {
        CompanyDB: companyDB,
        DocEntry: docEntry,
        Status: status,
      });

      if (response?.data?.Success && (status === 'CM' || status === 'C')) {
        try {
          await jobCardService.closeIncident(companyDB, docEntry, 'J');
        } catch (closeError) {
          console.warn('CloseIncident failed after UpdateJobCardStatus:', closeError?.message || closeError);
        }
      }

      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Add work progress notes to job card
   */
  addWorkProgress: async (companyDB, docEntry, notes) => {
    try {
      const response = await post('AddJobCardProgress', {
        CompanyDB: companyDB,
        DocEntry: docEntry,
        Notes: notes,
        Timestamp: new Date().toISOString(),
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Complete job card with final details
   */
  completeJobCard: async (companyDB, docEntry, completionData) => {
    try {
      const response = await post('CompleteJobCard', {
        CompanyDB: companyDB,
        DocEntry: docEntry,
        ...completionData,
      });

      if (response?.data?.Success) {
        try {
          await jobCardService.closeIncident(companyDB, docEntry, 'J');
        } catch (closeError) {
          console.warn('CloseIncident failed after CompleteJobCard:', closeError?.message || closeError);
        }
      }

      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Team Leader accepts or rejects a Job Card for their mapped Maintenance Team.
   * SOP §2 Step 3 / 3R — reuses UpdateJobCard (documented, generic update endpoint)
   * since a dedicated Accept/Reject endpoint is not yet published.
   * @param {string} companyDB
   * @param {string|number} jobCardNo
   * @param {'Accepted'|'Rejected'} decision
   * @param {string} teamLeaderCode
   * @param {string} teamLeaderName
   * @param {string} reason - Required for rejection (SOP: "proper reason")
   */
  respondToJobCard: async (companyDB, jobCardNo, decision, teamLeaderCode, teamLeaderName, reason = '') => {
    const payload = {
      CompanyDB: companyDB,
      JobCardNo: jobCardNo,
      TeamStatus: decision,
      TeamLeader: teamLeaderCode,
      TeamLeaderName: teamLeaderName,
      RejectReason: reason,
      RespondedAt: new Date().toISOString(),
    };
    try {
      console.log(`📤 Team Leader ${decision} job card:`, JSON.stringify(payload, null, 2));
      const response = await post('UpdateJobCard', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Supervisor reassigns a rejected Job Card to a different Maintenance Team
   * or an individual mechanic (SOP §2 Step 4R).
   * @param {string} companyDB
   * @param {string|number} jobCardNo
   * @param {string} newTeamCode
   * @param {string} individualMechanicCode - optional, when reassigning to a single mechanic
   * @param {string} reason
   */
  reassignJobCard: async (companyDB, jobCardNo, newTeamCode, individualMechanicCode = '', reason = '') => {
    const payload = {
      CompanyDB: companyDB,
      JobCardNo: jobCardNo,
      TeamCode: newTeamCode || '',
      IndividualMechanicCode: individualMechanicCode || '',
      TeamStatus: 'Pending',
      ReassignReason: reason,
    };
    try {
      console.log('📤 Reassigning job card:', JSON.stringify(payload, null, 2));
      const response = await post('UpdateJobCard', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Cancel a Job Card.
   * API 30 (New): POST CancelJobCard
   */
  cancelJobCard: async (companyDB, jobCardNo, reason = '') => {
    try {
      const payload = { CompanyDB: companyDB, JobCardNo: jobCardNo, Reason: reason };
      const response = await post('CancelJobCard', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get Job Card activity history (audit trail).
   * API 31 (New): GET GetJobCardHistory?CompanyDB=...&JobCardNo=...
   */
  getJobCardHistory: async (companyDB, jobCardNo) => {
    try {
      const response = await get(`GetJobCardHistory?CompanyDB=${companyDB}&JobCardNo=${jobCardNo}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
