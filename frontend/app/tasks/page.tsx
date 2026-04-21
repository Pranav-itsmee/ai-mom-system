'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Search, Trash2, X, UserCheck } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchTasks, deleteTask, setFilter, clearFilters, updateTask, Task } from '@/store/slices/taskSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import TaskCard   from '@/components/tasks/TaskCard';
import TaskEditor from '@/components/tasks/TaskEditor';
import { api } from '@/services/api';

// ── Pill filter button ─────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150 whitespace-nowrap',
        active
          ? 'bg-[var(--primary-deep)] text-white shadow-sm'
          : 'bg-[var(--surface-3)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Quick-reassign popover ─────────────────────────────────────────────────

function ReassignPopover({ task, onDone }: { task: Task; onDone: (t: Task) => void }) {
  const [open,   setOpen]   = useState(false);
  const [users,  setUsers]  = useState<{ id: number; name: string; email: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  async function load() {
    if (users.length) return;
    try { const r = await api.get('/users'); setUsers(r.data.users ?? []); } catch {}
  }

  async function pick(userId: number, userName: string) {
    setSaving(true);
    try {
      const updated = await dispatch(updateTask({ id: task.id, assignee_id: userId, assigned_to: userName })).unwrap();
      onDone(updated);
      setOpen(false);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => { setOpen((o) => !o); load(); }}
        className="flex items-center gap-1 text-[11px] font-semibold text-[var(--primary-deep)]
                   hover:text-[var(--text)] transition-colors px-2 py-1 rounded-lg
                   hover:bg-[var(--surface-3)]"
        title="Reassign"
      >
        <UserCheck size={12} />
        Reassign
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 w-52 rounded-xl border border-[var(--border)]
                          bg-[var(--surface)] shadow-theme-lg z-[101] py-1 max-h-52 overflow-y-auto">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Assign to
            </p>
            {users.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : users.map((u) => (
              <button
                key={u.id}
                onClick={() => pick(u.id, u.name)}
                disabled={saving}
                className={[
                  'w-full text-left px-3 py-2 hover:bg-[var(--bg)] transition-colors',
                  u.id === task.assignee_id
                    ? 'text-[var(--primary-deep)] font-semibold text-[12px]'
                    : 'text-[var(--text)] text-[12px]',
                ].join(' ')}
              >
                <span className="block font-medium">{u.name}</span>
                <span className="block text-[10px] text-[var(--text-muted)]">{u.email}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────

function TasksContent() {
  const dispatch = useDispatch<AppDispatch>();
  const searchParams = useSearchParams();

  const { tasks, filters, status, error, total } = useSelector((s: RootState) => s.tasks);
  const user    = useSelector((s: RootState) => s.auth.user);
  const isAdmin = user?.role === 'admin';

  const momIdParam = searchParams.get('momId');
  const momId = momIdParam ? Number(momIdParam) : undefined;

  const [editTask,   setEditTask]   = useState<Task | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search,     setSearch]     = useState('');

  useEffect(() => { dispatch(fetchTasks(filters)); }, [dispatch, filters]);

  function handleSaved() { dispatch(fetchTasks(filters)); }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!window.confirm('Delete this task?')) return;
    dispatch(deleteTask(id));
  }

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.assigned_to ?? '').toLowerCase().includes(q) ||
      (t.assignee?.name ?? '').toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const STATUS_OPTIONS  = ['', 'pending', 'in_progress', 'completed'] as const;
  const PRIORITY_OPTIONS = ['', 'high', 'medium', 'low'] as const;

  const STATUS_LABELS: Record<string, string>   = { '': 'All', pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
  const PRIORITY_LABELS: Record<string, string> = { '': 'All', high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };

  const hasFilters = Object.values(filters).some(Boolean) || search;

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--text)]">Tasks</h1>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {status === 'succeeded' ? `${filtered.length} of ${total} task${total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            className="btn-primary flex items-center gap-1.5 text-[13px]"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} /> New Task
          </button>
        )}
      </div>

      {/* ── Filter card ── */}
      <div className="card mb-4 space-y-3">

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className="input pl-9 w-full"
            placeholder="Search tasks by title, assignee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status pills */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <Pill
                key={s}
                label={STATUS_LABELS[s]}
                active={(filters.status ?? '') === s}
                onClick={() => dispatch(setFilter({ status: s || undefined }))}
              />
            ))}
          </div>
        </div>

        {/* Priority pills */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_OPTIONS.map((p) => (
              <Pill
                key={p}
                label={PRIORITY_LABELS[p]}
                active={(filters.priority ?? '') === p}
                onClick={() => dispatch(setFilter({ priority: p || undefined }))}
              />
            ))}
          </div>
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            className="text-[12px] text-[var(--primary-deep)] hover:text-[var(--text)] transition-colors flex items-center gap-1"
            onClick={() => { dispatch(clearFilters()); setSearch(''); }}
          >
            <X size={12} /> Clear all filters
          </button>
        )}
      </div>

      {/* ── List ── */}
      {status === 'loading' && (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-8">Loading…</p>
      )}
      {error && (
        <p className="text-[13px] text-[var(--danger)] text-center py-4">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {status === 'succeeded' && filtered.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-[14px] font-medium text-[var(--text-muted)]">No tasks found</p>
            <p className="text-[12px] text-[var(--text-light)] mt-1">
              {search ? 'Try a different search term' : 'No tasks match the current filters'}
            </p>
          </div>
        )}

        {filtered.map((task) => (
          <div key={task.id} className="relative group">
            <TaskCard
              task={task}
              onClick={() => { setEditTask(task); setShowEditor(true); }}
            />
            {/* Action overlay — appears on hover */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ReassignPopover
                task={task}
                onDone={() => dispatch(fetchTasks(filters))}
              />
              {isAdmin && (
                <button
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)]
                             hover:text-white hover:bg-[var(--danger)] transition-all px-2 py-1
                             rounded-lg"
                  onClick={(e) => handleDelete(e, task.id)}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showEditor && editTask && (
        <TaskEditor
          task={editTask}
          onClose={() => { setEditTask(null); setShowEditor(false); }}
          onSaved={handleSaved}
        />
      )}
      {showCreate && (
        <TaskEditor
          task={null}
          momId={momId}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <ProtectedLayout>
      <Suspense fallback={<p className="text-[13px] text-[var(--text-muted)]">Loading…</p>}>
        <TasksContent />
      </Suspense>
    </ProtectedLayout>
  );
}
