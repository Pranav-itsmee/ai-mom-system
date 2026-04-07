'use client';

import { useTranslation } from 'react-i18next';
import { User, Calendar } from 'lucide-react';
import { Task } from '@/store/slices/taskSlice';

interface Props {
  task: Task;
  onClick: () => void;
}

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  high:   'bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30',
  medium: 'bg-[#FFB347]/15 text-[#FFB347] border border-[#FFB347]/30',
  low:    'bg-[#00C9A7]/15 text-[#00C9A7] border border-[#00C9A7]/30',
};

const STATUS_CLASS: Record<Task['status'], string> = {
  pending:     'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  in_progress: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  completed:   'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',
};

export default function TaskCard({ task, onClick }: Props) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="card cursor-pointer hover:border-[var(--primary)] hover:shadow-sm transition-all duration-150 space-y-2"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text)] leading-snug flex-1 min-w-0 truncate">
          {task.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Priority badge */}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_CLASS[task.priority]}`}>
            {t(`task.priority.${task.priority}`)}
          </span>
          {/* Status badge */}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[task.status]}`}>
            {t(`task.status.${task.status}`)}
          </span>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
        {/* Assignee */}
        <span className="flex items-center gap-1">
          <User className="w-3.5 h-3.5" />
          {task.assignee?.name ?? task.assigned_to ?? t('task.unassigned')}
        </span>

        {/* Deadline */}
        {task.deadline && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}

        {/* Edited badge */}
        {task.is_edited && (
          <span className="ml-auto text-[10px] text-[var(--text-muted)] italic">
            {t('task.edited', { defaultValue: 'edited' })}
          </span>
        )}
      </div>
    </div>
  );
}
