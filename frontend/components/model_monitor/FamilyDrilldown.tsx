'use client';

// Family drill-down — one family at a time, so it is never more than 14 rows (Growth). That scoping is
// what lets a per-feature view work at all: across 70 features the dumbbell of design pass 1 does not.
// Per feature: trailing-12m attention, contribution and the factor's own payoff, plus two histories.
// ⚠️ Correlated sisters split credit (tree_path_dependent SHAP), so ranks WITHIN a sister group are noise.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeaturePoint } from '@/lib/modelMonitor';
import { HOLDOUT_START, fetchFamily, familyColor, monthLabel, pct, signedPct } from '@/lib/modelMonitor';

function Spark({ values, color, signed }: { values: (number | null)[]; color: string; signed?: boolean }) {
  const W = 140, H = 28;
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <svg width={W} height={H} />;
  const lo = signed ? -Math.max(...v.map(Math.abs)) : Math.min(...v);
  const hi = signed ? -lo : Math.max(...v);
  const span = hi - lo || 1;
  let pen = false;
  const d = values.map((x, i) => {
    if (x == null) { pen = false; return ''; }
    const s = `${pen ? 'L' : 'M'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((x - lo) / span) * H).toFixed(1)}`;
    pen = true;
    return s;
  }).join(' ');
  return (
    <svg width={W} height={H} aria-hidden="true">
      {signed && <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--border-soft)" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

export function FamilyDrilldown({ modelId, family, contributionValid, onClose }: {
  modelId: string;
  family: string;
  contributionValid: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<FeaturePoint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    setRows(null); setErr(null);
    fetchFamily(modelId, family).then(setRows).catch((e) => setErr(String(e)));
    // the drill-down sits at the foot of the page; a click on a family near the top must bring it
    // into view or it reads as "nothing happened"
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [modelId, family]);

  const feats = useMemo(() => {
    if (!rows) return [];
    const m = new Map<string, FeaturePoint[]>();
    for (const r of rows) m.set(r.feature, [...(m.get(r.feature) ?? []), r]);
    return Array.from(m.entries()).map(([feature, s]) => {
      const sorted = s.sort((a, b) => a.date.localeCompare(b.date));
      return { feature, series: sorted, last: sorted[sorted.length - 1] };
    }).sort((a, b) => (b.last.reliance_12m ?? 0) - (a.last.reliance_12m ?? 0));
  }, [rows]);

  const col = familyColor(family);
  const asof = feats[0]?.last.date ?? null;
  return (
    <section ref={ref} className="panel" style={{ borderTop: `3px solid ${col}`, scrollMarginTop: 16 }}>
      <header className="px-5 py-4 flex items-start justify-between gap-4"
              style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: col }}>{family} — feature by feature</h2>
          <p className="text-xs text-[var(--tx-dim)] mt-1">
            Trailing 12 months to {monthLabel(asof)}, ordered by attention. Histories run 2015 → now
            {` (2024+ is spent holdout)`}. Correlated sister features split credit between them, so
            compare the family total before any single feature.
          </p>
        </div>
        <button onClick={onClose} className="text-xs font-bold text-[var(--tx-mut)] hover:text-[var(--tx)]">Close</button>
      </header>
      <div className="px-5 py-3 overflow-x-auto">
        {err && <p className="text-sm text-[var(--neg)]">Couldn&apos;t load this family: {err}</p>}
        {!rows && !err && <p className="text-sm text-[var(--tx-dim)]">Loading…</p>}
        {feats.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--tx-dim)] text-left">
                <th className="font-semibold py-1">Feature</th>
                <th className="font-semibold text-right">Attention</th>
                <th className="font-semibold text-right">Contribution</th>
                <th className="font-semibold text-right">Factor payoff (IC)</th>
                <th className="font-semibold pl-4">Attention, 2015 → now</th>
                <th className="font-semibold pl-4">Contribution, 2015 → now</th>
              </tr>
            </thead>
            <tbody>
              {feats.map(({ feature, series, last }) => (
                <tr key={feature} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td className="py-1.5 font-mono text-[12px] text-[var(--tx)]">
                    {feature}
                    <span className="text-[11px] text-[var(--tx-dim)] ml-1.5 font-sans">#{last.reliance_rank}</span>
                  </td>
                  <td className="text-right tabular-nums">{pct(last.reliance_12m)}</td>
                  <td className="text-right tabular-nums font-semibold"
                      style={{ color: last.contribution_12m == null ? 'var(--tx-dim)'
                        : last.contribution_12m >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {contributionValid ? signedPct(last.contribution_12m) : 'withheld'}
                  </td>
                  <td className="text-right tabular-nums text-[var(--tx-mut)]">
                    {last.payoff_12m == null ? 'no series' : `${last.payoff_12m >= 0 ? '+' : ''}${last.payoff_12m.toFixed(3)}`}
                  </td>
                  <td className="pl-4"><Spark values={series.map((p) => p.reliance_12m)} color={col} /></td>
                  <td className="pl-4">
                    {contributionValid
                      ? <Spark values={series.map((p) => p.contribution_12m)} color={col} signed />
                      : <span className="text-[11px] text-[var(--tx-dim)]">withheld</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-[var(--tx-dim)] mt-2">
          Attention: share of the month&apos;s mean |SHAP|. Contribution: share of the month&apos;s gross
          contribution. Factor payoff: the factor&apos;s own sign-aligned within-sector IC — how the factor
          did, not how the model used it. The # is this month&apos;s attention rank. Holdout boundary {HOLDOUT_START.slice(0, 4)}.
        </p>
      </div>
    </section>
  );
}
