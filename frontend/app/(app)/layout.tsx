import { Sidebar } from '@/components/shell/Sidebar';

// The authenticated app shell — a FIXED-height frame: the sidebar + top bar never move, and only
// <main> scrolls (its own scroll region). Pages with a master-detail layout keep their list pinned
// (sticky) relative to <main> while the detail scrolls. /login is outside this group (bare layout).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div
          className="h-[52px] flex-none flex items-center gap-4 px-6 z-20"
          style={{ background: 'rgba(255,253,249,0.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-soft)' }}
        >
          <div
            className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg w-[260px]"
            style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)', color: 'var(--tx-dim)' }}
          >
            <span>⌕</span> Search configs, models, holdings…
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] font-medium hidden sm:block" style={{ color: 'var(--tx-dim)' }}>
              Internal · In-sample 2005–2023
            </span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'rgba(14,124,111,0.12)', color: 'var(--teal)' }}
            >
              SP
            </div>
          </div>
        </div>
        <main className="flex-1 min-h-0 overflow-y-auto px-5 py-4 max-w-[1640px] w-full">{children}</main>
      </div>
    </div>
  );
}
