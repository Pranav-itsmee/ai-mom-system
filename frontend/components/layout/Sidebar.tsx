'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Calendar, FileText, CheckSquare, CalendarDays, Settings,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

const NAV = [
  { key: 'nav.meetings', icon: Calendar,     href: '/meetings' },
  { key: 'nav.moms',     icon: FileText,     href: '/mom/search' },
  { key: 'nav.tasks',    icon: CheckSquare,  href: '/tasks' },
  { key: 'nav.calendar', icon: CalendarDays, href: '/calendar' },
  { key: 'nav.settings', icon: Settings,     href: '/settings' },
];

export default function Sidebar() {
  const { t }     = useTranslation();
  const pathname  = usePathname();
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed);

  return (
    <aside
      className={`sidebar-transition no-scrollbar flex flex-col h-screen
                  bg-[var(--surface)] border-r border-[var(--border)]
                  ${collapsed ? 'w-[70px]' : 'w-[240px]'}`}
    >
      {/* ── Logo ── */}
      <div className={`flex items-center h-16 border-b border-[var(--border)] shrink-0
                       ${collapsed ? 'justify-center' : 'px-5 gap-3'}`}>
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <span className="text-white text-base">🧠</span>
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-[14px] font-bold text-[var(--text)]">AI MOM</p>
            <p className="text-[11px] text-[var(--text-muted)]">Meeting System</p>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-5 px-3">
        {/* MENU section label — exactly like SMS */}
        {!collapsed && (
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.1em]
                        text-[var(--text-muted)]">
            Menu
          </p>
        )}

        <div className="space-y-0.5">
          {NAV.map(({ key, icon: Icon, href }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? t(key) : undefined}
                className={`menu-item ${active ? 'menu-item-active' : 'menu-item-inactive'}
                            ${collapsed ? 'justify-center px-0 py-2.5' : ''}`}
              >
                <Icon
                  size={17}
                  className={`shrink-0 ${active ? 'text-primary' : 'text-[var(--gray-400)]'}`}
                />
                {!collapsed && (
                  <span>{t(key)}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
