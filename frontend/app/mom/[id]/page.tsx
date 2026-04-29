'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  Pencil, RefreshCw, FileDown, Globe,
  Share2, ChevronDown, ChevronUp, AlertCircle, Loader2, UserCheck, Mail, X as XIcon,
  Archive, ArchiveRestore,
} from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById, KeyPoint } from '@/store/slices/momSlice';
import { Task } from '@/store/slices/taskSlice';
import { api } from '@/services/api';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { Toast, useToast } from '@/components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectLanguage(summary: string): 'ja' | 'en' {
  return summary.includes('---\n[English Translation]') ? 'ja' : 'en';
}

function isOverdue(deadline: string | null | undefined) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

const KNOWN_PREFIXES = [
  '[Agenda]', '[Discussion]', '[Decision]', '[Risk]',
  '[EN Agenda]', '[EN Discussion]', '[EN Decision]', '[EN Risk]',
  '[議題]', '[議論]', '[決定]', '[リスク]',
].sort((a, b) => b.length - a.length);

function parsePrefix(text: string): { prefix: string | null; rest: string } {
  for (const p of KNOWN_PREFIXES) {
    if (text.startsWith(p)) return { prefix: p, rest: text.slice(p.length).trimStart() };
  }
  const m = text.match(/^(\[[^\]]+\])\s*/);
  if (m) return { prefix: m[1], rest: text.slice(m[0].length) };
  return { prefix: null, rest: text };
}

// Split a paired "jp text\n[EN] en text" key point into its two parts.
function splitJpEn(text: string): { jp: string; en: string | null } {
  const idx = text.indexOf('\n[EN] ');
  if (idx !== -1) return { jp: text.slice(0, idx).trim(), en: text.slice(idx + 6).trim() };
  return { jp: text, en: null };
}

// legacyEn: used for old MOMs that stored EN as a separate row — passed in from the paired index
function KeyPointCell({ text, legacyEn }: { text: string; legacyEn?: string | null }) {
  const { rest } = parsePrefix(text);
  const { jp, en } = splitJpEn(rest);
  const displayEn = en ?? legacyEn ?? null;
  return (
    <Td>
      <span className="text-[var(--text)]">{jp}</span>
      {displayEn && (
        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 italic">{displayEn}</span>
      )}
    </Td>
  );
}


function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtShortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(iso));
}

// ── Attendee row with inline name edit ───────────────────────────────────────

function AttendeeRow({ index, attendee, displayName, displayEmail, isOrganizer, meetingId }: {
  index: number; attendee: any; displayName: string | null;
  displayEmail: string; isOrganizer: boolean; meetingId?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(displayName ?? '');
  const [saved,   setSaved]   = useState(displayName);
  const [saving,  setSaving]  = useState(false);

  async function save() {
    if (!meetingId || !attendee.id) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.patch(`/meetings/${meetingId}/attendees/${attendee.id}`, { name });
      setSaved(name || null);
      setEditing(false);
    } catch { /* keep editing open on error */ }
    finally { setSaving(false); }
  }

  const shownName = saved ?? '—';
  return (
    <tr className="hover:bg-[var(--bg)] transition-colors">
      <Td className="text-[var(--text-muted)] text-[12px]">{index + 1}</Td>
      <Td>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              className="input py-0.5 px-2 text-[13px] w-40"
            />
            <button onClick={save} disabled={saving}
              className="text-[11px] text-[var(--primary-deep)] font-semibold hover:underline disabled:opacity-50">
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 group">
            <span className="w-7 h-7 rounded-full bg-[var(--primary)]/20 text-[var(--primary-deep)] text-[11px] font-bold flex items-center justify-center shrink-0">
              {shownName !== '—' ? shownName.charAt(0).toUpperCase() : '?'}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[13px] text-[var(--text)] truncate">
                {displayEmail}
                {isOrganizer && (
                  <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-100 text-amber-700 border-amber-200">Host</span>
                )}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate flex items-center gap-1">
                {shownName !== '—' ? shownName : <span className="italic">No name</span>}
                <button
                  onClick={() => { setName(saved ?? ''); setEditing(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-[var(--primary-deep)]"
                  title="Edit name"
                >
                  <Pencil size={10} />
                </button>
              </p>
            </div>
          </div>
        )}
      </Td>
      <Td className="hidden">{null}</Td>
      <Td>
        {attendee.status === 'absent'
          ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-100 text-red-600 border-red-200">Absent</span>
          : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-green-100 text-green-700 border-green-200">Present</span>
        }
      </Td>
    </tr>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function DocSection({
  num, title, accentColor, children,
}: {
  num: number; title: string; accentColor: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
      style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className={`flex items-center gap-3 px-5 py-3 border-b-2 ${accentColor}`}>
        <span className="text-[12px] font-extrabold text-[var(--text-muted)] w-5 text-center">{num}.</span>
        <h3 className="text-[14px] font-bold text-[var(--text)] tracking-tight uppercase">{title}</h3>
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--surface-2)] border-b border-[var(--border)] ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-[13px] text-[var(--text)] border-b border-[var(--border)] align-top ${className}`}>
      {children}
    </td>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    discussed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200',
    resolved:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200',
    deferred:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200',
    escalated: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200',
    in_progress: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200',
    pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200',
  };
  const cls = map[status.toLowerCase()] ?? 'bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--border)]';
  const label = status === 'in_progress' ? 'In Progress'
    : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high:   'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low:    'bg-teal-100 text-teal-700 border-teal-200',
  };
  const cls = map[priority] ?? 'bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--border)]';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

// ── Reassign popover ──────────────────────────────────────────────────────────

interface ReassignUser {
  id: number;
  name: string;
  email: string;
  source?: 'attendee' | 'user';
  disabled?: boolean;
  note?: string;
}

function ReassignPopover({ taskId, currentAssigneeId, attendees = [], onReassigned }: {
  taskId: number;
  currentAssigneeId: number | null;
  attendees?: any[];
  onReassigned: (user: ReassignUser) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [users,   setUsers]   = useState<ReassignUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Attendee options computed first so loadUsers can safely reference them
  const attendeeOptions: ReassignUser[] = attendees
    .map((a: any, idx: number) => {
      const id    = a.user?.id ?? a.user_id ?? null;
      const name  = a.user?.name  ?? a.name  ?? a.user?.email ?? a.email ?? 'Unknown';
      const email = a.user?.email ?? a.email ?? '';
      return {
        id: id ?? -1 * (idx + 1),
        name,
        email,
        source:   'attendee' as const,
        disabled: !id,
        note:     id ? 'Attendee' : 'No account',
      };
    })
    .filter((a) => a.name !== 'Unknown' || a.email);

  async function loadUsers() {
    if (users.length) return;
    setLoading(true);
    try {
      const res      = await api.get('/users');
      const opts     = (res.data.users ?? []).map((u: any) => ({ ...u, source: 'user' as const }));
      const attIds   = new Set(attendeeOptions.filter((a) => !a.disabled).map((a) => a.id));
      setUsers([...attendeeOptions, ...opts.filter((u: ReassignUser) => !attIds.has(u.id))]);
    } catch (err) {
      console.error('[Reassign] loadUsers failed:', err);
      setUsers(attendeeOptions);
    } finally {
      setLoading(false);
    }
  }

  async function handlePick(u: ReassignUser) {
    if (u.disabled || saving) return;
    setSaving(true);
    try {
      await api.put(`/tasks/${taskId}`, { assignee_id: u.id, assigned_to: u.name });
      onReassigned(u);
      setOpen(false);
    } catch (err) {
      console.error('[Reassign] save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    loadUsers();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 text-[11px] text-[var(--primary-deep)] hover:text-[var(--text)] transition-colors font-semibold"
      >
        <UserCheck size={11} /> Reassign
      </button>

      {open && typeof window !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setOpen(false)}
          />
          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px' }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-theme-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <p className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Assign task to</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                <XIcon size={14} />
              </button>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }} className="py-1">
              {loading ? (
                <p className="px-4 py-3 text-[13px] text-[var(--text-muted)]">Loading users…</p>
              ) : users.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-[var(--text-muted)]">No users found.</p>
              ) : users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handlePick(u)}
                  disabled={saving || !!u.disabled}
                  className={[
                    'w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors',
                    u.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--bg)] cursor-pointer',
                    u.id === currentAssigneeId ? 'bg-[var(--primary)]/10' : '',
                  ].join(' ')}
                >
                  <span className="w-8 h-8 rounded-full bg-[var(--primary)]/20 text-[var(--primary-deep)] text-[12px] font-bold flex items-center justify-center shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[13px] font-medium truncate ${u.id === currentAssigneeId ? 'text-[var(--primary-deep)]' : 'text-[var(--text)]'}`}>
                      {u.name}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] truncate">
                      {u.email || u.note || ''}
                    </span>
                  </span>
                  {u.id === currentAssigneeId && (
                    <span className="shrink-0 text-[10px] font-bold text-[var(--primary-deep)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  )}
                  {u.disabled && (
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)]">No account</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportDropdown({ momId }: { momId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="btn-secondary flex items-center gap-1.5 text-[13px]">
        <FileDown size={14} /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 rounded-[10px] border border-[var(--border)]
                          bg-[var(--surface)] shadow-theme-md z-20 py-1">
            {(['pdf', 'docx'] as const).map((fmt) => (
              <button key={fmt}
                onClick={() => { window.open(`/api/v1/mom/${momId}/export?format=${fmt}`, '_blank'); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--bg)] text-[var(--text)] transition-colors capitalize">
                Export {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Share modal ───────────────────────────────────────────────────────────────

interface ShareAttendee { name: string; email: string; }

function ShareModal({ momId, onClose, attendees }: {
  momId: string; onClose: () => void; attendees: ShareAttendee[];
}) {
  const [tab,        setTab]        = useState<'email' | 'chat'>('email');
  const [selected,   setSelected]   = useState<Set<string>>(
    () => new Set(attendees.filter((a) => a.email).map((a) => a.email)),
  );
  const [extraEmail, setExtraEmail] = useState('');
  const [webhook,    setWebhook]    = useState('');
  const [sending,    setSending]    = useState(false);
  const [done,       setDone]       = useState('');
  const [err,        setErr]        = useState('');
  const [mounted,    setMounted]    = useState(false);
  useEffect(() => setMounted(true), []);

  function toggleEmail(email: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(email) ? n.delete(email) : n.add(email); return n; });
  }
  function buildRecipients() {
    const extras = extraEmail.split(',').map((s) => s.trim()).filter(Boolean);
    return [...Array.from(selected), ...extras.filter((e) => !selected.has(e))];
  }

  async function send() {
    setErr(''); setDone(''); setSending(true);
    try {
      if (tab === 'email') {
        const r = buildRecipients();
        if (!r.length) { setErr('Select at least one recipient.'); setSending(false); return; }
        await api.post(`/mom/${momId}/share/email`, { emails: r });
        setDone(`Email sent to ${r.length} recipient${r.length > 1 ? 's' : ''}!`);
      } else {
        if (!webhook.trim()) { setErr('Webhook URL is required.'); setSending(false); return; }
        await api.post(`/mom/${momId}/share/googlechat`, { webhook_url: webhook.trim() });
        setDone('Message sent to Google Chat!');
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Failed to send.');
    } finally { setSending(false); }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{    opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(90vh, 600px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Share2 size={14} className="text-[var(--primary-deep)]" />
            <h2 className="text-[15px] font-bold text-[var(--text)]">Share MOM</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors">
            <XIcon size={14} />
          </button>
        </div>
        <div className="flex border-b border-[var(--border)] shrink-0">
          {(['email', 'chat'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={['flex-1 py-2.5 text-[13px] font-semibold transition-colors',
                tab === t ? 'text-[var(--primary-deep)] border-b-2 border-[var(--primary-deep)]'
                           : 'text-[var(--text-muted)] hover:text-[var(--text)]'].join(' ')}>
              {t === 'email' ? '✉ Email' : '💬 Google Chat'}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {done && <p className="text-[12px] text-[var(--success)] bg-[var(--success)]/10 px-3 py-2 rounded-lg">{done}</p>}
          {err  && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-lg">{err}</p>}
          {tab === 'email' ? (
            <>
              {attendees.filter((a) => a.email).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Participants</label>
                    <button onClick={() => selected.size === attendees.filter((a) => a.email).length
                        ? setSelected(new Set()) : setSelected(new Set(attendees.filter((a) => a.email).map((a) => a.email)))}
                      className="text-[11px] text-[var(--primary-deep)] hover:text-[var(--text)] transition-colors">
                      {selected.size === attendees.filter((a) => a.email).length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {attendees.filter((a) => a.email).map((a, i) => (
                      <label key={i} className={['flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors',
                        selected.has(a.email) ? 'border-[var(--primary-deep)] bg-[var(--primary)]/8'
                                               : 'border-[var(--border)] bg-[var(--surface-3)] hover:border-[var(--border-2)]'].join(' ')}>
                        <input type="checkbox" checked={selected.has(a.email)} onChange={() => toggleEmail(a.email)}
                          className="w-3.5 h-3.5 accent-[var(--primary-deep)]" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text)] truncate">{a.name}</p>
                          <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] truncate">
                            <Mail size={10} className="shrink-0" />{a.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Additional Recipients</label>
                <input value={extraEmail} onChange={(e) => setExtraEmail(e.target.value)}
                  placeholder="extra@company.com, client@example.com" className="input w-full" />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  {buildRecipients().length} total recipient{buildRecipients().length !== 1 ? 's' : ''} selected.
                </p>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Google Chat Webhook URL</label>
              <input value={webhook} onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://chat.googleapis.com/v1/spaces/..." className="input w-full" />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Paste your Google Chat space webhook URL.</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)] shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={send} disabled={sending} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
            {sending ? 'Sending…' : 'Share'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MOMPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMOM, status, error } = useSelector((s: RootState) => s.mom);

  const [regenerating,   setRegenerating]   = useState(false);
  const [shareOpen,      setShareOpen]      = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [archiving,      setArchiving]      = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  // Local task state for optimistic reassign updates
  const [localTasks, setLocalTasks] = useState<Task[]>([]);

  useEffect(() => {
    dispatch(fetchMOMById(params.id));
  }, [dispatch, params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remoteTasks = (currentMOM?.tasks ?? []) as Task[];
  useEffect(() => {
    setLocalTasks(remoteTasks);
  }, [currentMOM]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleReassigned(taskId: number, user: ReassignUser) {
    setLocalTasks((prev) => prev.map((t) =>
      t.id === taskId
        ? { ...t, assignee_id: user.id, assigned_to: user.name, assignee: { id: user.id, name: user.name, email: user.email } }
        : t,
    ));
  }

  async function handleArchive() {
    if (!currentMOM) return;
    const isArchived = (currentMOM as any).is_archived;
    if (!confirm(isArchived ? 'Unarchive this MOM?' : 'Archive this MOM? It will be moved to the Archives section.')) return;
    setArchiving(true);
    try {
      await api.patch(`/mom/${params.id}/archive`);
      dispatch(fetchMOMById(params.id));
      showToast(isArchived ? 'MOM unarchived' : 'MOM archived', 'success');
    } catch {
      showToast('Failed to update archive status', 'error');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api.post(`/mom/${params.id}/regenerate`);
      showToast('Regeneration started — refresh shortly', 'success');
      setTimeout(() => dispatch(fetchMOMById(params.id)), 5000);
    } catch {
      showToast('Failed to start regeneration', 'error');
    } finally {
      setRegenerating(false);
    }
  }

  const language = currentMOM ? detectLanguage(currentMOM.summary) : null;
  const isLoading = status === 'loading';
  const meeting   = (currentMOM as any)?.meeting;

  // Categorise key points.
  // New MOMs: JP and EN paired inline as "[議題] jp\n[EN] en" — KeyPointCell splits them.
  // Old MOMs: JP and EN stored as separate rows with [EN Agenda] etc. prefixes.
  //           We collect the legacy EN rows by category and pair them by index with JP rows.
  const AGENDA_PFX     = ['[Agenda]',    '[議題]'];
  const DISCUSSION_PFX = ['[Discussion]','[議論]'];
  const DECISION_PFX   = ['[Decision]',  '[決定]'];
  const RISK_PFX       = ['[Risk]',      '[リスク]'];
  const LEGACY_EN_PFX  = ['[EN Agenda]', '[EN Discussion]', '[EN Decision]', '[EN Risk]'];

  const keyPoints      = (currentMOM?.keyPoints ?? []) as KeyPoint[];
  const agendaPoints   = keyPoints.filter((kp) => AGENDA_PFX.some((p) => kp.point_text.startsWith(p)));
  const discussionPts  = keyPoints.filter((kp) => DISCUSSION_PFX.some((p) => kp.point_text.startsWith(p)));
  const decisionPoints = keyPoints.filter((kp) => DECISION_PFX.some((p) => kp.point_text.startsWith(p)));
  const riskPoints     = keyPoints.filter((kp) => RISK_PFX.some((p) => kp.point_text.startsWith(p)));

  // Legacy separate EN rows — used to provide translations for old MOMs
  const legacyEnAgenda     = keyPoints.filter((kp) => kp.point_text.startsWith('[EN Agenda]'));
  const legacyEnDiscussion = keyPoints.filter((kp) => kp.point_text.startsWith('[EN Discussion]'));
  const legacyEnDecision   = keyPoints.filter((kp) => kp.point_text.startsWith('[EN Decision]'));

  const otherPoints    = keyPoints.filter((kp) =>
    ![...AGENDA_PFX, ...DISCUSSION_PFX, ...DECISION_PFX, ...RISK_PFX, ...LEGACY_EN_PFX].some((p) => kp.point_text.startsWith(p))
  );

  // Agenda + Discussion merged rows — carry legacy EN text by index for old MOMs
  const agendaDiscRows = [
    ...agendaPoints.map((kp, i) => ({
      ...kp, type: 'agenda' as const,
      legacyEn: legacyEnAgenda[i] ? parsePrefix(legacyEnAgenda[i].point_text).rest : null,
    })),
    ...discussionPts.map((kp, i) => ({
      ...kp, type: 'discussion' as const,
      legacyEn: legacyEnDiscussion[i] ? parsePrefix(legacyEnDiscussion[i].point_text).rest : null,
    })),
  ];

  // Meeting attendees
  const attendees: any[] = meeting?.attendees ?? [];

  // Section counter — only shows sections with data
  let sectionCounter = 0;
  function nextSection(hasData: boolean) {
    if (hasData) return ++sectionCounter;
    return 0;
  }

  const SEC = {
    details:   nextSection(Boolean(meeting)),
    attendees: nextSection(attendees.length > 0),
    agenda:    nextSection(agendaDiscRows.length > 0),
    decisions: nextSection(decisionPoints.length > 0),
    actions:   nextSection(localTasks.length > 0),
    risks:     nextSection(riskPoints.length > 0 || otherPoints.length > 0),
  };

  return (
    <ProtectedLayout>
      <motion.div
        className="max-w-5xl mx-auto space-y-4"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* ── Header row ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <nav className="text-[12px] text-[var(--text-muted)] flex items-center gap-1 mb-1">
              <Link href="/meetings" className="hover:text-[var(--primary-deep)] transition-colors">Meetings</Link>
              {currentMOM?.meeting_id && (
                <>
                  <span>/</span>
                  <Link href={`/meetings/${currentMOM.meeting_id}`}
                    className="hover:text-[var(--primary-deep)] transition-colors">Meeting</Link>
                </>
              )}
              <span>/</span>
              <span className="text-[var(--text)]">MOM</span>
            </nav>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold text-[var(--text)]">
                {meeting?.title ?? `MOM #${params.id}`}
              </h1>
              {language && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  language === 'ja'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200'
                }`}>
                  <Globe size={10} />
                  {language === 'ja' ? t('mom.language.ja') : t('mom.language.en')}
                </span>
              )}
            </div>
            {currentMOM?.is_edited && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                <Pencil size={10} />
                Last edited{currentMOM.editor ? ` by ${(currentMOM as any).editor.name}` : ''}
                {currentMOM.edited_at ? ` · ${new Date(currentMOM.edited_at).toLocaleString()}` : ''}
              </p>
            )}
          </div>

          {currentMOM && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button onClick={() => setShareOpen(true)}
                className="btn-secondary flex items-center gap-1.5 text-[13px]">
                <Share2 size={13} /> Share
              </button>
              <Link href={`/mom/${params.id}/edit`}
                className="btn-secondary flex items-center gap-1.5 text-[13px]">
                <Pencil size={13} /> {t('btn.edit_mom')}
              </Link>
              <ExportDropdown momId={params.id} />
              <button onClick={handleArchive} disabled={archiving}
                className={`btn-secondary flex items-center gap-1.5 text-[13px] disabled:opacity-50 ${
                  (currentMOM as any).is_archived ? 'text-amber-600' : ''
                }`}>
                {(currentMOM as any).is_archived
                  ? <><ArchiveRestore size={13} /> Unarchive</>
                  : <><Archive size={13} /> Archive</>}
              </button>
              <button onClick={handleRegenerate} disabled={regenerating}
                className="btn-secondary flex items-center gap-1.5 text-[13px] disabled:opacity-50">
                <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                {regenerating ? 'Regenerating…' : t('btn.regenerate')}
              </button>
            </div>
          )}
        </div>

        {/* ── Loading / Error ── */}
        {isLoading && !currentMOM && (
          <div className="card flex items-center justify-center h-40 gap-2 text-[var(--text-muted)] text-[13px]">
            <Loader2 size={18} className="animate-spin" /> {t('common.loading')}
          </div>
        )}
        {!isLoading && error && (
          <div className="card text-[var(--accent)] text-[13px]">{t('common.error')}: {error}</div>
        )}
        {!isLoading && !error && !currentMOM && (
          <div className="card text-[var(--text-muted)] text-[13px] text-center py-10">{t('mom.not_available')}</div>
        )}

        {currentMOM && (
          <motion.div
            className="space-y-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          >

            {/* ── DOCUMENT TITLE BANNER ── */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
              className="rounded-xl border-2 border-[var(--primary-deep)] bg-[var(--primary)]/5 px-6 py-4 text-center"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary-deep)] mb-1">Minutes of Meeting</p>
              <h2 className="text-[22px] font-extrabold text-[var(--text)] leading-tight">{meeting?.title ?? `MOM #${params.id}`}</h2>
              {meeting?.scheduled_at && (
                <p className="text-[13px] text-[var(--text-muted)] mt-1">{fmtDate(meeting.scheduled_at)}</p>
              )}
            </motion.div>

            {/* ── SECTION 1: Meeting Details ── */}
            {SEC.details > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.details} title="Meeting Details" accentColor="border-[var(--primary-deep)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
                    {[
                      { label: 'Date & Time',   value: fmtDate(meeting?.scheduled_at) },
                      { label: 'Venue / Platform', value: meeting?.location || (meeting?.meet_link ? 'Google Meet (Online)' : '—') },
                      { label: 'Host',    value: (meeting as any)?.organizer_name  ?? meeting?.organizer?.name  ?? '—' },
                      { label: 'Contact', value: (meeting as any)?.organizer_email ?? meeting?.organizer?.email ?? '—' },
                      { label: 'Meeting Type',  value: meeting?.meet_link ? 'Virtual' : 'In-Person' },
                      { label: 'MOM Reference', value: `MOM-${String(params.id).padStart(4, '0')}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col px-5 py-3.5 border-b border-[var(--border)] last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-r-[var(--border)]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-0.5">{label}</span>
                        <span className="text-[13px] text-[var(--text)] font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                  {meeting?.meet_link && (
                    <div className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Meet Link:</span>
                      <a href={meeting.meet_link} target="_blank" rel="noreferrer"
                        className="text-[12px] text-[var(--primary-deep)] hover:underline truncate">
                        {meeting.meet_link}
                      </a>
                    </div>
                  )}
                  {currentMOM.summary && (
                    <div className="px-5 py-4 border-t border-[var(--border)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Purpose / Objective</p>
                      <p className="text-[13px] text-[var(--text)] leading-relaxed">{currentMOM.summary}</p>
                    </div>
                  )}
                </DocSection>
              </motion.div>
            )}

            {/* ── SECTION 2: Attendees ── */}
            {SEC.attendees > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.attendees} title="Attendees" accentColor="border-blue-500">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th className="w-8">#</Th>
                          <Th>Attendee</Th>
                          <Th className="hidden">{null}</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendees.map((a: any, i: number) => {
                          const displayEmail = a.user?.email ?? a.email ?? '—';
                          const displayName  = a.user?.name ?? a.name ?? null;
                          const isOrganizer  =
                            (meeting?.organizer_id && a.user?.id === meeting.organizer_id) ||
                            ((meeting as any)?.organizer_email && displayEmail === (meeting as any).organizer_email);
                          return (
                            <AttendeeRow
                              key={a.id ?? i}
                              index={i}
                              attendee={a}
                              displayName={displayName}
                              displayEmail={displayEmail}
                              isOrganizer={isOrganizer}
                              meetingId={currentMOM?.meeting_id}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </DocSection>
              </motion.div>
            )}

            {/* ── SECTION 3: Agenda & Discussion Points ── */}
            {SEC.agenda > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.agenda} title="Agenda & Discussion Points" accentColor="border-purple-500">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th className="w-12">#</Th>
                          <Th className="w-20">Type</Th>
                          <Th>Topic / Discussion</Th>
                          <Th className="w-28">Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {agendaDiscRows.map((kp, i) => {
                          const isAgenda = kp.type === 'agenda';
                          return (
                            <tr key={kp.id} className="hover:bg-[var(--bg)] transition-colors">
                              <Td className="text-[var(--text-muted)] font-mono text-[12px]">
                                {isAgenda ? `A${agendaPoints.indexOf(kp as any) + 1}` : `D${discussionPts.indexOf(kp as any) + 1}`}
                              </Td>
                              <Td>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  isAgenda
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-purple-100 text-purple-700 border-purple-200'
                                }`}>
                                  {isAgenda ? 'Agenda' : 'Discussion'}
                                </span>
                              </Td>
                              <KeyPointCell text={kp.point_text} legacyEn={(kp as any).legacyEn} />
                              <Td>
                                <StatusBadge status={isAgenda ? 'discussed' : 'discussed'} />
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </DocSection>
              </motion.div>
            )}

            {/* ── SECTION 4: Decisions Made ── */}
            {SEC.decisions > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.decisions} title="Decisions Made" accentColor="border-green-500">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th className="w-12">Ref</Th>
                          <Th>Decision</Th>
                          <Th className="w-28">Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {decisionPoints.map((kp, i) => {
                          const legacyEn = legacyEnDecision[i] ? parsePrefix(legacyEnDecision[i].point_text).rest : null;
                          return (
                            <tr key={kp.id} className="hover:bg-[var(--bg)] transition-colors">
                              <Td className="text-[var(--primary-deep)] font-bold font-mono text-[12px]">D{i + 1}</Td>
                              <KeyPointCell text={kp.point_text} legacyEn={legacyEn} />
                              <Td><StatusBadge status="resolved" /></Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </DocSection>
              </motion.div>
            )}

            {/* ── SECTION 5: Action Items ── */}
            {SEC.actions > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.actions} title="Action Items" accentColor="border-amber-500">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th className="w-12">Ref</Th>
                          <Th>Task</Th>
                          <Th className="w-36">Owner</Th>
                          <Th className="w-28">Due Date</Th>
                          <Th className="w-20">Priority</Th>
                          <Th className="w-28">Status</Th>
                          <Th className="w-24">Action</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {localTasks.map((task, i) => {
                          const overdue = isOverdue(task.deadline) && task.status !== 'completed';
                          const ownerName = task.assignee?.name ?? task.assigned_to ?? '—';
                          return (
                            <tr key={task.id} className="hover:bg-[var(--bg)] transition-colors">
                              <Td className="text-[var(--accent)] font-bold font-mono text-[12px]">A{i + 1}</Td>
                              <Td>
                                <p className="font-semibold text-[var(--text)]">{task.title}</p>
                                {task.description && (
                                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{task.description}</p>
                                )}
                              </Td>
                              <Td>
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {ownerName !== '—' ? ownerName.charAt(0).toUpperCase() : '?'}
                                  </span>
                                  <span className="text-[12px]">{ownerName}</span>
                                </div>
                              </Td>
                              <Td>
                                <span className={`text-[12px] flex items-center gap-1 ${overdue ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                                  {task.deadline
                                    ? fmtShortDate(task.deadline + 'T00:00:00')
                                    : '—'}
                                  {overdue && <AlertCircle size={10} />}
                                </span>
                              </Td>
                              <Td><PriorityBadge priority={task.priority} /></Td>
                              <Td><StatusBadge status={task.status} /></Td>
                              <Td>
                                <ReassignPopover
                                  taskId={task.id}
                                  currentAssigneeId={task.assignee_id ?? null}
                                  attendees={attendees}
                                  onReassigned={(u) => handleReassigned(task.id, u)}
                                />
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </DocSection>
              </motion.div>
            )}

            {/* ── SECTION 6: Risks & Blockers / Notes ── */}
            {SEC.risks > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                <DocSection num={SEC.risks} title="Risks, Blockers & Notes" accentColor="border-red-400">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th className="w-12">Ref</Th>
                          <Th>Description</Th>
                          <Th className="w-24">Severity</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...riskPoints, ...otherPoints].map((kp, i) => {
                          const { prefix, rest } = parsePrefix(kp.point_text);
                          const isRisk = RISK_PFX.some((p) => kp.point_text.startsWith(p));
                          return (
                            <tr key={kp.id} className="hover:bg-[var(--bg)] transition-colors">
                              <Td className="text-red-500 font-bold font-mono text-[12px]">R{i + 1}</Td>
                              <Td>{rest}</Td>
                              <Td>
                                {isRisk
                                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-100 text-red-700 border-red-200">Risk</span>
                                  : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--border)]">Note</span>
                                }
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </DocSection>
              </motion.div>
            )}

            {/* ── Raw Transcript ── */}
            {(currentMOM as any).raw_transcript && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
              >
                <button
                  onClick={() => setTranscriptOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <span className="text-[13px] font-bold text-[var(--text)] flex items-center gap-2">
                    <FileDown size={13} className="text-[var(--text-muted)]" />
                    Raw Transcript
                  </span>
                  {transcriptOpen ? <ChevronUp size={13} className="text-[var(--text-muted)]" /> : <ChevronDown size={13} className="text-[var(--text-muted)]" />}
                </button>
                <AnimatePresence initial={false}>
                  {transcriptOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-[var(--border)]"
                    >
                      <pre className="m-4 max-h-96 overflow-y-auto text-[12px] text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed font-mono bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
                        {(currentMOM as any).raw_transcript}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {shareOpen && (
          <ShareModal
            momId={params.id}
            onClose={() => setShareOpen(false)}
            attendees={(meeting?.attendees ?? []).map((a: any) => ({
              name:  a.user?.name  ?? a.name  ?? (meeting as any)?.organizer_name  ?? 'Unknown',
              email: a.user?.email ?? a.email ?? '',
            }))}
          />
        )}
      </AnimatePresence>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </ProtectedLayout>
  );
}
