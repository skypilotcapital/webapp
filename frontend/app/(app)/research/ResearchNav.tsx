'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

// Layer switch (pipeline order) x persistent universe toggle. The universe toggle routes between the
// existing sp500 / r2500 pages for Factors/Models, and drives ?u= for the Portfolios hub.
const LAYERS = [
  { key: 'factors', label: 'Factors', tag: 'P01' },
  { key: 'models', label: 'Alpha Models', tag: 'P02' },
  { key: 'portfolios', label: 'Portfolios', tag: 'L2' },
] as const;

type Layer = (typeof LAYERS)[number]['key'];

function hrefFor(layer: Layer, universe: 'sp500' | 'r2500'): string {
  if (layer === 'portfolios') return `/research/portfolios?u=${universe}`;
  const prefix = universe === 'r2500' ? 'r2500-' : '';
  return `/research/${prefix}${layer}`;
}

export function ResearchNav() {
  const pathname = usePathname() || '';
  const search = useSearchParams();

  const layer: Layer = pathname.includes('portfolios') ? 'portfolios'
    : pathname.includes('models') ? 'models' : 'factors';
  const universe: 'sp500' | 'r2500' = layer === 'portfolios'
    ? (search.get('u') === 'r2500' ? 'r2500' : 'sp500')
    : (pathname.includes('r2500') ? 'r2500' : 'sp500');

  return (
    <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
      {/* layer switch */}
      <div className="flex items-center gap-1">
        {LAYERS.map((l) => {
          const active = l.key === layer;
          return (
            <Link
              key={l.key}
              href={hrefFor(l.key, universe)}
              className="px-4 py-2 rounded-lg text-[13px] font-bold transition-colors flex items-center gap-2"
              style={active
                ? { background: 'rgba(14,124,111,0.10)', color: 'var(--teal)', boxShadow: 'inset 0 -2px 0 var(--teal)' }
                : { color: 'var(--tx-mut)' }}
            >
              {l.label}
              <span className="text-[9px] font-extrabold px-1.5 py-px rounded"
                style={{ background: 'rgba(30,64,175,0.12)', color: 'var(--cyan)' }}>{l.tag}</span>
            </Link>
          );
        })}
      </div>

      {/* universe toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-dim)' }}>Universe</span>
        <div className="flex rounded-lg p-0.5" style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)' }}>
          {(['sp500', 'r2500'] as const).map((u) => (
            <Link
              key={u}
              href={hrefFor(layer, u)}
              className="px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-colors"
              style={u === universe ? { background: 'var(--teal)', color: '#fffdf9' } : { color: 'var(--tx-mut)' }}
            >
              {u === 'sp500' ? 'S&P 500' : 'Russell 2500'}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
