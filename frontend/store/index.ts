import { configureStore } from '@reduxjs/toolkit';
import authReducer         from './slices/authSlice';
import uiReducer           from './slices/uiSlice';
import meetingReducer      from './slices/meetingSlice';
import momReducer          from './slices/momSlice';
import taskReducer         from './slices/taskSlice';
import notificationReducer from './slices/notificationSlice';
import bmsReducer          from './slices/bmsSlice';
export const store = configureStore({
  reducer: {
    auth:          authReducer,
    ui:            uiReducer,
    meetings:      meetingReducer,
    mom:           momReducer,
    tasks:         taskReducer,
    notifications: notificationReducer,
    bms:           bmsReducer,
  },
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
