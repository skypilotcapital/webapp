// Hand-rolled SVG charts for the Portfolios hub (the frontend has no chart lib, by design).

interface FrontierPoint { xLabel: string; y: number | null; highlight?: boolean; }

/** Small frontier: y (e.g. IR) across ordered parameter points, evenly spaced, labelled. */
export function FrontierChart({ points, height = 96 }: { points: FrontierPoint[]; height?: number }) {
  const W = 240, PL = 14, PR = 14, PT = 16, PB = 18;
  const cw = W - PL - PR, ch = height - PT - PB;
  const ys = points.map((p) => p.y).filter((v): v is number => v != null);
  if (!ys.length) return <div className="text-[10px] dim">no data</div>;
  const mn = Math.min(...ys, 0) * 0.95, mx = Math.max(...ys) * 1.12;
  const n = points.length;
  const xAt = (i: number) => PL + (n === 1 ? cw / 2 : (i / (n - 1)) * cw);
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn || 1)) * ch;
  let path = '';
  points.forEach((p, i) => { if (p.y != null) path += `${path ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)} `; });
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {[0, 0.5, 1].map((f) => { const y = PT + ch - f * ch; return <line key={f} x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border-soft)" strokeWidth="1" />; })}
      <path d={path} fill="none" stroke="var(--teal)" strokeWidth="1.8" />
      {points.map((p, i) => {
        if (p.y == null) return null;
        // endpoints anchor inward so wide value labels (e.g. "1.94") never clip the SVG edge
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        return (
          <g key={i}>
            <circle cx={xAt(i)} cy={yAt(p.y)} r={p.highlight ? 4.5 : 3.4}
              fill={p.highlight ? 'var(--amber)' : 'var(--teal)'} stroke="var(--panel)" strokeWidth="1" />
            <text x={xAt(i)} y={yAt(p.y) - 7} textAnchor={anchor} fontSize="8.5" fill="var(--tx-mut)" className="mono">{p.y.toFixed(2)}</text>
            <text x={xAt(i)} y={height - 6} textAnchor={anchor} fontSize="8.5" fill="var(--tx-dim)">{p.xLabel}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface Series { label: string; color: string; values: (number | null)[]; dash?: boolean; }

/** Cumulative (base 100) multi-line chart with year ticks + legend. Optional in-sample/OOS boundary marker. */
export function CumulativeChart({ dates, series, height = 240, boundaryDate, log = false }: { dates: string[]; series: Series[]; height?: number; boundaryDate?: string; log?: boolean }) {
  const W = 900, PL = 46, PR = 14, PT = 10, PB = 26;
  const cw = W - PL - PR, ch = height - PT - PB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length || dates.length < 2) return <div className="text-[11px] dim py-8 text-center">no series</div>;
  // log scale (values are always > 0 — growth of 100): scale + ticks live in log10 space, labels stay in level units
  const useLog = log && all.every((v) => v > 0);
  const T = useLog ? Math.log10 : (x: number) => x;
  const rawMn = Math.min(...all), rawMx = Math.max(...all);
  const tSpan = (T(rawMx) - T(rawMn)) || 1;
  const mn = useLog ? T(rawMn) - tSpan * 0.03 : rawMn * 0.97;
  const mx = useLog ? T(rawMx) + tSpan * 0.03 : rawMx * 1.03;
  const xAt = (i: number) => PL + (i / (dates.length - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((T(v) - mn) / (mx - mn || 1)) * ch;
  const bIdx = boundaryDate ? dates.findIndex((d) => d >= boundaryDate) : -1;
  const pathOf = (vals: (number | null)[]) => {
    let d = '', pen = true;
    vals.forEach((v, i) => { if (v == null) { pen = true; return; } d += `${pen ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; pen = false; });
    return d;
  };
  // tick VALUES in level units (so labels read "100, 150, …"); positioned via yAt through the log transform
  const ticks = Array.from({ length: 6 }, (_, i) => { const t = mn + (i / 5) * (mx - mn); return useLog ? Math.pow(10, t) : t; });
  const years: { i: number; y: string }[] = [];
  let last = '';
  dates.forEach((d, i) => { const y = d.slice(0, 4); if (y !== last && +y % 3 === 0) { years.push({ i, y }); last = y; } });
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yAt(v).toFixed(1)} x2={W - PR} y2={yAt(v).toFixed(1)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--tx-dim)">{v.toFixed(0)}</text>
        </g>
      ))}
      {bIdx > 0 && (
        <g>
          <line x1={xAt(bIdx)} y1={PT} x2={xAt(bIdx)} y2={PT + ch} stroke="var(--tx-mut)" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
          <text x={xAt(bIdx) + 3} y={PT + 9} fontSize="8.5" fill="var(--tx-mut)">live →</text>
        </g>
      )}
      {series.map((s, i) => (
        <path key={`${s.label}-${i}`} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={s.dash ? 1.5 : 2}
          strokeDasharray={s.dash ? '5 3' : undefined} opacity={s.dash ? 0.75 : 1} />
      ))}
      {years.map(({ i, y }) => <text key={y} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{y}</text>)}
    </svg>
  );
}

/** Underwater / drawdown area. Optional in-sample/OOS boundary marker. */
export function DrawdownChart({ dates, dd, height = 120, boundaryDate }: { dates: string[]; dd: (number | null)[]; height?: number; boundaryDate?: string }) {
  const W = 900, PL = 46, PR = 14, PT = 8, PB = 22;
  const cw = W - PL - PR, ch = height - PT - PB;
  const vals = dd.filter((v): v is number => v != null);
  if (!vals.length) return null;
  const mn = Math.min(...vals), mx = 0;
  const xAt = (i: number) => PL + (i / (dates.length - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn || 1)) * ch;
  const bIdx = boundaryDate ? dates.findIndex((d) => d >= boundaryDate) : -1;
  let line = '', pen = true;
  dd.forEach((v, i) => { if (v == null) { pen = true; return; } line += `${pen ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; pen = false; });
  const area = `${line} L${xAt(dd.length - 1).toFixed(1)} ${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)} ${yAt(0).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {[0, 0.5, 1].map((f) => { const v = mn * f; return (
        <g key={f}><line x1={PL} y1={yAt(v)} x2={W - PR} y2={yAt(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="8" fill="var(--tx-dim)">{(v * 100).toFixed(0)}%</text></g>); })}
      <path d={area} fill="rgba(248,113,113,0.12)" stroke="none" />
      <path d={line} fill="none" stroke="var(--neg)" strokeWidth="1.6" />
      {bIdx > 0 && <line x1={xAt(bIdx)} y1={PT} x2={xAt(bIdx)} y2={PT + ch} stroke="var(--tx-mut)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />}
    </svg>
  );
}

interface LineSeries { label: string; color: string; values: (number | null)[]; }

/** Generic multi-line time series with a horizontal reference line (rolling IR, batting avg, etc.). */
export function MultiLineChart({ dates, series, height = 190, refY = 0, refLabel, yFmt, yDomain }: {
  dates: string[]; series: LineSeries[]; height?: number; refY?: number | null; refLabel?: string;
  yFmt: (v: number) => string; yDomain?: [number, number];
}) {
  const W = 900, PL = 48, PR = 16, PT = 12, PB = 24;
  const cw = W - PL - PR, ch = height - PT - PB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length || dates.length < 2) return <div className="text-[11px] dim py-8 text-center">not enough data yet</div>;
  let mn = yDomain ? yDomain[0] : Math.min(...all, ...(refY != null ? [refY] : []));
  let mx = yDomain ? yDomain[1] : Math.max(...all, ...(refY != null ? [refY] : []));
  if (mn === mx) { mn -= 1; mx += 1; }
  if (!yDomain) { const p = (mx - mn) * 0.08; mn -= p; mx += p; }
  const xAt = (i: number) => PL + (i / (dates.length - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn)) * ch;
  const pathOf = (vals: (number | null)[]) => {
    let d = '', pen = true;
    vals.forEach((v, i) => { if (v == null) { pen = true; return; } d += `${pen ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; pen = false; });
    return d;
  };
  const ticks = Array.from({ length: 5 }, (_, i) => mn + (i / 4) * (mx - mn));
  const years: { i: number; y: string }[] = []; let last = '';
  dates.forEach((d, i) => { const y = d.slice(0, 4); if (y !== last && +y % 3 === 0) { years.push({ i, y }); last = y; } });
  const refPix = refY != null ? yAt(refY) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yAt(v)} x2={W - PR} y2={yAt(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="var(--tx-dim)">{yFmt(v)}</text>
        </g>
      ))}
      {refY != null && refY >= mn && refY <= mx && (
        <>
          <line x1={PL} y1={refPix} x2={W - PR} y2={refPix} stroke="var(--tx-mut)" strokeWidth="1.2" strokeDasharray="4 3" />
          {refLabel && <text x={W - PR - 2} y={refPix - 3} textAnchor="end" fontSize="8.5" fill="var(--tx-mut)">{refLabel}</text>}
        </>
      )}
      {series.map((s, i) => (
        <path key={`${s.label}-${i}`} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {years.map(({ i, y }) => <text key={y} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{y}</text>)}
    </svg>
  );
}

/** Stacked area with ALGEBRAIC cumulative stacking (handles mixed signs — a band can dip below 0).
 *  The bold top line = the running total (the sum of all series). Series values may contain nulls
 *  only via `?? 0`; pass a already-trimmed (leading-null-free) window for a clean start. */
export function StackedAreaChart({ dates, series, height = 220, refY = 0, refLabel, yFmt }: {
  dates: string[]; series: LineSeries[]; height?: number; refY?: number; refLabel?: string; yFmt: (v: number) => string;
}) {
  const W = 900, PL = 48, PR = 16, PT = 12, PB = 24;
  const cw = W - PL - PR, ch = height - PT - PB;
  const n = dates.length;
  if (n < 2 || !series.length) return <div className="text-[11px] dim py-8 text-center">not enough data yet</div>;
  const bands: { color: string; lower: number[]; upper: number[] }[] = [];
  let prev = new Array(n).fill(0) as number[];
  series.forEach((s) => {
    const upper = prev.map((b, i) => b + (s.values[i] ?? 0));
    bands.push({ color: s.color, lower: prev, upper });
    prev = upper;
  });
  const total = prev;
  const edges = [...bands.flatMap((b) => [...b.lower, ...b.upper]), refY];
  let mn = Math.min(...edges), mx = Math.max(...edges);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const xAt = (i: number) => PL + (i / (n - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn)) * ch;
  const areaOf = (lo: number[], up: number[]) => {
    let d = '';
    up.forEach((v, i) => { d += `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; });
    for (let i = n - 1; i >= 0; i--) d += `L${xAt(i).toFixed(1)} ${yAt(lo[i]).toFixed(1)} `;
    return d + 'Z';
  };
  const lineOf = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => mn + (i / 4) * (mx - mn));
  const years: { i: number; y: string }[] = []; let last = '';
  dates.forEach((d, i) => { const y = d.slice(0, 4); if (y !== last && +y % 3 === 0) { years.push({ i, y }); last = y; } });
  const refPix = refY != null ? yAt(refY) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yAt(v)} x2={W - PR} y2={yAt(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="var(--tx-dim)">{yFmt(v)}</text>
        </g>
      ))}
      {bands.map((b, i) => <path key={i} d={areaOf(b.lower, b.upper)} fill={b.color} fillOpacity="0.5" stroke="none" />)}
      {refY >= mn && refY <= mx && (
        <line x1={PL} y1={refPix} x2={W - PR} y2={refPix} stroke="var(--tx-mut)" strokeWidth="1.1" strokeDasharray="4 3" />
      )}
      <path d={lineOf(total)} fill="none" stroke="var(--tx)" strokeWidth="1.6" strokeLinejoin="round" />
      {refLabel && refY >= mn && refY <= mx && <text x={W - PR - 2} y={refPix - 3} textAnchor="end" fontSize="8.5" fill="var(--tx-mut)">{refLabel}</text>}
      {years.map(({ i, y }) => <text key={y} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{y}</text>)}
    </svg>
  );
}

interface ScatterPoint { label: string; color: string; x: number; y: number; highlight?: boolean; }

/** Metric-vs-metric scatter: one labelled dot per model. */
export function ScatterChart({ points, xLabel, yLabel, xFmt, yFmt, height = 300 }: {
  points: ScatterPoint[]; xLabel: string; yLabel: string;
  xFmt: (v: number) => string; yFmt: (v: number) => string; height?: number;
}) {
  const W = 680, PL = 58, PR = 20, PT = 14, PB = 42;
  const cw = W - PL - PR, ch = height - PT - PB;
  if (!points.length) return <div className="text-[11px] dim py-10 text-center">no models selected</div>;
  const dom = (mn: number, mx: number): [number, number] => {
    if (mn === mx) { const d = Math.abs(mn) || 1; return [mn - d * 0.5, mx + d * 0.5]; }
    const p = (mx - mn) * 0.18; return [mn - p, mx + p];
  };
  const [xmn, xmx] = dom(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)));
  const [ymn, ymx] = dom(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));
  const xAt = (v: number) => PL + ((v - xmn) / (xmx - xmn)) * cw;
  const yAt = (v: number) => PT + ch - ((v - ymn) / (ymx - ymn)) * ch;
  const xticks = Array.from({ length: 5 }, (_, i) => xmn + (i / 4) * (xmx - xmn));
  const yticks = Array.from({ length: 5 }, (_, i) => ymn + (i / 4) * (ymx - ymn));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {yticks.map((v, i) => (
        <g key={`y${i}`}>
          <line x1={PL} y1={yAt(v)} x2={PL + cw} y2={yAt(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 7} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="var(--tx-dim)">{yFmt(v)}</text>
        </g>
      ))}
      {xticks.map((v, i) => (
        <g key={`x${i}`}>
          <line x1={xAt(v)} y1={PT} x2={xAt(v)} y2={PT + ch} stroke="var(--border-soft)" strokeWidth="1" opacity="0.55" />
          <text x={xAt(v)} y={PT + ch + 15} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{xFmt(v)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const rightEdge = xAt(p.x) > PL + cw * 0.72;
        return (
          <g key={`${p.label}-${i}`}>
            <circle cx={xAt(p.x)} cy={yAt(p.y)} r={p.highlight ? 7 : 5.5} fill={p.color} stroke="var(--panel)" strokeWidth={p.highlight ? 2 : 1.2} />
            <text x={xAt(p.x) + (rightEdge ? -9 : 9)} y={yAt(p.y) + 3.5} textAnchor={rightEdge ? 'end' : 'start'} fontSize="10.5" fontWeight="600" fill={p.color} className="mono">{p.label}</text>
          </g>
        );
      })}
      <text x={PL + cw / 2} y={height - 5} textAnchor="middle" fontSize="10" fill="var(--tx-mut)">{xLabel}</text>
      <text x={13} y={PT + ch / 2} textAnchor="middle" fontSize="10" fill="var(--tx-mut)" transform={`rotate(-90 13 ${PT + ch / 2})`}>{yLabel}</text>
    </svg>
  );
}

/** Horizontal bars — diverging (from a centre zero) for signed values (exposures, return contributions)
 *  or left-anchored for positive-only (risk %). One row per item; label left, value right. */
export function HBarChart({ bars, valFmt, labelW = 112, rowH = 22, diverging = true,
  posColor = 'var(--pos)', negColor = 'var(--neg)' }: {
  bars: { label: string; value: number; color?: string }[];
  valFmt: (v: number) => string; labelW?: number; rowH?: number; diverging?: boolean;
  posColor?: string; negColor?: string;
}) {
  // viewBox ~matches the narrow report column so `w-full` renders near 1:1 (no downscale) — keeps text
  // legible and rows uncramped. Values sit in a fixed right-aligned column (never collide with bars).
  const W = 384, valW = 42, PT = 4, PB = 4;
  const barX = labelW, barW = W - labelW - valW;
  const H = PT + PB + bars.length * rowH;
  if (!bars.length) return <div className="text-[11px] dim py-4 text-center">no data</div>;
  const maxAbs = Math.max(1e-9, ...bars.map((b) => Math.abs(b.value)));
  const zeroX = diverging ? barX + barW / 2 : barX;
  const scale = (diverging ? barW / 2 : barW) / maxAbs;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {diverging && <line x1={zeroX} y1={PT} x2={zeroX} y2={H - PB} stroke="var(--border)" strokeWidth="1" />}
      {bars.map((b, i) => {
        const y = PT + i * rowH;
        const w = Math.max(0.6, Math.abs(b.value) * scale);
        const x = b.value >= 0 ? zeroX : zeroX - w;
        const col = b.color ?? (b.value >= 0 ? posColor : negColor);
        return (
          <g key={b.label}>
            <text x={labelW - 7} y={y + rowH / 2 + 3.5} textAnchor="end" fontSize="11" fill="var(--tx-mut)">{b.label}</text>
            <rect x={x} y={y + 3.5} width={w} height={rowH - 7} fill={col} opacity={0.88} rx="2" />
            <text x={W - 2} y={y + rowH / 2 + 3.5} textAnchor="end" fontSize="9.5" fill="var(--tx-dim)" className="mono">{valFmt(b.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Histogram — bars coloured by sign, dashed zero line (monthly active-return distribution). */
export function Histogram({ bins, height = 150, xFmt }: {
  bins: { x: number; count: number }[]; height?: number; xFmt: (v: number) => string;
}) {
  const W = 680, PL = 8, PR = 8, PT = 10, PB = 24;
  const cw = W - PL - PR, ch = height - PT - PB;
  if (bins.length < 2) return <div className="text-[11px] dim py-6 text-center">not enough data</div>;
  const maxC = Math.max(...bins.map((b) => b.count), 1);
  const mn = bins[0].x, mx = bins[bins.length - 1].x, span = mx - mn || 1;
  const bw = cw / bins.length;
  const zeroX = PL + ((0 - mn) / span) * cw;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {bins.map((b, i) => {
        const h = (b.count / maxC) * ch;
        return <rect key={i} x={PL + i * bw + 0.5} y={PT + ch - h} width={Math.max(1, bw - 1)} height={Math.max(h, 0)}
          fill={b.x >= 0 ? 'var(--pos)' : 'var(--neg)'} opacity={0.5} rx="0.5" />;
      })}
      {zeroX >= PL && zeroX <= PL + cw &&
        <line x1={zeroX} y1={PT} x2={zeroX} y2={PT + ch} stroke="var(--tx-mut)" strokeWidth="1.2" strokeDasharray="3 3" />}
      <line x1={PL} y1={PT + ch} x2={PL + cw} y2={PT + ch} stroke="var(--border-soft)" strokeWidth="1" />
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) =>
        <text key={i} x={PL + f * cw} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{xFmt(mn + f * span)}</text>)}
    </svg>
  );
}
