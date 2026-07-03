'use client';

import useSWR from 'swr';
import { fetchMacroBetaLatest } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import type { Universe } from '@/types/macroBeta';

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
  if (reasons === 'exit_confirm_holding') {
    out.push(
      'Defense triggers have released; the 10-day exit confirmation is running before the signal returns to normal.'
    );
  }
  return out;
}

export function HeroStatus({ universe }: { universe: Universe }) {
  const { data, error, isLoading } = useSWR(
    ['macro-beta-latest', universe],
    () => fetchMacroBetaLatest(universe),
    { refreshInterval: 60_000 }
  );

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
              {data.month_end_state && (
                <p className="text-sm text-[var(--tx-mut,#64748b)]">
                  <span className="font-bold text-[var(--tx,#334155)]">Month-end view:</span>{' '}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                      data.month_end_state === 'defense'
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    }`}
                  >
                    {data.month_end_state}
                  </span>{' '}
                  <span className="text-xs">
                    as of {data.month_end_date} — the daily state sampled at each
                    month-end and held (committee cadence, ~1.3 switches/yr historically).
                    The daily state above remains the executable signal.
                  </span>
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
