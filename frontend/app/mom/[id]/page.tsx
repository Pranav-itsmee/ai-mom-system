'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Pencil, RefreshCw, FileDown, Globe, CheckSquare, User, CalendarDays } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById } from '@/store/slices/momSlice';
import { Task } from '@/store/slices/taskSlice';
import { api } from '@/services/api';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MOMViewer from '@/components/mom/MOMViewer';
import { Toast, useToast } from '@/components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectLanguage(summary: string): 'ja' | 'en' {
  return summary.includes('---\n[English Translation]') ? 'ja' : 'en';
}

const PRIORITY_CLASSES: Record<string, string> = {
  high:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
  low:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
};

const STATUS_CLASSES: Record<string, string> = {
  pending:     'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600',
  in_progress: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  completed:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700',
};

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportDropdown({ momId }: { momId: string }) {
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
        className="btn-secondary flex items-center gap-1.5 text-[13px]"
      >
        <FileDown size={14} />
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-theme-md z-20 py-1">
            <button
              onClick={() => handleExport('pdf')}
              className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
            >
              {t('btn.export_pdf')}
            </button>
            <button
              onClick={() => handleExport('docx')}
              className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
            >
              {t('btn.export_docx')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tasks panel ───────────────────────────────────────────────────────────────

function TasksPanel({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();

  return (
    <div className="card p-0 overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <CheckSquare size={15} className="text-primary shrink-0" />
        <p className="text-[13px] font-semibold text-[var(--text)]">
          {t('mom.tasks')}
        </p>
        {tasks.length > 0 && (
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {tasks.length}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">
          No action items
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {tasks.map((task) => (
            <div key={task.id} className="px-4 py-3 hover:bg-[var(--bg)] transition-colors">
              <p className="text-[13px] font-medium text-[var(--text)] leading-snug mb-2">
                {task.title}
              </p>
              {task.description && (
                <p className="text-[12px] text-[var(--text-muted)] mb-2 leading-relaxed">
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY_CLASSES[task.priority] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                  {t(`task.priority.${task.priority}`)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CLASSES[task.status] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                  {t(`task.status.${task.status}`)}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
                {task.assigned_to && (
                  <span className="flex items-center gap-1">
                    <User size={10} /> {task.assigned_to}
                  </span>
                )}
                {task.deadline && (
                  <span className="flex items-center gap-1">
                    <CalendarDays size={10} /> {task.deadline}
                  </span>
                )}
              </div>
            </div>
          ))}
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
      setTimeout(() => dispatch(fetchMOMById(params.id)), 5000);
    } catch {
      showToast('Failed to start regeneration', 'error');
    } finally {
      setRegenerating(false);
    }
  }

  const meetingTitle = currentMOM ? `MOM #${currentMOM.id}` : `MOM #${params.id}`;
  const createdDate  = currentMOM
    ? new Date(currentMOM.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;
  const language     = currentMOM ? detectLanguage(currentMOM.summary) : null;
  const isLoading    = status === 'loading' && !currentMOM;
  const tasks        = (currentMOM?.tasks ?? []) as Task[];

  return (
    <ProtectedLayout>
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Breadcrumb + title row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <nav className="text-[12px] text-[var(--text-muted)] flex items-center gap-1 mb-1">
              <Link href="/meetings" className="hover:text-primary transition-colors">Meetings</Link>
              {currentMOM?.meeting_id && (
                <>
                  <span>/</span>
                  <Link
                    href={`/meetings/${currentMOM.meeting_id}`}
                    className="hover:text-primary transition-colors"
                  >
                    Meeting
                  </Link>
                </>
              )}
              <span>/</span>
              <span className="text-[var(--text)]">MOM</span>
            </nav>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-semibold text-[var(--text)]">{meetingTitle}</h1>
              {language && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  language === 'ja'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                }`}>
                  <Globe size={10} />
                  {language === 'ja' ? t('mom.language.ja') : t('mom.language.en')}
                </span>
              )}
            </div>
            {createdDate && (
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{createdDate}</p>
            )}
          </div>

          {/* Action buttons */}
          {currentMOM && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Link
                href={`/mom/${params.id}/edit`}
                className="btn-secondary flex items-center gap-1.5 text-[13px]"
              >
                <Pencil size={13} />
                {t('btn.edit_mom')}
              </Link>
              <ExportDropdown momId={params.id} />
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="btn-secondary flex items-center gap-1.5 text-[13px] disabled:opacity-50"
              >
                <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                {regenerating ? 'Regenerating…' : t('btn.regenerate')}
              </button>
            </div>
          )}
        </div>

        {/* Loading / error states */}
        {isLoading && (
          <div className="card flex items-center justify-center h-40 text-[var(--text-muted)] text-[13px]">
            {t('common.loading')}
          </div>
        )}
        {!isLoading && error && (
          <div className="card text-[var(--accent)] text-[13px]">
            {t('common.error')}: {error}
          </div>
        )}
        {!isLoading && !error && !currentMOM && (
          <div className="card text-[var(--text-muted)] text-[13px] text-center py-10">
            {t('mom.not_available')}
          </div>
        )}

        {/* 2-column content layout */}
        {currentMOM && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Left: Summary + Key Points + Transcript */}
            <div className="lg:col-span-2 min-w-0">
              <MOMViewer mom={currentMOM} compact={false} showTasks={false} />
            </div>

            {/* Right: Tasks sticky panel */}
            <div className="lg:col-span-1 lg:sticky lg:top-4">
              <TasksPanel tasks={tasks} />
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </ProtectedLayout>
  );
}
