import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface Meeting {
  id: number;
  title: string;
  google_event_id: string | null;
  meet_link: string | null;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  organizer_id: number | null;
  status: 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed';
  audio_path: string | null;
  claude_file_id: string | null;
  created_at: string;
  organizer?: { id: number; name: string; email: string };
  mom?: any;
  attendees?: any[];
}

interface MeetingsState {
  meetings: Meeting[];
  currentMeeting: Meeting | null;
  total: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MeetingsState = {
  meetings: [],
  currentMeeting: null,
  total: 0,
  status: 'idle',
  error: null,
};

export const fetchMeetings = createAsyncThunk(
  'meetings/fetchAll',
  async (params: { status?: string; from?: string; to?: string; page?: number; limit?: number }) => {
    const res = await api.get('/meetings', { params });
    return res.data;
  }
);

export const fetchMeeting = createAsyncThunk(
  'meetings/fetchOne',
  async (id: string | number) => {
    const res = await api.get(`/meetings/${id}`);
    return res.data;
  }
);

export const updateMeetingStatus = createAsyncThunk(
  'meetings/updateStatus',
  async ({ id, status }: { id: number; status: string }) => {
    const res = await api.patch(`/meetings/${id}/status`, { status });
    return res.data;
  }
);

export const deleteMeeting = createAsyncThunk(
  'meetings/delete',
  async (id: number) => {
    await api.delete(`/meetings/${id}`);
    return id;
  }
);

const meetingSlice = createSlice({
  name: 'meetings',
  initialState,
  reducers: {
    clearCurrentMeeting(state) {
      state.currentMeeting = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMeetings.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMeetings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.meetings = action.payload.meetings;
        state.total = action.payload.total;
      })
      .addCase(fetchMeetings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to fetch meetings';
      })
      .addCase(fetchMeeting.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMeeting.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentMeeting = action.payload;
      })
      .addCase(fetchMeeting.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to fetch meeting';
      })
      .addCase(updateMeetingStatus.fulfilled, (state, action) => {
        const idx = state.meetings.findIndex((m) => m.id === action.payload.id);
        if (idx !== -1) state.meetings[idx] = action.payload;
        if (state.currentMeeting?.id === action.payload.id) {
          state.currentMeeting = action.payload;
        }
      })
      .addCase(deleteMeeting.fulfilled, (state, action) => {
        state.meetings = state.meetings.filter((m) => m.id !== action.payload);
        if (state.currentMeeting?.id === action.payload) {
          state.currentMeeting = null;
        }
      });
  },
});

export const { clearCurrentMeeting } = meetingSlice.actions;
export default meetingSlice.reducer;
