'use client';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Theme    = 'light' | 'dark';
type Language = 'en' | 'ja';

interface UIState {
  theme:            Theme;
  language:         Language;
  sidebarCollapsed: boolean;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (v as unknown as T) : fallback;
  } catch { return fallback; }
}

const initialState: UIState = {
  theme:            loadFromStorage<Theme>('theme', 'light'),
  language:         loadFromStorage<Language>('language', 'en'),
  sidebarCollapsed: loadFromStorage<boolean>('sidebarCollapsed', false),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', action.payload);
        document.documentElement.classList.toggle('dark', action.payload === 'dark');
      }
    },
    setLanguage(state, action: PayloadAction<Language>) {
      state.language = action.payload;
      if (typeof window !== 'undefined') localStorage.setItem('language', action.payload);
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      if (typeof window !== 'undefined')
        localStorage.setItem('sidebarCollapsed', String(state.sidebarCollapsed));
    },
  },
});

export const { setTheme, setLanguage, toggleSidebar } = uiSlice.actions;
export default uiSlice.reducer;
