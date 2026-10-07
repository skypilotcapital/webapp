'use client';

// Panel 5 — "Is the factor broken, or is it how we use it?"
//
// Per family, on one axis in z units against the 2015-23 norm: where the FACTOR'S OWN PAYOFF sits now
// (square), what the family's long-run coupling EXPECTS its contribution to be given that payoff
// (ring), and the ACTUAL contribution (dot). The gap — actual minus expected — is reported as a
// PERCENTILE of the 2015-23 residuals, never in sd: everything is a 12-month mean, so consecutive
// months share 11 of 12 observations and sd units read like t-statistics they are not.
//
// Read the gap IN PROPORTION TO THE COUPLING: a family whose contribution never tracked its factor has
// no expectation to depart from, so the ring fades and the row says "weak coupling".

import type { FamilyNow } from '@/lib/modelMonitor';
import { familyColor, monthLabel, ordinal } from '@/lib/modelMonitor';

const LO = -4;
const HI = 4;

function x(v: number, w: number) {
  const c = Math.max(LO, Math.min(HI, v));
  return ((c - LO) / (HI - LO)) * w;
}

function gapTone(p: number | null) {
  if (p == null) return 'var(--tx-dim)';
  if (p <= 12) return 'var(--neg)';
  if (p >= 88) return 'var(--pos)';
  return 'var(--tx-mut)';
}

export function FamilyGapPanel({ rows, asof, onPick }: {
  rows: FamilyNow[];
  asof: string | null;
  onPick: (family: string) => void;
}) {
  const W = 300;
  const withheld = rows.every((r) => r.actual == null);
  return (
    <section className="panel">
      <header className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <h2 className="text-base font-bold text-[var(--tx)]">Is the factor broken, or is it how we use it?</h2>
        <p className="text-xs text-[var(--tx-dim)] mt-1">
          Trailing 12 months as of {monthLabel(asof)} — the last month both feeds have. Square: the
          factor&apos;s own payoff. Ring: the contribution that payoff predicts, from the family&apos;s
          2015–23 coupling (faded when the coupling is weak). Dot: the actual contribution. Gap shown as
          a percentile of 2015–23.
        </p>
      </header>
      <div className="px-5 py-3">
        {withheld && (
          <p className="text-xs text-[var(--amber)] mb-2">
            Contribution is withheld for this model, so only the factor&apos;s own payoff is shown.
          </p>
        )}
        <div className="grid items-center gap-x-4 gap-y-2"
             style={{ gridTemplateColumns: '150px minmax(0,1fr) 92px minmax(0,220px)' }}>
          <span className="text-[11px] font-bold text-[var(--tx-dim)]">Family · attention</span>
          <span className="text-[11px] font-bold text-[var(--tx-dim)] flex justify-between">
            <span>below norm</span><span>2015–23 norm</span><span>above norm</span>
          </span>
          <span className="text-[11px] font-bold text-[var(--tx-dim)]">Gap</span>
          <span className="text-[11px] font-bold text-[var(--tx-dim)]">Reads as</span>
          {rows.map((r) => {
            const fade = r.coupling == null ? 0.25 : Math.max(0.2, Math.min(1, Math.abs(r.coupling) / 0.6));
            const col = familyColor(r.family);
            return (
              <div key={r.family} className="contents">
                <button onClick={() => onPick(r.family)} className="text-left text-sm font-semibold hover:underline"
                        style={{ color: col }}>
                  {r.family}
                  <span className="text-[11px] font-medium text-[var(--tx-dim)] ml-1.5">
                    {r.attention == null ? '' : `${(r.attention * 100).toFixed(1)}%`}
                  </span>
                </button>
                <svg viewBox={`0 0 ${W} 20`} className="w-full h-5" preserveAspectRatio="none" aria-hidden="true">
                  <line x1={0} x2={W} y1={10} y2={10} stroke="var(--border-soft)" strokeWidth={1} />
                  <line x1={x(0, W)} x2={x(0, W)} y1={2} y2={18} stroke="var(--border)" strokeWidth={1} />
                  {r.payoff_now != null && (
                    <rect x={x(r.payoff_now, W) - 4} y={6} width={8} height={8} fill="none"
                          stroke="var(--tx-mut)" strokeWidth={1.5} />
                  )}
                  {r.expected != null && (
                    <circle cx={x(r.expected, W)} cy={10} r={5} fill="none" stroke={col} strokeWidth={2}
                            opacity={fade} />
                  )}
                  {r.expected != null && r.actual != null && (
                    <line x1={x(r.expected, W)} x2={x(r.actual, W)} y1={10} y2={10} stroke={col}
                          strokeWidth={2} opacity={0.5} />
                  )}
                  {r.actual != null && <circle cx={x(r.actual, W)} cy={10} r={4.5} fill={col} />}
                </svg>
                <span className="text-sm font-bold tabular-nums" style={{ color: gapTone(r.gap_pctile) }}>
                  {r.gap_pctile == null ? '—' : `${ordinal(r.gap_pctile)}`}
                </span>
                <span className="text-xs text-[var(--tx-mut)]">
                  {r.payoff_now == null
                    ? 'no factor series — the size control, never a P01 factor'
                    : (r.reads_as ?? (withheld ? 'factor payoff only' : '—'))}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--tx-dim)] mt-3">
          Axis in z units against 2015–23 (clipped at ±4). The gap is the only number read as a
          percentile; coupling below 0.45 means the factor never predicted this family&apos;s contribution,
          so a large gap there carries little weight.
        </p>
      </div>
    </section>
  );
}
