'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchMeetings } from '@/store/slices/meetingSlice';
import MeetingCard from '@/components/MeetingCard';

const STATUSES = ['', 'scheduled', 'recording', 'processing', 'completed', 'failed'] as const;

export default function MeetingsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { meetings, status, error, total } = useSelector((s: RootState) => s.meetings);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    dispatch(fetchMeetings(filterStatus ? { status: filterStatus } : {}));
  }, [dispatch, filterStatus]);

  // Auto-refresh every 30 s so status badges stay up-to-date during recording/processing
  useEffect(() => {
    const id = setInterval(() => {
      dispatch(fetchMeetings(filterStatus ? { status: filterStatus } : {}));
    }, 30_000);
    return () => clearInterval(id);
  }, [dispatch, filterStatus]);

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 24px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 13, color: '#5e6c84' }}>
        <Link href="/" style={{ color: '#3b82f6' }}>Dashboard</Link>
        {' / Meetings'}
      </p>

      {/* Header */}
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#172b4d' }}>Meetings</h1>
          {status === 'succeeded' && (
            <p style={{ fontSize: 13, color: '#5e6c84', marginTop: 2 }}>{total} total</p>
          )}
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={selectStyle}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {status === 'loading' && <p style={{ marginTop: 24, color: '#5e6c84' }}>Loading…</p>}
      {error && <p style={{ marginTop: 24, color: '#e53e3e' }}>Error: {error}</p>}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {status === 'succeeded' && meetings.length === 0 && (
          <p style={{ color: '#5e6c84' }}>No meetings found.</p>
        )}
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
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
