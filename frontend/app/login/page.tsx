'use client';

import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Globe, Sun, Moon, Loader2 } from 'lucide-react';
import { login } from '@/store/slices/authSlice';
import { setTheme, setLanguage } from '@/store/slices/uiSlice';
import { RootState, AppDispatch } from '@/store';

export default function LoginPage() {
  const { t }    = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const router   = useRouter();
  const { token, status, error } = useSelector((s: RootState) => s.auth);
  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const isDark   = theme === 'dark';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch(login({ email, password }));
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center"
               style={{ boxShadow: 'var(--shadow-sm)' }}>
            <span className="text-sm">🧠</span>
          </div>
          <span className="text-[14px] font-bold text-[var(--text)]">AI MOM</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => dispatch(setLanguage(language === 'en' ? 'ja' : 'en'))}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--border)]
                       bg-[var(--surface)] text-[var(--text)] text-[12px] font-medium
                       hover:bg-[var(--surface-3)] transition-all duration-200"
          >
            <Globe size={13} className="text-[var(--text-muted)]" />
            {language === 'en' ? 'EN' : 'JP'}
          </button>
          <button
            onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
            className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]
                       flex items-center justify-center text-[var(--text-muted)]
                       hover:bg-[var(--surface-3)] hover:text-[var(--text)]
                       transition-all duration-200"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Decorative accent */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
                 style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }} />
            <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full opacity-15"
                 style={{ background: 'radial-gradient(circle, var(--secondary) 0%, transparent 70%)' }} />
          </div>

          {/* Logo block */}
          <div className="text-center mb-8 relative">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              🧠
            </div>
            <h1 className="text-[26px] font-extrabold text-[var(--text)] tracking-tight">
              {t('auth.login_title')}
            </h1>
            <p className="text-[14px] text-[var(--text-muted)] mt-1.5">
              {t('auth.login_subtitle')}
            </p>
          </div>

          {/* Form card */}
          <div
            className="relative rounded-2xl border border-[var(--border)] p-7"
            style={{
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Error message */}
            {error && (
              <div className="mb-5 alert alert-error" role="alert">
                <span className="shrink-0 mt-0.5">⚠</span>
                <p>{t('auth.invalid_creds')}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

              {/* Email */}
              <div>
                <label htmlFor="email" className="input-label">
                  {t('auth.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="input-label">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-11"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2
                               text-[var(--text-muted)] hover:text-[var(--text)]
                               transition-colors p-0.5 rounded"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="btn-primary w-full h-11 mt-1 justify-center text-[14px]"
                style={{ borderRadius: '12px' }}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('btn.login')
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <p className="text-center text-[12px] text-[var(--text-light)] mt-5">
            Enterprise Meeting Management System
          </p>
        </div>
      </div>
    </div>
  );
}
