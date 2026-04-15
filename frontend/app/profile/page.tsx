'use client';

import { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  Camera, Check, Eye, EyeOff, ChevronRight,
  Mail, Shield, User as UserIcon, AlertCircle,
} from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { updateProfile } from '@/store/slices/authSlice';
import ProtectedLayout from '@/components/layout/ProtectedLayout';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:5000';

// ── Avatar ─────────────────────────────────────────────────────────────────

function ProfileAvatar({
  name, avatarUrl, preview, size = 96,
  onUpload,
}: {
  name: string; avatarUrl: string | null; preview: string | null;
  size?: number; onUpload?: () => void;
}) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  const src = preview ?? (avatarUrl
    ? (avatarUrl.startsWith('http') ? avatarUrl : `${API_BASE}${avatarUrl}`)
    : null);

  return (
    <div
      className="relative group cursor-pointer shrink-0"
      style={{ width: size, height: size }}
      onClick={onUpload}
    >
      {src ? (
        <img src={src} alt={name}
          className="w-full h-full rounded-full object-cover ring-4 ring-[var(--surface)] shadow-theme-sm" />
      ) : (
        <div
          className="w-full h-full rounded-full bg-gradient-to-br from-primary/30 to-primary/60
                     flex items-center justify-center ring-4 ring-[var(--surface)] shadow-theme-sm"
          style={{ fontSize: size * 0.33 }}
        >
          <span className="font-bold text-primary">{initials || '?'}</span>
        </div>
      )}
      {onUpload && (
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100
                        transition-opacity flex items-center justify-center">
          <Camera size={size * 0.22} className="text-white" />
        </div>
      )}
    </div>
  );
}

// ── Feedback banner ────────────────────────────────────────────────────────

function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium
      ${type === 'success'
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
        : 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
      }`}>
      <AlertCircle size={15} className="shrink-0" />
      {msg}
    </div>
  );
}

// ── Password field ─────────────────────────────────────────────────────────

function PasswordField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input w-full pr-10"
        />
        <button type="button" onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-primary" />
        </div>
        <h2 className="text-[13px] font-semibold text-[var(--text)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t } = useTranslation();
  const dispatch   = useDispatch<AppDispatch>();
  const user       = useSelector((s: RootState) => s.auth.user);
  const authStatus = useSelector((s: RootState) => s.auth.status);

  // Avatar
  const fileRef       = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarAlert,   setAvatarAlert]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Personal info
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [infoAlert,  setInfoAlert]  = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  // Password
  const [currentPwd,   setCurrentPwd]   = useState('');
  const [newPwd,       setNewPwd]       = useState('');
  const [confirmPwd,   setConfirmPwd]   = useState('');
  const [pwdAlert,     setPwdAlert]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingPwd,    setSavingPwd]    = useState(false);

  useEffect(() => {
    if (user) { setName(user.name); setEmail(user.email); }
  }, [user]);

  // ── Avatar upload (immediate save) ──────────────────────────────────────
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setAvatarAlert({ type: 'error', msg: 'Only JPG, JPEG and PNG files are allowed' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarAlert({ type: 'error', msg: 'File must be under 2 MB' });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setAvatarAlert(null);
  }

  async function handleAvatarSave() {
    if (!avatarFile) return;
    const fd = new FormData();
    fd.append('avatar', avatarFile);
    const result = await dispatch(updateProfile(fd));
    if (updateProfile.fulfilled.match(result)) {
      setAvatarAlert({ type: 'success', msg: 'Profile photo updated' });
      setAvatarFile(null); setAvatarPreview(null);
    } else {
      setAvatarAlert({ type: 'error', msg: (result.payload as string) || 'Upload failed' });
    }
  }

  // ── Personal info save ───────────────────────────────────────────────────
  async function handleInfoSave(e: React.FormEvent) {
    e.preventDefault();
    setInfoAlert(null);
    if (!name.trim()) { setInfoAlert({ type: 'error', msg: 'Name is required' }); return; }
    if (!email.trim() || !email.includes('@')) { setInfoAlert({ type: 'error', msg: 'Valid email is required' }); return; }
    setSavingInfo(true);
    const fd = new FormData();
    fd.append('name',  name.trim());
    fd.append('email', email.trim());
    const result = await dispatch(updateProfile(fd));
    setSavingInfo(false);
    if (updateProfile.fulfilled.match(result)) {
      setInfoAlert({ type: 'success', msg: 'Personal information updated' });
    } else {
      setInfoAlert({ type: 'error', msg: (result.payload as string) || 'Update failed' });
    }
  }

  // ── Password save ────────────────────────────────────────────────────────
  async function handlePwdSave(e: React.FormEvent) {
    e.preventDefault();
    setPwdAlert(null);
    if (!currentPwd) { setPwdAlert({ type: 'error', msg: 'Current password is required' }); return; }
    if (!newPwd || newPwd.length < 6) { setPwdAlert({ type: 'error', msg: 'New password must be at least 6 characters' }); return; }
    if (newPwd !== confirmPwd) { setPwdAlert({ type: 'error', msg: 'Passwords do not match' }); return; }
    setSavingPwd(true);
    const fd = new FormData();
    fd.append('current_password', currentPwd);
    fd.append('new_password',     newPwd);
    const result = await dispatch(updateProfile(fd));
    setSavingPwd(false);
    if (updateProfile.fulfilled.match(result)) {
      setPwdAlert({ type: 'success', msg: 'Password updated successfully' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } else {
      setPwdAlert({ type: 'error', msg: (result.payload as string) || 'Password update failed' });
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)] mb-5">
          <Link href="/dashboard" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight size={12} />
          <span className="text-[var(--text)]">Profile</span>
        </div>

        {/* ── Profile header card ───────────────────────────────────────── */}
        <div className="card mb-5 overflow-hidden p-0">
          {/* Top accent strip */}
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />

          <div className="px-6 pb-6">
            {/* Avatar row — overlaps strip */}
            <div className="flex items-end justify-between -mt-12 mb-4 flex-wrap gap-4">
              <div className="flex items-end gap-4">
                <ProfileAvatar
                  name={user?.name ?? ''}
                  avatarUrl={user?.avatar_url ?? null}
                  preview={avatarPreview}
                  size={88}
                  onUpload={() => fileRef.current?.click()}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="mb-1">
                  <h1 className="text-[18px] font-semibold text-[var(--text)]">{user?.name}</h1>
                  <p className="text-[13px] text-[var(--text-muted)]">{user?.email}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold
                      ${user?.role === 'admin'
                        ? 'bg-accent/15 text-accent border border-accent/20'
                        : 'bg-primary/15 text-primary border border-primary/20'}`}>
                      {user?.role === 'admin' ? 'Administrator' : 'Member'}
                    </span>
                    {memberSince && (
                      <span className="text-[11px] text-[var(--text-muted)]">Member since {memberSince}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar actions */}
              {avatarFile ? (
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); setAvatarAlert(null); }}
                    className="btn-secondary text-[12px] px-3 py-1.5">
                    Cancel
                  </button>
                  <button onClick={handleAvatarSave}
                    disabled={authStatus === 'loading'}
                    className="btn-primary text-[12px] px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-60">
                    {authStatus === 'loading'
                      ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Check size={12} />}
                    Save Photo
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="btn-secondary text-[12px] px-3 py-1.5 flex items-center gap-1.5 mb-1">
                  <Camera size={13} />
                  Change Photo
                </button>
              )}
            </div>

            {avatarAlert && <Alert type={avatarAlert.type} msg={avatarAlert.msg} />}
          </div>
        </div>

        {/* ── Two-column forms ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Personal Information */}
          <Section icon={UserIcon} title="Personal Information">
            {infoAlert && <Alert type={infoAlert.type} msg={infoAlert.msg} />}
            <form onSubmit={handleInfoSave} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="input w-full pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
                  Role
                </label>
                <input
                  type="text"
                  value={user?.role === 'admin' ? 'Administrator' : 'Member'}
                  disabled
                  className="input w-full bg-[var(--bg)] text-[var(--text-muted)] cursor-not-allowed"
                />
              </div>
              <button
                type="submit"
                disabled={savingInfo}
                className="btn-primary w-full flex items-center justify-center gap-2 text-[13px] disabled:opacity-60"
              >
                {savingInfo
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check size={13} />
                }
                {savingInfo ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </Section>

          {/* Security */}
          <Section icon={Shield} title="Security">
            {pwdAlert && <Alert type={pwdAlert.type} msg={pwdAlert.msg} />}
            <form onSubmit={handlePwdSave} className="space-y-4">
              <PasswordField
                label="Current Password"
                value={currentPwd}
                onChange={setCurrentPwd}
                placeholder="Enter current password"
              />
              <PasswordField
                label="New Password"
                value={newPwd}
                onChange={setNewPwd}
                placeholder="Minimum 6 characters"
              />
              <PasswordField
                label="Confirm New Password"
                value={confirmPwd}
                onChange={setConfirmPwd}
                placeholder="Repeat new password"
              />

              {/* Password strength indicator */}
              {newPwd && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map((lvl) => {
                      const strength = newPwd.length >= 12 ? 4 : newPwd.length >= 8 ? 3 : newPwd.length >= 6 ? 2 : 1;
                      return (
                        <div key={lvl} className={`h-1 flex-1 rounded-full transition-colors
                          ${lvl <= strength
                            ? strength >= 4 ? 'bg-emerald-500' : strength >= 3 ? 'bg-primary' : strength >= 2 ? 'bg-warning' : 'bg-accent'
                            : 'bg-[var(--border)]'}`}
                        />
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {newPwd.length < 6 ? 'Too short' : newPwd.length < 8 ? 'Weak' : newPwd.length < 12 ? 'Good' : 'Strong'}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={savingPwd}
                className="btn-primary w-full flex items-center justify-center gap-2 text-[13px] disabled:opacity-60"
              >
                {savingPwd
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Shield size={13} />
                }
                {savingPwd ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </Section>
        </div>
      </div>
    </ProtectedLayout>
  );
}
