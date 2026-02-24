import { createSlice } from '@reduxjs/toolkit';

/**
 * Master Data Slice
 * Caches frequently accessed master data to reduce API calls
 */
const initialState = {
  buses: [],
  drivers: [],
  mechanics: [],
  supervisors: [],
  jobTypes: [],
  faults: [],
  routes: [],
  spareParts: [],
  loading: false,
  lastFetch: {
    buses: null,
    drivers: null,
    mechanics: null,
    supervisors: null,
    jobTypes: null,
    faults: null,
    routes: null,
    spareParts: null,
  },
};

const masterDataSlice = createSlice({
  name: 'masterData',
  initialState,
  reducers: {
    // Set buses
    setBuses: (state, action) => {
      state.buses = action.payload;
      state.lastFetch.buses = Date.now();
    },

    // Set drivers
    setDrivers: (state, action) => {
      state.drivers = action.payload;
      state.lastFetch.drivers = Date.now();
    },

    // Set mechanics
    setMechanics: (state, action) => {
      state.mechanics = action.payload;
      state.lastFetch.mechanics = Date.now();
    },

    // Set supervisors
    setSupervisors: (state, action) => {
      state.supervisors = action.payload;
      state.lastFetch.supervisors = Date.now();
    },

    // Set job types
    setJobTypes: (state, action) => {
      state.jobTypes = action.payload;
      state.lastFetch.jobTypes = Date.now();
    },

    // Set faults
    setFaults: (state, action) => {
      state.faults = action.payload;
      state.lastFetch.faults = Date.now();
    },

    // Set routes
    setRoutes: (state, action) => {
      state.routes = action.payload;
      state.lastFetch.routes = Date.now();
    },

    // Set spare parts
    setSpareParts: (state, action) => {
      state.spareParts = action.payload;
      state.lastFetch.spareParts = Date.now();
    },

    // Set loading state
    setLoading: (state, action) => {
      state.loading = action.payload;
    },

    // Clear all master data (on logout)
    clearMasterData: () => initialState,

    // Check if data needs refresh (older than 5 minutes)
    needsRefresh: (state, action) => {
      const { dataType } = action.payload;
      const lastFetch = state.lastFetch[dataType];
      if (!lastFetch) return true;
      const fiveMinutes = 5 * 60 * 1000;
      return Date.now() - lastFetch > fiveMinutes;
    },
  },
});

export const {
  setBuses,
  setDrivers,
  setMechanics,
  setSupervisors,
  setJobTypes,
  setFaults,
  setRoutes,
  setSpareParts,
  setLoading,
  clearMasterData,
  needsRefresh,
} = masterDataSlice.actions;

// Selectors
export const selectBuses = (state) => state.masterData.buses;
export const selectDrivers = (state) => state.masterData.drivers;
export const selectMechanics = (state) => state.masterData.mechanics;
export const selectSupervisors = (state) => state.masterData.supervisors;
export const selectJobTypes = (state) => state.masterData.jobTypes;
export const selectFaults = (state) => state.masterData.faults;
export const selectRoutes = (state) => state.masterData.routes;
export const selectSpareParts = (state) => state.masterData.spareParts;

export default masterDataSlice.reducer;
