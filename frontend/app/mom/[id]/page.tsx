'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Pencil, RefreshCw, FileDown, Globe } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById } from '@/store/slices/momSlice';
import { api } from '@/services/api';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MOMViewer from '@/components/mom/MOMViewer';
import { Toast, useToast } from '@/components/ui/Toast';

// ── Language badge ────────────────────────────────────────────────────────────

function detectLanguage(summary: string): 'ja' | 'en' {
  return summary.includes('---\n[English Translation]') ? 'ja' : 'en';
}

// ── Inline ExportButton ───────────────────────────────────────────────────────
// A lightweight stub — replace with a full @/components/ui/ExportButton when it exists.
function ExportButton({ momId }: { momId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function handleExport(format: 'pdf' | 'docx') {
    window.open(`/api/v1/mom/${momId}/export?format=${format}`, '_blank');
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary flex items-center gap-1.5 text-sm"
      >
        <FileDown size={15} />
        Export
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg z-20 py-1">
          <button
            onClick={() => handleExport('pdf')}
            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            {t('btn.export_pdf')}
          </button>
          <button
            onClick={() => handleExport('docx')}
            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            {t('btn.export_docx')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MOMPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMOM, status, error } = useSelector((s: RootState) => s.mom);

  const [regenerating, setRegenerating] = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  useEffect(() => {
    if (!currentMOM || String(currentMOM.id) !== params.id) {
      dispatch(fetchMOMById(params.id));
    }
  }, [dispatch, params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api.post(`/mom/${params.id}/regenerate`);
      showToast('Regeneration started — refresh shortly', 'success');
      // Re-fetch after a short delay to pick up the new MOM
      setTimeout(() => dispatch(fetchMOMById(params.id)), 5000);
    } catch {
      showToast('Failed to start regeneration', 'error');
    } finally {
      setRegenerating(false);
    }
  }

  // ── Meeting title and date ──────────────────────────────────────────────────
  const meetingTitle = currentMOM?.meeting_id
    ? `MOM #${currentMOM.id}`
    : `MOM #${params.id}`;

  const createdDate = currentMOM
    ? new Date(currentMOM.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  const language = currentMOM ? detectLanguage(currentMOM.summary) : null;

  // ── Loading / error ─────────────────────────────────────────────────────────
  const isLoading = status === 'loading' && !currentMOM;

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Breadcrumb */}
        <nav className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
          <Link href="/" className="hover:text-[var(--primary)] transition-colors">Dashboard</Link>
          <span>/</span>
          <Link href="/meetings" className="hover:text-[var(--primary)] transition-colors">Meetings</Link>
          {currentMOM?.meeting_id && (
            <>
              <span>/</span>
              <Link
                href={`/meetings/${currentMOM.meeting_id}`}
                className="hover:text-[var(--primary)] transition-colors"
              >
                Meeting
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-[var(--text)]">MOM</span>
        </nav>

        {/* Header */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Title + meta */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-[var(--text)]">{meetingTitle}</h1>
                {language && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    language === 'ja'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                  }`}>
                    <Globe size={11} />
                    {language === 'ja' ? t('mom.language.ja') : t('mom.language.en')}
                  </span>
                )}
              </div>
              {createdDate && (
                <p className="text-sm text-[var(--text-muted)]">{createdDate}</p>
              )}
            </div>

            {/* Action buttons */}
            {currentMOM && (
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/mom/${params.id}/edit`}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Pencil size={14} />
                  {t('btn.edit_mom')}
                </Link>
                <ExportButton momId={params.id} />
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
                  {regenerating ? 'Regenerating…' : t('btn.regenerate')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="card flex items-center justify-center h-40 text-[var(--text-muted)] text-sm">
            {t('common.loading')}
          </div>
        )}

        {!isLoading && error && (
          <div className="card text-[var(--accent)] text-sm">
            {t('common.error')}: {error}
          </div>
        )}

        {!isLoading && !error && !currentMOM && (
          <div className="card text-[var(--text-muted)] text-sm text-center py-10">
            {t('mom.not_available')}
          </div>
        )}

        {currentMOM && (
          <MOMViewer mom={currentMOM} compact={false} />
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </ProtectedLayout>
  );
}
