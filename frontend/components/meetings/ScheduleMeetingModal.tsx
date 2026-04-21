'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Link2, MapPin, Users, Loader2 } from 'lucide-react';
import { api } from '@/services/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function ScheduleMeetingModal({ onClose, onCreated }: Props) {
  const [title,    setTitle]    = useState('');
  const [dateTime, setDateTime] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [location, setLocation] = useState('');
  const [emails,   setEmails]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim() || !dateTime) {
      setError('Title and date/time are required.');
      return;
    }
    setLoading(true);
    try {
      const attendee_emails = emails.split(',').map((s) => s.trim()).filter(Boolean);
      await api.post('/meetings', {
        title:        title.trim(),
        scheduled_at: new Date(dateTime).toISOString(),
        meet_link:    meetLink.trim() || undefined,
        location:     location.trim() || undefined,
        attendee_emails,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to create meeting.');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{    opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)]
                     overflow-hidden flex flex-col"
          style={{ maxHeight: 'min(90vh, 640px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/20 flex items-center justify-center">
                <Calendar size={14} className="text-[var(--primary-deep)]" />
              </div>
              <h2 className="text-[15px] font-bold text-[var(--text)]">Schedule Meeting</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <p className="text-[12px] text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <div>
                <label className="block text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                  Meeting Title *
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Weekly sync / Product review…"
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                  Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                  <Link2 size={11} /> Google Meet Link
                </label>
                <input
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                  <MapPin size={11} /> Location
                </label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Conference Room A / Online"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                  <Users size={11} /> Attendee Emails
                  <span className="font-normal text-[var(--text-light)]">(comma-separated)</span>
                </label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="alice@company.com, bob@company.com"
                  rows={2}
                  className="input w-full resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1 pb-1">
                <button type="button" onClick={onClose} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Creating…' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
