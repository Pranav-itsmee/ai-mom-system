'use client';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Theme    = 'light' | 'dark';
type Language = 'en' | 'ja';

interface UIState {
  theme:              Theme;
  language:           Language;
  sidebarCollapsed:   boolean;
  mobileSidebarOpen:  boolean;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    // Parse booleans properly — localStorage stores strings
    if (typeof fallback === 'boolean') return (v === 'true') as unknown as T;
    return v as unknown as T;
  } catch { return fallback; }
}

const initialState: UIState = {
  theme:             loadFromStorage<Theme>('theme', 'light'),
  language:          loadFromStorage<Language>('language', 'en'),
  sidebarCollapsed:  loadFromStorage<boolean>('sidebarCollapsed', false),
  mobileSidebarOpen: false,
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
    openMobileSidebar(state)  { state.mobileSidebarOpen = true;  },
    closeMobileSidebar(state) { state.mobileSidebarOpen = false; },
    toggleMobileSidebar(state){ state.mobileSidebarOpen = !state.mobileSidebarOpen; },
  },
});

export const {
  setTheme, setLanguage, toggleSidebar,
  openMobileSidebar, closeMobileSidebar, toggleMobileSidebar,
} = uiSlice.actions;
export default uiSlice.reducer;
