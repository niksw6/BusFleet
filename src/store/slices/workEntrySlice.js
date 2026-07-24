import { createSlice } from '@reduxjs/toolkit';

/**
 * Work Entry Slice
 * Tracks mechanic work entries and parts requests per work order.
 */
const initialState = {
  // keyed by workOrderDocEntry string
  workEntries: {},   // { [docEntry]: WorkEntry[] }
  partsRequests: {}, // { [docEntry]: PartRequest[] }
  loading: false,
  error: null,
};

const workEntrySlice = createSlice({
  name: 'workEntry',
  initialState,
  reducers: {
    setWorkEntries: (state, action) => {
      const { docEntry, entries } = action.payload;
      state.workEntries[String(docEntry)] = entries;
    },

    addWorkEntry: (state, action) => {
      const { docEntry, entry } = action.payload;
      const key = String(docEntry);
      if (!state.workEntries[key]) state.workEntries[key] = [];
      state.workEntries[key].unshift(entry);
    },

    setPartsRequests: (state, action) => {
      const { docEntry, requests } = action.payload;
      state.partsRequests[String(docEntry)] = requests;
    },

    addPartRequest: (state, action) => {
      const { docEntry, request } = action.payload;
      const key = String(docEntry);
      if (!state.partsRequests[key]) state.partsRequests[key] = [];
      state.partsRequests[key].unshift(request);
    },

    updatePartRequestStatus: (state, action) => {
      const { docEntry, requestCode, status } = action.payload;
      const key = String(docEntry);
      const list = state.partsRequests[key] || [];
      const idx = list.findIndex(r => r.RequestCode === requestCode || r.Code === requestCode);
      if (idx !== -1) {
        state.partsRequests[key][idx] = { ...state.partsRequests[key][idx], Status: status };
      }
    },

    setLoading: (state, action) => {
      state.loading = action.payload;
    },

    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

export const {
  setWorkEntries,
  addWorkEntry,
  setPartsRequests,
  addPartRequest,
  updatePartRequestStatus,
  setLoading,
  setError,
} = workEntrySlice.actions;

export default workEntrySlice.reducer;
