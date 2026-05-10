'use client';

import React, { useState, useEffect } from 'react';
import type { P01ScorecardRow } from '@/types/api';

const QUALITY_DOT: Record<string, string> = {
  Strong:      'bg-emerald-500',
  Moderate:    'bg-blue-400',
  Weak:        'bg-amber-400',
  Investigate: 'bg-red-400',
};

const QUALITY_TEXT: Record<string, string> = {
  Strong:      'text-emerald-700',
  Moderate:    'text-blue-600',
  Weak:        'text-amber-600',
  Investigate: 'text-red-600',
};

const QUALITY_LABEL: Record<string, string> = {
  Strong:      'Strong',
  Moderate:    'Moderate',
  Weak:        'Weak',
  Investigate: 'Negative',
};

const QUALITY_ORDER: Record<string, number> = {
  Strong: 0, Moderate: 1, Weak: 2, Investigate: 3,
};

const FAMILY_ORDER = ['Momentum', 'Technical', 'Quality', 'Valuation', 'Growth', 'Risk', 'Macro'] as const;

function cleanFactorName(factor: string): string {
  return factor.replace(/^z_/, '').replace(/_/g, ' ');
}

function bestQuality(familyRows: P01ScorecardRow[]): string | null {
  let best: string | null = null;
  for (const r of familyRows) {
    const q = r.ws_signal_quality ?? r.full_signal_quality;
    if (!q) continue;
    if (best === null || QUALITY_ORDER[q] < QUALITY_ORDER[best]) best = q;
  }
  return best;
}

interface Props {
  rows: P01ScorecardRow[];
  selectedFactor: string | null;
  onSelect: (factor: string) => void;
}

export function FactorSidebar({ rows, selectedFactor, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand the group containing the selected factor
  useEffect(() => {
    if (!selectedFactor) return;
    const row = rows.find((r) => r.factor === selectedFactor);
    if (!row) return;
    setExpanded((prev) => {
      if (prev.has(row.factor_family)) return prev;
      return new Set([...prev, row.factor_family]);
    });
  }, [selectedFactor, rows]);

  const toggle = (family: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  };

  // Group rows by family
  const byFamily = new Map<string, P01ScorecardRow[]>();
  for (const fam of FAMILY_ORDER) byFamily.set(fam, []);
  for (const row of rows) {
    const fam = row.factor_family;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(row);
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold">
          {rows.length} factors
        </p>
        <p className="text-[9px] text-slate-400 mt-0.5">Click a group to expand</p>
      </div>

      {Array.from(byFamily.entries()).map(([family, familyRows]) => {
        if (familyRows.length === 0) return null;
        const isOpen = expanded.has(family);
        const hasSelected = familyRows.some((r) => r.factor === selectedFactor);
        const best = bestQuality(familyRows);
        const bestDot = best ? QUALITY_DOT[best] : 'bg-slate-200';

        return (
          <div key={family} className="mb-px">
            {/* Group header — clickable */}
            <button
              onClick={() => toggle(family)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                hasSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-none ${bestDot}`} />
              <span className={`text-[10px] uppercase tracking-[0.15em] font-black flex-1 ${
                hasSelected ? 'text-indigo-700' : 'text-slate-500'
              }`}>
                {family}
              </span>
              <span className="text-[9px] text-slate-400 font-medium">{familyRows.length}</span>
              <span className="text-[9px] text-slate-400 ml-0.5">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Factor list — visible when expanded */}
            {isOpen && (
              <div className="flex flex-col gap-px pb-1">
                {/* Column header */}
                <div className="flex items-center px-3 pt-0.5 pb-1">
                  <span className="flex-1" />
                  <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">
                    WS t-stat
                  </span>
                </div>

                {familyRows.map((row) => {
                  const isSelected = row.factor === selectedFactor;
                  const quality = row.ws_signal_quality ?? row.full_signal_quality;
                  const tstat = row.ws_ic_tstat ?? row.full_ic_tstat;
                  const dotColor = quality ? QUALITY_DOT[quality] : 'bg-slate-200';
                  const tColor = quality ? QUALITY_TEXT[quality] : 'text-slate-400';
                  const sign = tstat != null && tstat < 0 ? '' : '+';

                  return (
                    <button
                      key={row.factor}
                      onClick={() => onSelect(row.factor)}
                      className={`w-full text-left px-3 py-1.5 transition-colors rounded-md ${
                        isSelected
                          ? 'bg-indigo-50 border border-indigo-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-none mt-px ${dotColor}`} />
                        <span className={`font-mono text-[10px] truncate flex-1 min-w-0 ${
                          isSelected ? 'text-indigo-700 font-semibold' : 'text-slate-600'
                        }`}>
                          {cleanFactorName(row.factor)}
                        </span>
                        <span className={`font-mono text-[10px] font-semibold flex-none ${tColor}`}>
                          {tstat != null ? `${sign}${tstat.toFixed(1)}` : '—'}
                        </span>
                      </div>
                      {isSelected && quality && (
                        <p className={`text-[9px] font-bold pl-3 mt-0.5 ${tColor}`}>
                          {QUALITY_LABEL[quality]}
                        </p>
                      )}
                    </button>
                  );
                })}

                {family === 'Macro' && (
                  <p className="text-[8px] text-slate-400 px-3 pt-1 leading-tight">
                    Per-stock 36M sensitivities. Global state factors are model-only (no cross-sectional IC).
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
