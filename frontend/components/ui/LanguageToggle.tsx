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
      className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-[13px] font-medium
                 hover:bg-[var(--surface-3)] border border-transparent
                 hover:border-[var(--border)]
                 text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-200"
      title="Toggle language"
    >
      <Globe size={15} />
      <span>{lang === 'en' ? 'EN' : 'JP'}</span>
    </button>
  );
}
