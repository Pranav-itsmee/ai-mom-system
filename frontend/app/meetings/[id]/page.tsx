'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchMeeting } from '@/store/slices/meetingSlice';
import { api } from '@/services/api';
import MOMViewer from '@/components/MOMViewer';
import ProjectLinker from '@/components/ProjectLinker';

const STATUS_COLOR: Record<string, string> = {
  scheduled:  '#3b82f6',
  recording:  '#f59e0b',
  processing: '#8b5cf6',
  completed:  '#10b981',
  failed:     '#ef4444',
};

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const dispatch  = useDispatch<AppDispatch>();
  const { currentMeeting, status, error } = useSelector((s: RootState) => s.meetings);

  const [showLinker,    setShowLinker]    = useState(false);
  const [regenerating,  setRegenerating]  = useState(false);
  const [regenMsg,      setRegenMsg]      = useState('');

  useEffect(() => {
    dispatch(fetchMeeting(params.id));
  }, [dispatch, params.id]);

  // Poll every 10 s while the meeting is still recording/processing
  useEffect(() => {
    if (!currentMeeting) return;
    if (!['recording', 'processing'].includes(currentMeeting.status)) return;

    const id = setInterval(() => dispatch(fetchMeeting(params.id)), 10_000);
    return () => clearInterval(id);
  }, [dispatch, params.id, currentMeeting?.status]);

  async function handleRegenerate() {
    if (!currentMeeting?.mom) return;
    setRegenerating(true);
    setRegenMsg('');
    try {
      const res = await api.post(`/mom/${currentMeeting.mom.id}/regenerate`);
      setRegenMsg(res.data.message ?? 'Regeneration started');
    } catch (err: unknown) {
      setRegenMsg(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  if (status === 'loading') return <div style={{ padding: 40, color: '#5e6c84' }}>Loading…</div>;
  if (error)               return <div style={{ padding: 40, color: '#e53e3e' }}>Error: {error}</div>;
  if (!currentMeeting)     return <div style={{ padding: 40, color: '#5e6c84' }}>Meeting not found.</div>;

  const mom   = currentMeeting.mom;
  const color = STATUS_COLOR[currentMeeting.status] ?? '#5e6c84';

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 24px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 13, color: '#5e6c84' }}>
        <Link href="/" style={{ color: '#3b82f6' }}>Dashboard</Link>
        {' / '}
        <Link href="/meetings" style={{ color: '#3b82f6' }}>Meetings</Link>
        {' / '}
        {currentMeeting.title}
      </p>

      {/* Header */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#172b4d' }}>{currentMeeting.title}</h1>
          <p style={{ fontSize: 13, color: '#5e6c84', marginTop: 4 }}>
            {new Date(currentMeeting.scheduled_at).toLocaleString()}
            {currentMeeting.duration_seconds != null && ` · ${Math.round(currentMeeting.duration_seconds / 60)} min`}
            {currentMeeting.organizer && ` · ${currentMeeting.organizer.name}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              background: color + '18',
              color,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {currentMeeting.status}
          </span>
          <button onClick={() => setShowLinker(true)} style={btnSecondary}>
            Link to Project
          </button>
        </div>
      </div>

      {/* Attendees */}
      {currentMeeting.attendees && currentMeeting.attendees.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 13, color: '#5e6c84' }}>
          <strong>Attendees:</strong>{' '}
          {currentMeeting.attendees.map((a: { name?: string; email?: string }) => a.name ?? a.email).join(', ')}
        </p>
      )}

      {/* Status notes for in-progress states */}
      {currentMeeting.status === 'recording' && (
        <div style={infoBox('#f59e0b')}>Recording in progress — bot is active in the meeting.</div>
      )}
      {currentMeeting.status === 'processing' && (
        <div style={infoBox('#8b5cf6')}>Processing audio — Claude is generating the MOM. This may take a minute.</div>
      )}
      {currentMeeting.status === 'failed' && (
        <div style={infoBox('#ef4444')}>Processing failed. Check server logs for details.</div>
      )}

      {/* Regen message */}
      {regenMsg && (
        <div style={{ ...infoBox('#3b82f6'), marginTop: 12 }}>{regenMsg}</div>
      )}

      {/* MOM */}
      <div style={{ marginTop: 28 }}>
        {mom ? (
          <MOMViewer
            mom={mom}
            editHref={`/mom/${mom.id}/edit`}
            onRegenerate={handleRegenerate}
            regenerating={regenerating}
          />
        ) : (
          <div style={{ padding: '20px 18px', background: '#fff', borderRadius: 8, border: '1px solid #dfe1e6', color: '#5e6c84' }}>
            {['scheduled', 'recording', 'processing'].includes(currentMeeting.status)
              ? 'MOM will be generated automatically after the meeting ends.'
              : 'No MOM generated for this meeting.'}
          </div>
        )}
      </div>

      {/* BMS Project Linker modal */}
      {showLinker && (
        <ProjectLinker
          meetingId={currentMeeting.id}
          onClose={() => setShowLinker(false)}
        />
      )}
    </main>
  );
}

function infoBox(color: string): React.CSSProperties {
  return {
    marginTop: 14,
    padding: '10px 14px',
    background: color + '12',
    border: `1px solid ${color}44`,
    borderRadius: 6,
    fontSize: 13,
    color,
    fontWeight: 500,
  };
}

const btnSecondary: React.CSSProperties = {
  padding: '7px 14px',
  background: '#fff',
  color: '#344563',
  border: '1px solid #dfe1e6',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
