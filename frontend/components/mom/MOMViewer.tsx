'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MOM, KeyPoint } from '@/store/slices/momSlice';
import { Task } from '@/store/slices/taskSlice';

// ── Prefix → chip color mapping ──────────────────────────────────────────────

interface PrefixStyle {
  bg: string;
  text: string;
  border: string;
}

const PREFIX_STYLES: Record<string, PrefixStyle> = {
  '[Agenda]':       { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  '[Discussion]':   { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
  '[Decision]':     { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',  border: 'border-green-200 dark:border-green-700' },
  '[EN Agenda]':    { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-600 dark:text-gray-400',   border: 'border-gray-200 dark:border-gray-600' },
  '[EN Discussion]':{ bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-600 dark:text-gray-400',   border: 'border-gray-200 dark:border-gray-600' },
  '[EN Decision]':  { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-600 dark:text-gray-400',   border: 'border-gray-200 dark:border-gray-600' },
  '[議題]':          { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  '[議論]':          { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
  '[決定]':          { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',  border: 'border-green-200 dark:border-green-700' },
};

// All known prefixes sorted longest-first so multi-word ones match before single-word
const KNOWN_PREFIXES = Object.keys(PREFIX_STYLES).sort((a, b) => b.length - a.length);

function parsePrefix(text: string): { prefix: string | null; rest: string } {
  for (const p of KNOWN_PREFIXES) {
    if (text.startsWith(p)) {
      return { prefix: p, rest: text.slice(p.length).trimStart() };
    }
  }
  // Fallback: match any [Xxx] bracket tag
  const m = text.match(/^(\[[^\]]+\])\s*/);
  if (m) return { prefix: m[1], rest: text.slice(m[0].length) };
  return { prefix: null, rest: text };
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const PRIORITY_CLASSES: Record<string, string> = {
  high:   'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30',
  medium: 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30',
  low:    'bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30',
};

const STATUS_CLASSES: Record<string, string> = {
  pending:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
  in_progress: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
  completed:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3">
      {children}
    </p>
  );
}

function KeyPointChip({ text }: { text: string }) {
  const { prefix, rest } = parsePrefix(text);
  const style = prefix ? (PREFIX_STYLES[prefix] ?? { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-600' }) : null;

  return (
    <li className="flex items-start gap-2 py-1.5 text-sm text-[var(--text)] leading-relaxed">
      {style && prefix ? (
        <span className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
          {prefix.replace(/\[|\]/g, '')}
        </span>
      ) : (
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--primary)] shrink-0" />
      )}
      <span>{rest || text}</span>
    </li>
  );
}

function PriorityBadge({ priority, label }: { priority: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_CLASSES[priority] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  mom: MOM;
  compact?: boolean;
  showTasks?: boolean;
}

export default function MOMViewer({ mom, compact = false, showTasks = true }: Props) {
  const { t } = useTranslation();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const keyPoints: KeyPoint[] = mom.keyPoints ?? [];
  const tasks: Task[] = (mom.tasks ?? []) as Task[];
  const displayPoints = compact ? keyPoints.slice(0, 5) : keyPoints;

  return (
    <div className="space-y-4">

      {/* Edit info badge */}
      {mom.is_edited && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <PencilLine size={13} />
          <span>
            {t('mom.last_edited')}
            {mom.editor ? ` ${mom.editor.name}` : ''}
            {mom.edited_at ? ` · ${new Date(mom.edited_at).toLocaleString()}` : ''}
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="card">
        <SectionLabel>{t('mom.summary')}</SectionLabel>
        <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{mom.summary}</p>
      </div>

      {/* Key Points */}
      {displayPoints.length > 0 && (
        <div className="card">
          <SectionLabel>
            {t('mom.key_points')}
            {!compact && keyPoints.length > 0 && (
              <span className="ml-1.5 font-normal text-[var(--text-muted)]">({keyPoints.length})</span>
            )}
          </SectionLabel>
          <ul className="space-y-0.5">
            {displayPoints.map((kp) => (
              <KeyPointChip key={kp.id} text={kp.point_text} />
            ))}
          </ul>
          {compact && keyPoints.length > 5 && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              +{keyPoints.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Tasks — full mode only, unless showTasks=false */}
      {!compact && showTasks && tasks.length > 0 && (
        <div className="card">
          <SectionLabel>
            {t('mom.tasks')}
            <span className="ml-1.5 font-normal text-[var(--text-muted)]">({tasks.length})</span>
          </SectionLabel>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Title</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{t('task.assigned_to')}</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{t('task.deadline')}</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{t('task.priority')}</th>
                  <th className="text-left py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-[var(--text)]">{task.title}</td>
                    <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                      {task.assigned_to ?? t('task.unassigned')}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                      {task.deadline ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <PriorityBadge
                        priority={task.priority}
                        label={t(`task.priority.${task.priority}`)}
                      />
                    </td>
                    <td className="py-2.5">
                      <StatusBadge
                        status={task.status}
                        label={t(`task.status.${task.status}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                <p className="font-semibold text-sm text-[var(--text)]">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-[var(--text-muted)]">{task.description}</p>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <PriorityBadge priority={task.priority} label={t(`task.priority.${task.priority}`)} />
                  <StatusBadge status={task.status} label={t(`task.status.${task.status}`)} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                  {task.assigned_to && (
                    <span>{t('task.assigned_to')}: {task.assigned_to}</span>
                  )}
                  {task.deadline && (
                    <span>{t('task.deadline')}: {task.deadline}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Transcript — full mode only, collapsible */}
      {!compact && mom.raw_transcript && (
        <div className="card">
          <button
            type="button"
            onClick={() => setTranscriptOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <SectionLabel>{t('mom.transcript')}</SectionLabel>
            {transcriptOpen
              ? <ChevronUp size={16} className="text-[var(--text-muted)] shrink-0" />
              : <ChevronDown size={16} className="text-[var(--text-muted)] shrink-0" />
            }
          </button>
          {transcriptOpen && (
            <pre className="mt-3 max-h-96 overflow-y-auto text-xs text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed font-mono bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
              {mom.raw_transcript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
