'use client';

// Panels 1 + 2 — "How did we get here?", 2015 → now on ONE shared time axis.
//   top:    what the model leans on — each family's share of the month's attention (stacked to 100%)
//   bottom: what its use of each family earned — trailing 12-month share of gross contribution
// Reliance moves ~0.1pp a month but several points over years, so the multi-year view is the point;
// a month-over-month view of it is noise. 2024 onward is shaded: spent holdout, read but never fitted.

import { useMemo, useState } from 'react';
import type { FamilyPoint } from '@/lib/modelMonitor';
import { HOLDOUT_START, familyColor, monthLabel, pct, signedPct } from '@/lib/modelMonitor';

export function FamilyHistory({ history, families, contributionValid, onPick }: {
  history: FamilyPoint[];
  families: string[];
  contributionValid: boolean;
  onPick: (family: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const dates = useMemo(() =>
    Array.from(new Set(history.filter((p) => p.reliance != null).map((p) => p.date))).sort(), [history]);
  const by = useMemo(() => {
    const m = new Map<string, FamilyPoint>();
    for (const p of history) m.set(`${p.date}|${p.family}`, p);
    return m;
  }, [history]);

  if (dates.length < 2) return null;
  const W = 900, H1 = 190, H2 = 170, L = 46, Rt = 12, T = 8, gap = 26;
  const iw = W - L - Rt;
  const xi = (i: number) => L + (i / (dates.length - 1)) * iw;
  const hold = dates.findIndex((d) => d >= HOLDOUT_START);

  // stacked reliance
  const y1 = (v: number) => T + (1 - v) * H1;
  const bands: { family: string; d: string }[] = [];
  const cum = new Array(dates.length).fill(0);
  for (const f of families) {
    const lo = [...cum];
    dates.forEach((d, i) => { cum[i] += by.get(`${d}|${f}`)?.reliance ?? 0; });
    const top = dates.map((_, i) => `${i ? 'L' : 'M'}${xi(i).toFixed(1)},${y1(cum[i]).toFixed(1)}`).join(' ');
    const bot = dates.map((_, i) => `L${xi(dates.length - 1 - i).toFixed(1)},${y1(lo[dates.length - 1 - i]).toFixed(1)}`).join(' ');
    bands.push({ family: f, d: `${top} ${bot} Z` });
  }

  // contribution lines
  const y2top = T + H1 + gap;
  const vals = history.map((p) => p.contribution_12m).filter((v): v is number => v != null);
  const m2 = Math.max(0.05, ...vals.map(Math.abs)) * 1.1;
  const y2 = (v: number) => y2top + (1 - (v + m2) / (2 * m2)) * H2;
  const lines = families.map((f) => {
    let pen = false;
    const d = dates.map((dt, i) => {
      const v = by.get(`${dt}|${f}`)?.contribution_12m;
      if (v == null) { pen = false; return ''; }
      const s = `${pen ? 'L' : 'M'}${xi(i).toFixed(1)},${y2(v).toFixed(1)}`;
      pen = true;
      return s;
    }).join(' ');
    return { family: f, d };
  });

  const years = dates.map((d, i) => ({ y: d.slice(0, 4), i })).filter((o, k, a) => k === 0 || o.y !== a[k - 1].y);
  const totalH = y2top + H2 + 22;
  const ci = cursor;
  const shown = focus ? [focus] : families;

  return (
    <section className="panel">
      <header className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <h2 className="text-base font-bold text-[var(--tx)]">How did we get here?</h2>
        <p className="text-xs text-[var(--tx-dim)] mt-1">
          Top: what the model leans on — each family&apos;s share of the month&apos;s attention. Bottom: what
          its use of each family earned — trailing 12-month share of gross contribution. Shaded: 2024
          onward, spent holdout. Hover a family in the legend to isolate it; click to open it.
        </p>
      </header>
      <div className="px-4 pt-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          {families.map((f) => (
            <button key={f} onMouseEnter={() => setFocus(f)} onMouseLeave={() => setFocus(null)}
                    onClick={() => onPick(f)} className="text-xs font-semibold flex items-center gap-1.5"
                    style={{ color: familyColor(f), opacity: focus && focus !== f ? 0.4 : 1 }}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: familyColor(f) }} />{f}
            </button>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full" role="img"
             aria-label="Reliance and contribution by factor family over time"
             onMouseLeave={() => setCursor(null)}
             onMouseMove={(e) => {
               const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
               const px = ((e.clientX - r.left) / r.width) * W;
               const i = Math.round(((px - L) / iw) * (dates.length - 1));
               setCursor(i >= 0 && i < dates.length ? i : null);
             }}>
          {hold > 0 && (
            <rect x={xi(hold)} y={T} width={xi(dates.length - 1) - xi(hold)} height={y2top + H2 - T}
                  fill="var(--border-soft)" opacity={0.55} />
          )}
          {bands.map((b) => (
            <path key={b.family} d={b.d} fill={familyColor(b.family)}
                  opacity={focus && focus !== b.family ? 0.12 : 0.75} />
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <text key={v} x={L - 6} y={y1(v) + 3} textAnchor="end" fontSize={10} fill="var(--tx-dim)">{v * 100}%</text>
          ))}
          {contributionValid ? (
            <>
              <line x1={L} x2={W - Rt} y1={y2(0)} y2={y2(0)} stroke="var(--border)" />
              {lines.map((l) => (
                <path key={l.family} d={l.d} fill="none" stroke={familyColor(l.family)}
                      strokeWidth={focus === l.family ? 2.5 : 1.4}
                      opacity={focus && focus !== l.family ? 0.15 : 0.9} />
              ))}
              {[-m2, 0, m2].map((v) => (
                <text key={v} x={L - 6} y={y2(v) + 3} textAnchor="end" fontSize={10} fill="var(--tx-dim)">
                  {signedPct(v, 0)}
                </text>
              ))}
            </>
          ) : (
            <text x={W / 2} y={y2top + H2 / 2} textAnchor="middle" fontSize={12} fill="var(--amber)">
              Contribution withheld for this model — see the note at the top of the page.
            </text>
          )}
          {years.map((o) => (
            <text key={o.y} x={xi(o.i)} y={totalH - 6} fontSize={10} fill="var(--tx-dim)" textAnchor="middle">{o.y}</text>
          ))}
          {ci != null && (
            <line x1={xi(ci)} x2={xi(ci)} y1={T} y2={y2top + H2} stroke="var(--tx-dim)" strokeDasharray="2 3" />
          )}
        </svg>
        <div className="text-[11px] text-[var(--tx-mut)] min-h-[34px] pb-2">
          {ci != null ? (
            <>
              <span className="font-bold text-[var(--tx)]">{monthLabel(dates[ci])}</span>
              {shown.map((f) => {
                const p = by.get(`${dates[ci]}|${f}`);
                return (
                  <span key={f} className="ml-3" style={{ color: familyColor(f) }}>
                    {f} {pct(p?.reliance)} attention
                    {contributionValid && p?.contribution_12m != null ? ` · ${signedPct(p.contribution_12m)} earned (12m)` : ''}
                  </span>
                );
              })}
            </>
          ) : 'Hover the chart for a month’s readings.'}
        </div>
      </div>
    </section>
  );
}
