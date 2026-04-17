'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchP01Scorecard } from '@/lib/api';
import { ScorecardTable } from '@/components/research/ScorecardTable';
import { FactorDetailPanel } from '@/components/research/FactorDetailPanel';

export default function FactorsPage() {
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR('p01-scorecard', fetchP01Scorecard, {
    revalidateOnFocus: false,
  });

  const selectedRow = data?.find((r) => r.factor === selectedFactor) ?? null;

  return (
    <div className="space-y-12">
      {/* Page header */}
      <div className="border-b border-black/5 pb-10 mb-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
            P01
          </span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Gate 2 Validation · Tier 1 Signal Research
          </span>
        </div>
        <h1 className="text-4xl font-bold text-[#0F172A] tracking-tight">Factor Quintile Analysis</h1>
        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium max-w-2xl">
          Gate 2 validation of the v1 factor layer. For each factor, stocks are sorted into quintiles
          at each month-end and equal-weighted 1-month forward returns are measured.
          Both full S&P 500 universe and within-GICS-sector sorts are computed for comparison.
          Click any factor to expand the full diagnostic view.
        </p>
        <div className="flex flex-wrap gap-6 mt-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span><strong className="text-slate-700">Full Universe</strong> — full S&P 500 cross-sectional sort</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span><strong className="text-slate-700">Within Sector</strong> — sort within each GICS sector, then averaged</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 bg-slate-300" />
            <span>Signal quality: individual IC strength — weak does not mean excluded from ML model</span>
          </div>
        </div>
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">Loading factor scorecard…</p>
          <p className="text-xs text-slate-300 mt-2">
            If this is your first load, run the analysis script first:
            <code className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
              python -m data.research.p01_quintile_analysis.run_analysis
            </code>
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-600">Failed to load scorecard data.</p>
          <p className="text-xs text-red-400 mt-1">
            Ensure the database rebuild is complete and the analysis script has been run.
          </p>
        </div>
      )}

      {/* Scorecard table */}
      {data && (
        <ScorecardTable
          rows={data}
          selectedFactor={selectedFactor}
          onSelect={(factor) => setSelectedFactor(factor === selectedFactor ? null : factor)}
        />
      )}

      {/* Factor detail panel — slides in below the table when a row is selected */}
      {selectedRow && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <FactorDetailPanel row={selectedRow} />
        </div>
      )}

      {/* Empty state hint when nothing selected */}
      {data && !selectedRow && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-300">Click a factor row to expand the diagnostic charts.</p>
        </div>
      )}
    </div>
  );
}
