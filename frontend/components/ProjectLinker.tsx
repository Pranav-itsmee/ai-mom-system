'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import {
  fetchBmsProjects,
  fetchProjectLinks,
  linkProject,
  removeProjectLink,
} from '@/store/slices/bmsSlice';

interface Props {
  meetingId: number;
  onClose: () => void;
}

export default function ProjectLinker({ meetingId, onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { projects, links, projectsStatus } = useSelector((s: RootState) => s.bms);

  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(fetchBmsProjects());
    dispatch(fetchProjectLinks(meetingId));
  }, [dispatch, meetingId]);

  async function handleLink() {
    if (!selectedProjectId) { setError('Select a project first'); return; }
    setError('');
    setLinking(true);
    try {
      await dispatch(linkProject({ meeting_id: meetingId, project_id: Number(selectedProjectId) })).unwrap();
      setSelectedProjectId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to link project');
    } finally {
      setLinking(false);
    }
  }

  async function handleRemove(linkId: number) {
    await dispatch(removeProjectLink(linkId));
  }

  // Build a map of project id → name for quick lookup in the links list
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#172b4d' }}>Link to BMS Project</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        {/* Add link */}
        <div>
          <label style={labelStyle}>Select Project</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ ...inputStyle, flex: 1 }}
              disabled={projectsStatus === 'loading'}
            >
              <option value="">
                {projectsStatus === 'loading'
                  ? 'Loading projects…'
                  : projects.length === 0
                  ? 'No projects available'
                  : 'Choose a project…'}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleLink}
              disabled={linking || !selectedProjectId}
              style={btnPrimary}
            >
              {linking ? '…' : 'Link'}
            </button>
          </div>
          {error && <p style={{ marginTop: 8, color: '#e53e3e', fontSize: 13 }}>{error}</p>}

          {projects.length === 0 && projectsStatus === 'succeeded' && (
            <p style={{ marginTop: 8, fontSize: 12, color: '#5e6c84' }}>
              No BMS projects found. Ensure BMS_API_URL is configured in the backend .env.
            </p>
          )}
        </div>

        {/* Existing links */}
        {links.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={labelStyle}>Linked Projects</p>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {links.map((link) => (
                <div
                  key={link.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#f4f5f7',
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#172b4d' }}>
                      {projectMap.get(link.project_id) ?? `Project #${link.project_id}`}
                    </p>
                    <p style={{ fontSize: 11, color: '#5e6c84', marginTop: 1 }}>
                      Linked {new Date(link.linked_at).toLocaleDateString()}
                      {link.linkedByUser ? ` by ${link.linkedByUser.name}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(link.id)}
                    style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                    title="Remove link"
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button onClick={onClose} style={btnSecondary}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#5e6c84',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 11px',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  color: '#172b4d',
  background: '#fff',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
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
