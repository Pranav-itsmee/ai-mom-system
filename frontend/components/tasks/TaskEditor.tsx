'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { X, User, Calendar, Flag, CheckCircle2 } from 'lucide-react';
import { AppDispatch } from '@/store';
import { Task, createTask, updateTask } from '@/store/slices/taskSlice';
import { api } from '@/services/api';

interface Props {
  task?: Task | null;
  momId?: number;
  onClose: () => void;
  onSaved: () => void;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

const EMPTY = {
  title:       '',
  description: '',
  assignee_id: null as number | null,
  assigned_to: '',
  deadline:    '',
  priority:    'medium' as Task['priority'],
  status:      'pending'  as Task['status'],
};

export default function TaskEditor({ task, momId, onClose, onSaved }: Props) {
  const dispatch  = useDispatch<AppDispatch>();
  const isEdit    = Boolean(task);

  const [form,    setForm]    = useState({ ...EMPTY });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [users,   setUsers]   = useState<UserOption[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r.data.users ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (task) {
      setForm({
        title:       task.title,
        description: task.description ?? '',
        assignee_id: task.assignee_id ?? null,
        assigned_to: task.assigned_to ?? '',
        deadline:    task.deadline ?? '',
        priority:    task.priority,
        status:      task.status,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [task]);

  function set<K extends keyof typeof EMPTY>(field: K, value: typeof EMPTY[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setError('');
    setSaving(true);
    const selectedUser = users.find((u) => u.id === form.assignee_id);
    try {
      if (isEdit && task) {
        await dispatch(updateTask({
          id:          task.id,
          title:       form.title.trim(),
          description: form.description || null,
          assigned_to: selectedUser?.name || form.assigned_to || null,
          assignee_id: form.assignee_id,
          deadline:    form.deadline || null,
          priority:    form.priority,
          status:      form.status,
        })).unwrap();
      } else {
        if (!momId) throw new Error('momId required');
        await dispatch(createTask({
          mom_id:      momId,
          title:       form.title.trim(),
          description: form.description || null,
          assigned_to: selectedUser?.name || form.assigned_to || null,
          assignee_id: form.assignee_id,
          deadline:    form.deadline || null,
          priority:    form.priority,
        })).unwrap();
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(90vh, 640px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-[15px] font-bold text-[var(--text)]">
            {isEdit ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">

          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Title *
            </label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Enter task title…"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Description
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Optional details…"
            />
          </div>

          {/* Assignee picker */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <User size={11} /> Assigned To
            </label>
            <select
              className="input"
              value={form.assignee_id ?? ''}
              onChange={(e) => set('assignee_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}  ·  {u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Deadline + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Calendar size={11} /> Deadline
              </label>
              <input
                type="date"
                className="input"
                value={form.deadline}
                onChange={(e) => set('deadline', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Flag size={11} /> Priority
              </label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as Task['priority'])}
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
          </div>

          {/* Status — edit only */}
          {isEdit && (
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <CheckCircle2 size={11} /> Status
              </label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => set('status', e.target.value as Task['status'])}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          {error && (
            <p className="text-[13px] text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
