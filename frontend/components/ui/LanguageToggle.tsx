'use client';

import { useDispatch, useSelector } from 'react-redux';
import { Globe } from 'lucide-react';
import { setLanguage } from '@/store/slices/uiSlice';
import { RootState } from '@/store';

export default function LanguageToggle() {
  const dispatch = useDispatch();
  const lang     = useSelector((s: RootState) => s.ui.language);

  return (
    <button
      onClick={() => dispatch(setLanguage(lang === 'en' ? 'ja' : 'en'))}
      className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-theme-xs font-medium
                 hover:bg-[var(--gray-100)] dark:hover:bg-white/5
                 text-[var(--gray-600)] dark:text-[var(--gray-400)] transition-colors"
      title="Toggle language"
    >
      <Globe size={15} />
      <span>{lang === 'en' ? 'EN' : 'JP'}</span>
    </button>
  );
}
