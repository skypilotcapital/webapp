import { Sidebar } from '@/components/shell/Sidebar';

// The authenticated app shell — a FIXED-height frame: the sidebar never moves, and only <main>
// scrolls (its own scroll region). Pages with a master-detail layout keep their list pinned
// relative to <main> while the detail scrolls. /login is outside this group (bare layout).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto px-5 py-4 max-w-[1640px] w-full">{children}</main>
    </div>
  );
}
