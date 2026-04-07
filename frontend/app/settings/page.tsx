'use client';

import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@/store';
import { setTheme, setLanguage } from '@/store/slices/uiSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';

export default function SettingsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const user     = useSelector((s: RootState) => s.auth.user);

  return (
    <ProtectedLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {t('settings.title', { defaultValue: 'Settings' })}
        </h1>

        {/* ── Theme ── */}
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.theme', { defaultValue: 'Theme' })}
          </h2>
          <div className="flex gap-4">
            {(['light', 'dark'] as const).map((opt) => (
              <label
                key={opt}
                className={[
                  'flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                  theme === opt
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt}
                  checked={theme === opt}
                  onChange={() => dispatch(setTheme(opt))}
                  className="sr-only"
                />
                <span>
                  {opt === 'light'
                    ? t('settings.theme_light', { defaultValue: 'Light' })
                    : t('settings.theme_dark', { defaultValue: 'Dark' })}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* ── Language ── */}
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.language', { defaultValue: 'Language' })}
          </h2>
          <div className="flex gap-4">
            {([
              { value: 'en', label: 'English' },
              { value: 'ja', label: '日本語' },
            ] as const).map(({ value, label }) => (
              <label
                key={value}
                className={[
                  'flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                  language === value
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="language"
                  value={value}
                  checked={language === value}
                  onChange={() => dispatch(setLanguage(value))}
                  className="sr-only"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* ── Profile ── */}
        <section className="card space-y-3">
          <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.profile', { defaultValue: 'Profile' })}
          </h2>

          {user ? (
            <dl className="space-y-2">
              <ProfileRow
                label={t('settings.profile_name', { defaultValue: 'Name' })}
                value={user.name}
              />
              <ProfileRow
                label={t('settings.profile_email', { defaultValue: 'Email' })}
                value={user.email}
              />
              <ProfileRow
                label={t('settings.profile_role', { defaultValue: 'Role' })}
                value={
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    user.role === 'admin'
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'bg-[var(--primary)]/15 text-[var(--primary)]'
                  }`}>
                    {user.role}
                  </span>
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {t('common.loading', { defaultValue: 'Loading…' })}
            </p>
          )}
        </section>
      </div>
    </ProtectedLayout>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-20 text-xs text-[var(--text-muted)] shrink-0">{label}</dt>
      <dd className="text-sm text-[var(--text)]">{value}</dd>
    </div>
  );
}
