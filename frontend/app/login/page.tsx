'use client';

import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '@/store/slices/authSlice';
import { RootState, AppDispatch } from '@/store';
import ThemeToggle    from '@/components/ui/ThemeToggle';
import LanguageToggle from '@/components/ui/LanguageToggle';

export default function LoginPage() {
  const { t }    = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const router   = useRouter();
  const { token, status, error } = useSelector((s: RootState) => s.auth);

  const [email,    setEmail]       = useState('');
  const [password, setPassword]    = useState('');
  const [showPass, setShowPass]    = useState(false);

  useEffect(() => {
    if (token) router.replace('/meetings');
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch(login({ email, password }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* Top bar */}
      <div className="flex justify-end gap-1 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      {/* Center card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[400px]">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center
                            text-3xl mx-auto mb-4" style={{ boxShadow: 'var(--shadow-md)' }}>
              🧠
            </div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">{t('auth.login_title')}</h1>
            <p className="text-theme-sm text-[var(--text-muted)] mt-1">{t('auth.login_subtitle')}</p>
          </div>

          {/* Form card */}
          <div className="card">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-500/10
                              border border-red-200 dark:border-red-500/20 px-4 py-3">
                <p className="text-theme-sm text-red-600 dark:text-red-400">{t('auth.invalid_creds')}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="mb-1.5 block text-theme-sm font-medium text-[var(--gray-700)]
                                  dark:text-[var(--gray-400)]">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-theme-sm font-medium text-[var(--gray-700)]
                                  dark:text-[var(--gray-400)]">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-11"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--gray-400)]
                               hover:text-[var(--gray-600)] transition-colors"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="btn-primary w-full h-11 mt-1 justify-center"
              >
                {status === 'loading' ? t('common.loading') : t('btn.login')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
