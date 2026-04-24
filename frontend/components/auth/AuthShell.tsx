'use client';

import { ReactNode } from 'react';
import { Globe, Moon, Sun } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { setTheme, setLanguage } from '@/store/slices/uiSlice';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerNote?: string;
}

export default function AuthShell({
  title,
  subtitle,
  children,
  footerNote = 'Enterprise Meeting Management System',
}: AuthShellProps) {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useSelector((state: RootState) => state.ui.theme);
  const language = useSelector((state: RootState) => state.ui.language);
  const isDark = theme === 'dark';

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-32 -right-28 h-[420px] w-[420px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-20 -left-20 h-[280px] w-[280px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, var(--secondary) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-[12px] font-bold text-[var(--text)]"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            AI
          </div>
          <span className="text-[14px] font-bold text-[var(--text)]">AI MOM</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => dispatch(setLanguage(language === 'en' ? 'ja' : 'en'))}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text)] transition-all duration-200 hover:bg-[var(--surface-3)]"
          >
            <Globe size={13} className="text-[var(--text-muted)]" />
            {language === 'en' ? 'EN' : 'JP'}
          </button>
          <button
            onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-all duration-200 hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-[440px] animate-fade-in">
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-[18px] font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--primary-deep) 0%, var(--secondary-deep) 100%)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              AI
            </div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--text)]">{title}</h1>
            <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">{subtitle}</p>
          </div>

          <div
            className="relative rounded-2xl border border-[var(--border)] p-7"
            style={{
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {children}
          </div>

          <p className="mt-5 text-center text-[12px] text-[var(--text-light)]">{footerNote}</p>
        </div>
      </div>
    </div>
  );
}
