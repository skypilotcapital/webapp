'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { HOME, NAV_GROUPS, activeHref } from '@/lib/nav';

// The sidebar renders `lib/nav.ts` and nothing else — the menu is defined once and shared with the
// home page. Four groups in workflow order; flat within a group. See lib/nav.ts for the rules.
export function Sidebar() {
  const pathname = usePathname() || '';
  const active = activeHref(pathname);

  return (
    <aside
      className="w-[212px] flex-none sticky top-0 h-screen px-3 py-4 overflow-y-auto flex flex-col"
      style={{ background: 'var(--panel)', borderRight: '1px solid var(--border-soft)' }}
    >
      <Link href="/" className="flex items-center gap-3 px-2 pb-4">
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

      <nav className="flex flex-col gap-0.5 flex-1">
        <NavLink href={HOME.href} label={HOME.label} icon={HOME.icon} active={active === HOME.href} />

        {NAV_GROUPS.map((g) => (
          <div key={g.key} className="flex flex-col gap-0.5">
            <div
              className="text-[9px] font-bold tracking-[1.5px] px-2.5 pt-2.5 pb-1 uppercase"
              style={{ color: 'var(--tx-dim)' }}
            >
              {g.label}
            </div>
            {g.items.map((it) => (
              <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} active={active === it.href} />
            ))}
          </div>
        ))}
      </nav>

      <div className="pt-3 mt-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <DisabledLink label="Settings" icon="⚙" />
      </div>
    </aside>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-2.5 py-[5px] rounded-[9px] text-[12.5px] font-semibold transition-colors"
      style={active
        ? { background: 'linear-gradient(90deg,rgba(14,124,111,0.13),rgba(14,124,111,0.02))', color: 'var(--teal)', boxShadow: 'inset 2px 0 0 var(--teal)' }
        : { color: 'var(--tx-mut)' }}
    >
      <span className="w-[17px] text-center text-[14px] opacity-90">{icon}</span>
      {label}
    </Link>
  );
}

function DisabledLink({ label, icon }: { label: string; icon: string }) {
  return (
    <div
      className="flex items-center gap-3 px-2.5 py-2 rounded-[9px] text-[12.5px] font-semibold cursor-not-allowed"
      style={{ color: 'var(--tx-dim)' }}
      title="Not built yet"
    >
      <span className="w-[17px] text-center text-[14px]">{icon}</span>
      {label}
    </div>
  );
}
