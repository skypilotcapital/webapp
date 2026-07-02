'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchP01Scorecard } from '@/lib/api';
import { FactorSidebar } from '@/components/research/FactorSidebar';
import { FactorDetailPanel } from '@/components/research/FactorDetailPanel';

function ICMethodologyBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg2)] text-xs text-[var(--tx-mut)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-[var(--tx-mut)] hover:bg-[rgba(45,212,191,0.06)] rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[var(--tx-dim)]">ℹ</span>
          How IC and signal quality are calculated
        </span>
        <span className="text-[var(--tx-dim)] text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[var(--border-soft)]">
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Information Coefficient (IC)</p>
            <p className="leading-relaxed">
              At each month-end, stocks are ranked by their factor score and by their realized 1-month forward return.
              IC is the <strong>Spearman rank correlation</strong> between those two rankings. Values range from −1 to +1;
              a consistent positive IC means higher-scored stocks tend to outperform.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Mean IC, t-stat, and ICIR</p>
            <p className="leading-relaxed">
              <strong>Mean IC</strong> — average IC across all months.{' '}
              <strong>t-stat</strong> — mean IC ÷ (std IC ÷ √n). Gate: |t| &gt; 2 meaningful, |t| &gt; 3 strong.{' '}
              <strong>ICIR</strong> — mean IC ÷ std IC. Measures signal consistency.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Signal quality ratings</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-1">
              <div><span className="inline-block w-20 font-semibold text-[var(--pos)]">Strong</span> |t-stat| &gt; 3.0</div>
              <div><span className="inline-block w-20 font-semibold text-[var(--cyan)]">Moderate</span> |t-stat| &gt; 2.0</div>
              <div><span className="inline-block w-20 font-semibold text-[var(--amber)]">Weak</span> IC positive, |t| &lt; 2.0</div>
              <div><span className="inline-block w-20 font-semibold text-[var(--neg)]">Negative</span> IC in wrong direction</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function R2500FactorsPage() {
  const universe = 'russell2500';
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(
    ['p01-scorecard', universe],
    () => fetchP01Scorecard(universe),
    { revalidateOnFocus: false }
  );

  const selectedRow = data?.find((r) => r.factor === selectedFactor) ?? null;
  const handleSelect = (factor: string) => setSelectedFactor(factor === selectedFactor ? null : factor);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header — frozen, condensed to one row */}
      <div className="flex-none mb-2 flex items-baseline gap-2.5 flex-wrap">
        <h1 className="text-base font-bold text-[var(--tx)] tracking-tight">Factor Quintile Analysis — Russell 2500</h1>
        <span className="px-1.5 py-0.5 rounded bg-[rgba(45,212,191,0.13)] text-[var(--teal)] text-[9px] font-bold uppercase tracking-wider">P01</span>
        <span className="text-[10px] text-[var(--tx-dim)] font-medium uppercase tracking-wider">SMID (ranks 501–3000) · quintile-sorted 1M forward returns</span>
        <span className="text-[11px] text-[var(--tx-dim)] ml-auto hidden xl:inline">Select a factor →</span>
      </div>

      {isLoading && (
        <div className="panel p-16 text-center"><p className="text-sm text-[var(--tx-dim)]">Loading factor scorecard…</p></div>
      )}
      {error && (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(248,113,113,0.10)] p-8"><p className="text-sm font-semibold text-[var(--neg)]">Failed to load scorecard data.</p></div>
      )}

      {/* Two independent scroll panes: factor list | detail */}
      {data && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-64 flex-none min-h-0 overflow-y-auto rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] shadow-sm">
            <FactorSidebar rows={data} selectedFactor={selectedFactor} onSelect={handleSelect} />
          </div>
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            {!selectedRow && (
              <div className="space-y-6">
                <ICMethodologyBox />
                <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-12 text-center">
                  <p className="text-sm text-[var(--tx-dim)]">Select a factor from the left panel to view its IC chart and quintile returns.</p>
                  <div className="flex justify-center gap-6 mt-4 text-xs text-[var(--tx-dim)]">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--pos)]" /><span>Strong — |t| &gt; 3.0</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--cyan)]" /><span>Moderate — |t| &gt; 2.0</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--amber)]" /><span>Weak — |t| &lt; 2.0</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--neg)]" /><span>Negative</span></div>
                  </div>
                </div>
              </div>
            )}
            {selectedRow && (
              <div className="animate-in fade-in duration-200">
                <FactorDetailPanel row={selectedRow} universe={universe} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
