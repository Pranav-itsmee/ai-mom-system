import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface KeyPoint {
  id: number;
  mom_id: number;
  point_text: string;
  order_index: number;
}

export interface MOM {
  id: number;
  meeting_id: number;
  raw_transcript: string | null;
  summary: string;
  is_edited: boolean;
  edited_by: number | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  keyPoints?: KeyPoint[];
  tasks?: any[];
  editor?: { id: number; name: string; email: string } | null;
}

interface MOMState {
  currentMOM: MOM | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MOMState = {
  currentMOM: null,
  status: 'idle',
  error: null,
};

export const fetchMOM = createAsyncThunk(
  'mom/fetchByMeeting',
  async (meetingId: number | string) => {
    const res = await api.get(`/mom/${meetingId}`);
    return res.data;
  }
);

export const fetchMOMById = createAsyncThunk(
  'mom/fetchById',
  async (momId: number | string) => {
    const res = await api.get(`/mom/id/${momId}`);
    return res.data;
  }
);

export const updateMOM = createAsyncThunk(
  'mom/update',
  async ({ id, summary, key_points }: { id: number; summary?: string; key_points?: string[] }) => {
    const res = await api.put(`/mom/${id}`, { summary, key_points });
    return res.data;
  }
);

const momSlice = createSlice({
  name: 'mom',
  initialState,
  reducers: {
    clearMOM(state) {
      state.currentMOM = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMOM.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMOM.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentMOM = action.payload;
      })
      .addCase(fetchMOM.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to fetch MOM';
      })
      .addCase(updateMOM.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(updateMOM.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentMOM = action.payload;
      })
      .addCase(updateMOM.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to update MOM';
      })
      .addCase(fetchMOMById.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMOMById.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentMOM = action.payload;
      })
      .addCase(fetchMOMById.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to fetch MOM';
      });
  },
});

export const { clearMOM } = momSlice.actions;
export default momSlice.reducer;
