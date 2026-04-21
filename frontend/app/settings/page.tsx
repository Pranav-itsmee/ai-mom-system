'use client';

import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { ChevronRight, UserCircle } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { setTheme, setLanguage } from '@/store/slices/uiSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:5000';

export default function SettingsPage() {
  const { t }    = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const user     = useSelector((s: RootState) => s.auth.user);

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`)
    : null;

  const initials = (user?.name ?? '')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <ProtectedLayout>
      <div className="max-w-xl mx-auto space-y-5">

        <h1 className="text-[20px] font-semibold text-[var(--text)]">
          {t('settings.title')}
        </h1>

        {/* ── Profile quick-link ── */}
        <Link
          href="/profile"
          className="card flex items-center gap-4 hover:shadow-theme-sm hover:border-[var(--primary)]
                     transition-all group no-underline"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={user?.name ?? ''}
              className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/60
                            flex items-center justify-center shrink-0 text-[var(--primary-deep)] font-bold text-[15px]">
              {initials || <UserCircle size={22} />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[var(--text)] truncate">{user?.name}</p>
            <p className="text-[12px] text-[var(--text-muted)] truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[12px] text-[var(--primary-deep)] font-semibold group-hover:underline">
              Edit Profile
            </span>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
          </div>
        </Link>

        {/* ── Theme ── */}
        <section className="card space-y-3">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.theme')}
          </h2>
          <div className="flex gap-3">
            {(['light', 'dark'] as const).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border
                            text-[13px] font-medium transition-colors
                  ${theme === opt
                    ? 'border-[var(--primary-deep)] bg-[var(--primary)]/20 text-[var(--primary-deep)] font-semibold'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'}`}
              >
                <input type="radio" name="theme" value={opt} checked={theme === opt}
                  onChange={() => dispatch(setTheme(opt))} className="sr-only" />
                {opt === 'light' ? '☀️ Light' : '🌙 Dark'}
              </label>
            ))}
          </div>
        </section>

        {/* ── Language ── */}
        <section className="card space-y-3">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.language')}
          </h2>
          <div className="flex gap-3">
            {([
              { value: 'en', label: 'English',  flag: '🇺🇸' },
              { value: 'ja', label: '日本語',   flag: '🇯🇵' },
            ] as const).map(({ value, label, flag }) => (
              <label
                key={value}
                className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border
                            text-[13px] font-medium transition-colors
                  ${language === value
                    ? 'border-[var(--primary-deep)] bg-[var(--primary)]/20 text-[var(--primary-deep)] font-semibold'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'}`}
              >
                <input type="radio" name="language" value={value} checked={language === value}
                  onChange={() => dispatch(setLanguage(value))} className="sr-only" />
                {flag} {label}
              </label>
            ))}
          </div>
        </section>

      </div>
    </ProtectedLayout>
  );
}
