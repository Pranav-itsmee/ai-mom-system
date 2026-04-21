'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  History, ChevronDown, ChevronUp, Clock, User, CalendarDays,
  Pencil, AlertCircle, Search, X as XIcon, CheckCircle2,
  Plus, Trash2, Users,
} from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { fetchMOMById, updateMOM, clearMOM } from '@/store/slices/momSlice';
import { Task } from '@/store/slices/taskSlice';
import { api } from '@/services/api';
import { Toast, useToast } from '@/components/ui/Toast';
import KeyPointsList from './KeyPointsList';
import TaskEditor from '@/components/tasks/TaskEditor';

interface Props {
  momId: string | number;
}

interface Version {
  id: number;
  summary: string;
  key_points_json: string | null;
  archived_at: string;
  archivedByUser?: { id: number; name: string } | null;
}

function isOverdue(deadline: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

export default function MOMEditor({ momId }: Props) {
  const { t } = useTranslation();
  const router   = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { currentMOM, status, error } = useSelector((s: RootState) => s.mom);

  const [summary,   setSummary]   = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving,    setSaving]    = useState(false);

  // Version history
  const [versions,      setVersions]      = useState<Version[]>([]);
  const [versionsOpen,  setVersionsOpen]  = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [restoring,     setRestoring]     = useState(false);

  // Task editing
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Host & Attendees
  const [hostName,       setHostName]       = useState('');
  const [hostEmail,      setHostEmail]      = useState('');
  const [attendeesList,  setAttendeesList]  = useState<{ name: string; email: string; status: 'present' | 'absent' }[]>([]);
  const [savingInfo,     setSavingInfo]     = useState(false);
  const [infoOpen,       setInfoOpen]       = useState(false);
  const originalAttendeesRef = useRef<{ name: string; email: string }[]>([]);

  // Find & Replace
  const [replaceOpen,    setReplaceOpen]    = useState(false);
  const [findText,       setFindText]       = useState('');
  const [replaceText,    setReplaceText]    = useState('');
  const [caseSensitive,  setCaseSensitive]  = useState(false);
  const [replacing,      setReplacing]      = useState(false);
  const [replaceResult,  setReplaceResult]  = useState<{ count: number; detail: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  // Always fetch fresh — avoids stale data when navigating between MOMs
  useEffect(() => {
    dispatch(fetchMOMById(momId));
  }, [dispatch, momId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentMOM && String(currentMOM.id) === String(momId)) {
      setSummary(currentMOM.summary ?? '');
      setKeyPoints((currentMOM.keyPoints ?? []).map((kp) => kp.point_text));

      const mtg = (currentMOM as any).meeting;
      setHostName(mtg?.organizer?.name ?? mtg?.organizer_name ?? '');
      setHostEmail(mtg?.organizer?.email ?? mtg?.organizer_email ?? '');
      const mapped = (mtg?.attendees ?? []).map((a: any) => ({
        name:   a.user?.name  ?? a.name  ?? '',
        email:  a.user?.email ?? a.email ?? '',
        status: (a.status === 'absent' ? 'absent' : 'present') as 'present' | 'absent',
      }));
      setAttendeesList(mapped);
      originalAttendeesRef.current = mapped.map(({ name, email }) => ({ name, email }));
    }
  }, [currentMOM, momId]);

  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const matchCount = useMemo(() => {
    if (!findText.trim()) return 0;
    const re = new RegExp(escapeRegex(findText), caseSensitive ? 'g' : 'gi');
    let n = [...(summary.matchAll(re))].length;
    keyPoints.forEach((kp) => { n += [...kp.matchAll(re)].length; });
    (currentMOM?.tasks as Task[] ?? []).forEach((t) => {
      n += [...t.title.matchAll(re)].length;
      if (t.description) n += [...t.description.matchAll(re)].length;
    });
    return n;
  }, [findText, caseSensitive, summary, keyPoints, currentMOM]);

  async function handleReplaceAll() {
    if (!findText.trim() || !currentMOM) return;
    setReplacing(true);
    setReplaceResult(null);

    try {
      const re = new RegExp(escapeRegex(findText), caseSensitive ? 'g' : 'gi');

      // Compute new values before touching state
      const newSummary   = summary.replace(re, replaceText);
      const newKeyPoints = keyPoints.map((kp) => kp.replace(re, replaceText));

      const summaryCount = [...summary.matchAll(re)].length;
      const kpCount      = keyPoints.reduce((n, kp) => n + [...kp.matchAll(re)].length, 0);

      // Persist summary + key points to DB immediately
      await dispatch(
        updateMOM({ id: currentMOM.id, summary: newSummary, key_points: newKeyPoints.filter((p) => p.trim()) })
      ).unwrap();

      // Update local state after DB save
      setSummary(newSummary);
      setKeyPoints(newKeyPoints);

      // Replace in tasks
      let taskCount = 0;
      const allTasks = (currentMOM.tasks as Task[] ?? []);
      for (const task of allTasks) {
        re.lastIndex = 0;
        const titleMatches = [...task.title.matchAll(re)].length;
        re.lastIndex = 0;
        const descMatches  = task.description ? [...task.description.matchAll(re)].length : 0;
        if (titleMatches + descMatches === 0) continue;
        taskCount += titleMatches + descMatches;
        re.lastIndex = 0;
        await api.put(`/tasks/${task.id}`, {
          title:       task.title.replace(re, replaceText),
          description: task.description ? task.description.replace(re, replaceText) : task.description,
        });
        re.lastIndex = 0;
      }
      if (taskCount > 0) dispatch(fetchMOMById(momId));

      const total = summaryCount + kpCount + taskCount;
      setReplaceResult({
        count: total,
        detail: `${summaryCount} in summary · ${kpCount} in key points · ${taskCount} in tasks`,
      });
      setFindText('');
      showToast(`Replaced ${total} occurrence${total !== 1 ? 's' : ''} and saved`, 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Replace failed', 'error');
    } finally {
      setReplacing(false);
    }
  }

  async function handleSaveInfo() {
    const meetingId = (currentMOM as any)?.meeting?.id;
    if (!meetingId) {
      showToast('Meeting ID not found — try refreshing the page', 'error');
      return;
    }
    setSavingInfo(true);
    try {
      await api.patch(`/meetings/${meetingId}/info`, {
        organizer_name:  hostName.trim()  || null,
        organizer_email: hostEmail.trim() || null,
        attendees: attendeesList.filter((a) => a.email?.trim() || a.name?.trim()),
      });

      // Update tasks whose assigned_to text matches a renamed attendee
      const renames = originalAttendeesRef.current
        .map((old, i) => ({ from: old.name, to: attendeesList[i]?.name ?? '' }))
        .filter(({ from, to }) => from && to && from !== to);

      if (renames.length > 0) {
        const allTasks = (currentMOM?.tasks as Task[] ?? []);
        for (const { from, to } of renames) {
          for (const task of allTasks) {
            if ((task.assigned_to === from || task.assignee?.name === from) && !task.assignee_id) {
              await api.put(`/tasks/${task.id}`, { assigned_to: to });
            }
          }
        }
      }

      await dispatch(fetchMOMById(momId));
      showToast('Host & attendees saved', 'success');
      setInfoOpen(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Failed to save';
      showToast(msg, 'error');
      console.error('[handleSaveInfo]', e);
    } finally {
      setSavingInfo(false);
    }
  }

  function handleSummaryInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setSummary(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (el && summary) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [summary]);

  async function handleSave() {
    if (!currentMOM) return;
    setSaveError('');
    setSaving(true);
    try {
      const cleanPoints = keyPoints.filter((p) => p.trim().length > 0);
      await dispatch(
        updateMOM({ id: currentMOM.id, summary, key_points: cleanPoints })
      ).unwrap();
      showToast('MOM saved — original archived', 'success');
      setTimeout(() => router.push(`/mom/${currentMOM.id}`), 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save MOM';
      setSaveError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (currentMOM) router.push(`/mom/${currentMOM.id}`);
    else router.back();
  }

  async function loadVersions() {
    if (versionsLoaded) return;
    try {
      const res = await api.get(`/mom/${momId}/versions`);
      setVersions(res.data.versions ?? []);
      setVersionsLoaded(true);
    } catch {}
  }

  async function restoreVersion(v: Version) {
    if (!confirm(`Restore version from ${new Date(v.archived_at).toLocaleString()}? Your current draft will be replaced.`)) return;
    setRestoring(true);
    try {
      const pts = v.key_points_json ? JSON.parse(v.key_points_json) as string[] : keyPoints;
      setSummary(v.summary);
      setKeyPoints(pts);
      setVersionsOpen(false);
      showToast('Version restored — click Save to apply', 'success');
    } catch {
      showToast('Failed to restore version', 'error');
    } finally {
      setRestoring(false);
    }
  }

  function handleTaskSaved() {
    dispatch(fetchMOMById(momId));
  }

  useEffect(() => {
    return () => { dispatch(clearMOM()); };
  }, [dispatch]);

  if (status === 'loading' && !currentMOM) {
    return (
      <div className="card flex items-center justify-center h-40 text-[var(--text-muted)]">
        {t('common.loading')}
      </div>
    );
  }

  if (status === 'failed' && error && !currentMOM) {
    return (
      <div className="card text-[var(--accent)] text-sm p-6">
        {t('common.error')}: {error}
      </div>
    );
  }

  if (!currentMOM) return null;

  const isBusy = saving || status === 'loading';
  const tasks  = (currentMOM.tasks ?? []) as Task[];

  return (
    <div className="space-y-5">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--text)]">Edit MOM</h1>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {(currentMOM as any).meeting?.title ?? `MOM #${currentMOM.id}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSave} disabled={isBusy || !summary.trim()} className="btn-primary">
            {isBusy ? 'Saving…' : t('btn.save')}
          </button>
          <button type="button" onClick={handleCancel} disabled={isBusy} className="btn-secondary">
            {t('btn.cancel')}
          </button>
        </div>
      </div>

      {/* ── Find & Replace ── */}
      <div className="card p-0 overflow-hidden">
        <button
          onClick={() => { setReplaceOpen((o) => !o); setReplaceResult(null); }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search size={13} className="text-[var(--primary-deep)]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Find &amp; Replace All
            </span>
          </div>
          {replaceOpen
            ? <ChevronUp size={13} className="text-[var(--text-muted)]" />
            : <ChevronDown size={13} className="text-[var(--text-muted)]" />}
        </button>

        {replaceOpen && (
          <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Find</label>
                <div className="relative">
                  <input
                    value={findText}
                    onChange={(e) => { setFindText(e.target.value); setReplaceResult(null); }}
                    placeholder="Text to find…"
                    className="input w-full pr-16 text-[13px]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {findText && (
                      <button onClick={() => setFindText('')} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                        <XIcon size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => setCaseSensitive((c) => !c)}
                      title="Case sensitive"
                      className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                        caseSensitive
                          ? 'bg-[var(--primary-deep)] text-white'
                          : 'bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      Aa
                    </button>
                  </div>
                </div>
                {findText.trim() && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {matchCount === 0 ? 'No matches' : `${matchCount} match${matchCount !== 1 ? 'es' : ''} found`}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Replace with</label>
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Replacement text…"
                  className="input w-full text-[13px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleReplaceAll}
                disabled={replacing || !findText.trim() || matchCount === 0}
                className="btn-primary text-[13px] px-4 disabled:opacity-50"
              >
                {replacing ? 'Replacing…' : `Replace All${matchCount > 0 ? ` (${matchCount})` : ''}`}
              </button>
              <p className="text-[11px] text-[var(--text-muted)]">
                Applies to summary, key points, and action items
              </p>
            </div>

            {replaceResult && (
              <div className="flex items-start gap-2 text-[12px] text-[var(--primary-deep)] bg-[var(--primary)]/8 border border-[var(--primary-deep)]/20 rounded-lg px-3 py-2">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{replaceResult.count}</strong> replacement{replaceResult.count !== 1 ? 's' : ''} made
                  <span className="text-[var(--text-muted)] ml-1">— {replaceResult.detail}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Host & Attendees ── */}
      <div className="card p-0 overflow-hidden">
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users size={13} className="text-[var(--primary-deep)]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Host &amp; Attendees
            </span>
            {attendeesList.length > 0 && (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary-deep)] text-[11px] font-bold">
                {attendeesList.length}
              </span>
            )}
          </div>
          {infoOpen
            ? <ChevronUp size={13} className="text-[var(--text-muted)]" />
            : <ChevronDown size={13} className="text-[var(--text-muted)]" />}
        </button>

        {infoOpen && (
          <div className="border-t border-[var(--border)] px-5 py-4 space-y-5">

            {/* Host row */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Host</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Host name"
                  className="input w-full text-[13px]"
                />
                <input
                  value={hostEmail}
                  onChange={(e) => setHostEmail(e.target.value)}
                  placeholder="host@company.com"
                  className="input w-full text-[13px]"
                  type="email"
                />
              </div>
            </div>

            {/* Attendees rows */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Attendees</p>
              <div className="space-y-2">
                {attendeesList.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={a.name}
                      onChange={(e) => setAttendeesList((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Name"
                      className="input flex-1 text-[13px]"
                    />
                    <input
                      value={a.email}
                      onChange={(e) => setAttendeesList((prev) => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                      placeholder="email@company.com"
                      className="input flex-1 text-[13px]"
                      type="email"
                    />
                    <button
                      title={a.status === 'present' ? 'Mark absent' : 'Mark present'}
                      onClick={() => setAttendeesList((prev) => prev.map((x, j) => j === i ? { ...x, status: x.status === 'present' ? 'absent' : 'present' } : x))}
                      className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        a.status === 'absent'
                          ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                      }`}
                    >
                      {a.status === 'absent' ? 'Absent' : 'Present'}
                    </button>
                    <button
                      onClick={() => setAttendeesList((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] rounded-lg hover:bg-[var(--surface-3)] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setAttendeesList((prev) => [...prev, { name: '', email: '', status: 'present' as const }])}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--primary-deep)] hover:text-[var(--text)] transition-colors mt-1"
                >
                  <Plus size={13} /> Add attendee
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveInfo}
              disabled={savingInfo}
              className="btn-primary text-[13px] px-4 disabled:opacity-50"
            >
              {savingInfo ? 'Saving…' : 'Save Host & Attendees'}
            </button>
          </div>
        )}
      </div>

      {/* ── Previously edited notice ── */}
      {currentMOM.is_edited && (
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2">
          <Pencil size={12} />
          Previously edited
          {currentMOM.editor ? ` by ${currentMOM.editor.name}` : ''}
          {currentMOM.edited_at ? ` · ${new Date(currentMOM.edited_at).toLocaleString()}` : ''}
        </div>
      )}

      {/* ── 1. Summary ── */}
      <div className="card space-y-3">
        <label htmlFor="mom-summary"
          className="block text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('mom.summary')}
        </label>
        <textarea
          id="mom-summary"
          ref={textareaRef}
          className="input resize-none overflow-hidden leading-relaxed"
          rows={6}
          value={summary}
          onChange={handleSummaryInput}
          placeholder="Executive summary of the meeting…"
          disabled={isBusy}
        />
      </div>

      {/* ── 2. Key Points ── */}
      <div className="card space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('mom.key_points')}
          <span className="ml-1.5 font-normal text-[var(--text-light)]">
            (prefix with [Agenda], [Discussion], or [Decision])
          </span>
        </p>
        <KeyPointsList points={keyPoints} onChange={setKeyPoints} />
      </div>

      {/* ── 3. Action Items (Tasks) ── */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Action Items
          </p>
          {tasks.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary-deep)] text-[11px] font-bold">
              {tasks.length}
            </span>
          )}
        </div>

        {tasks.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--text-muted)]">
            No action items assigned to this meeting
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {tasks.map((task) => {
              const overdue = isOverdue(task.deadline ?? null) && task.status !== 'completed';
              return (
                <div key={task.id} className="px-5 py-3 flex items-start gap-4 hover:bg-[var(--bg)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--text)] truncate">{task.title}</p>
                    {task.description && (
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                      {/* Assignee */}
                      {(task.assignee?.name || task.assigned_to) && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                          <User size={10} />
                          {task.assignee?.name ?? task.assigned_to}
                        </span>
                      )}
                      {/* Deadline */}
                      {task.deadline && (
                        <span className={`flex items-center gap-1 text-[11px] ${overdue ? 'text-[var(--danger)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                          <CalendarDays size={10} />
                          {task.deadline}
                          {overdue && <AlertCircle size={10} />}
                        </span>
                      )}
                      {/* Status badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        task.status === 'completed'   ? 'bg-green-100 text-green-700 border-green-200' :
                        task.status === 'in_progress' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                                        'bg-blue-100 text-blue-700 border-blue-200'
                      }`}>
                        {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                      </span>
                      {/* Priority badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        task.priority === 'high'   ? 'bg-red-100 text-red-700 border-red-200' :
                        task.priority === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                     'bg-teal-100 text-teal-700 border-teal-200'
                      }`}>
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingTask(task)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[var(--primary-deep)]
                               hover:bg-[var(--surface-3)] px-2 py-1 rounded-lg transition-colors"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Version History ── */}
      <div className="card p-0 overflow-hidden">
        <button
          onClick={() => { setVersionsOpen((o) => !o); if (!versionsOpen) loadVersions(); }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <History size={13} className="text-[var(--primary-deep)]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Version History
            </span>
            {versionsLoaded && versions.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary-deep)] text-[11px] font-bold">
                {versions.length}
              </span>
            )}
          </div>
          {versionsOpen
            ? <ChevronUp size={13} className="text-[var(--text-muted)]" />
            : <ChevronDown size={13} className="text-[var(--text-muted)]" />}
        </button>

        {versionsOpen && (
          <div className="border-t border-[var(--border)]">
            {!versionsLoaded ? (
              <p className="px-5 py-4 text-[12px] text-[var(--text-muted)]">Loading…</p>
            ) : versions.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-[var(--text-muted)]">
                No previous versions yet — the original will be archived when you save.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-[var(--bg)] transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Clock size={11} className="text-[var(--text-muted)] shrink-0" />
                        <span className="text-[12px] font-semibold text-[var(--text)]">
                          {new Date(v.archived_at).toLocaleString()}
                        </span>
                      </div>
                      {v.archivedByUser && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                          <User size={10} />
                          Archived by {v.archivedByUser.name}
                        </span>
                      )}
                      <p className="text-[12px] text-[var(--text-muted)] mt-1 line-clamp-2">{v.summary}</p>
                    </div>
                    <button
                      onClick={() => restoreVersion(v)}
                      disabled={restoring}
                      className="shrink-0 text-[11px] font-semibold text-[var(--primary-deep)] hover:bg-[var(--surface-3)] px-2 py-1 rounded-lg transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {saveError && (
        <p className="text-sm text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      {/* ── Task Editor modal ── */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={handleTaskSaved}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
