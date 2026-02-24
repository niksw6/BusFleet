import { createSlice } from '@reduxjs/toolkit';

/**
 * Job Cards Slice
 * Manages state for job cards and work orders
 */
const initialState = {
  jobCards: [],
  currentJobCard: null,
  loading: false,
  error: null,
  filters: {
    status: 'All', // All | O | I | CM
    assignedTo: null, // Filter by mechanic
  },
};

const jobCardsSlice = createSlice({
  name: 'jobCards',
  initialState,
  reducers: {
    // Set job cards list
    setJobCards: (state, action) => {
      state.jobCards = action.payload;
      state.loading = false;
      state.error = null;
    },

    // Add new job card
    addJobCard: (state, action) => {
      state.jobCards.unshift(action.payload);
    },

    // Set current job card details
    setCurrentJobCard: (state, action) => {
      state.currentJobCard = action.payload;
    },

    // Update job card
    updateJobCard: (state, action) => {
      const index = state.jobCards.findIndex(jc => jc.DocEntry === action.payload.DocEntry);
      if (index !== -1) {
        state.jobCards[index] = { ...state.jobCards[index], ...action.payload };
      }
    },

    // Update job card status
    updateJobCardStatus: (state, action) => {
      const { docEntry, status } = action.payload;
      const index = state.jobCards.findIndex(jc => jc.DocEntry === docEntry);
      if (index !== -1) {
        state.jobCards[index].Status = status;
      }
      if (state.currentJobCard?.DocEntry === docEntry) {
        state.currentJobCard.Status = status;
      }
    },

    // Assign mechanic to job card
    assignMechanic: (state, action) => {
      const { docEntry, mechanicCode, mechanicName } = action.payload;
      const index = state.jobCards.findIndex(jc => jc.DocEntry === docEntry);
      if (index !== -1) {
        state.jobCards[index].MechanicCode = mechanicCode;
        state.jobCards[index].MechanicName = mechanicName;
      }
      if (state.currentJobCard?.DocEntry === docEntry) {
        state.currentJobCard.MechanicCode = mechanicCode;
        state.currentJobCard.MechanicName = mechanicName;
      }
    },

    // Add work progress
    addWorkProgress: (state, action) => {
      const { docEntry, progress } = action.payload;
      if (state.currentJobCard?.DocEntry === docEntry) {
        if (!state.currentJobCard.WorkProgress) {
          state.currentJobCard.WorkProgress = [];
        }
        state.currentJobCard.WorkProgress.push(progress);
      }
    },

    // Set filters
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    // Set loading state
    setLoading: (state, action) => {
      state.loading = action.payload;
    },

    // Set error
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset state
    resetJobCards: () => initialState,
  },
});

export const {
  setJobCards,
  addJobCard,
  setCurrentJobCard,
  updateJobCard,
  updateJobCardStatus,
  assignMechanic,
  addWorkProgress,
  setFilters,
  setLoading,
  setError,
  clearError,
  resetJobCards,
} = jobCardsSlice.actions;

export default jobCardsSlice.reducer;
