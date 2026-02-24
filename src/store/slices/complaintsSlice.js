import { createSlice } from '@reduxjs/toolkit';

/**
 * Complaints Slice
 * Manages state for complaints and breakdowns
 */
const initialState = {
  complaints: [],
  breakdowns: [],
  currentComplaint: null,
  loading: false,
  error: null,
  filters: {
    status: 'All',
    search: '',
    type: 'complaints', // complaints | breakdowns
  },
};

const complaintsSlice = createSlice({
  name: 'complaints',
  initialState,
  reducers: {
    // Set complaints list
    setComplaints: (state, action) => {
      state.complaints = action.payload;
      state.loading = false;
      state.error = null;
    },

    // Set breakdowns list
    setBreakdowns: (state, action) => {
      state.breakdowns = action.payload;
      state.loading = false;
      state.error = null;
    },

    // Add new complaint
    addComplaint: (state, action) => {
      state.complaints.unshift(action.payload);
    },

    // Add new breakdown
    addBreakdown: (state, action) => {
      state.breakdowns.unshift(action.payload);
    },

    // Set current complaint details
    setCurrentComplaint: (state, action) => {
      state.currentComplaint = action.payload;
    },

    // Update complaint
    updateComplaint: (state, action) => {
      const index = state.complaints.findIndex(c => c.DocEntry === action.payload.DocEntry);
      if (index !== -1) {
        state.complaints[index] = { ...state.complaints[index], ...action.payload };
      }
    },

    // Update complaint status
    updateComplaintStatus: (state, action) => {
      const { docEntry, status } = action.payload;
      const index = state.complaints.findIndex(c => c.DocEntry === docEntry);
      if (index !== -1) {
        state.complaints[index].Status = status;
      }
      if (state.currentComplaint?.DocEntry === docEntry) {
        state.currentComplaint.Status = status;
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
    resetComplaints: () => initialState,
  },
});

export const {
  setComplaints,
  setBreakdowns,
  addComplaint,
  addBreakdown,
  setCurrentComplaint,
  updateComplaint,
  updateComplaintStatus,
  setFilters,
  setLoading,
  setError,
  clearError,
  resetComplaints,
} = complaintsSlice.actions;

export default complaintsSlice.reducer;
