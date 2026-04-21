'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { RefreshCw, X, Calendar, Clock, User, ExternalLink, Globe, Video, AlignLeft, MapPin } from 'lucide-react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { api } from '@/services/api';
import type { EventClickArg } from '@fullcalendar/core';

const CalendarWidget = dynamic(() => import('@/components/CalendarWidget'), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  meetLink: string | null;
  organizer: string | null;
  htmlLink: string | null;
}

type FilterKey = 'all' | 'meetings' | 'allday' | 'events';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All'          },
  { key: 'meetings', label: 'With Meet'    },
  { key: 'events',   label: 'Events'       },
  { key: 'allday',   label: 'All-day'      },
];

// Color per filter type
function eventColor(e: GCalEvent): string {
  if (e.meetLink)  return '#8B5CF6'; // purple — has Meet link
  if (e.allDay)    return '#F59E0B'; // amber  — all-day
  return '#3B82F6';                  // blue   — regular event
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventModal({ event, onClose }: { event: GCalEvent; onClose: () => void }) {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';
  const start  = event.start ? new Date(event.start) : null;
  const end    = event.end   ? new Date(event.end)   : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] rounded-[14px] shadow-theme-lg w-full max-w-sm p-5 z-10">
        <button onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--text-muted)] transition-colors">
          <X size={16} />
        </button>

        {/* Type badge */}
        <div className="mb-3">
          {event.meetLink ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              <Video size={10} /> Google Meet
            </span>
          ) : event.allDay ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Calendar size={10} /> All-day
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <Globe size={10} /> Event
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-[16px] font-semibold text-[var(--text)] mb-4 pr-6 leading-snug">
          {event.title}
        </h2>

        <div className="space-y-2.5 mb-5">
          {start && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <Calendar size={14} className="shrink-0" />
              <span>{new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(start)}</span>
            </div>
          )}
          {start && !event.allDay && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <Clock size={14} className="shrink-0" />
              <span>
                {new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(start)}
                {end && ` – ${new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(end)}`}
              </span>
            </div>
          )}
          {event.organizer && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <User size={14} className="shrink-0" />
              <span>{event.organizer}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.description && (
            <div className="flex items-start gap-2 text-[13px] text-[var(--text-muted)]">
              <AlignLeft size={14} className="shrink-0 mt-0.5" />
              <span className="line-clamp-3 leading-relaxed">{event.description}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {event.meetLink && (
            <a href={event.meetLink} target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 text-[13px]">
              <Video size={13} /> Join Meeting
            </a>
          )}
          {event.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2 text-[13px]">
              <ExternalLink size={13} /> Open in Google Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t } = useTranslation();

  const [mounted,       setMounted]       = useState(false);
  const [gcalEvents,    setGcalEvents]    = useState<GCalEvent[]>([]);
  const [gcalLoading,   setGcalLoading]   = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [connecting,    setConnecting]    = useState(false);
  const [activeFilter,  setActiveFilter]  = useState<FilterKey>('all');
  const [selected,      setSelected]      = useState<GCalEvent | null>(null);

  function loadEvents() {
    const from = new Date(); from.setMonth(from.getMonth() - 3);
    const to   = new Date(); to.setMonth(to.getMonth() + 6);
    setGcalLoading(true);
    api.get('/meetings/calendar-events', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then((res) => {
        setGcalConnected(res.data.connected !== false);
        setGcalEvents(res.data.events || []);
      })
      .catch(() => { setGcalConnected(false); setGcalEvents([]); })
      .finally(() => setGcalLoading(false));
  }

  useEffect(() => { setMounted(true); loadEvents(); }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await api.get('/auth/google/connect');
      window.location.href = res.data.url;
    } catch { setConnecting(false); }
  }

  // Apply filter
  const filtered = gcalEvents.filter((e) => {
    if (activeFilter === 'meetings') return !!e.meetLink;
    if (activeFilter === 'allday')   return e.allDay;
    if (activeFilter === 'events')   return !e.allDay && !e.meetLink;
    return true;
  });

  // Count per filter
  const counts: Record<FilterKey, number> = {
    all:      gcalEvents.length,
    meetings: gcalEvents.filter((e) => !!e.meetLink).length,
    allday:   gcalEvents.filter((e) => e.allDay).length,
    events:   gcalEvents.filter((e) => !e.allDay && !e.meetLink).length,
  };

  // FullCalendar events
  const calEvents = filtered.map((e) => {
    const color = eventColor(e);
    return {
      id:              `gc-${e.id}`,
      title:           e.title,
      start:           e.start,
      end:             e.end || undefined,
      allDay:          e.allDay,
      backgroundColor: color,
      borderColor:     color,
      textColor:       '#ffffff',
      extendedProps:   { gcalEvent: e },
    };
  });

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
              {gcalLoading
                ? 'Loading…'
                : gcalConnected
                  ? `${filtered.length} of ${gcalEvents.length} events`
                  : 'Connect Google Calendar to see your events'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {gcalConnected === false && (
              <button onClick={handleConnect} disabled={connecting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold
                           bg-[#8B5CF6] text-white hover:bg-[#7C3AED] transition-colors disabled:opacity-60">
                <Globe size={13} />
                {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
              </button>
            )}
            {gcalConnected && (
              <button onClick={loadEvents} disabled={gcalLoading}
                className="btn-secondary flex items-center gap-1.5 text-[13px]">
                <RefreshCw size={13} className={gcalLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Not connected banner */}
        {gcalConnected === false && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30">
            <Globe size={18} className="text-[#8B5CF6] shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#8B5CF6]">Google Calendar not connected</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                Connect your account to view all your calendar events, meetings, and reminders.
              </p>
            </div>
            <button onClick={handleConnect} disabled={connecting}
              className="shrink-0 px-3 py-1.5 bg-[#8B5CF6] text-white rounded-lg text-[12px] font-semibold
                         hover:bg-[#7C3AED] transition-colors disabled:opacity-60">
              {connecting ? 'Redirecting…' : 'Connect'}
            </button>
          </div>
        )}

        {/* Filter tabs + color legend */}
        {gcalConnected && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              {FILTER_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                    activeFilter === key
                      ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeFilter === key
                      ? 'bg-[var(--primary)]/20 text-[var(--primary-deep)]'
                      : 'bg-[var(--border)] text-[var(--text-muted)]'
                  }`}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>

            {/* Color legend */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" /> With Meet
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /> Events
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" /> All-day
              </span>
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="card p-0 overflow-hidden fc-theme-custom">
          {mounted ? (
            <CalendarWidget
              events={calEvents}
              onEventClick={(info: EventClickArg) => {
                info.jsEvent.preventDefault();
                setSelected(info.event.extendedProps.gcalEvent as GCalEvent);
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
        <EventModal event={selected} onClose={() => setSelected(null)} />
      )}
    </ProtectedLayout>
  );
}
