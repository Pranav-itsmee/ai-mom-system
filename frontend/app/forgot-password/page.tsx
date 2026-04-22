'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthShell from '@/components/auth/AuthShell';
import { api } from '@/services/api';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setStatus('loading');

    try {
      const response = await api.post('/auth/password-reset/request', { email });
      setStatus('success');
      setMessage(response.data?.message || t('auth.forgot_success'));
    } catch (err: any) {
      setStatus('idle');
      setError(err.response?.data?.error || t('common.error'));
    }
  }

  return (
    <AuthShell
      title={t('auth.forgot_title')}
      subtitle={t('auth.forgot_subtitle')}
    >
      <div className="mb-5 alert alert-info" role="status">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        <p>{t('auth.forgot_security_note')}</p>
      </div>

      {message && (
        <div className="mb-5 alert alert-success" role="status">
          <p>{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-5 alert alert-error" role="alert">
          <p>{error}</p>
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
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            placeholder="you@example.com"
            required
            autoFocus
            autoComplete="email"
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn-primary h-11 w-full justify-center text-[14px]"
          style={{ borderRadius: '12px' }}
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('common.loading')}
            </>
          ) : (
            t('auth.forgot_submit')
          )}
        </button>
      </form>

      <div className="mt-5">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} />
          {t('auth.back_to_login')}
        </Link>
      </div>
    </AuthShell>
  );
}
