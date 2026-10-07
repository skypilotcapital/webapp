'use client';

// Panel 3 — "Is it leaning on what works?"
//
// Variant B (settled in design pass 1): both axes standardised against each family's own 2015-23 norm
// (z of the 12-month mean), so families are comparable and the corners become a diagnosis; dot size
// restores the magnitude the standardising removes (= this month's share of attention). Hovering or
// selecting a family draws its last 12 months as a faint path (owner, 2026-10-07: trail on hover).
//
// ⚠️ z-scores rescale every family by its OWN volatility: a calm family's small move can sit further
// out than a noisy family's large one. For "how big", read panels 1-2 in absolute shares.

import { useMemo, useState } from 'react';
import type { FamilyNow, FamilyPoint } from '@/lib/modelMonitor';
import { familyColor, monthLabel } from '@/lib/modelMonitor';

const R = 3.5; // axis half-range in z

export function RelianceQuadrant({ rows, history, onPick, selected }: {
  rows: FamilyNow[];
  history: FamilyPoint[];
  onPick: (family: string) => void;
  selected: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 420, H = 320, pad = 34;
  const sx = (v: number) => pad + ((Math.max(-R, Math.min(R, v)) + R) / (2 * R)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((Math.max(-R, Math.min(R, v)) + R) / (2 * R)) * (H - 2 * pad);
  const pts = rows.filter((r) => r.z_reliance_12m != null && r.z_contribution_12m != null);
  const focus = hover ?? selected;

  const trail = useMemo(() => {
    if (!focus) return '';
    const h = history.filter((p) => p.family === focus && p.z_reliance_12m != null && p.z_contribution_12m != null);
    return h.slice(-12).map((p, i) =>
      `${i ? 'L' : 'M'}${sx(p.z_reliance_12m as number).toFixed(1)},${sy(p.z_contribution_12m as number).toFixed(1)}`
    ).join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, history]);

  const asof = rows[0]?.quadrant_asof ?? null;
  return (
    <section className="panel h-full">
      <header className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <h2 className="text-base font-bold text-[var(--tx)]">Is it leaning on what works?</h2>
        <p className="text-xs text-[var(--tx-dim)] mt-1">
          Trailing 12 months as of {monthLabel(asof)}, each family against its own 2015–23 norm. Dot size:
          share of attention. Hover a family for its last 12 months.
        </p>
      </header>
      {pts.length === 0 ? (
        <p className="px-5 py-10 text-sm text-[var(--tx-dim)] text-center">
          Contribution is withheld for this model, so there is no vertical axis to plot.
        </p>
      ) : (
        <div className="px-3 py-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
               aria-label="Quadrant of reliance against contribution by factor family">
            <line x1={sx(0)} x2={sx(0)} y1={pad / 2} y2={H - pad / 2} stroke="var(--border)" />
            <line x1={pad / 2} x2={W - pad / 2} y1={sy(0)} y2={sy(0)} stroke="var(--border)" />
            <text x={W - pad} y={pad - 8} textAnchor="end" fontSize={11} fill="var(--pos)">leaning in · paying</text>
            <text x={W - pad} y={H - 8} textAnchor="end" fontSize={11} fill="var(--neg)">leaning in · not paying</text>
            <text x={pad} y={pad - 8} fontSize={11} fill="var(--tx-dim)">quiet · paying</text>
            <text x={pad} y={H - 8} fontSize={11} fill="var(--tx-dim)">quiet · not paying</text>
            <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="var(--tx-dim)">reliance vs norm →</text>
            <text x={10} y={H / 2} fontSize={10} fill="var(--tx-dim)" transform={`rotate(-90 10 ${H / 2})`}
                  textAnchor="middle">contribution vs norm →</text>
            {trail && <path d={trail} fill="none" stroke={familyColor(focus as string)} strokeWidth={1.5}
                            strokeDasharray="3 3" opacity={0.7} />}
            {pts.map((r) => {
              const cx = sx(r.z_reliance_12m as number);
              const cy = sy(r.z_contribution_12m as number);
              const rad = 4 + Math.sqrt(Math.max(0, r.attention ?? 0)) * 26;
              const col = familyColor(r.family);
              const dim = focus != null && focus !== r.family;
              return (
                <g key={r.family} onMouseEnter={() => setHover(r.family)} onMouseLeave={() => setHover(null)}
                   onClick={() => onPick(r.family)} style={{ cursor: 'pointer' }} opacity={dim ? 0.35 : 1}>
                  <circle cx={cx} cy={cy} r={rad} fill={col} fillOpacity={0.22} stroke={col} strokeWidth={1.5} />
                  <text x={cx} y={cy - rad - 3} textAnchor="middle" fontSize={11} fontWeight={600} fill={col}>
                    {r.family}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="text-[11px] text-[var(--tx-dim)] px-2 pb-2">
            Axes clipped at ±{R} (z of the 12-month mean vs 2015–23). Each family is scaled by its own
            volatility — compare sizes in the history panels below.
          </p>
        </div>
      )}
    </section>
  );
}
