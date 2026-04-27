'use client';

import type { P01ScorecardRow } from '@/types/api';

// ---------------------------------------------------------------------------
// Signal quality badge
// ---------------------------------------------------------------------------
type Quality = 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;

const QUALITY_STYLES: Record<string, string> = {
  Strong:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Moderate:    'bg-blue-50 text-blue-700 border border-blue-200',
  Weak:        'bg-amber-50 text-amber-700 border border-amber-200',
  Investigate: 'bg-red-50 text-red-600 border border-red-200',
};

function QualityBadge({ quality }: { quality: Quality }) {
  if (!quality) return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${QUALITY_STYLES[quality] ?? 'bg-slate-100 text-slate-500'}`}>
      {quality}
    </span>
  );
}

// ---------------------------------------------------------------------------
// IC bar — small inline visualisation of IC magnitude
// ---------------------------------------------------------------------------
function ICBar({ value, direction }: { value: number | null; direction: 1 | -1 }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>;
  // Effective IC: positive = factor working correctly regardless of direction
  const effective = value * direction;
  const pct = Math.min(Math.abs(effective) / 0.08, 1) * 100; // saturate at IC=0.08
  const color = effective >= 0 ? 'bg-indigo-400' : 'bg-red-400';
  const sign = value >= 0 ? '+' : '';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-mono text-slate-700 w-14 shrink-0">{sign}{value.toFixed(4)}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 min-w-[40px]">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Family filter button group
// ---------------------------------------------------------------------------
const FAMILIES = ['All', 'Momentum', 'Technical', 'Quality', 'Valuation', 'Growth', 'Risk'] as const;
type Family = typeof FAMILIES[number];

const FAMILY_COLORS: Record<string, string> = {
  Momentum:  'bg-violet-50 text-violet-700',
  Technical: 'bg-purple-50 text-purple-700',
  Quality:   'bg-teal-50 text-teal-700',
  Valuation: 'bg-sky-50 text-sky-700',
  Growth:    'bg-lime-50 text-lime-700',
  Risk:      'bg-orange-50 text-orange-700',
};

function FamilyPill({ family }: { family: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[family] ?? 'bg-slate-100 text-slate-600'}`}>
      {family}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------
type SortKey = 'factor_label' | 'full_mean_ic' | 'full_ic_tstat' | 'full_q5q1_spread_ann' | 'ws_mean_ic' | 'ws_ic_tstat';

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

export function ScorecardTable({ rows, selectedFactor, onSelect }: ScorecardTableProps) {
  const [family, setFamily] = React.useState<Family>('All');
  const [sortKey, setSortKey] = React.useState<SortKey>('factor_label');
  const [sortAsc, setSortAsc] = React.useState(true);

  const filtered = family === 'All' ? rows : rows.filter((r) => r.factor_family === family);
  const sorted = sortRows(filtered, sortKey, sortAsc);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false); // default to descending for numeric columns
    }
  }

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-xs uppercase tracking-[0.15em] font-bold transition-colors ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
      >
        {label}
        <span className="text-[10px]">{active ? (sortAsc ? '▲' : '▼') : '⇅'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Family filter */}
      <div className="flex flex-wrap gap-2">
        {FAMILIES.map((f) => (
          <button
            key={f}
            onClick={() => setFamily(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              family === f
                ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-3.5 text-left">
                  <SortHeader label="Factor" col="factor_label" />
                </th>
                <th className="px-3 py-3.5 text-left w-24">
                  <span className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold">Family</span>
                </th>
                {/* Full universe */}
                <th className="px-3 py-3.5 text-left" colSpan={3}>
                  <span className="text-xs uppercase tracking-[0.15em] text-indigo-500 font-bold">Full Universe</span>
                </th>
                {/* Within sector */}
                <th className="px-3 py-3.5 text-left" colSpan={3}>
                  <span className="text-xs uppercase tracking-[0.15em] text-sky-500 font-bold">Within Sector</span>
                </th>
                <th className="px-3 py-3.5 w-6" />
              </tr>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th className="px-5 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Mean IC" col="full_mean_ic" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="t-stat" col="full_ic_tstat" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Q5-Q1 Ann." col="full_q5q1_spread_ann" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Mean IC" col="ws_mean_ic" />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="t-stat" col="ws_ic_tstat" />
                </th>
                <th className="px-3 py-2 text-left">
                  <span className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold">Quality</span>
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((row) => {
                const isSelected = selectedFactor === row.factor;
                return (
                  <tr
                    key={row.factor}
                    onClick={() => onSelect(isSelected ? '' : row.factor)}
                    className={`cursor-pointer transition-colors group ${
                      isSelected
                        ? 'bg-indigo-50/70 border-l-2 border-indigo-400'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{row.factor_label}</p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{row.factor}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <FamilyPill family={row.factor_family} />
                    </td>
                    {/* Full universe */}
                    <td className="px-3 py-3.5">
                      <ICBar value={row.full_mean_ic} direction={row.direction} />
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs font-mono ${(row.full_ic_tstat ?? 0) > 1.65 ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                        {row.full_ic_tstat != null ? row.full_ic_tstat.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs font-mono ${(row.full_q5q1_spread_ann ?? 0) * row.direction > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500'}`}>
                        {row.full_q5q1_spread_ann != null
                          ? `${row.full_q5q1_spread_ann > 0 ? '+' : ''}${(row.full_q5q1_spread_ann * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>
                    {/* Within sector */}
                    <td className="px-3 py-3.5">
                      <ICBar value={row.ws_mean_ic} direction={row.direction} />
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs font-mono ${(row.ws_ic_tstat ?? 0) > 1.65 ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                        {row.ws_ic_tstat != null ? row.ws_ic_tstat.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 w-4">F</span>
                          <QualityBadge quality={row.full_signal_quality} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-sky-400 w-4">S</span>
                          <QualityBadge quality={row.ws_signal_quality} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className={`text-slate-300 text-xs transition-transform inline-block ${isSelected ? 'rotate-90' : 'group-hover:text-slate-400'}`}>▶</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {sorted.length} factor{sorted.length !== 1 ? 's' : ''} shown
            {rows[0]?.date_from ? ` · ${rows[0].date_from} → ${rows[0].date_to}` : ''}
            {rows[0]?.n_months ? ` · ${rows[0].n_months} months` : ''}
          </p>
          <p className="text-xs text-slate-400">
            F = Full Universe · S = Within Sector
          </p>
        </div>
      </div>
    </div>
  );
}

// React import — needed because this is a client component
import React from 'react';
