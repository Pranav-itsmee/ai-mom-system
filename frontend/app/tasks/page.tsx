'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchTasks, setFilter, clearFilters, Task } from '@/store/slices/taskSlice';
import TaskCard from '@/components/TaskCard';
import TaskEditor from '@/components/TaskEditor';

export default function TasksPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { tasks, filters, status, error, total } = useSelector((s: RootState) => s.tasks);

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    dispatch(fetchTasks(filters));
  }, [dispatch, filters]);

  function resetFilters() {
    dispatch(clearFilters());
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 24px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 13, color: '#5e6c84' }}>
        <Link href="/" style={{ color: '#3b82f6' }}>Dashboard</Link>
        {' / Tasks'}
      </p>

      {/* Header */}
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#172b4d' }}>Tasks</h1>
          {status === 'succeeded' && (
            <p style={{ fontSize: 13, color: '#5e6c84', marginTop: 2 }}>{total} total</p>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filters.status ?? ''}
            onChange={(e) => dispatch(setFilter({ status: e.target.value || undefined }))}
            style={selectStyle}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={filters.priority ?? ''}
            onChange={(e) => dispatch(setFilter({ priority: e.target.value || undefined }))}
            style={selectStyle}
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {hasFilters && (
            <button onClick={resetFilters} style={clearBtn}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {status === 'loading' && <p style={{ marginTop: 24, color: '#5e6c84' }}>Loading…</p>}
      {error && <p style={{ marginTop: 24, color: '#e53e3e' }}>Error: {error}</p>}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {status === 'succeeded' && tasks.length === 0 && (
          <p style={{ color: '#5e6c84' }}>No tasks found{hasFilters ? ' for the selected filters' : ''}.</p>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={(t) => setEditingTask(t)}
          />
        ))}
      </div>

      {/* Task editor modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  outline: 'none',
  color: '#172b4d',
};

const clearBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: 'none',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 13,
  color: '#5e6c84',
  cursor: 'pointer',
};
