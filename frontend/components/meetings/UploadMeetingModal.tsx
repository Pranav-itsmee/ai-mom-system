'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileAudio, Calendar, MapPin, Users, Loader2, CheckCircle, Film } from 'lucide-react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadMeetingModal({ onClose, onCreated }: Props) {
  const [title,    setTitle]    = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [emails,   setEmails]   = useState('');
  const [file,     setFile]     = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState<{ meetingId: number } | null>(null);
  const [mounted,  setMounted]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router  = useRouter();

  useEffect(() => { setMounted(true); }, []);

  function handleFile(f: File) {
    setFile(f);
    setError('');
    if (!title) {
      setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim() || !dateTime) { setError('Title and date/time are required.'); return; }
    if (!file) { setError('Please select a recording file.'); return; }

    setLoading(true);
    setProgress(0);

    try {
      const form = new FormData();
      form.append('title',        title.trim());
      form.append('scheduled_at', new Date(dateTime).toISOString());
      if (location.trim()) form.append('location', location.trim());
      if (emails.trim())   form.append('attendee_emails', emails.trim());
      form.append('file', file);

      const token   = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

      const res = await axios.post(`${baseURL}/meetings/upload`, form, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      setDone({ meetingId: res.data.meeting.id });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Upload failed. Please try again.');
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
        onClick={!loading && !done ? onClose : undefined}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{    opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col"
          style={{ maxHeight: 'min(92vh, 720px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center">
                <Upload size={15} className="text-[var(--primary-deep)]" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text)]">Upload Meeting Recording</h2>
                <p className="text-[11px] text-[var(--text-muted)]">MOM will be auto-generated after upload</p>
              </div>
            </div>
            {!loading && (
              <button onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors">
                <X size={15} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {done ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center justify-center py-14 gap-5 px-8 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
                >
                  <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                </motion.div>
                <div>
                  <p className="text-[17px] font-bold text-[var(--text)]">Recording Uploaded!</p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                    MOM generation has started. Processing typically takes 1–5 minutes
                    depending on recording length.
                  </p>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => router.push(`/meetings/${done.meetingId}`)}
                    className="btn-primary text-[13px]"
                  >
                    View Meeting
                  </button>
                  <button onClick={onClose} className="btn-secondary text-[13px]">Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {error && (
                  <p className="text-[12px] text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-lg">{error}</p>
                )}

                {/* ── Drop zone ── */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !loading && fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2.5 cursor-pointer transition-all ${
                    dragging
                      ? 'border-[var(--primary-deep)] bg-[var(--primary)]/8'
                      : file
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/10 cursor-default'
                      : 'border-[var(--border)] hover:border-[var(--primary-deep)] hover:bg-[var(--surface-3)]'
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".mp3,.mp4,.webm,.wav,.m4a,.ogg,.flac"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {file ? (
                    <>
                      <FileAudio size={30} className="text-green-500" />
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-[var(--text)]">{file.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{formatBytes(file.size)}</p>
                      </div>
                      {!loading && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          className="text-[11px] text-[var(--danger)] hover:underline"
                        >
                          Remove file
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <Film size={30} className="text-[var(--text-muted)]" />
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-[var(--text)]">
                          Drop recording here or <span className="text-[var(--primary-deep)]">click to browse</span>
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          MP3, MP4, WebM, WAV, M4A, OGG · max 500 MB
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Upload progress ── */}
                {loading && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" />
                        {progress < 100 ? 'Uploading file…' : 'Starting MOM generation…'}
                      </span>
                      <span className="font-semibold">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[var(--primary-deep)]"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}

                {/* ── Meeting details ── */}
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                    Meeting Title *
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Q2 Planning / Sprint Review / All-Hands…"
                    className="input w-full"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                    Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="input w-full"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                    <MapPin size={11} /> Location / Platform
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Conference Room A / Google Meet / Zoom"
                    className="input w-full"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] mb-1.5">
                    <Users size={11} /> Attendee Emails
                    <span className="font-normal text-[var(--text-light)]">(comma-separated, optional)</span>
                  </label>
                  <textarea
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    placeholder="alice@company.com, bob@company.com"
                    rows={2}
                    className="input w-full resize-none"
                    disabled={loading}
                  />
                </div>

                <div className="flex gap-2 pt-1 pb-1">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="btn-ghost flex-1 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !file}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading
                      ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                      : <><Upload size={14} /> Upload &amp; Generate MOM</>
                    }
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
