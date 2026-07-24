import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import themeReducer from './slices/themeSlice';
import dataReducer from './slices/dataSlice';
import notificationReducer from './slices/notificationSlice';
import complaintsReducer from './slices/complaintsSlice';
import jobCardsReducer from './slices/jobCardsSlice';
import masterDataReducer from './slices/masterDataSlice';
import workEntryReducer from './slices/workEntrySlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    theme: themeReducer,
    notification: notificationReducer,
    complaints: complaintsReducer,
    jobCards: jobCardsReducer,
    masterData: masterDataReducer,
    workEntry: workEntryReducer,
    data: dataReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
