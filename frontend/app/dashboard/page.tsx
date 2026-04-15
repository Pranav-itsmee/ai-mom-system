'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMeetings, Meeting } from '@/store/slices/meetingSlice';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { api } from '@/services/api';

const STATUSES = ['', 'scheduled', 'recording', 'processing', 'completed', 'failed'] as const;

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(iso));
}
function formatTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function formatDur(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function getGreeting(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const dispatch    = useDispatch<AppDispatch>();
  const { meetings, status, error, total } = useSelector((s: RootState) => s.meetings);
  const user = useSelector((s: RootState) => s.auth.user);

  const [filterStatus, setFilterStatus] = useState('');
  const [syncing,      setSyncing]      = useState(false);
  const [page,         setPage]         = useState(1);
  const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';

  const greeting = getGreeting();

  function load(s = filterStatus, p = page) {
    dispatch(fetchMeetings({ status: s || undefined, page: p, limit: 20 }));
  }
  useEffect(() => { load(); }, [filterStatus, page]);
  useEffect(() => {
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, [filterStatus, page]);

  async function handleSync() {
    setSyncing(true);
    try { await api.post('/meetings/sync'); load(); }
    catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  // Stat counts from current loaded set
  const counts: Record<string, number> = {};
  meetings.forEach((m) => { counts[m.status] = (counts[m.status] ?? 0) + 1; });

  return (
    <ProtectedLayout>
      <div className="max-w-6xl mx-auto">

        {/* ── Page header — title left + breadcrumb right ── */}
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-[20px] font-semibold text-[var(--text)]">
            {t('nav.dashboard')}
          </h1>
          <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
            <span>Home</span>
            <ChevronRight size={13} />
            <span className="text-[var(--text)]">{t('nav.dashboard')}</span>
          </div>
        </div>

        {/* ── Greeting ── */}
        <p className="text-[14px] text-[var(--text-muted)] mb-6">
          Good {greeting}, <span className="font-medium text-[var(--text)]">{user?.name ?? ''}</span>
        </p>

        {/* ── Stat cards row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {(['scheduled','recording','processing','completed','failed'] as const).map((st) => (
            <div key={st} className="card p-5 cursor-pointer hover:shadow-theme-sm transition-all"
                 onClick={() => { setFilterStatus(filterStatus === st ? '' : st); setPage(1); }}
                 style={{ outline: filterStatus === st ? '2px solid #00C9A7' : 'none', outlineOffset: 2 }}>
              <p className="text-[11px] text-[var(--text-muted)] font-medium mb-1">
                {t(`status.${st}`)}
              </p>
              <p className="text-[28px] font-bold text-[var(--text)] leading-none">
                {counts[st] ?? 0}
              </p>
            </div>
          ))}
        </div>

        {/* ── Content card — filter tabs + table inside one card ── */}
        <div className="card p-0 overflow-hidden">

          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatus(s); setPage(1); }}
                  className={`px-3.5 py-1 text-[12px] font-medium transition-colors
                              ${filterStatus === s
                                ? 'bg-primary text-white rounded-full'
                                : 'text-[var(--gray-500)] hover:text-[var(--text)] rounded-full hover:bg-[var(--gray-100)] dark:hover:bg-white/5'
                              }`}
                >
                  {s === '' ? 'All' : t(`status.${s}`)}
                </button>
              ))}
            </div>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-secondary gap-1.5 text-[12px] px-3 py-1.5"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {t('btn.sync_calendar')}
            </button>
          </div>

          {/* Table */}
          {status === 'loading' && (
            <p className="px-5 py-10 text-[13px] text-center text-[var(--text-muted)]">
              {t('common.loading')}
            </p>
          )}
          {error && (
            <p className="px-5 py-6 text-[13px] text-center text-accent">
              {t('common.error')}: {error}
            </p>
          )}
          {status === 'succeeded' && meetings.length === 0 && (
            <p className="px-5 py-10 text-[13px] text-center text-[var(--text-muted)]">
              {t('common.no_data')}
            </p>
          )}

          {meetings.length > 0 && (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Organizer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m: Meeting) => (
                  <tr key={m.id}>
                    <td>
                      <Link
                        href={`/meetings/${m.id}`}
                        className="font-medium text-[var(--text)] hover:text-primary transition-colors"
                      >
                        {m.title}
                      </Link>
                    </td>
                    <td className="text-[var(--text-muted)]">{formatDate(m.scheduled_at, locale)}</td>
                    <td className="text-[var(--text-muted)]">{formatTime(m.scheduled_at, locale)}</td>
                    <td className="text-[var(--text-muted)]">{formatDur(m.duration_seconds)}</td>
                    <td className="text-[var(--text-muted)]">{m.organizer?.name ?? '—'}</td>
                    <td><MeetingStatusBadge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
              <p className="text-[12px] text-[var(--text-muted)]">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40">
                  Previous
                </button>
                <button onClick={() => setPage((p) => p + 1)}
                        disabled={page * 20 >= total}
                        className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </ProtectedLayout>
  );
}
