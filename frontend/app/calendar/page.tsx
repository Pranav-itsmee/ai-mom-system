'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { RefreshCw, X, Calendar, Clock, User, ExternalLink } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMeetings, Meeting } from '@/store/slices/meetingSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import { api } from '@/services/api';
import type { EventClickArg } from '@fullcalendar/core';

// FullCalendar — dynamic import prevents module-level SVG assets from running on server
const CalendarWidget = dynamic(() => import('@/components/CalendarWidget'), { ssr: false });

// ── Status → colour mapping ───────────────────────────────────────────────────
const STATUS_COLOR: Record<Meeting['status'], string> = {
  scheduled:  '#3B82F6',
  recording:  '#EF4444',
  processing: '#F59E0B',
  completed:  '#10B981',
  failed:     '#F87171',
};

// ── Event detail modal ────────────────────────────────────────────────────────

interface EventModalProps {
  meeting: Meeting;
  onClose: () => void;
}

function EventModal({ meeting, onClose }: EventModalProps) {
  const { i18n } = useTranslation();
  const router   = useRouter();
  const locale   = i18n.language === 'ja' ? 'ja-JP' : 'en-US';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] rounded-[14px] shadow-theme-lg w-full max-w-sm p-5 z-10">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--text-muted)] transition-colors"
        >
          <X size={16} />
        </button>

        {/* Status badge */}
        <div className="mb-3">
          <MeetingStatusBadge status={meeting.status} />
        </div>

        {/* Title */}
        <h2 className="text-[16px] font-semibold text-[var(--text)] mb-4 pr-6 leading-snug">
          {meeting.title}
        </h2>

        {/* Details */}
        <div className="space-y-2.5 mb-5">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <Calendar size={14} className="shrink-0" />
            <span>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'full' })
                .format(new Date(meeting.scheduled_at))}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <Clock size={14} className="shrink-0" />
            <span>
              {new Intl.DateTimeFormat(locale, { timeStyle: 'short' })
                .format(new Date(meeting.scheduled_at))}
              {meeting.duration_seconds != null && (
                <span className="ml-1 text-[12px]">
                  · {Math.round(meeting.duration_seconds / 60)} min
                </span>
              )}
            </span>
          </div>
          {meeting.organizer && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <User size={14} className="shrink-0" />
              <span>{meeting.organizer.name}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={() => { router.push(`/meetings/${meeting.id}`); onClose(); }}
          className="btn-primary w-full flex items-center justify-center gap-2 text-[13px]"
        >
          <ExternalLink size={13} />
          View Meeting
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { meetings } = useSelector((s: RootState) => s.meetings);

  const [mounted,  setMounted]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [selected, setSelected] = useState<Meeting | null>(null);

  // FullCalendar requires browser APIs — only render after mount
  useEffect(() => {
    setMounted(true);
    // Load meetings for a wide range (±6 months) so all views are populated
    const from = new Date();
    from.setMonth(from.getMonth() - 3);
    const to = new Date();
    to.setMonth(to.getMonth() + 6);
    dispatch(fetchMeetings({ from: from.toISOString(), to: to.toISOString() }));
  }, [dispatch]);

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/meetings/sync');
      const from = new Date(); from.setMonth(from.getMonth() - 3);
      const to   = new Date(); to.setMonth(to.getMonth() + 6);
      dispatch(fetchMeetings({ from: from.toISOString(), to: to.toISOString() }));
    } catch { /* ignore */ } finally {
      setSyncing(false);
    }
  }

  // Convert meetings → FullCalendar events
  const events = meetings.map((m) => ({
    id:              String(m.id),
    title:           m.title,
    start:           m.scheduled_at,
    end:             m.duration_seconds
      ? new Date(new Date(m.scheduled_at).getTime() + m.duration_seconds * 1000).toISOString()
      : undefined,
    backgroundColor: STATUS_COLOR[m.status],
    borderColor:     STATUS_COLOR[m.status],
    textColor:       '#ffffff',
    extendedProps:   { meeting: m },
  }));

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-[var(--text)]">
              {t('calendar.title')}
            </h1>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              View and track your scheduled meetings
            </p>
          </div>
          <button
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {t('calendar.sync')}
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {(Object.entries(STATUS_COLOR) as [Meeting['status'], string][]).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          ))}
        </div>

        {/* FullCalendar — rendered client-only via dynamic import */}
        <div className="card p-0 overflow-hidden fc-theme-custom">
          {mounted ? (
            <CalendarWidget
              events={events}
              onEventClick={(info: EventClickArg) => {
                info.jsEvent.preventDefault();
                setSelected(info.event.extendedProps.meeting as Meeting);
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-[var(--text-muted)] text-[13px]">
              {t('common.loading')}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <EventModal meeting={selected} onClose={() => setSelected(null)} />
      )}
    </ProtectedLayout>
  );
}
