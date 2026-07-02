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

// the three cycle votes and which board rows belong to each
const LABOR_MEMBER_KEYS = ['claims_ratio_12m_low', 'sahm_gap', 'u3_vs_12mma'];
const TREND_KEY = 'trend_50_200_pct';
const INFLATION_KEY = 'cpi_mom_z3m60m';

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

function VoteChip({ vote }: { vote: string | null | undefined }) {
  if (!vote) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-slate-400/10 text-[var(--tx-dim,#94a3b8)] border border-[var(--border-soft,#e2e8f0)]">
        n/a
      </span>
    );
  }
  const bearish = vote === 'bearish';
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${
        bearish
          ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
          : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
      }`}
    >
      {vote}
    </span>
  );
}

function ComponentRow({
  c,
  history,
  indent = false,
}: {
  c: ComponentReading;
  history: ComponentHistoryPoint[];
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 py-2.5 border-b border-[var(--border-soft,#f1f5f9)] last:border-0 ${
        indent ? 'pl-7' : ''
      }`}
    >
      <div className="w-2.5 shrink-0">
        <span
          className={`block w-2.5 h-2.5 rounded-full ${
            c.firing == null ? 'bg-slate-200' : c.firing ? 'bg-rose-500' : 'bg-emerald-400'
          }`}
          title={c.firing ? 'firing (bearish)' : 'quiet'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`${indent ? 'text-[13px]' : 'text-sm'} font-semibold text-[var(--tx,#1e293b)] truncate`}>
          {c.label}
        </p>
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

function VoteHeader({
  n,
  title,
  detail,
  vote,
}: {
  n: number;
  title: string;
  detail: string;
  vote: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1">
      <span className="w-5 h-5 rounded-full bg-slate-400/15 text-[var(--tx-mut,#64748b)] text-[11px] font-black flex items-center justify-center shrink-0">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-[var(--tx,#1e293b)]">
          {title}{' '}
          <span className="text-xs font-medium text-[var(--tx-dim,#94a3b8)]">{detail}</span>
        </p>
      </div>
      <VoteChip vote={vote} />
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

  const comps = latest?.components ?? [];
  const byKey = Object.fromEntries(comps.map((c) => [c.key, c]));
  const trend = byKey[TREND_KEY];
  const inflation = byKey[INFLATION_KEY];
  const laborMembers = LABOR_MEMBER_KEYS.map((k) => byKey[k]).filter(Boolean);
  const laborFiring = laborMembers.filter((c) => c?.firing).length;
  const fast = comps.filter((c) => c.group === 'fast');
  const cycleBearish = latest?.cycle_result === 'bearish';

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
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim,#94a3b8)] font-black mb-1">
              Cycle — three votes, majority decides
            </h3>

            <VoteHeader n={1} title="Trend" detail="S&P 500 50d vs 200d MA"
                        vote={latest?.trend_vote} />
            {trend && <ComponentRow c={trend} history={history ?? []} indent />}

            <VoteHeader
              n={2}
              title="Labor block"
              detail={`one vote — bearish when ≥2 of its 3 members fire (now ${laborFiring} of 3)`}
              vote={latest?.labor_vote}
            />
            {laborMembers.map((c) => (
              <ComponentRow key={c.key} c={c} history={history ?? []} indent />
            ))}

            <VoteHeader n={3} title="Inflation" detail="CPI momentum z-score"
                        vote={latest?.inflation_vote} />
            {inflation && <ComponentRow c={inflation} history={history ?? []} indent />}

            {latest && (
              <div
                className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                  cycleBearish
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/25'
                }`}
              >
                <p className="text-sm font-black text-[var(--tx,#1e293b)]">
                  Cycle vote (majority of the three)
                </p>
                <VoteChip vote={latest.cycle_result} />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim,#94a3b8)] font-black mb-1">
              Fast triggers (latched)
            </h3>
            <div className="pt-2">
              {fast.map((c) => (
                <ComponentRow key={c.key} c={c} history={history ?? []} />
              ))}
            </div>
            {latest && (
              <div className="text-xs text-[var(--tx-mut,#64748b)] mt-3 space-y-1">
                <p>
                  Credit latch: <b>{latest.credit_latch_on ? 'ON' : 'off'}</b> (enters &gt;10bp,
                  releases &lt;0) · Vol gate: <b>{latest.vol_gate_on ? 'ON' : 'off'}</b> (enters
                  &gt;90th pctile, releases &lt;75th)
                </p>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-[var(--border-soft,#e2e8f0)] bg-slate-400/5 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] mb-2">
                How the state is formed — DEFENSE if any of:
              </p>
              <ul className="text-xs text-[var(--tx-mut,#64748b)] space-y-1.5 leading-relaxed">
                <li>
                  <b className="text-[var(--tx,#1e293b)]">① Cycle bearish</b> — the majority
                  vote on the left is bearish (the slow, recession-grade path).
                </li>
                <li>
                  <b className="text-[var(--tx,#1e293b)]">② Credit force</b> — the credit
                  latch is ON while the cycle vote is <i>not outright bullish</i> (credit
                  stress breaks ties; a fully bullish cycle vetoes it).
                </li>
                <li>
                  <b className="text-[var(--tx,#1e293b)]">③ Correction channel</b> — (credit
                  latch OR vol gate) <i>and</i> price below its 10-month average — fires
                  regardless of the cycle vote (the fast-crash path; needs both market
                  stress and a broken trend).
                </li>
              </ul>
              <p className="text-xs text-[var(--tx-mut,#64748b)] mt-2">
                Entries publish immediately; exits carry a 10-day confirmation (v1.6) — the
                signal returns to NORMAL only after all three conditions have stayed quiet
                for 10 straight sessions.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
