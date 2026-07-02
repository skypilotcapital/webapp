'use client';

import useSWR from 'swr';
import {
  fetchMacroBetaLatest,
  fetchMacroBetaComponentsHistory,
} from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ComponentHistoryPoint, ComponentReading, Universe } from '@/types/macroBeta';

const PCT_KEYS = new Set(['trend_50_200_pct', 'trend_10m_pct']);
const PCTL_KEYS = new Set(['rv21_pct10y']);

function fmt(key: string, v: number | null): string {
  if (v == null) return '—';
  if (PCT_KEYS.has(key)) return `${(v * 100).toFixed(1)}%`;
  if (PCTL_KEYS.has(key)) return `${(v * 100).toFixed(0)}th`;
  return v.toFixed(2);
}

function Sparkline({
  history,
  seriesKey,
  threshold,
}: {
  history: ComponentHistoryPoint[];
  seriesKey: string;
  threshold: number | null;
}) {
  const values = history
    .map((p) => p[seriesKey as keyof ComponentHistoryPoint] as number | null)
    .map((v) => (v == null ? null : Number(v)));
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return <div className="w-[140px] h-8" />;

  const withThreshold = threshold != null ? [...valid, threshold] : valid;
  const min = Math.min(...withThreshold);
  const max = Math.max(...withThreshold);
  const span = max - min || 1;
  const w = 140;
  const h = 32;

  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  const thresholdY = threshold != null ? h - ((threshold - min) / span) * h : null;

  return (
    <svg width={w} height={h} className="shrink-0">
      {thresholdY != null && (
        <line x1={0} x2={w} y1={thresholdY} y2={thresholdY} stroke="#f43f5e"
              strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      )}
      <polyline points={pts} fill="none" stroke="var(--tx-mut,#64748b)" strokeWidth={1.5} />
    </svg>
  );
}

function ComponentRow({
  c,
  history,
}: {
  c: ComponentReading;
  history: ComponentHistoryPoint[];
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-[var(--border-soft,#f1f5f9)] last:border-0">
      <div className="w-2.5 shrink-0">
        <span
          className={`block w-2.5 h-2.5 rounded-full ${
            c.firing == null ? 'bg-slate-200' : c.firing ? 'bg-rose-500' : 'bg-emerald-400'
          }`}
          title={c.firing ? 'firing (bearish)' : 'quiet'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--tx,#1e293b)] truncate">{c.label}</p>
        <p className="text-xs text-[var(--tx-dim,#94a3b8)]">
          {c.direction === 'bearish_above' ? 'bearish above' : 'bearish below'}{' '}
          {fmt(c.key, c.threshold)}
        </p>
      </div>
      <div className="text-right w-20 shrink-0">
        <p
          className={`text-sm font-bold ${
            c.firing ? 'text-rose-500' : 'text-[var(--tx,#334155)]'
          }`}
        >
          {fmt(c.key, c.value)}
        </p>
      </div>
      <Sparkline history={history} seriesKey={c.key} threshold={c.threshold} />
    </div>
  );
}

export function ComponentBoard({ universe }: { universe: Universe }) {
  const { data: latest } = useSWR(['macro-beta-latest', universe], () =>
    fetchMacroBetaLatest(universe)
  );
  const { data: history } = useSWR(['macro-beta-comp-history', universe], () =>
    fetchMacroBetaComponentsHistory(universe, 24)
  );

  const cycle = (latest?.components ?? []).filter((c) => c.group === 'cycle');
  const fast = (latest?.components ?? []).filter((c) => c.group === 'fast');

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">Why — Component Board</h2>
        <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
          Every input behind the state, with its frozen threshold and a 24-month history.
          A red dot means the component currently reads bearish. The state is fully
          reproducible from this board.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-4">
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim,#94a3b8)] font-black mb-2">
              Cycle votes (majority 2-of-3: trend · labor block · inflation)
            </h3>
            {cycle.map((c) => (
              <ComponentRow key={c.key} c={c} history={history ?? []} />
            ))}
            {latest && (
              <p className="text-xs text-[var(--tx-mut,#64748b)] mt-3">
                Labor block is one vote, bearish when ≥2 of claims / Sahm gap / U3-vs-12m-avg
                fire. Current votes — trend:{' '}
                <b>{latest.trend_vote ?? 'n/a'}</b>, labor: <b>{latest.labor_vote ?? 'n/a'}</b>,
                inflation: <b>{latest.inflation_vote ?? 'n/a'}</b> → cycle:{' '}
                <b>{latest.cycle_result ?? 'n/a'}</b>
              </p>
            )}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim,#94a3b8)] font-black mb-2">
              Fast triggers (latched)
            </h3>
            {fast.map((c) => (
              <ComponentRow key={c.key} c={c} history={history ?? []} />
            ))}
            {latest && (
              <div className="text-xs text-[var(--tx-mut,#64748b)] mt-3 space-y-1">
                <p>
                  Credit latch: <b>{latest.credit_latch_on ? 'ON' : 'off'}</b> (enters &gt;10bp,
                  releases &lt;0) · Vol gate: <b>{latest.vol_gate_on ? 'ON' : 'off'}</b> (enters
                  &gt;90th pctile, releases &lt;75th)
                </p>
                <p>
                  Defense fires on: cycle bearish · credit latch while cycle not bullish ·
                  (credit latch OR vol gate) while price is below its 10-month average.
                  Entries publish immediately; exits carry a 10-day confirmation (v1.6) —
                  the signal returns to normal only after all triggers have stayed quiet
                  for 10 straight sessions.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
