'use client';

import React from 'react';
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

const FAMILY_ORDER = ['Momentum', 'Technical', 'Quality', 'Valuation', 'Growth', 'Risk', 'Macro'] as const;

function cleanFactorName(factor: string): string {
  // Remove z_ prefix and replace underscores with spaces for display
  return factor.replace(/^z_/, '').replace(/_/g, ' ');
}

interface Props {
  rows: P01ScorecardRow[];
  selectedFactor: string | null;
  onSelect: (factor: string) => void;
}

export function FactorSidebar({ rows, selectedFactor, onSelect }: Props) {
  // Group rows by family in display order
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
      </div>

      {Array.from(byFamily.entries()).map(([family, familyRows]) => {
        if (familyRows.length === 0) return null;
        return (
          <div key={family} className="mb-2">
            {/* Family header */}
            <div className="px-3 py-1">
              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-300 font-black">
                {family}
              </p>
            </div>

            {/* Factor rows */}
            <div className="flex flex-col gap-px">
              {familyRows.map((row) => {
                const isSelected = row.factor === selectedFactor;
                const quality = row.ws_signal_quality ?? row.full_signal_quality;
                const tstat = row.ws_ic_tstat ?? row.full_ic_tstat;
                const dotColor = quality ? QUALITY_DOT[quality] : 'bg-slate-200';
                const tColor = quality ? QUALITY_TEXT[quality] : 'text-slate-400';
                const tstatSign = tstat != null && tstat < 0 ? '' : '+'; // negatives print their own sign

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
                        {tstat != null ? `${tstatSign}${tstat.toFixed(1)}` : '—'}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
