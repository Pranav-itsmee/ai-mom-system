import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface Task {
  id: number;
  mom_id: number;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assignee_id: number | null;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  assignee?: { id: number; name: string; email: string } | null;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  assignee?: string;
  meetingId?: number;
}

interface TasksState {
  tasks: Task[];
  filters: TaskFilters;
  total: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: TasksState = {
  tasks: [],
  filters: {},
  total: 0,
  status: 'idle',
  error: null,
};

export const fetchTasks = createAsyncThunk(
  'tasks/fetchAll',
  async (params: TaskFilters) => {
    const res = await api.get('/tasks', { params });
    return res.data;
  }
);

export const createTask = createAsyncThunk(
  'tasks/create',
  async (data: Partial<Task> & { mom_id: number; title: string }) => {
    const res = await api.post('/tasks', data);
    return res.data;
  }
);

export const updateTask = createAsyncThunk(
  'tasks/update',
  async ({ id, ...data }: Partial<Task> & { id: number }) => {
    const res = await api.put(`/tasks/${id}`, data);
    return res.data;
  }
);

export const deleteTask = createAsyncThunk(
  'tasks/delete',
  async (id: number) => {
    await api.delete(`/tasks/${id}`);
    return id;
  }
);

const taskSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<TaskFilters>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters(state) {
      state.filters = {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTasks.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.tasks = action.payload.tasks;
        state.total = action.payload.total;
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to fetch tasks';
      })
      .addCase(createTask.fulfilled, (state, action) => {
        state.tasks.unshift(action.payload);
        state.total += 1;
      })
      .addCase(updateTask.fulfilled, (state, action) => {
        const idx = state.tasks.findIndex((t) => t.id === action.payload.id);
        if (idx !== -1) state.tasks[idx] = action.payload;
      })
      .addCase(deleteTask.fulfilled, (state, action) => {
        state.tasks = state.tasks.filter((t) => t.id !== action.payload);
        state.total -= 1;
      });
  },
});

export const { setFilter, clearFilters } = taskSlice.actions;
export default taskSlice.reducer;
