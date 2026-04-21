'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, CheckSquare, CalendarDays, Clock, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import {
  fetchNotifications,
  markRead,
  markAllRead,
  Notification,
} from '@/store/slices/notificationSlice';

const TYPE_ICON = {
  task_assigned:    <CheckSquare size={13} className="text-[var(--primary-deep)]" />,
  task_deadline:    <Clock       size={13} className="text-[var(--danger)]"       />,
  meeting_starting: <CalendarDays size={13} className="text-[var(--secondary)]"  />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationDropdown() {
  const dispatch = useDispatch<AppDispatch>();
  const { items, unreadCount } = useSelector((s: RootState) => s.notifications);

  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch on mount and every 60s
  useEffect(() => {
    dispatch(fetchNotifications());
    const id = setInterval(() => dispatch(fetchNotifications()), 60_000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function handleClick(n: Notification) {
    if (!n.is_read) dispatch(markRead(n.id));
    setOpen(false);
    if (n.meeting_id) router.push(`/mom/${n.meeting_id}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg
                   hover:bg-[var(--surface-3)] border border-transparent
                   hover:border-[var(--border)]
                   text-[var(--text-muted)] hover:text-[var(--text)]
                   transition-all duration-200 active:scale-95"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full
                       bg-[var(--danger)] text-white text-[9px] font-bold
                       flex items-center justify-center px-0.5 leading-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1     }}
            exit={{    opacity: 0, y: -6, scale: 0.97  }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 rounded-2xl border border-[var(--border)]
                       bg-[var(--surface)] shadow-theme-lg z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-[var(--primary-deep)]" />
                <span className="text-[13px] font-bold text-[var(--text)]">Notifications</span>
                {unreadCount > 0 && (
                  <span className="badge badge-danger text-[10px]">{unreadCount}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => dispatch(markAllRead())}
                    className="flex items-center gap-1 text-[11px] text-[var(--primary-deep)]
                               hover:text-[var(--text)] transition-colors px-2 py-1 rounded"
                    title="Mark all as read"
                  >
                    <CheckCheck size={12} />
                    <span className="hidden sm:inline">All read</span>
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Bell size={22} className="text-[var(--text-muted)] opacity-40" />
                  <p className="text-[13px] text-[var(--text-muted)]">All caught up!</p>
                </div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={[
                      'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                      'hover:bg-[var(--bg)] border-b border-[var(--border)] last:border-0',
                      !n.is_read ? 'bg-[var(--primary)]/8' : '',
                    ].join(' ')}
                  >
                    <div className="w-6 h-6 rounded-lg bg-[var(--surface-3)] flex items-center justify-center shrink-0 mt-0.5">
                      {TYPE_ICON[n.type] ?? <Bell size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--text)] leading-snug">
                        {n.title}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-[var(--text-light)] mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[var(--primary-deep)] mt-1 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
