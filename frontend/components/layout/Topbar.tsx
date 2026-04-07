'use client';

import { useDispatch, useSelector } from 'react-redux';
import { AlignLeft, Bell, Sun, Moon } from 'lucide-react';
import { toggleSidebar, setTheme, setLanguage } from '@/store/slices/uiSlice';
import { RootState } from '@/store';
import UserMenu from '@/components/ui/UserMenu';

export default function Topbar() {
  const dispatch = useDispatch();
  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);
  const isDark   = theme === 'dark';

  return (
    <header
      className="fixed top-0 right-0 left-0 z-40 flex items-center h-16 px-5
                 bg-[var(--surface)] border-b border-[var(--border)]"
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      {/* Hamburger */}
      <button
        onClick={() => dispatch(toggleSidebar())}
        className="p-1.5 rounded-lg hover:bg-[var(--gray-100)] dark:hover:bg-white/5
                   text-[var(--gray-500)] transition-colors"
      >
        <AlignLeft size={18} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right controls — matches SMS exactly */}
      <div className="flex items-center gap-2">

        {/* Language select — native dropdown like SMS */}
        <select
          value={language}
          onChange={(e) => dispatch(setLanguage(e.target.value as 'en' | 'ja'))}
          className="h-9 px-3 pr-7 text-[13px] font-medium rounded-lg border border-[var(--border)]
                     bg-[var(--surface)] text-[var(--text)] outline-none cursor-pointer
                     hover:bg-[var(--gray-50)] dark:hover:bg-white/5 transition-colors
                     appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2398A2B3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>

        {/* Theme toggle */}
        <button
          onClick={() => dispatch(setTheme(isDark ? 'light' : 'dark'))}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     hover:bg-[var(--gray-100)] dark:hover:bg-white/5
                     text-[var(--gray-500)] transition-colors"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notification bell */}
        <button
          className="flex items-center justify-center w-9 h-9 rounded-lg relative
                     hover:bg-[var(--gray-100)] dark:hover:bg-white/5
                     text-[var(--gray-500)] transition-colors"
        >
          <Bell size={17} />
        </button>

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
