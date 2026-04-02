import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface BmsProject {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface ProjectLink {
  id: number;
  meeting_id: number;
  project_id: number;
  linked_by: number;
  linked_at: string;
  linkedByUser?: { id: number; name: string } | null;
}

interface BmsState {
  projects: BmsProject[];
  links: ProjectLink[];
  projectsStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  linksStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: BmsState = {
  projects: [],
  links: [],
  projectsStatus: 'idle',
  linksStatus: 'idle',
  error: null,
};

export const fetchBmsProjects = createAsyncThunk('bms/fetchProjects', async () => {
  const res = await api.get('/bms/projects');
  return res.data;
});

export const fetchProjectLinks = createAsyncThunk(
  'bms/fetchLinks',
  async (meetingId: number) => {
    const res = await api.get(`/bms/links/${meetingId}`);
    return res.data as ProjectLink[];
  }
);

export const linkProject = createAsyncThunk(
  'bms/link',
  async ({ meeting_id, project_id }: { meeting_id: number; project_id: number }) => {
    const res = await api.post('/bms/link', { meeting_id, project_id });
    return res.data as ProjectLink;
  }
);

export const removeProjectLink = createAsyncThunk('bms/removeLink', async (linkId: number) => {
  await api.delete(`/bms/link/${linkId}`);
  return linkId;
});

const bmsSlice = createSlice({
  name: 'bms',
  initialState,
  reducers: {
    clearLinks(state) {
      state.links = [];
      state.linksStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBmsProjects.pending, (state) => {
        state.projectsStatus = 'loading';
      })
      .addCase(fetchBmsProjects.fulfilled, (state, action) => {
        state.projectsStatus = 'succeeded';
        state.projects = action.payload.projects ?? action.payload ?? [];
      })
      .addCase(fetchBmsProjects.rejected, (state, action) => {
        state.projectsStatus = 'failed';
        state.error = action.error.message ?? 'Failed to fetch BMS projects';
      })
      .addCase(fetchProjectLinks.pending, (state) => {
        state.linksStatus = 'loading';
      })
      .addCase(fetchProjectLinks.fulfilled, (state, action) => {
        state.linksStatus = 'succeeded';
        state.links = action.payload;
      })
      .addCase(fetchProjectLinks.rejected, (state, action) => {
        state.linksStatus = 'failed';
        state.error = action.error.message ?? 'Failed to fetch project links';
      })
      .addCase(linkProject.fulfilled, (state, action) => {
        state.links.unshift(action.payload);
      })
      .addCase(removeProjectLink.fulfilled, (state, action) => {
        state.links = state.links.filter((l) => l.id !== action.payload);
      });
  },
});

export const { clearLinks } = bmsSlice.actions;
export default bmsSlice.reducer;
