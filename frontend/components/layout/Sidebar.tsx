'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, FileText, CheckSquare, CalendarDays, Settings, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { closeMobileSidebar } from '@/store/slices/uiSlice';

const NAV = [
  { key: 'nav.dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { key: 'nav.moms',      icon: FileText,        href: '/mom/search' },
  { key: 'nav.tasks',     icon: CheckSquare,     href: '/tasks'      },
  { key: 'nav.calendar',  icon: CalendarDays,    href: '/calendar'   },
  { key: 'nav.settings',  icon: Settings,        href: '/settings'   },
];

export default function Sidebar() {
  const { t }      = useTranslation();
  const pathname   = usePathname();
  const dispatch   = useDispatch();
  const collapsed  = useSelector((s: RootState) => s.ui.sidebarCollapsed);
  const mobileOpen = useSelector((s: RootState) => s.ui.mobileSidebarOpen);

  const isCollapsed = collapsed;   // desktop collapse state; on mobile always show full width

  return (
    <aside
      aria-label="Main navigation"
      className={[
        'sidebar-transition flex flex-col h-screen no-scrollbar',
        'bg-[var(--surface)] border-r border-[var(--border)]',
        // Desktop: respect collapsed state
        // Mobile: always full 240px when drawer is open
        'lg:relative',
        isCollapsed ? 'lg:w-[72px]' : 'lg:w-[240px]',
        'w-[240px]',            // mobile always full
      ].join(' ')}
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      {/* ── Logo + mobile close ── */}
      <div
        className={[
          'flex items-center h-16 border-b border-[var(--border)] shrink-0',
          isCollapsed ? 'lg:justify-center' : 'px-4 gap-3',
          'px-4 gap-3',         // mobile always expanded
        ].join(' ')}
      >
        {/* Logo mark */}
        <img
          src="/logo.png"
          alt="AI MOM"
          className="shrink-0 rounded-full"
          style={{ width: 44, height: 44, objectFit: 'cover' }}
        />

        {/* Title — hidden on desktop collapsed */}
        <div className={[
          'leading-tight flex-1 min-w-0',
          isCollapsed ? 'lg:hidden' : '',
        ].join(' ')}>
          <p className="text-[14px] font-bold text-[var(--text)] truncate">AI MOM</p>
          <p className="text-[11px] text-[var(--text-muted)] truncate">Meeting System</p>
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => dispatch(closeMobileSidebar())}
          className="lg:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)]
                     hover:text-[var(--text)] transition-colors shrink-0"
          aria-label="Close navigation"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-4 px-3">
        {/* Section label */}
        <p className={[
          'mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]',
          isCollapsed ? 'lg:hidden' : '',
        ].join(' ')}>
          Menu
        </p>

        <div className="space-y-0.5">
          {NAV.map(({ key, icon: Icon, href }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                title={isCollapsed ? t(key) : undefined}
                onClick={() => dispatch(closeMobileSidebar())}
                className={[
                  'menu-item relative',
                  active ? 'menu-item-active' : 'menu-item-inactive',
                  isCollapsed ? 'lg:justify-center lg:px-0' : '',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  size={17}
                  className={[
                    'shrink-0 transition-colors',
                    active ? 'text-[var(--primary-deep)]' : 'text-[var(--text-muted)]',
                  ].join(' ')}
                />
                <span className={isCollapsed ? 'lg:hidden' : ''}>
                  {t(key)}
                </span>
                {/* Active indicator dot — desktop collapsed */}
                {active && isCollapsed && (
                  <span className="hidden lg:block absolute right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--primary-deep)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Footer branding ── */}
      <div className={[
        'shrink-0 border-t border-[var(--border)] px-4 py-3',
        isCollapsed ? 'lg:hidden' : '',
      ].join(' ')}>
        <p className="text-[10px] text-[var(--text-light)] text-center leading-tight">
          Powered by Claude AI
        </p>
      </div>
    </aside>
  );
}
