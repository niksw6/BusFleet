import { get, post, handleApiError } from '../client';

export const repairService = {
  getRepairAssemblies: async (companyDB) => {
    try {
      const response = await get(`GetRepairAssemblies?CompanyDB=${encodeURIComponent(companyDB)}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  createRepairIncident: async (payload) => {
    try {
      const response = await post('CreateRepairIncident', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getRepairAssemblyDetails: async (companyDB, assemblyCode) => {
    try {
      const response = await get(
        `GetRepairAssemblyDetails?CompanyDB=${encodeURIComponent(companyDB)}&AssemblyCode=${encodeURIComponent(assemblyCode)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getRepairIncident: async (companyDB, docEntry) => {
    try {
      const response = await get(
        `GetRepairIncident?CompanyDB=${encodeURIComponent(companyDB)}&DocEntry=${encodeURIComponent(docEntry)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  respondToRepairIncident: async (payload) => {
    try {
      const response = await post('RespondToRepairIncident', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getRepairAssemblyForIssue: async (companyDB, docEntry, storePersonID) => {
    try {
      const response = await get(
        `GetRepairAssemblyForIssue?CompanyDB=${encodeURIComponent(companyDB)}&DocEntry=${encodeURIComponent(docEntry)}&StorePersonID=${encodeURIComponent(storePersonID)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  issueRepairAssembly: async (payload) => {
    try {
      const response = await post('IssueRepairAssembly', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  createRepairJobCard: async (payload) => {
    try {
      const response = await post('CreateRepairJobCard', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getRepairJobCard: async (companyDB, docEntry) => {
    try {
      const response = await get(
        `GetRepairJobCard?CompanyDB=${encodeURIComponent(companyDB)}&DocEntry=${encodeURIComponent(docEntry)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getRepairMechanics: async (companyDB, depot) => {
    try {
      const response = await get(
        `GetRepairMechanics?CompanyDB=${encodeURIComponent(companyDB)}&Depot=${encodeURIComponent(depot)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  updateRepairJobCard: async (payload) => {
    try {
      console.log('[Repair API] POST UpdateRepairJobCard payload:', JSON.stringify(payload));
      const response = await post('UpdateRepairJobCard', payload);
      console.log('[Repair API] UpdateRepairJobCard response:', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  respondToRepairJobCardAssignment: async (payload) => {
    try {
      const response = await post('RespondToRepairJobCardAssignment', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  receiveRepairAssembly: async (payload) => {
    try {
      const response = await post('ReceiveRepairAssembly', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getMyRepairWorkDashboard: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetMyRepairWorkDashboard?CompanyDB=${encodeURIComponent(companyDB)}&UserCode=${encodeURIComponent(userCode)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  createRepairWorkEntry: async (payload) => {
    try {
      console.log('[Repair API] POST CreateRepairWorkEntry payload:', JSON.stringify(payload));
      const response = await post('CreateRepairWorkEntry', payload);
      console.log('[Repair API] CreateRepairWorkEntry response:', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  updateRepairWorkEntry: async (payload) => {
    try {
      const response = await post('UpdateRepairWorkEntry', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  addRepairWorkImage: async (payload) => {
    try {
      const response = await post('AddRepairWorkImage', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  pauseRepairWorkEntry: async (payload) => {
    try {
      const response = await post('PauseRepairWorkEntry', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  resumeRepairWorkEntry: async (payload) => {
    try {
      const response = await post('ResumeRepairWorkEntry', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  requestRepairAdditionalPart: async (payload) => {
    try {
      const response = await post('RequestRepairAdditionalPart', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  receiveRepairPart: async (payload) => {
    try {
      const response = await post('ReceiveRepairPart', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  completeRepairWorkEntry: async (payload) => {
    try {
      const response = await post('CompleteRepairWorkEntry', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getPendingRepairPartRequests: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetPendingRepairPartRequests?CompanyDB=${encodeURIComponent(companyDB)}&UserCode=${encodeURIComponent(userCode)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  respondToRepairPartRequest: async (payload) => {
    try {
      const response = await post('RespondToRepairPartRequest', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getApprovedRepairParts: async (companyDB, userCode) => {
    try {
      const response = await get(
        `GetApprovedRepairParts?CompanyDB=${encodeURIComponent(companyDB)}&UserCode=${encodeURIComponent(userCode)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  issueRepairPart: async (payload) => {
    try {
      const response = await post('IssueRepairPart', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  getIssuedRepairParts: async (companyDB, docEntry, userCode) => {
    try {
      const response = await get(
        `GetIssuedRepairParts?CompanyDB=${encodeURIComponent(companyDB)}&DocEntry=${encodeURIComponent(docEntry)}&UserCode=${encodeURIComponent(userCode)}`,
      );
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  reviewRepairJobCard: async (payload) => {
    try {
      const response = await post('ReviewRepairJobCard', payload);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
