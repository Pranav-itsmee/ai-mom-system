'use client';

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/store';
import { closeMobileSidebar } from '@/store/slices/uiSlice';
import Sidebar from './Sidebar';
import Topbar  from './Topbar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router    = useRouter();
  const dispatch  = useDispatch();
  const token     = useSelector((s: RootState) => s.auth.token);
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed);
  const mobileOpen= useSelector((s: RootState) => s.ui.mobileSidebarOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted && !token) router.replace('/login'); }, [mounted, token, router]);

  // Close mobile drawer on route changes (clicking a nav item)
  useEffect(() => {
    dispatch(closeMobileSidebar());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted || !token) return null;

  // Desktop sidebar width
  const desktopSidebarW = collapsed ? 72 : 240;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">

      {/* ── Mobile overlay backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => dispatch(closeMobileSidebar())}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <div
        className={[
          'fixed left-0 top-0 bottom-0 z-50',
          // Mobile: translate off-screen when closed
          'transition-transform duration-300 ease-spring lg:transition-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <Sidebar />
      </div>

      {/* ── Main area ── */}
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{
          // On desktop: push content right by sidebar width
          paddingLeft: `var(--_sidebar-offset, 0px)`,
        }}
      >
        {/* CSS custom prop trick for responsive offset */}
        <style>{`
          @media (min-width: 1024px) {
            :root { --_sidebar-offset: ${desktopSidebarW}px; }
          }
          @media (max-width: 1023px) {
            :root { --_sidebar-offset: 0px; }
          }
        `}</style>

        <Topbar />

        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingTop: 'var(--topbar-h)' }}
        >
          <div className="p-4 sm:p-5 lg:p-6 max-w-[1400px] mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
