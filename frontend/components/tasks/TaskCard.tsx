'use client';

import { useTranslation } from 'react-i18next';
import { User, Calendar } from 'lucide-react';
import { Task } from '@/store/slices/taskSlice';

interface Props {
  task: Task;
  onClick: () => void;
}

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  high:   'badge badge-danger',
  medium: 'badge badge-warning',
  low:    'badge badge-primary',
};

const STATUS_CLASS: Record<Task['status'], string> = {
  pending:     'badge badge-info',
  in_progress: 'badge badge-accent',
  completed:   'badge badge-success',
};

export default function TaskCard({ task, onClick }: Props) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="card cursor-pointer hover:border-[var(--primary-deep)] hover:shadow-theme-sm
                 transition-all duration-200 space-y-2.5 group"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-[var(--text)] leading-snug flex-1 min-w-0
                       group-hover:text-[var(--primary-deep)] transition-colors">
          {task.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={PRIORITY_CLASS[task.priority]}>
            {t(`task.priority.${task.priority}`)}
          </span>
          <span className={STATUS_CLASS[task.status]}>
            {t(`task.status.${task.status}`)}
          </span>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-[13px] text-[var(--text-muted)] leading-snug line-clamp-1">
          {task.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <User size={12} className="shrink-0" />
          {task.assignee?.name ?? task.assigned_to ?? t('task.unassigned')}
        </span>
        {task.deadline && (
          <span className="flex items-center gap-1.5">
            <Calendar size={12} className="shrink-0" />
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
        {task.is_edited && (
          <span className="ml-auto text-[11px] text-[var(--text-light)] italic">edited</span>
        )}
      </div>
    </div>
  );
}
