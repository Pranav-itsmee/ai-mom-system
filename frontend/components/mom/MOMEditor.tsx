'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById, updateMOM, clearMOM } from '@/store/slices/momSlice';
import { Toast, useToast } from '@/components/ui/Toast';
import KeyPointsList from './KeyPointsList';

interface Props {
  momId: string | number;
}

export default function MOMEditor({ momId }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMOM, status, error } = useSelector((s: RootState) => s.mom);

  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  // Fetch MOM on mount if not already loaded or wrong id
  useEffect(() => {
    if (!currentMOM || String(currentMOM.id) !== String(momId)) {
      dispatch(fetchMOMById(momId));
    }
  }, [dispatch, momId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate form fields when MOM data arrives
  useEffect(() => {
    if (currentMOM && String(currentMOM.id) === String(momId)) {
      setSummary(currentMOM.summary ?? '');
      setKeyPoints((currentMOM.keyPoints ?? []).map((kp) => kp.point_text));
    }
  }, [currentMOM, momId]);

  // Auto-resize textarea
  function handleSummaryInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setSummary(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // Trigger resize on initial populate
  useEffect(() => {
    const el = textareaRef.current;
    if (el && summary) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [summary]);

  async function handleSave() {
    if (!currentMOM) return;
    setSaveError('');
    setSaving(true);
    try {
      const cleanPoints = keyPoints.filter((p) => p.trim().length > 0);
      await dispatch(
        updateMOM({ id: currentMOM.id, summary, key_points: cleanPoints })
      ).unwrap();
      showToast(t('btn.save') + ' — MOM updated successfully', 'success');
      // Short delay so toast is visible before navigation
      setTimeout(() => {
        router.push(`/mom/${currentMOM.id}`);
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save MOM';
      setSaveError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (currentMOM) {
      router.push(`/mom/${currentMOM.id}`);
    } else {
      router.back();
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispatch(clearMOM());
    };
  }, [dispatch]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (status === 'loading' && !currentMOM) {
    return (
      <div className="card flex items-center justify-center h-40 text-[var(--text-muted)]">
        {t('common.loading')}
      </div>
    );
  }

  if (status === 'failed' && error && !currentMOM) {
    return (
      <div className="card text-[var(--accent)] text-sm p-6">
        {t('common.error')}: {error}
      </div>
    );
  }

  if (!currentMOM) return null;

  const isBusy = saving || status === 'loading';

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Previously edited notice */}
      {currentMOM.is_edited && (
        <div className="text-xs text-[var(--text-muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
          Previously edited
          {currentMOM.editor ? ` by ${currentMOM.editor.name}` : ''}
          {currentMOM.edited_at ? ` · ${new Date(currentMOM.edited_at).toLocaleString()}` : ''}
        </div>
      )}

      {/* Summary */}
      <div className="card space-y-3">
        <label
          htmlFor="mom-summary"
          className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]"
        >
          {t('mom.summary')}
        </label>
        <textarea
          id="mom-summary"
          ref={textareaRef}
          className="input resize-none overflow-hidden leading-relaxed"
          rows={6}
          value={summary}
          onChange={handleSummaryInput}
          placeholder="Executive summary of the meeting…"
          disabled={isBusy}
        />
      </div>

      {/* Key Points */}
      <div className="card space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('mom.key_points')}
        </p>
        <KeyPointsList points={keyPoints} onChange={setKeyPoints} />
      </div>

      {/* Error */}
      {saveError && (
        <p className="text-sm text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isBusy || !summary.trim()}
          className="btn-primary"
        >
          {isBusy ? `${t('btn.save')}…` : t('btn.save')}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isBusy}
          className="btn-secondary"
        >
          {t('btn.cancel')}
        </button>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
