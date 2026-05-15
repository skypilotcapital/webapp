'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchP01Scorecard } from '@/lib/api';
import { FactorSidebar } from '@/components/research/FactorSidebar';
import { FactorDetailPanel } from '@/components/research/FactorDetailPanel';

const NAV_HEIGHT = 92; // px — sticky site header

function ICMethodologyBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-600">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-slate-700 hover:bg-slate-100/60 rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400">ℹ</span>
          How IC and signal quality are calculated
        </span>
        <span className="text-slate-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-200">
          <div>
            <p className="font-semibold text-slate-700 mb-1">Information Coefficient (IC)</p>
            <p className="leading-relaxed">
              At each month-end, stocks are ranked by their factor score and by their realized 1-month forward return.
              IC is the <strong>Spearman rank correlation</strong> between those two rankings. Values range from −1 to +1;
              a consistent positive IC means higher-scored stocks tend to outperform.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">Mean IC, t-stat, and ICIR</p>
            <p className="leading-relaxed">
              <strong>Mean IC</strong> — average IC across all months.{' '}
              <strong>t-stat</strong> — mean IC ÷ (std IC ÷ √n). Gate: |t| &gt; 2 meaningful, |t| &gt; 3 strong.{' '}
              <strong>ICIR</strong> — mean IC ÷ std IC. Measures signal consistency.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">Signal quality ratings</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-1">
              <div><span className="inline-block w-20 font-semibold text-emerald-700">Strong</span> |t-stat| &gt; 3.0</div>
              <div><span className="inline-block w-20 font-semibold text-blue-700">Moderate</span> |t-stat| &gt; 2.0</div>
              <div><span className="inline-block w-20 font-semibold text-amber-700">Weak</span> IC positive, |t| &lt; 2.0</div>
              <div><span className="inline-block w-20 font-semibold text-red-600">Negative</span> IC in wrong direction</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FactorsPage() {
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR('p01-scorecard', fetchP01Scorecard, {
    revalidateOnFocus: false,
  });

  const selectedRow = data?.find((r) => r.factor === selectedFactor) ?? null;

  const handleSelect = (factor: string) => {
    setSelectedFactor(factor === selectedFactor ? null : factor);
  };

  return (
    <div>
      {/* Page header — above the split layout */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
            P01
          </span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Gate 2 Validation · Tier 1 Signal Research
          </span>
        </div>
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Factor Quintile Analysis</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
          For each factor, stocks are sorted into quintiles at each month-end and equal-weighted
          1-month forward returns are measured. Select any factor from the left panel to view IC and quintile charts.
        </p>
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">Loading factor scorecard…</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-600">Failed to load scorecard data.</p>
        </div>
      )}

      {/* Two-column layout: sidebar + detail */}
      {data && (
        <div className="flex gap-6 items-start">

          {/* Left sidebar — sticky, scrolls independently */}
          <div
            className="w-64 flex-none sticky overflow-y-auto rounded-2xl border border-slate-100 bg-white/80 backdrop-blur-sm shadow-sm"
            style={{
              top: `${NAV_HEIGHT + 16}px`,
              maxHeight: `calc(100vh - ${NAV_HEIGHT + 32}px)`,
            }}
          >
            <FactorSidebar
              rows={data}
              selectedFactor={selectedFactor}
              onSelect={handleSelect}
            />
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            {!selectedRow && (
              <div className="space-y-6">
                <ICMethodologyBox />
                <div className="rounded-2xl border border-slate-100 bg-white/60 p-12 text-center">
                  <p className="text-sm text-slate-300">
                    Select a factor from the left panel to view its IC chart and quintile returns.
                  </p>
                  <div className="flex justify-center gap-6 mt-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Strong — |t| &gt; 3.0</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>Moderate — |t| &gt; 2.0</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>Weak — |t| &lt; 2.0</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span>Negative</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedRow && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                <FactorDetailPanel row={selectedRow} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
