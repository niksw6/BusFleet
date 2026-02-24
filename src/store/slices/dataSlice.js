import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  complaints: [],
  breakdowns: [],
  fuelLogs: [],
  schedules: [],
  inspections: [],
  workOrders: [],
  loading: false,
  error: null,
  refreshing: false,
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    fetchDataStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    fetchDataSuccess: (state, action) => {
      state.loading = false;
      state.refreshing = false;
      const { dataType, data } = action.payload;
      state[dataType] = data;
    },
    fetchDataFailure: (state, action) => {
      state.loading = false;
      state.refreshing = false;
      state.error = action.payload;
    },
    setRefreshing: (state, action) => {
      state.refreshing = action.payload;
    },
    addComplaint: (state, action) => {
      state.complaints.unshift(action.payload);
    },
    addBreakdown: (state, action) => {
      state.breakdowns.unshift(action.payload);
    },
    addFuelLog: (state, action) => {
      state.fuelLogs.unshift(action.payload);
    },
    addSchedule: (state, action) => {
      state.schedules.unshift(action.payload);
    },
    updateComplaint: (state, action) => {
      const index = state.complaints.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.complaints[index] = action.payload;
      }
    },
    updateBreakdown: (state, action) => {
      const index = state.breakdowns.findIndex(b => b.id === action.payload.id);
      if (index !== -1) {
        state.breakdowns[index] = action.payload;
      }
    },
    clearData: (state) => {
      state.complaints = [];
      state.breakdowns = [];
      state.fuelLogs = [];
      state.schedules = [];
      state.inspections = [];
      state.workOrders = [];
      state.error = null;
    },
  },
});

export const {
  fetchDataStart,
  fetchDataSuccess,
  fetchDataFailure,
  setRefreshing,
  addComplaint,
  addBreakdown,
  addFuelLog,
  addSchedule,
  updateComplaint,
  updateBreakdown,
  clearData,
} = dataSlice.actions;

export default dataSlice.reducer;
