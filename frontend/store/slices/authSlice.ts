import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export interface User {
  id:    number;
  name:  string;
  email: string;
  role:  'admin' | 'member';
}

interface AuthState {
  user:   User | null;
  token:  string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error:  string | null;
}

function loadAuth(): Pick<AuthState, 'user' | 'token'> {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    return {
      token: localStorage.getItem('token'),
      user:  JSON.parse(localStorage.getItem('user') || 'null'),
    };
  } catch { return { user: null, token: null }; }
}

const { user, token } = loadAuth();

const initialState: AuthState = {
  user,
  token,
  status: 'idle',
  error:  null,
};

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      return res.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Invalid credentials');
    }
  }
);

export const fetchMe = createAsyncThunk('auth/fetchMe', async () => {
  const res = await api.get('/auth/me');
  return res.data;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user  = null;
      state.token = null;
      state.status = 'idle';
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    },
    setCredentials(state, action: PayloadAction<{ user: User; token: string }>) {
      state.user  = action.payload.user;
      state.token = action.payload.token;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user   = action.payload.user;
        state.token  = action.payload.token;
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', action.payload.token);
          localStorage.setItem('user', JSON.stringify(action.payload.user));
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error  = action.payload as string;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        if (typeof window !== 'undefined')
          localStorage.setItem('user', JSON.stringify(action.payload));
      });
  },
});

export const { logout, setCredentials } = authSlice.actions;
export default authSlice.reducer;
