'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchTasks, deleteTask, setFilter, clearFilters, Task } from '@/store/slices/taskSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import TaskCard   from '@/components/tasks/TaskCard';
import TaskEditor from '@/components/tasks/TaskEditor';

function TasksContent() {
  const { t }    = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const searchParams = useSearchParams();

  const { tasks, filters, status, error, total } = useSelector((s: RootState) => s.tasks);
  const user    = useSelector((s: RootState) => s.auth.user);
  const isAdmin = user?.role === 'admin';

  const momIdParam = searchParams.get('momId');
  const momId = momIdParam ? Number(momIdParam) : undefined;

  const [editTask,    setEditTask]    = useState<Task | null>(null);
  const [showEditor,  setShowEditor]  = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);

  useEffect(() => { dispatch(fetchTasks(filters)); }, [dispatch, filters]);

  function handleSaved() { dispatch(fetchTasks(filters)); }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!window.confirm(t('common.confirm_delete'))) return;
    dispatch(deleteTask(id));
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">{t('nav.tasks')}</h1>
          {status === 'succeeded' && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{total} total</p>
          )}
        </div>
        {isAdmin && (
          <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Task
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-3 mb-4">
        <select
          className="input w-auto text-sm"
          value={filters.status ?? ''}
          onChange={(e) => dispatch(setFilter({ status: e.target.value || undefined }))}
        >
          <option value="">All Statuses</option>
          <option value="pending">{t('task.status.pending')}</option>
          <option value="in_progress">{t('task.status.in_progress')}</option>
          <option value="completed">{t('task.status.completed')}</option>
        </select>
        <select
          className="input w-auto text-sm"
          value={filters.priority ?? ''}
          onChange={(e) => dispatch(setFilter({ priority: e.target.value || undefined }))}
        >
          <option value="">All Priorities</option>
          <option value="high">{t('task.priority.high')}</option>
          <option value="medium">{t('task.priority.medium')}</option>
          <option value="low">{t('task.priority.low')}</option>
        </select>
        {hasFilters && (
          <button className="btn-secondary text-sm" onClick={() => dispatch(clearFilters())}>
            {t('btn.clear_filters')}
          </button>
        )}
      </div>

      {status === 'loading' && <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>}
      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="flex flex-col gap-2">
        {status === 'succeeded' && tasks.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">{t('common.no_data')}</p>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="relative group">
            <TaskCard task={task} onClick={() => { setEditTask(task); setShowEditor(true); }} />
            {isAdmin && (
              <button
                className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                onClick={(e) => handleDelete(e, task.id)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {showEditor && editTask && (
        <TaskEditor task={editTask} onClose={() => { setEditTask(null); setShowEditor(false); }} onSaved={handleSaved} />
      )}
      {showCreate && (
        <TaskEditor task={null} momId={momId} onClose={() => setShowCreate(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <ProtectedLayout>
      <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading...</p>}>
        <TasksContent />
      </Suspense>
    </ProtectedLayout>
  );
}
