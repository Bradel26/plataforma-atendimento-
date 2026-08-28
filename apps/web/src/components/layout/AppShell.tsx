import { Outlet, useLocation } from 'react-router-dom';
import { itemDaRota } from './nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const { pathname } = useLocation();
  const atual = itemDaRota(pathname);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={atual?.label ?? 'Plataforma'} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
