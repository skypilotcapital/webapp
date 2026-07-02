// Hand-rolled SVG charts for the Portfolios hub (the frontend has no chart lib, by design).

interface FrontierPoint { xLabel: string; y: number | null; highlight?: boolean; }

/** Small frontier: y (e.g. IR) across ordered parameter points, evenly spaced, labelled. */
export function FrontierChart({ points, height = 96 }: { points: FrontierPoint[]; height?: number }) {
  const W = 240, PL = 6, PR = 12, PT = 8, PB = 18;
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
      {points.map((p, i) => p.y != null && (
        <g key={i}>
          <circle cx={xAt(i)} cy={yAt(p.y)} r={p.highlight ? 4.5 : 3.4}
            fill={p.highlight ? 'var(--amber)' : 'var(--teal)'} stroke="var(--panel)" strokeWidth="1" />
          <text x={xAt(i)} y={yAt(p.y) - 7} textAnchor="middle" fontSize="8.5" fill="var(--tx-mut)" className="mono">{p.y.toFixed(2)}</text>
          <text x={xAt(i)} y={height - 6} textAnchor="middle" fontSize="8.5" fill="var(--tx-dim)">{p.xLabel}</text>
        </g>
      ))}
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
      {series.map((s) => (
        <path key={s.label} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={s.dash ? 1.5 : 2}
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
