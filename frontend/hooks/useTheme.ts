'use client';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export function useTheme() {
  const theme = useSelector((s: RootState) => s.ui.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return theme;
}
