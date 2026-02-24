import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import themeReducer from './slices/themeSlice';
import dataReducer from './slices/dataSlice';
import notificationReducer from './slices/notificationSlice';
import complaintsReducer from './slices/complaintsSlice';
import jobCardsReducer from './slices/jobCardsSlice';
import masterDataReducer from './slices/masterDataSlice';

export const store = configureStore({
  reducer: {
    // Core slices
    auth: authReducer,
    theme: themeReducer,
    notification: notificationReducer,
    
    // Feature slices
    complaints: complaintsReducer,
    jobCards: jobCardsReducer,
    masterData: masterDataReducer,
    
    // Legacy data slice (to be migrated)
    data: dataReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
