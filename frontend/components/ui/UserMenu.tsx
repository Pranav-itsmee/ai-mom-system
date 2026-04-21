'use client';

import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { UserCircle, Settings, LogOut, ChevronDown } from 'lucide-react';
import { logout } from '@/store/slices/authSlice';
import { RootState } from '@/store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:5000';

export default function UserMenu() {
  const { t }    = useTranslation();
  const dispatch = useDispatch();
  const router   = useRouter();
  const user     = useSelector((s: RootState) => s.auth.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function initials(name: string) {
    return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  }

  function handleLogout() {
    dispatch(logout());
    router.push('/login');
  }

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`)
    : null;

  if (!user) return null;

  return (
    <div ref={ref} className="relative">

      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-xl
                   hover:bg-[var(--surface-3)] border border-transparent
                   hover:border-[var(--border)]
                   transition-all duration-200 active:scale-95"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="User menu"
      >
        <Avatar src={avatarSrc} name={user.name} size={28} />
        <div className="hidden sm:flex flex-col text-left max-w-[120px]">
          <span className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
            {user.name}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] capitalize leading-tight">
            {user.role}
          </span>
        </div>
        <ChevronDown
          size={13}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-60 rounded-2xl border border-[var(--border)]
                     bg-[var(--surface)] z-50 overflow-hidden animate-scale-in"
          style={{ boxShadow: 'var(--shadow-lg)' }}
          role="menu"
        >
          {/* User info header */}
          <div className="px-4 py-3.5 border-b border-[var(--border)]"
               style={{ background: 'linear-gradient(135deg, rgba(180,211,217,0.15) 0%, rgba(189,166,206,0.10) 100%)' }}>
            <div className="flex items-center gap-3">
              <Avatar src={avatarSrc} name={user.name} size={38} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--text)] truncate">{user.name}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
              </div>
            </div>
            {/* Role badge */}
            <span className={[
              'mt-2.5 inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full font-bold capitalize',
              user.role === 'admin'
                ? 'bg-[var(--accent)]/15 text-[var(--accent-deep)] border border-[var(--accent)]/25'
                : 'bg-[var(--primary)]/25 text-[var(--primary-deep)] border border-[var(--primary)]/40',
            ].join(' ')}>
              {user.role === 'admin' ? 'Administrator' : 'Member'}
            </span>
          </div>

          {/* Menu items */}
          <div className="p-1.5 space-y-0.5" role="group">
            <DropdownItem
              icon={UserCircle}
              label="Edit Profile"
              onClick={() => { setOpen(false); router.push('/profile'); }}
            />
            <DropdownItem
              icon={Settings}
              label={t('settings.title')}
              onClick={() => { setOpen(false); router.push('/settings'); }}
            />
          </div>

          {/* Logout */}
          <div className="p-1.5 border-t border-[var(--border)]" role="group">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl
                         font-semibold text-[var(--danger)] transition-colors duration-150
                         hover:bg-red-50 dark:hover:bg-red-500/10"
              role="menuitem"
            >
              <LogOut size={14} className="shrink-0" />
              {t('btn.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared Avatar component ── */
function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  function initials(n: string) {
    return n.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  }
  if (src) {
    return (
      <img
        src={src} alt={name}
        className="rounded-full object-cover shrink-0 ring-2 ring-[var(--border)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold select-none"
      style={{
        width: size, height: size,
        fontSize: size * 0.38,
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
        color: 'var(--text)',
      }}
    >
      {initials(name)}
    </div>
  );
}

function DropdownItem({
  icon: Icon, label, onClick,
}: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl
                 text-[var(--text)] hover:bg-[var(--surface-3)]
                 transition-colors duration-150 font-medium"
      role="menuitem"
    >
      <Icon size={14} className="text-[var(--text-muted)] shrink-0" />
      {label}
    </button>
  );
}
