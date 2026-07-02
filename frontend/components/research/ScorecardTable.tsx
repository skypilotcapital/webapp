'use client';

import React from 'react';
import type { P01ScorecardRow } from '@/types/api';

// ---------------------------------------------------------------------------
// Signal quality badge
// ---------------------------------------------------------------------------
type Quality = 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;

const QUALITY_STYLES: Record<string, string> = {
  Strong:      'bg-[rgba(52,211,153,0.14)] text-[var(--pos)] border border-[rgba(52,211,153,0.30)]',
  Moderate:    'bg-[rgba(56,189,248,0.13)] text-[var(--cyan)] border border-[rgba(56,189,248,0.30)]',
  Weak:        'bg-[rgba(251,191,36,0.13)] text-[var(--amber)] border border-[rgba(251,191,36,0.30)]',
  Investigate: 'bg-[rgba(248,113,113,0.13)] text-[var(--neg)] border border-[rgba(248,113,113,0.30)]',
};

// Display label — "Investigate" is internal; show "Negative" to users
const QUALITY_LABEL: Record<string, string> = {
  Strong:      'Strong',
  Moderate:    'Moderate',
  Weak:        'Weak',
  Investigate: 'Negative',
};

function QualityBadge({ quality }: { quality: Quality }) {
  if (!quality) return <span className="text-[var(--tx-dim)]">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${QUALITY_STYLES[quality] ?? 'bg-[var(--bg2)] text-[var(--tx-mut)]'}`}>
      {QUALITY_LABEL[quality] ?? quality}
    </span>
  );
}

// ---------------------------------------------------------------------------
// t-stat bar — bar scaled 0–5 with a reference tick at t=2 (significance)
// ---------------------------------------------------------------------------
function TStatBar({ tstat, direction }: { tstat: number | null; direction: 1 | -1 }) {
  if (tstat == null) return <span className="text-[var(--tx-dim)] text-xs">—</span>;
  const effective = tstat * direction;
  const pct = Math.min(Math.abs(tstat) / 5, 1);
  const refPct = 2 / 5; // t=2 threshold marker at 40% of bar
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="relative flex-1 h-1.5 rounded-full bg-[var(--bg2)]">
        <div
          className={`h-full rounded-full ${effective > 0 ? 'bg-[var(--pos)]' : 'bg-[var(--neg)]'}`}
          style={{ width: `${pct * 100}%` }}
        />
        {/* Reference tick at t = 2 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-[var(--tx-dim)]"
          style={{ left: `${refPct * 100}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-12 ${effective > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'} ${Math.abs(tstat) > 2 ? 'font-semibold' : ''}`}>
        {tstat >= 0 ? '+' : ''}{tstat.toFixed(2)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quintile sparkbar — 5 bars Q1→Q5 showing avg monthly return
// ---------------------------------------------------------------------------
const Q_COLORS = ['#dc2626', '#ea580c', '#64748b', '#0d9488', '#16a34a'];

function QuintileSparkbar({ row }: { row: P01ScorecardRow }) {
  const vals = [row.full_q1_avg, row.full_q2_avg, row.full_q3_avg, row.full_q4_avg, row.full_q5_avg];
  if (vals.every(v => v == null)) return <span className="text-[var(--tx-dim)] text-xs">—</span>;

  const w = 80;
  const h = 28;
  const barW = 10;
  const gap = 4;
  const totalW = 5 * barW + 4 * gap;
  const offsetX = (w - totalW) / 2;
  const baseY = h - 2;

  // Truncated y-axis: scale from min→max so the full height shows the spread.
  // This amplifies the visual difference between quintiles rather than scaling from 0.
  const nums = vals.filter((v): v is number => v != null);
  const minVal = Math.min(...nums);
  const maxVal = Math.max(...nums);
  const range = maxVal - minVal || 0.001;
  const scale = (h - 4) / range;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible">
      {vals.map((v, i) => {
        const x = offsetX + i * (barW + gap);
        if (v == null) return <rect key={i} x={x} y={baseY - 2} width={barW} height={2} fill="var(--border-soft)" rx="1" />;
        const barH = Math.max((v - minVal) * scale, 1.5);
        const y = baseY - barH;
        return <rect key={i} x={x} y={y} width={barW} height={barH} fill={Q_COLORS[i]} rx="1.5" opacity={0.85} />;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Family filter button group
// ---------------------------------------------------------------------------
const FAMILIES = ['All', 'Momentum', 'Technical', 'Quality', 'Valuation', 'Growth', 'Risk'] as const;
type Family = typeof FAMILIES[number];

const FAMILY_COLORS: Record<string, string> = {
  Momentum:  'bg-[rgba(167,139,250,0.14)] text-[#7c3aed]',
  Technical: 'bg-[rgba(192,132,252,0.14)] text-[#9333ea]',
  Quality:   'bg-[rgba(45,212,191,0.14)] text-[var(--teal)]',
  Valuation: 'bg-[rgba(56,189,248,0.14)] text-[var(--cyan)]',
  Growth:    'bg-[rgba(163,230,53,0.14)] text-[#4d7c0f]',
  Risk:      'bg-[rgba(251,146,60,0.14)] text-[#c2410c]',
};

function FamilyPill({ family }: { family: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[family] ?? 'bg-[var(--bg2)] text-[var(--tx-mut)]'}`}>
      {family}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------
type SortKey = 'factor_label' | 'full_mean_ic' | 'full_ic_tstat' | 'full_icir' | 'full_q5q1_spread_ann' | 'ws_mean_ic' | 'ws_ic_tstat' | 'ws_icir';

function sortRows(rows: P01ScorecardRow[], key: SortKey, asc: boolean): P01ScorecardRow[] {
  return [...rows].sort((a, b) => {
    const va = a[key] ?? -Infinity;
    const vb = b[key] ?? -Infinity;
    if (typeof va === 'string' && typeof vb === 'string') {
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface ScorecardTableProps {
  rows: P01ScorecardRow[];
  selectedFactor: string | null;
  onSelect: (factor: string) => void;
}

const FAMILY_ORDER = ['Momentum', 'Technical', 'Quality', 'Valuation', 'Growth', 'Risk'] as const;

export function ScorecardTable({ rows, selectedFactor, onSelect }: ScorecardTableProps) {
  const [family, setFamily] = React.useState<Family>('All');
  const [groupByFamily, setGroupByFamily] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>('factor_label');
  const [sortAsc, setSortAsc] = React.useState(true);

  const filtered = family === 'All' ? rows : rows.filter((r) => r.factor_family === family);
  const sorted = sortRows(filtered, sortKey, sortAsc);

  // For group view: bucket rows by family in canonical order
  const grouped = React.useMemo(() => {
    if (!groupByFamily) return null;
    const buckets = new Map<string, P01ScorecardRow[]>();
    for (const f of FAMILY_ORDER) buckets.set(f, []);
    for (const row of rows) {
      const bucket = buckets.get(row.factor_family);
      if (bucket) bucket.push(row);
      else buckets.set(row.factor_family, [row]);
    }
    return buckets;
  }, [groupByFamily, rows]);

  function handleSort(key: SortKey) {
    if (groupByFamily) return; // sort disabled in group view
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col && !groupByFamily;
    return (
      <button
        onClick={() => handleSort(col)}
        disabled={groupByFamily}
        className={`flex items-center gap-1 text-xs uppercase tracking-[0.15em] font-bold transition-colors ${active ? 'text-[var(--teal)]' : 'text-[var(--tx-dim)] hover:text-[var(--tx-mut)]'} ${groupByFamily ? 'cursor-default' : ''}`}
      >
        {label}
        {!groupByFamily && <span className="text-[10px]">{active ? (sortAsc ? '▲' : '▼') : '⇅'}</span>}
      </button>
    );
  }

  function FactorRow({ row }: { row: P01ScorecardRow }) {
    const isSelected = selectedFactor === row.factor;
    return (
      <tr
        key={row.factor}
        onClick={() => onSelect(isSelected ? '' : row.factor)}
        className={`cursor-pointer transition-colors group ${
          isSelected ? 'bg-[rgba(45,212,191,0.10)] border-l-2 border-[var(--teal)]' : 'hover:bg-[rgba(45,212,191,0.06)]'
        }`}
      >
        <td className="px-5 py-3">
          <div>
            <p className="font-semibold text-[var(--tx)] text-sm leading-tight">{row.factor_label}</p>
            <p className="text-xs text-[var(--tx-dim)] mt-0.5 font-mono">{row.factor}</p>
          </div>
        </td>
        <td className="px-3 py-3">
          {!groupByFamily && <FamilyPill family={row.factor_family} />}
        </td>
        <td className="px-3 py-3">
          <QuintileSparkbar row={row} />
        </td>
        {/* Full universe: t-stat bar, ICIR, Mean IC (plain) */}
        <td className="px-3 py-3">
          <TStatBar tstat={row.full_ic_tstat} direction={row.direction} />
        </td>
        <td className="px-3 py-3">
          <span className={`text-xs font-mono ${Math.abs(row.full_icir ?? 0) > 0.3 ? 'text-[var(--teal)] font-semibold' : 'text-[var(--tx-dim)]'}`}>
            {row.full_icir != null ? (row.full_icir >= 0 ? '+' : '') + row.full_icir.toFixed(3) : '—'}
          </span>
        </td>
        <td className="px-3 py-3">
          <span className="text-xs font-mono text-[var(--tx-dim)]">
            {row.full_mean_ic != null ? (row.full_mean_ic >= 0 ? '+' : '') + row.full_mean_ic.toFixed(4) : '—'}
          </span>
        </td>
        {/* Within sector: t-stat bar, ICIR */}
        <td className="px-3 py-3">
          <TStatBar tstat={row.ws_ic_tstat} direction={row.direction} />
        </td>
        <td className="px-3 py-3">
          <span className={`text-xs font-mono ${Math.abs(row.ws_icir ?? 0) > 0.3 ? 'text-[var(--cyan)] font-semibold' : 'text-[var(--tx-dim)]'}`}>
            {row.ws_icir != null ? (row.ws_icir >= 0 ? '+' : '') + row.ws_icir.toFixed(3) : '—'}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--teal)] w-4">F</span>
              <QualityBadge quality={row.full_signal_quality} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--cyan)] w-4">S</span>
              <QualityBadge quality={row.ws_signal_quality} />
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          <span className={`text-[var(--tx-dim)] text-xs transition-transform inline-block ${isSelected ? 'rotate-90' : 'group-hover:text-[var(--tx-mut)]'}`}>▶</span>
        </td>
      </tr>
    );
  }

  const totalShown = groupByFamily ? rows.length : sorted.length;

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Family filter — hidden in group mode */}
        {!groupByFamily && (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-[var(--tx-dim)] font-medium">Filter:</span>
            {FAMILIES.map((f) => (
              <button
                key={f}
                onClick={() => setFamily(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  family === f
                    ? 'bg-[var(--teal)] text-[#fffdf9] border-[var(--teal)] shadow-sm'
                    : 'bg-[var(--panel)] text-[var(--tx-mut)] border-[var(--border-soft)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {groupByFamily && <div />}
        {/* Group toggle */}
        <button
          onClick={() => { setGroupByFamily((v) => !v); setFamily('All'); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            groupByFamily
              ? 'bg-[var(--teal)] text-[#fffdf9] border-[var(--teal)] shadow-sm'
              : 'bg-[var(--panel)] text-[var(--tx-mut)] border-[var(--border-soft)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
          }`}
        >
          <span>⊞</span> Group by Family
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--bg2)]">
              <tr className="border-b border-[var(--border-soft)] bg-[var(--bg2)]">
                <th className="px-5 py-3.5 text-left">
                  <SortHeader label="Factor" col="factor_label" />
                </th>
                <th className="px-3 py-3.5 text-left w-24">
                  <span className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim)] font-bold">
                    {groupByFamily ? '' : 'Family'}
                  </span>
                </th>
                <th className="px-3 py-3.5 text-left">
                  <span className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim)] font-bold">Q1→Q5</span>
                </th>
                <th className="px-3 py-3.5 text-left" colSpan={3}>
                  <span className="text-xs uppercase tracking-[0.15em] text-[var(--teal)] font-bold">Full Universe</span>
                </th>
                <th className="px-3 py-3.5 text-left" colSpan={3}>
                  <span className="text-xs uppercase tracking-[0.15em] text-[var(--cyan)] font-bold">Within Sector</span>
                </th>
                <th className="px-3 py-3.5 w-6" />
              </tr>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--bg2)]">
                <th className="px-5 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2 text-left"><SortHeader label="t-stat" col="full_ic_tstat" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="ICIR" col="full_icir" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Mean IC" col="full_mean_ic" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="t-stat" col="ws_ic_tstat" /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="ICIR" col="ws_icir" /></th>
                <th className="px-3 py-2 text-left">
                  <span className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim)] font-bold">Quality</span>
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {groupByFamily && grouped
                ? Array.from(grouped.entries()).filter(([, fRows]) => fRows.length > 0).map(([fam, fRows]) => (
                    <React.Fragment key={fam}>
                      <tr className="bg-[var(--bg2)]">
                        <td colSpan={10} className="px-5 py-2">
                          <div className="flex items-center gap-2">
                            <FamilyPill family={fam} />
                            <span className="text-xs text-[var(--tx-dim)]">{fRows.length} factor{fRows.length !== 1 ? 's' : ''}</span>
                          </div>
                        </td>
                      </tr>
                      {fRows.map((row) => <FactorRow key={row.factor} row={row} />)}
                    </React.Fragment>
                  ))
                : sorted.map((row) => <FactorRow key={row.factor} row={row} />)
              }
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-soft)] bg-[var(--bg2)] flex items-center justify-between">
          <p className="text-xs text-[var(--tx-dim)]">
            {totalShown} factor{totalShown !== 1 ? 's' : ''} shown
            {rows[0]?.date_from ? ` · ${rows[0].date_from} → ${rows[0].date_to}` : ''}
            {rows[0]?.n_months ? ` · ${rows[0].n_months} months` : ''}
          </p>
          <p className="text-xs text-[var(--tx-dim)]">
            Q1→Q5 = avg monthly return by quintile (red→green) · F = Full Universe · S = Within Sector · Negative = IC in wrong direction
          </p>
        </div>
      </div>
    </div>
  );
}
