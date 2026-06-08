import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isAuthenticated: false,
  user: null,
  dbName: null,
  token: null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      const payload = action.payload || {};
      const user = payload.user || {};
      const normalizedDbName =
        (typeof payload.dbName === 'string' && payload.dbName.trim()) ||
        (typeof user.CompanyDatabaseName === 'string' && user.CompanyDatabaseName.trim()) ||
        (typeof user.DBName === 'string' && user.DBName.trim()) ||
        (typeof user.companyName === 'string' && user.companyName.trim()) ||
        (typeof user.company === 'string' && user.company.trim()) ||
        null;

      state.loading = false;
      state.isAuthenticated = true;
      state.user = payload.user;
      state.dbName = normalizedDbName;
      state.token = payload.token;
      state.error = null;
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.dbName = null;
      state.token = null;
      state.error = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  updateUser,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;
