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
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
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
    <div ref={ref} className="relative ml-1">

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 pl-2 pr-2 rounded-lg
                   hover:bg-[var(--gray-100)] dark:hover:bg-white/5 transition-colors"
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={user.name}
            className="w-7 h-7 rounded-full object-cover ring-2 ring-[var(--border)] shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/40 to-primary
                          text-white text-[11px] flex items-center justify-center font-bold shrink-0">
            {initials(user.name)}
          </div>
        )}
        <div className="hidden sm:block text-left">
          <p className="text-[13px] font-medium text-[var(--text)] leading-tight">{user.name}</p>
          <p className="text-[11px] text-[var(--text-muted)] capitalize leading-tight">{user.role}</p>
        </div>
        <ChevronDown size={13} className={`text-[var(--gray-400)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 bg-[var(--surface)] border border-[var(--border)]
                     rounded-2xl z-50 overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              {avatarSrc ? (
                <img src={avatarSrc} alt={user.name}
                  className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary
                                text-white text-[13px] flex items-center justify-center font-bold shrink-0">
                  {initials(user.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text)] truncate">{user.name}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
              </div>
            </div>
            <span className={`mt-2 inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize
              ${user.role === 'admin'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-primary/10 text-primary border border-primary/20'}`}>
              {user.role === 'admin' ? 'Administrator' : 'Member'}
            </span>
          </div>

          {/* Menu items */}
          <div className="p-1.5 space-y-0.5">
            <MenuItem
              icon={UserCircle}
              label="Edit Profile"
              onClick={() => { setOpen(false); router.push('/profile'); }}
            />
            <MenuItem
              icon={Settings}
              label={t('settings.title')}
              onClick={() => { setOpen(false); router.push('/settings'); }}
            />
          </div>

          {/* Logout */}
          <div className="p-1.5 border-t border-[var(--border)]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg
                         text-accent hover:bg-accent/8 transition-colors font-medium"
            >
              <LogOut size={15} />
              {t('btn.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick,
}: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg
                 text-[var(--gray-700)] dark:text-[var(--gray-300)]
                 hover:bg-[var(--gray-100)] dark:hover:bg-white/5 transition-colors"
    >
      <Icon size={15} className="text-[var(--gray-400)] shrink-0" />
      {label}
    </button>
  );
}
