'use client';

import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { AppDispatch } from '@/store';
import { Task, createTask, updateTask } from '@/store/slices/taskSlice';

interface Props {
  task?: Task | null;
  momId?: number;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY = {
  title: '',
  description: '',
  assigned_to: '',
  deadline: '',
  priority: 'medium' as Task['priority'],
  status: 'pending' as Task['status'],
};

export default function TaskEditor({ task, momId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const isEdit = Boolean(task);

  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (task) {
      setForm({
        title:       task.title,
        description: task.description ?? '',
        assigned_to: task.assigned_to ?? '',
        deadline:    task.deadline ?? '',
        priority:    task.priority,
        status:      task.status,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [task]);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError(t('task.editor.title_required', { defaultValue: 'Title is required.' }));
      return;
    }
    setError('');
    setSaving(true);

    try {
      if (isEdit && task) {
        await dispatch(updateTask({
          id:          task.id,
          title:       form.title.trim(),
          description: form.description || null,
          assigned_to: form.assigned_to || null,
          deadline:    form.deadline || null,
          priority:    form.priority,
          status:      form.status,
        })).unwrap();
      } else {
        if (!momId) throw new Error('momId is required to create a task');
        await dispatch(createTask({
          mom_id:      momId,
          title:       form.title.trim(),
          description: form.description || null,
          assigned_to: form.assigned_to || null,
          deadline:    form.deadline || null,
          priority:    form.priority,
        })).unwrap();
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error', { defaultValue: 'An error occurred.' }));
    } finally {
      setSaving(false);
    }
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text)]">
            {isEdit
              ? t('task.editor.edit_title', { defaultValue: 'Edit Task' })
              : t('task.editor.create_title', { defaultValue: 'New Task' })}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {t('task.editor.field_title', { defaultValue: 'Title' })} *
            </label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('task.editor.title_placeholder', { defaultValue: 'Enter task title…' })}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {t('task.editor.field_description', { defaultValue: 'Description' })}
            </label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('task.editor.description_placeholder', { defaultValue: 'Optional details…' })}
            />
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {t('task.assigned_to', { defaultValue: 'Assigned To' })}
            </label>
            <input
              className="input"
              value={form.assigned_to}
              onChange={(e) => set('assigned_to', e.target.value)}
              placeholder={t('task.unassigned', { defaultValue: 'Unassigned' })}
            />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {t('task.deadline', { defaultValue: 'Deadline' })}
            </label>
            <input
              type="date"
              className="input"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {t('task.editor.field_priority', { defaultValue: 'Priority' })}
            </label>
            <select
              className="input"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as Task['priority'])}
            >
              <option value="high">{t('task.priority.high', { defaultValue: 'High' })}</option>
              <option value="medium">{t('task.priority.medium', { defaultValue: 'Medium' })}</option>
              <option value="low">{t('task.priority.low', { defaultValue: 'Low' })}</option>
            </select>
          </div>

          {/* Status — edit mode only */}
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                {t('task.editor.field_status', { defaultValue: 'Status' })}
              </label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => set('status', e.target.value as Task['status'])}
              >
                <option value="pending">{t('task.status.pending', { defaultValue: 'Pending' })}</option>
                <option value="in_progress">{t('task.status.in_progress', { defaultValue: 'In Progress' })}</option>
                <option value="completed">{t('task.status.completed', { defaultValue: 'Completed' })}</option>
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--accent)]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving
              ? t('common.saving', { defaultValue: 'Saving…' })
              : t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  );
}
