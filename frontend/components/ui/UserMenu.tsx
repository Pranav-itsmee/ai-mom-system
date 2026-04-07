'use client';

import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Settings, LogOut, ChevronDown } from 'lucide-react';
import { logout } from '@/store/slices/authSlice';
import { RootState } from '@/store';

export default function UserMenu() {
  const { t }    = useTranslation();
  const dispatch = useDispatch();
  const router   = useRouter();
  const user     = useSelector((s: RootState) => s.auth.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function initials(name: string) {
    return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  }

  function handleLogout() {
    dispatch(logout());
    router.push('/login');
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 pl-2 pr-1.5 rounded-lg
                   hover:bg-[var(--gray-100)] dark:hover:bg-white/5 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary text-white text-xs
                        flex items-center justify-center font-semibold shrink-0">
          {initials(user.name)}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-theme-xs font-medium text-[var(--text)] leading-tight">{user.name}</p>
          <p className="text-[11px] text-[var(--text-muted)] capitalize leading-tight">{user.role}</p>
        </div>
        <ChevronDown size={13} className="text-[var(--gray-400)]" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-48 bg-[var(--surface)] border border-[var(--border)]
                     rounded-2xl z-50 overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-theme-sm font-semibold text-[var(--text)]">{user.name}</p>
            <p className="text-theme-xs text-[var(--text-muted)] mt-0.5">{user.email}</p>
            <span className={`mt-1.5 inline-block text-[11px] px-2 py-0.5 rounded-full font-medium capitalize
              ${user.role === 'admin'
                ? 'bg-primary/10 text-primary'
                : 'bg-[var(--gray-100)] text-[var(--gray-600)]'}`}>
              {user.role}
            </span>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => { setOpen(false); router.push('/settings'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-theme-sm
                         text-[var(--gray-700)] dark:text-[var(--gray-300)]
                         hover:bg-[var(--gray-100)] dark:hover:bg-white/5
                         rounded-lg transition-colors"
            >
              <Settings size={15} className="text-[var(--gray-400)]" />
              {t('settings.title')}
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-theme-sm
                         text-accent hover:bg-accent/5 rounded-lg transition-colors"
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
