'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import AuthShell from '@/components/auth/AuthShell';
import { api } from '@/services/api';
import { getPasswordRuleStates, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'loading' | 'success'>('checking');
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        if (!cancelled) {
          setTokenStatus('invalid');
          setStatus('idle');
          setError(t('auth.reset_missing_token'));
        }
        return;
      }

      if (!cancelled) {
        setTokenStatus('checking');
        setStatus('checking');
        setError('');
      }

      try {
        await api.get('/auth/password-reset/validate', {
          params: { token },
        });

        if (!cancelled) {
          setTokenStatus('valid');
          setStatus('idle');
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) {
          setTokenStatus('invalid');
          setStatus('idle');
          setError(err.response?.data?.error || t('auth.reset_invalid_token'));
        }
      }
    }

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const ruleStates = useMemo(() => getPasswordRuleStates(password), [password]);
  const passwordLabels: Record<string, string> = {
    length: t('auth.password_rule_length', { min: PASSWORD_MIN_LENGTH }),
    uppercase: t('auth.password_rule_uppercase'),
    lowercase: t('auth.password_rule_lowercase'),
    number: t('auth.password_rule_number'),
    special: t('auth.password_rule_special'),
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (tokenStatus !== 'valid') {
      setError(t('auth.reset_invalid_token'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.password_mismatch'));
      return;
    }

    if (ruleStates.some((rule) => !rule.passed)) {
      setError(t('auth.password_strength_error'));
      return;
    }

    setStatus('loading');

    try {
      const response = await api.post('/auth/password-reset/reset', {
        token,
        password,
      });
      setStatus('success');
      setMessage(response.data?.message || t('auth.reset_success'));
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const nextError = err.response?.data?.error || t('common.error');
      setStatus('idle');
      setError(nextError);

      if (err.response?.status === 400 && /invalid|expired/i.test(nextError)) {
        setTokenStatus('invalid');
      }
    }
  }

  return (
    <AuthShell
      title={t('auth.reset_title')}
      subtitle={t('auth.reset_subtitle')}
    >
      {status === 'checking' && (
        <div className="mb-5 alert alert-info" role="status">
          <p>{t('auth.reset_token_checking')}</p>
        </div>
      )}

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

      {status === 'success' ? (
        <div className="flex flex-col gap-4">
          <Link
            href="/login?reset=success"
            className="btn-primary h-11 w-full justify-center text-[14px]"
            style={{ borderRadius: '12px' }}
          >
            <CheckCircle2 size={16} />
            {t('auth.back_to_login')}
          </Link>
          <Link
            href="/forgot-password"
            className="btn-secondary h-11 w-full justify-center text-[14px]"
            style={{ borderRadius: '12px' }}
          >
            {t('auth.request_another_link')}
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <div>
              <label htmlFor="password" className="input-label">
                {t('auth.new_password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input"
                placeholder="........"
                required
                autoComplete="new-password"
                disabled={tokenStatus !== 'valid'}
              />
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-[12px] font-semibold text-[var(--text)]">
                  {t('auth.password_rules_title')}
                </p>
                <div className="mt-3 grid gap-2 text-[12px]">
                  {ruleStates.map((rule) => (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-2 ${
                        rule.passed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <CheckCircle2 size={14} className={rule.passed ? 'opacity-100' : 'opacity-30'} />
                      <span>{passwordLabels[rule.id]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="input-label">
                {t('auth.confirm_password')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="input"
                placeholder="........"
                required
                autoComplete="new-password"
                disabled={tokenStatus !== 'valid'}
              />
            </div>

            <button
              type="submit"
              disabled={status === 'loading' || tokenStatus !== 'valid'}
              className="btn-primary h-11 w-full justify-center text-[14px]"
              style={{ borderRadius: '12px' }}
            >
              {status === 'loading' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.reset_submit')
              )}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              <ArrowLeft size={14} />
              {t('auth.back_to_login')}
            </Link>
            <Link
              href="/forgot-password"
              className="text-[13px] font-medium text-[var(--primary-deep)] transition-colors hover:text-[var(--accent)]"
            >
              {t('auth.request_another_link')}
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
