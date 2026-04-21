'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import AuthShell from '@/components/auth/AuthShell';
import { login } from '@/store/slices/authSlice';
import { RootState, AppDispatch } from '@/store';

export default function LoginPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, status, error } = useSelector((state: RootState) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch(login({ email, password }));
  }

  const resetSuccess = searchParams.get('reset') === 'success';

  return (
    <AuthShell
      title={t('auth.login_title')}
      subtitle={t('auth.login_subtitle')}
    >
      {resetSuccess && (
        <div className="mb-5 alert alert-success" role="status">
          <p>{t('auth.login_reset_success')}</p>
        </div>
      )}

      {error && (
        <div className="mb-5 alert alert-error" role="alert">
          <p>{error || t('auth.invalid_creds')}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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
              placeholder="........"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPass((value) => !value)}
              className="absolute right-3 top-1/2 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              style={{ transform: 'translateY(-50%)' }}
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-[12px] font-medium text-[var(--primary-deep)] transition-colors hover:text-[var(--accent)]"
            >
              {t('auth.forgot_password_link')}
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn-primary mt-1 h-11 w-full justify-center text-[14px]"
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
    </AuthShell>
  );
}
