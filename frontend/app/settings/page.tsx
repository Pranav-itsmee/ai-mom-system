'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { ChevronRight, UserCircle, Globe, CheckCircle, XCircle, UserPlus, Trash2, X } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { setTheme, setLanguage } from '@/store/slices/uiSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { api } from '@/services/api';

interface SystemUser { id: number; name: string; email: string; role: string; created_at: string; }

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:5000';

export default function SettingsPage() {
  const { t }    = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const user     = useSelector((s: RootState) => s.auth.user);

  const [gcalConnected,  setGcalConnected]  = useState<boolean | null>(null);
  const [gcalLoading,    setGcalLoading]    = useState(false);
  const [connecting,     setConnecting]     = useState(false);
  const [disconnecting,  setDisconnecting]  = useState(false);
  const [gcalMsg,        setGcalMsg]        = useState<string | null>(null);

  // User management (admin only)
  const [users,       setUsers]       = useState<SystemUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addForm,     setAddForm]     = useState({ name: '', email: '', password: '', role: 'member' });
  const [addErr,      setAddErr]      = useState<string | null>(null);
  const [addLoading,  setAddLoading]  = useState(false);
  const [deleting,    setDeleting]    = useState<number | null>(null);

  useEffect(() => {
    api.get('/auth/google/status')
      .then((r) => setGcalConnected(r.data.connected))
      .catch(() => setGcalConnected(false));
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/users').then((r) => setUsers(r.data.users)).catch(() => {});
    }
  }, [user?.role]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddErr(null);
    setAddLoading(true);
    try {
      const res = await api.post('/users', addForm);
      setUsers((prev) => [...prev, res.data.user].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm({ name: '', email: '', password: '', role: 'member' });
      setShowAddUser(false);
    } catch (err: any) {
      setAddErr(err.response?.data?.error ?? 'Failed to create user');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteUser(id: number) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await api.get('/auth/google/connect');
      window.location.href = res.data.url;
    } catch {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await api.delete('/auth/google/disconnect');
      setGcalConnected(false);
      setGcalMsg('Google Calendar disconnected.');
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`)
    : null;

  const initials = (user?.name ?? '')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <ProtectedLayout>
      <div className="max-w-xl mx-auto space-y-5">

        <h1 className="text-[20px] font-semibold text-[var(--text)]">
          {t('settings.title')}
        </h1>

        {/* ── Profile quick-link ── */}
        <Link
          href="/profile"
          className="card flex items-center gap-4 hover:shadow-theme-sm hover:border-[var(--primary)]
                     transition-all group no-underline"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={user?.name ?? ''}
              className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/60
                            flex items-center justify-center shrink-0 text-[var(--primary-deep)] font-bold text-[15px]">
              {initials || <UserCircle size={22} />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[var(--text)] truncate">{user?.name}</p>
            <p className="text-[12px] text-[var(--text-muted)] truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[12px] text-[var(--primary-deep)] font-semibold group-hover:underline">
              Edit Profile
            </span>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
          </div>
        </Link>

        {/* ── Theme ── */}
        <section className="card space-y-3">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.theme')}
          </h2>
          <div className="flex gap-3">
            {(['light', 'dark'] as const).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border
                            text-[13px] font-medium transition-colors
                  ${theme === opt
                    ? 'border-[var(--primary-deep)] bg-[var(--primary)]/20 text-[var(--primary-deep)] font-semibold'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'}`}
              >
                <input type="radio" name="theme" value={opt} checked={theme === opt}
                  onChange={() => dispatch(setTheme(opt))} className="sr-only" />
                {opt === 'light' ? '☀️ Light' : '🌙 Dark'}
              </label>
            ))}
          </div>
        </section>

        {/* ── Language ── */}
        <section className="card space-y-3">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('settings.language')}
          </h2>
          <div className="flex gap-3">
            {([
              { value: 'en', label: 'English',  flag: '🇺🇸' },
              { value: 'ja', label: '日本語',   flag: '🇯🇵' },
            ] as const).map(({ value, label, flag }) => (
              <label
                key={value}
                className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-xl border
                            text-[13px] font-medium transition-colors
                  ${language === value
                    ? 'border-[var(--primary-deep)] bg-[var(--primary)]/20 text-[var(--primary-deep)] font-semibold'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'}`}
              >
                <input type="radio" name="language" value={value} checked={language === value}
                  onChange={() => dispatch(setLanguage(value))} className="sr-only" />
                {flag} {label}
              </label>
            ))}
          </div>
        </section>

        {/* ── Google Calendar ── */}
        <section className="card space-y-3">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Google Calendar
          </h2>

          {gcalMsg && (
            <p className={`text-[12px] px-3 py-2 rounded-lg font-medium
              ${gcalMsg.includes('success') || gcalMsg.includes('disconnected')
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
              {gcalMsg}
            </p>
          )}

          <div className="flex items-center gap-3">
            {gcalConnected === null ? (
              <span className="text-[13px] text-[var(--text-muted)]">Checking…</span>
            ) : gcalConnected ? (
              <>
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                <span className="text-[13px] text-[var(--text)] flex-1">
                  Google Calendar connected — your events appear on the calendar page.
                </span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="shrink-0 text-[12px] text-red-500 hover:text-red-600 font-semibold disabled:opacity-60"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            ) : (
              <>
                <XCircle size={16} className="text-[var(--text-muted)] shrink-0" />
                <span className="text-[13px] text-[var(--text-muted)] flex-1">
                  Not connected. Connect to see your personal Google Calendar events.
                </span>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#8B5CF6] text-white
                             rounded-lg text-[12px] font-semibold hover:bg-[#7C3AED] transition-colors
                             disabled:opacity-60"
                >
                  <Globe size={12} />
                  {connecting ? 'Redirecting…' : 'Connect Google'}
                </button>
              </>
            )}
          </div>

          {!gcalConnected && (
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Each user connects their own Google account. Your calendar data is private and only visible to you.
            </p>
          )}
        </section>

        {/* ── User Management (admin only) ── */}
        {user?.role === 'admin' && (
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                User Management
              </h2>
              <button
                onClick={() => { setShowAddUser(true); setAddErr(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] text-white
                           rounded-lg text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                <UserPlus size={13} />
                Add User
              </button>
            </div>

            {/* User list */}
            <div className="divide-y divide-[var(--border)]">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/60
                                  flex items-center justify-center shrink-0 text-[var(--primary-deep)] font-bold text-[11px]">
                    {u.name.split(' ').map((w) => w[0]?.toUpperCase()).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text)] truncate">
                      {u.name}
                      {u.id === user.id && (
                        <span className="ml-1.5 text-[10px] text-[var(--primary-deep)] font-semibold">(you)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{u.email}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full
                    ${u.role === 'admin'
                      ? 'bg-[var(--primary)]/20 text-[var(--primary-deep)]'
                      : 'bg-[var(--border)] text-[var(--text-muted)]'}`}>
                    {u.role}
                  </span>
                  {u.id !== user.id && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={deleting === u.id}
                      className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500
                                 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                      title="Delete user"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)] py-2">No users found.</p>
              )}
            </div>

            {/* Add User form (inline slide-down) */}
            {showAddUser && (
              <form onSubmit={handleAddUser}
                className="border border-[var(--border)] rounded-xl p-4 space-y-3 bg-[var(--bg)]">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-semibold text-[var(--text)]">New User</p>
                  <button type="button" onClick={() => setShowAddUser(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text)]">
                    <X size={15} />
                  </button>
                </div>

                {addErr && (
                  <p className="text-[12px] text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                    {addErr}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Full Name</label>
                    <input
                      className="input w-full text-[13px]"
                      placeholder="e.g. Yuki Tanaka"
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Email</label>
                    <input
                      type="email"
                      className="input w-full text-[13px]"
                      placeholder="user@company.com"
                      value={addForm.email}
                      onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Password</label>
                    <input
                      type="password"
                      className="input w-full text-[13px]"
                      placeholder="Min 6 characters"
                      value={addForm.password}
                      onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Role</label>
                    <select
                      className="input w-full text-[13px]"
                      value={addForm.role}
                      onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="btn-primary text-[12px] py-2 px-4 disabled:opacity-60"
                  >
                    {addLoading ? 'Creating…' : 'Create User'}
                  </button>
                  <button type="button" onClick={() => setShowAddUser(false)}
                    className="btn-secondary text-[12px] py-2 px-4">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

      </div>
    </ProtectedLayout>
  );
}
