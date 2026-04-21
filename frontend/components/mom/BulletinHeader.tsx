'use client';

import { motion } from 'framer-motion';
import { CalendarDays, Clock, MapPin, Mail, Users, Building2, Hash } from 'lucide-react';

interface Attendee {
  id?: number;
  user?: { id: number; name: string; email: string };
  email?: string;
  name?: string;
}

interface Meeting {
  id: number;
  title: string;
  scheduled_at: string;
  location?: string | null;
  meet_link?: string | null;
  organizer?: { id: number; name: string; email: string } | null;
  attendees?: Attendee[];
}

interface Props {
  meeting: Meeting;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

const AVATAR_BG = ['#3A8899', '#E8804C', '#6B8FD4', '#5CB8A0', '#C084FC', '#F59E0B'];
function avatarColor(i: number) { return AVATAR_BG[i % AVATAR_BG.length]; }

export default function BulletinHeader({ meeting }: Props) {
  const dateObj  = new Date(meeting.scheduled_at);
  const dateStr  = dateObj.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr  = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const location = meeting.location || (meeting.meet_link ? 'Google Meet (Online)' : 'Not specified');

  const attendees: Array<{ name: string; email: string }> = (meeting.attendees ?? []).map((a) => ({
    name:  a.user?.name  ?? a.name  ?? 'Unknown',
    email: a.user?.email ?? a.email ?? '',
  }));
  const host = meeting.organizer;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      {/* Accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-[var(--primary-deep)] via-[var(--secondary)] to-[var(--accent)]" />

      {/* ── TITLE ── */}
      <div className="px-6 pt-5 pb-4 border-b border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-[var(--primary-deep)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-0.5">
              Minutes of Meeting
            </p>
            <h2 className="text-[20px] font-bold text-[var(--text)] leading-tight">{meeting.title}</h2>
            <div className="flex items-center gap-1.5 mt-1 text-[12px] text-[var(--text-muted)]">
              <Hash size={11} />
              <span>Meeting ID: {meeting.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── DATE / TIME / LOCATION ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
        <div className="flex items-start gap-3 px-6 py-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/15 flex items-center justify-center shrink-0">
            <CalendarDays size={14} className="text-[var(--primary-deep)]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Date</p>
            <p className="text-[13px] font-semibold text-[var(--text)] leading-tight">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 px-6 py-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--secondary)]/15 flex items-center justify-center shrink-0">
            <Clock size={14} className="text-[var(--secondary)]" style={{ filter: 'brightness(0.75)' }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Time</p>
            <p className="text-[13px] font-semibold text-[var(--text)] leading-tight">{timeStr}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 px-6 py-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Location</p>
            <p className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">{location}</p>
          </div>
        </div>
      </div>

      {/* ── HOST ── */}
      {host && (
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-2)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">Host</p>
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
              style={{ background: avatarColor(0) }}
            >
              {initials(host.name)}
            </span>
            <div>
              <p className="text-[14px] font-bold text-[var(--text)]">{host.name}</p>
              <a
                href={`mailto:${host.email}`}
                className="flex items-center gap-1 text-[12px] text-[var(--primary-deep)] hover:underline"
              >
                <Mail size={11} />
                {host.email}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── PARTICIPANTS ── */}
      {attendees.length > 0 && (
        <div className="px-6 py-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3">
            <Users size={13} className="text-[var(--primary-deep)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Participants
            </p>
            <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full
                             bg-[var(--primary)]/15 text-[var(--primary-deep)] text-[11px] font-bold">
              {attendees.length} {attendees.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attendees.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-3)]
                           border border-[var(--border)] hover:border-[var(--primary-deep)]/40 transition-colors"
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ background: avatarColor(i + 1) }}
                >
                  {initials(a.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text)] truncate">{a.name}</p>
                  {a.email && (
                    <a
                      href={`mailto:${a.email}`}
                      className="flex items-center gap-1 text-[11px] text-[var(--primary-deep)] hover:underline truncate"
                    >
                      <Mail size={10} className="shrink-0" />
                      <span className="truncate">{a.email}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
