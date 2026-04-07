'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMeetings, Meeting } from '@/store/slices/meetingSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import MeetingStatusBadge from '@/components/meetings/MeetingStatusBadge';
import { api } from '@/services/api';

// Color dots per meeting status
const STATUS_DOT: Record<Meeting['status'], string> = {
  scheduled:  'bg-blue-400',
  recording:  'bg-red-500',
  processing: 'bg-amber-400',
  completed:  'bg-green-500',
  failed:     'bg-red-400',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const { meetings, status } = useSelector((s: RootState) => s.meetings);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [syncing, setSyncing]           = useState(false);

  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  useEffect(() => {
    // Fetch meetings for the visible month range
    const from = new Date(year, month, 1).toISOString();
    const to   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    dispatch(fetchMeetings({ from, to }));
  }, [dispatch, year, month]);

  // Build a map: "YYYY-MM-DD" → Meeting[]
  const meetingsByDay = new Map<string, Meeting[]>();
  meetings.forEach((m) => {
    const day = m.scheduled_at.slice(0, 10);
    if (!meetingsByDay.has(day)) meetingsByDay.set(day, []);
    meetingsByDay.get(day)!.push(m);
  });

  function prevMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/meetings/sync');
      const from = new Date(year, month, 1).toISOString();
      const to   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      dispatch(fetchMeetings({ from, to }));
    } catch {
      // swallow — backend may not be running
    } finally {
      setSyncing(false);
    }
  }

  const daysInMonth  = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfMonth(year, month); // 0=Sun

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const DAY_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedMeetings = selectedDate ? (meetingsByDay.get(selectedDate) ?? []) : [];

  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            {t('calendar.title', { defaultValue: 'Calendar' })}
          </h1>
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {t('calendar.sync', { defaultValue: 'Sync' })}
          </button>
        </div>

        {/* Month navigation */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <button
              className="p-1.5 rounded-lg hover:bg-[var(--bg)] transition-colors text-[var(--text-muted)]"
              onClick={prevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-[var(--text)]">{monthLabel}</span>
            <button
              className="p-1.5 rounded-lg hover:bg-[var(--bg)] transition-colors text-[var(--text-muted)]"
              onClick={nextMonth}
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day name headers */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-[var(--text-muted)] py-1">
                {d}
              </div>
            ))}

            {/* Empty cells before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum  = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayMeetings = meetingsByDay.get(dateStr) ?? [];
              const isToday    = dateStr === new Date().toISOString().slice(0, 10);
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={[
                    'flex flex-col items-center rounded-lg py-1.5 px-1 transition-colors text-sm',
                    isSelected  ? 'bg-[var(--primary)] text-white'          : '',
                    isToday && !isSelected ? 'font-bold text-[var(--primary)]' : 'text-[var(--text)]',
                    !isSelected ? 'hover:bg-[var(--bg)]' : '',
                  ].join(' ')}
                >
                  <span>{dayNum}</span>
                  {dayMeetings.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                      {dayMeetings.slice(0, 3).map((m, idx) => (
                        <span
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : STATUS_DOT[m.status]}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day meeting list */}
        {selectedDate && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-muted)]">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('default', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </h2>

            {status === 'loading' && (
              <p className="text-sm text-[var(--text-muted)]">
                {t('common.loading', { defaultValue: 'Loading…' })}
              </p>
            )}

            {selectedMeetings.length === 0 && status !== 'loading' && (
              <p className="text-sm text-[var(--text-muted)]">
                {t('calendar.no_meetings', { defaultValue: 'No meetings on this day.' })}
              </p>
            )}

            {selectedMeetings.map((m) => (
              <button
                key={m.id}
                className="card w-full text-left hover:border-[var(--primary)] hover:shadow-sm transition-all"
                onClick={() => router.push(`/meetings/${m.id}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--text)] truncate">{m.title}</span>
                  <MeetingStatusBadge status={m.status} />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {new Date(m.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
