'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, User } from 'lucide-react';
import MeetingStatusBadge from './MeetingStatusBadge';
import type { Meeting } from '@/store/slices/meetingSlice';

function formatDuration(secs: number | null) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'ja' ? 'ja-JP' : 'en-US';

  const date = new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(meeting.scheduled_at));

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(meeting.scheduled_at));

  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div className="card hover:shadow-theme-sm transition-all cursor-pointer group py-3.5">
        <div className="flex items-center justify-between gap-4">
          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text)]
                          group-hover:text-primary transition-colors truncate">
              {meeting.title}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Calendar size={10} /> {date}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Clock size={10} /> {time}
              </span>
              {meeting.duration_seconds && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  {formatDuration(meeting.duration_seconds)}
                </span>
              )}
              {meeting.organizer && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <User size={10} /> {meeting.organizer.name}
                </span>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className="shrink-0">
            <MeetingStatusBadge status={meeting.status} />
          </div>
        </div>
      </div>
    </Link>
  );
}
