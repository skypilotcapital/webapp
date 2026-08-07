'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/monitor', label: 'Data Monitor', icon: '▤' },
  { href: '/macro-beta', label: 'Macro Beta', icon: '∿' },
];

// Trading gets sub-items for the same reason Research has them: the section is more than one
// surface and the blotter is watched on its own, not scrolled to past an approval panel.
// `/trading/paper` is hardcoded because paper is the only configured env (the live route 404s);
// when live exists this becomes env-aware rather than a second copy of the list.
const TRADING_SUB = [
  { label: 'Rebalance', href: '/trading/paper/rebalance', match: ['/trading/paper/rebalance'] },
  { label: 'Trade blotter', href: '/trading/paper/blotter', match: ['/trading/paper/blotter'] },
];

const RESEARCH_SUB = [
  { label: 'Factors · P01', href: '/research/factors', match: ['/research/factors', '/research/r2500-factors'] },
  { label: 'Alpha Models · P02', href: '/research/models', match: ['/research/models', '/research/r2500-models'] },
  { label: 'Portfolios · L2', href: '/research/portfolios', match: ['/research/portfolios'] },
];

export function Sidebar() {
  const pathname = usePathname() || '';
  const inResearch = pathname.startsWith('/research');

  return (
    <aside
      className="w-[212px] flex-none sticky top-0 h-screen px-3 py-4 overflow-y-auto"
      style={{ background: 'var(--panel)', borderRight: '1px solid var(--border-soft)' }}
    >
      <Link href="/" className="flex items-center gap-3 px-2 pb-5">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center font-black text-[18px]"
          style={{ background: 'linear-gradient(135deg,var(--teal),#0b6055)', color: '#fffdf9' }}
        >
          S
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>SkyPilot</div>
          <div className="text-[9px] font-bold tracking-[2.5px]" style={{ color: 'var(--teal)' }}>CAPITAL</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/');
          return <NavLink key={n.href} href={n.href} label={n.label} icon={n.icon} active={active} />;
        })}

        {/* Research (section with sub-items) */}
        <NavLink href="/research/factors" label="Research" icon="◔" active={inResearch} />
        <div className="ml-3 pl-3 flex flex-col gap-px my-1" style={{ borderLeft: '1px solid var(--border-soft)' }}>
          {RESEARCH_SUB.map((s) => {
            const active = s.match.some((m) => pathname === m || pathname.startsWith(m + '/') || pathname.startsWith(m + '?'));
            return (
              <Link
                key={s.href}
                href={s.href}
                className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors"
                style={active
                  ? { color: 'var(--teal)', background: 'rgba(14,124,111,0.10)' }
                  : { color: 'var(--tx-mut)' }}
              >
                {s.label}
              </Link>
            );
          })}
        </div>

        <div className="text-[9px] font-bold tracking-[1.5px] px-2.5 pt-3.5 pb-1.5" style={{ color: 'var(--tx-dim)' }}>
          PRODUCTION
        </div>
        <NavLink href="/trading/paper" label="Trading" icon="⌁"
                 active={pathname.startsWith('/trading')} />
        <div className="ml-3 pl-3 flex flex-col gap-px my-1" style={{ borderLeft: '1px solid var(--border-soft)' }}>
          {TRADING_SUB.map((s) => {
            const active = s.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
            return (
              <Link
                key={s.href}
                href={s.href}
                className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors"
                style={active
                  ? { color: 'var(--teal)', background: 'rgba(14,124,111,0.10)' }
                  : { color: 'var(--tx-mut)' }}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
        <NavLink href="/portfolios" label="Portfolios" icon="◈"
          active={pathname === '/portfolios' || pathname.startsWith('/portfolios/')} />
        <DisabledLink label="Settings" icon="⚙" />
      </nav>
    </aside>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-2.5 py-2 rounded-[9px] text-[12.5px] font-semibold transition-colors"
      style={active
        ? { background: 'linear-gradient(90deg,rgba(14,124,111,0.13),rgba(14,124,111,0.02))', color: 'var(--teal)', boxShadow: 'inset 2px 0 0 var(--teal)' }
        : { color: 'var(--tx-mut)' }}
    >
      <span className="w-[17px] text-center text-[14px] opacity-90">{icon}</span>
      {label}
    </Link>
  );
}

function DisabledLink({ label, icon, badge }: { label: string; icon: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2 rounded-[9px] text-[12.5px] font-semibold cursor-not-allowed" style={{ color: 'var(--tx-dim)' }}>
      <span className="w-[17px] text-center text-[14px]">{icon}</span>
      {label}
      {badge && (
        <span className="ml-auto text-[8px] font-bold px-1.5 py-px rounded" style={{ background: 'rgba(124,139,161,0.18)', color: 'var(--tx-dim)' }}>
          {badge}
        </span>
      )}
    </div>
  );
}
