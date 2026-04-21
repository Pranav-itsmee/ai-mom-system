'use client';

import { useDispatch, useSelector } from 'react-redux';
import { Menu, Sun, Moon, Globe } from 'lucide-react';
import { toggleSidebar, toggleMobileSidebar, setTheme, setLanguage } from '@/store/slices/uiSlice';
import { RootState } from '@/store';
import UserMenu from '@/components/ui/UserMenu';
import NotificationDropdown from '@/components/ui/NotificationDropdown';

export default function Topbar() {
  const dispatch = useDispatch();
  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const isDark   = theme === 'dark';

  function handleHamburger() {
    // On mobile: toggle mobile drawer; on desktop: toggle collapse
    // We dispatch both and CSS handles which is visible
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      dispatch(toggleMobileSidebar());
    } else {
      dispatch(toggleSidebar());
    }
  }

  return (
    <header
      className="fixed top-0 right-0 left-0 z-40 flex items-center h-16 px-4 sm:px-5
                 bg-[var(--surface)] border-b border-[var(--border)]"
      style={{ boxShadow: 'var(--shadow-xs)', height: 'var(--topbar-h)' }}
      role="banner"
    >
      {/* Hamburger — mobile: opens drawer; desktop: collapses sidebar */}
      <button
        onClick={handleHamburger}
        className="p-2 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-muted)]
                   hover:text-[var(--text)] transition-all duration-200 active:scale-95"
        aria-label="Toggle navigation"
      >
        <Menu size={18} />
      </button>

      {/* Brand name on mobile (when sidebar is closed) */}
      <div className="ml-3 lg:hidden">
        <span className="text-[14px] font-bold text-[var(--text)]">AI MOM</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Right controls ── */}
      <div className="flex items-center gap-1 sm:gap-1.5">

        {/* Language toggle */}
        <div className="relative">
          <button
            onClick={() => dispatch(setLanguage(language === 'en' ? 'ja' : 'en'))}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border)]
                       bg-[var(--surface)] text-[var(--text)] text-[13px] font-medium
                       hover:bg-[var(--surface-3)] hover:border-[var(--border-2)]
                       transition-all duration-200 active:scale-95"
            title={language === 'en' ? 'Switch to 日本語' : 'Switch to English'}
            aria-label="Toggle language"
          >
            <Globe size={14} className="text-[var(--text-muted)]" />
            <span className="hidden sm:inline">{language === 'en' ? 'EN' : 'JP'}</span>
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     hover:bg-[var(--surface-3)] border border-transparent
                     hover:border-[var(--border)]
                     text-[var(--text-muted)] hover:text-[var(--text)]
                     transition-all duration-200 active:scale-95"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark
            ? <Sun  size={17} className="text-[var(--primary-deep)]" />
            : <Moon size={17} />
          }
        </button>

        {/* Notification bell */}
        <NotificationDropdown />

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--border)] mx-0.5" aria-hidden="true" />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
