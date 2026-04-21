import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface Notification {
  id: number;
  user_id: number;
  type: 'task_assigned' | 'task_deadline' | 'meeting_starting';
  title: string;
  message: string;
  task_id: number | null;
  meeting_id: number | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationState {
  items:       Notification[];
  unreadCount: number;
  status:      'idle' | 'loading' | 'succeeded' | 'failed';
}

const initialState: NotificationState = {
  items:       [],
  unreadCount: 0,
  status:      'idle',
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetch',
  async () => {
    const res = await api.get('/notifications');
    return res.data as { notifications: Notification[]; unreadCount: number };
  }
);

export const markRead = createAsyncThunk(
  'notifications/markRead',
  async (id: number) => {
    await api.put(`/notifications/${id}/read`);
    return id;
  }
);

export const markAllRead = createAsyncThunk(
  'notifications/markAllRead',
  async () => {
    await api.put('/notifications/read-all');
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.status      = 'succeeded';
        state.items       = action.payload.notifications;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(fetchNotifications.rejected, (state) => {
        state.status = 'failed';
      })
      .addCase(markRead.fulfilled, (state, action) => {
        const n = state.items.find((i) => i.id === action.payload);
        if (n && !n.is_read) { n.is_read = true; state.unreadCount = Math.max(0, state.unreadCount - 1); }
      })
      .addCase(markAllRead.fulfilled, (state) => {
        state.items.forEach((n) => { n.is_read = true; });
        state.unreadCount = 0;
      });
  },
});

export default notificationSlice.reducer;
