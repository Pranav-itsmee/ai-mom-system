'use client';

import { useDispatch, useSelector } from 'react-redux';
import { Sun, Moon } from 'lucide-react';
import { setTheme } from '@/store/slices/uiSlice';
import { RootState } from '@/store';

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const theme    = useSelector((s: RootState) => s.ui.theme);
  const isDark   = theme === 'dark';

  return (
    <button
      onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
      className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--gray-100)] dark:hover:bg-white/5 text-[var(--gray-500)] transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
