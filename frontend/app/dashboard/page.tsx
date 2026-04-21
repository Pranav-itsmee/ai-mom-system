'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ChevronRight, Upload, Archive, ChevronDown, ChevronUp, Video, Loader2 } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMeetings, Meeting } from '@/store/slices/meetingSlice';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import UploadMeetingModal from '@/components/meetings/UploadMeetingModal';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { api } from '@/services/api';

interface ArchivedMOM {
  id: number;
  meeting_id: number;
  archived_at: string | null;
  meeting?: { id: number; title: string; scheduled_at: string; status: string };
}

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

  const [filterStatus,   setFilterStatus]   = useState('');
  const [syncing,        setSyncing]        = useState(false);
  const [page,           setPage]           = useState(1);
  const [showUpload,     setShowUpload]     = useState(false);
  const [archivedMOMs,   setArchivedMOMs]   = useState<ArchivedMOM[]>([]);
  const [archivesOpen,   setArchivesOpen]   = useState(false);
  const [meetLink,       setMeetLink]       = useState('');
  const [recording,      setRecording]      = useState(false);
  const [recordMsg,      setRecordMsg]      = useState<{ text: string; ok: boolean } | null>(null);


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

  useEffect(() => {
    api.get('/mom/list', { params: { archived: 'true' } })
      .then((res) => setArchivedMOMs(res.data.moms ?? []))
      .catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true);
    try { await api.post('/meetings/sync'); load(); }
    catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  async function handleQuickRecord() {
    const link = meetLink.trim();
    if (!link) return;
    setRecording(true);
    setRecordMsg(null);
    try {
      const res = await api.post('/meetings', {
        title: 'Quick Recording',
        meet_link: link,
        scheduled_at: new Date().toISOString(),
        organizer_id: null,
      });
      const id = res.data.id;
      await api.post(`/meetings/${id}/record`);
      setRecordMsg({ text: 'Bot is joining the meeting…', ok: true });
      setMeetLink('');
      load();
    } catch (e: any) {
      setRecordMsg({ text: e?.response?.data?.error ?? 'Failed to start recording', ok: false });
    } finally {
      setRecording(false);
    }
  }

  const archivedMeetingIds = new Set(archivedMOMs.map((a) => a.meeting_id));
  const visibleMeetings = meetings.filter((m) => !archivedMeetingIds.has(m.id));

  const counts: Record<string, number> = {};
  visibleMeetings.forEach((m) => { counts[m.status] = (counts[m.status] ?? 0) + 1; });

  return (
    <ProtectedLayout>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('nav.dashboard')}</h1>
            <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)] mt-0.5">
              <span>Home</span>
              <ChevronRight size={13} />
              <span className="text-[var(--text)]">{t('nav.dashboard')}</span>
            </div>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-1.5 text-[13px]">
            <Upload size={14} /> Upload Meeting
          </button>
        </div>

        {/* ── Greeting ── */}
        <p className="text-[14px] text-[var(--text-muted)] -mt-4">
          Good {greeting}, <span className="font-medium text-[var(--text)]">{user?.name ?? ''}</span>
        </p>

        {/* ── Quick Record ── */}
        <div className="card p-4">
          <p className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Video size={13} className="text-red-500" /> Record a Meeting Now
          </p>
          <div className="flex gap-2">
            <input
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickRecord()}
              placeholder="Paste Google Meet link — meet.google.com/xxx-xxxx-xxx"
              className="input flex-1 text-[13px]"
            />
            <button
              onClick={handleQuickRecord}
              disabled={recording || !meetLink.trim()}
              className="btn-primary flex items-center gap-2 text-[13px] px-4 disabled:opacity-50 shrink-0"
            >
              {recording ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />}
              {recording ? 'Starting…' : 'Record Now'}
            </button>
          </div>
          {recordMsg && (
            <p className={`text-[12px] mt-2 ${recordMsg.ok ? 'text-[var(--primary-deep)]' : 'text-[var(--danger)]'}`}>
              {recordMsg.text}
            </p>
          )}
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(['scheduled','recording','processing','completed','failed'] as const).map((st) => (
            <button
              key={st}
              className={`stat-card text-left ${filterStatus === st ? 'stat-card-active' : ''}`}
              onClick={() => { setFilterStatus(filterStatus === st ? '' : st); setPage(1); }}
            >
              <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">
                {t(`status.${st}`)}
              </p>
              <p className="text-[30px] font-extrabold text-[var(--text)] leading-none mt-1">
                {counts[st] ?? 0}
              </p>
            </button>
          ))}
        </div>

        {/* ── Meetings card ── */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatus(s); setPage(1); }}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-all duration-200
                              ${filterStatus === s
                                ? 'bg-[var(--primary)] text-[var(--text)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
                              }`}
                >
                  {s === '' ? 'All' : t(`status.${s}`)}
                </button>
              ))}
            </div>
            <button onClick={handleSync} disabled={syncing} className="btn-secondary gap-1.5 text-[12px] px-3 py-1.5">
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {t('btn.sync_calendar')}
            </button>
          </div>

          {status === 'loading' && (
            <p className="px-5 py-10 text-[13px] text-center text-[var(--text-muted)]">{t('common.loading')}</p>
          )}
          {error && (
            <p className="px-5 py-6 text-[13px] text-center text-[var(--danger)]">{t('common.error')}: {error}</p>
          )}
          {status === 'succeeded' && visibleMeetings.length === 0 && (
            <p className="px-5 py-10 text-[13px] text-center text-[var(--text-muted)]">{t('common.no_data')}</p>
          )}

          {visibleMeetings.length > 0 && (
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
                {visibleMeetings.map((m: Meeting) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/meetings/${m.id}`}
                        className="font-semibold text-[var(--text)] hover:text-[var(--primary-deep)] transition-colors">
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

          {total > 20 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
              <p className="text-[12px] text-[var(--text-muted)]">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40">Previous</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total}
                  className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>


        {/* ── Archived MOMs ── */}
        <div className="card p-0 overflow-hidden">
          <button
            onClick={() => setArchivesOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--surface-2)] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Archive size={14} className="text-amber-500" />
              <span className="text-[14px] font-semibold text-[var(--text)]">Archived MOMs</span>
              {archivedMOMs.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {archivedMOMs.length}
                </span>
              )}
            </div>
            {archivesOpen
              ? <ChevronUp size={14} className="text-[var(--text-muted)]" />
              : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
          </button>

          <AnimatePresence initial={false}>
            {archivesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-[var(--border)]"
              >
                {archivedMOMs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Archive size={22} className="text-amber-300" />
                    <p className="text-[13px] text-[var(--text-muted)]">No archived MOMs yet</p>
                    <p className="text-[12px] text-[var(--text-muted)]">Archive a MOM from its detail page to see it here</p>
                  </div>
                ) : (
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Meeting</th>
                        <th>Date</th>
                        <th>Archived On</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedMOMs.map((m) => (
                        <tr key={m.id} className="opacity-70 hover:opacity-100 transition-opacity">
                          <td>
                            <Link href={`/mom/${m.id}`}
                              className="font-semibold text-[var(--text)] hover:text-[var(--primary-deep)] transition-colors flex items-center gap-1.5">
                              <Archive size={11} className="text-amber-500 shrink-0" />
                              {m.meeting?.title || `MOM #${m.id}`}
                            </Link>
                          </td>
                          <td className="text-[var(--text-muted)] text-[12px]">
                            {m.meeting?.scheduled_at ? formatDate(m.meeting.scheduled_at, locale) : '—'}
                          </td>
                          <td className="text-[var(--text-muted)] text-[12px]">
                            {m.archived_at ? formatDate(m.archived_at, locale) : '—'}
                          </td>
                          <td>
                            {m.meeting?.status && <MeetingStatusBadge status={m.meeting.status as any} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {showUpload && (
        <UploadMeetingModal
          onClose={() => setShowUpload(false)}
          onCreated={() => load()}
        />
      )}
    </ProtectedLayout>
  );
}
