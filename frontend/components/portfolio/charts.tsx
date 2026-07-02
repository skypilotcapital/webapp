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

/** Cumulative (base 100) multi-line chart with year ticks + legend. */
export function CumulativeChart({ dates, series, height = 240 }: { dates: string[]; series: Series[]; height?: number }) {
  const W = 900, PL = 46, PR = 14, PT = 10, PB = 26;
  const cw = W - PL - PR, ch = height - PT - PB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length || dates.length < 2) return <div className="text-[11px] dim py-8 text-center">no series</div>;
  const mn = Math.min(...all) * 0.97, mx = Math.max(...all) * 1.03;
  const xAt = (i: number) => PL + (i / (dates.length - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn || 1)) * ch;
  const pathOf = (vals: (number | null)[]) => {
    let d = '', pen = true;
    vals.forEach((v, i) => { if (v == null) { pen = true; return; } d += `${pen ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `; pen = false; });
    return d;
  };
  const ticks = Array.from({ length: 6 }, (_, i) => mn + (i / 5) * (mx - mn));
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
      {series.map((s, i) => (
        <path key={`${s.label}-${i}`} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={s.dash ? 1.5 : 2}
          strokeDasharray={s.dash ? '5 3' : undefined} opacity={s.dash ? 0.75 : 1} />
      ))}
      {years.map(({ i, y }) => <text key={y} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--tx-dim)">{y}</text>)}
    </svg>
  );
}

/** Underwater / drawdown area. */
export function DrawdownChart({ dates, dd, height = 120 }: { dates: string[]; dd: (number | null)[]; height?: number }) {
  const W = 900, PL = 46, PR = 14, PT = 8, PB = 22;
  const cw = W - PL - PR, ch = height - PT - PB;
  const vals = dd.filter((v): v is number => v != null);
  if (!vals.length) return null;
  const mn = Math.min(...vals), mx = 0;
  const xAt = (i: number) => PL + (i / (dates.length - 1)) * cw;
  const yAt = (v: number) => PT + ch - ((v - mn) / (mx - mn || 1)) * ch;
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
    </svg>
  );
}

interface LineSeries { label: string; color: string; values: (number | null)[]; }

/** Generic multi-line time series with a horizontal reference line (rolling IR, batting avg, etc.). */
export function MultiLineChart({ dates, series, height = 190, refY = 0, refLabel, yFmt, yDomain }: {
  dates: string[]; series: LineSeries[]; height?: number; refY?: number; refLabel?: string;
  yFmt: (v: number) => string; yDomain?: [number, number];
}) {
  const W = 900, PL = 48, PR = 16, PT = 12, PB = 24;
  const cw = W - PL - PR, ch = height - PT - PB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length || dates.length < 2) return <div className="text-[11px] dim py-8 text-center">not enough data yet</div>;
  let mn = yDomain ? yDomain[0] : Math.min(...all, refY);
  let mx = yDomain ? yDomain[1] : Math.max(...all, refY);
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
  const refPix = yAt(refY);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yAt(v)} x2={W - PR} y2={yAt(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="var(--tx-dim)">{yFmt(v)}</text>
        </g>
      ))}
      {refY >= mn && refY <= mx && (
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
