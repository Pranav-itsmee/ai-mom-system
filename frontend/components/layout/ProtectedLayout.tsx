'use client';

import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/store';
import Sidebar from './Sidebar';
import Topbar  from './Topbar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router    = useRouter();
  const token     = useSelector((s: RootState) => s.auth.token);
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed);

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  if (!token) return null;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Fixed sidebar */}
      <div className="fixed left-0 top-0 bottom-0 z-30">
        <Sidebar />
      </div>

      {/* Main area */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-[250ms]"
        style={{ paddingLeft: collapsed ? '70px' : '230px' }}
      >
        <Topbar />
        <main className="flex-1 pt-16 p-5 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
