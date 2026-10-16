import Link from 'next/link';

import { NAV_GROUPS } from '@/lib/nav';

// The home page is the menu, rendered as cards — one section per group, one card per page, read
// from the same `lib/nav.ts` the sidebar renders. It used to carry its own four hand-written cards,
// which still described "two production finalists" months after one book went to production.
export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="pill pill-teal">DASHBOARD</span>
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--tx-dim)' }}>
            Sky Pilot Capital · Systematic Quant Equity
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Fund Operating Dashboard</h1>
      </div>

      {NAV_GROUPS.map((g) => (
        <section key={g.key}>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-[11px] font-bold tracking-[1.5px] uppercase" style={{ color: 'var(--tx-dim)' }}>
              {g.label}
            </h2>
            <span className="text-[12px]" style={{ color: 'var(--tx-mut)' }}>{g.question}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="panel group relative block p-5 transition-all duration-300"
                style={{ minHeight: 150 }}
              >
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                  style={{ background: 'rgba(45,212,191,0.18)' }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] opacity-80" style={{ color: 'var(--teal)' }}>{it.icon}</span>
                  <h3 className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{it.label}</h3>
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--tx-mut)' }}>{it.blurb}</p>
                <div className="mt-4 flex items-center gap-2 text-[11px] font-bold" style={{ color: 'var(--teal)' }}>
                  <span>Open</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
