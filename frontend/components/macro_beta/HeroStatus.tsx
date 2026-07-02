'use client';

import useSWR from 'swr';
import { fetchMacroBetaLatest } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

function plainEnglishReasons(reasons: string | null): string[] {
  if (!reasons) return [];
  const out: string[] = [];
  const cycleMatch = reasons.match(/cycle_bearish\(([^)]*)\)/);
  if (cycleMatch) {
    const names = cycleMatch[1]
      .split(',')
      .map((v) =>
        v === 'trend' ? 'the price trend is broken'
        : v === 'labor' ? 'the labor market is deteriorating'
        : 'inflation momentum is elevated'
      );
    out.push(`Cycle vote is bearish: ${names.join(', ')}.`);
  }
  if (reasons.includes('credit_force')) {
    out.push('Credit spreads are widening (fast risk-off latch engaged).');
  }
  const corrMatch = reasons.match(/correction\(([^)]*)\)/);
  if (corrMatch) {
    const src = corrMatch[1]
      .split(',')
      .map((v) => (v === 'credit' ? 'credit stress' : 'extreme volatility'))
      .join(' + ');
    out.push(`Correction channel: ${src} with price below its 10-month average.`);
  }
  return out;
}

export function HeroStatus() {
  const { data, error, isLoading } = useSWR('macro-beta-latest', fetchMacroBetaLatest, {
    refreshInterval: 60_000,
  });

  const isDefense = data?.final_state === 'defense';
  const reasons = plainEnglishReasons(data?.defense_reasons ?? null);

  return (
    <Card>
      <CardContent className="py-8">
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading signal…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load the latest signal.</p>}
        {data && (
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div
              className={`px-8 py-6 rounded-3xl border-2 shrink-0 ${
                isDefense
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : 'bg-emerald-500/10 border-emerald-500/30'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-[0.25em] font-black ${
                  isDefense ? 'text-rose-500' : 'text-emerald-500'
                }`}
              >
                Current State
              </p>
              <p
                className={`text-4xl font-black tracking-tight ${
                  isDefense ? 'text-rose-500' : 'text-emerald-500'
                }`}
              >
                {isDefense ? 'DEFENSE' : 'NORMAL'}
              </p>
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-sm text-[var(--tx,#334155)] font-semibold">
                As of {data.signal_date}
                {data.state_since && (
                  <span className="text-[var(--tx-mut,#64748b)] font-medium">
                    {' '}· in this state since {data.state_since} ({data.days_in_state} trading days)
                  </span>
                )}
              </p>
              {isDefense ? (
                <ul className="text-sm text-[var(--tx-mut,#475569)] leading-relaxed list-disc pl-5 space-y-1">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--tx-mut,#475569)] leading-relaxed">
                  No defense triggers are active: the cycle vote is not bearish, the credit
                  latch is off, and no correction-channel condition is met. The signal reads
                  this as an ordinary market environment.
                </p>
              )}
              <p className="text-xs text-[var(--tx-dim,#94a3b8)] font-medium">
                {data.model_version} · two-state drawdown-defense signal · updated daily after
                US close
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
