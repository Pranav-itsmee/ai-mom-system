'use client';

import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { Task, updateTask } from '@/store/slices/taskSlice';

interface Props {
  task: Task;
  onClose: () => void;
}

export default function TaskEditor({ task, onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [assignedTo,  setAssignedTo]  = useState(task.assigned_to ?? '');
  const [deadline,    setDeadline]    = useState(task.deadline ?? '');
  const [priority,    setPriority]    = useState(task.priority);
  const [status,      setStatus]      = useState(task.status);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  // Sync if parent swaps the task prop
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setAssignedTo(task.assigned_to ?? '');
    setDeadline(task.deadline ?? '');
    setPriority(task.priority);
    setStatus(task.status);
  }, [task.id]);

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setError('');
    setSaving(true);
    try {
      await dispatch(updateTask({
        id:          task.id,
        title:       title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo.trim() || null,
        deadline:    deadline || null,
        priority,
        status,
      })).unwrap();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#172b4d' }}>Edit Task</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Task title"
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="What needs to be done…"
            />
          </div>

          {/* Assigned To */}
          <div>
            <label style={labelStyle}>Assigned To</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              style={inputStyle}
              placeholder="Person responsible"
            />
          </div>

          {/* Deadline + Priority row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} style={inputStyle}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Task['status'])} style={inputStyle}>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {error && <p style={{ marginTop: 12, color: '#e53e3e', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save Task'}
          </button>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#5e6c84',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  color: '#172b4d',
  background: '#fff',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '9px 16px',
  background: '#fff',
  color: '#344563',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5e6c84',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0 4px',
};
