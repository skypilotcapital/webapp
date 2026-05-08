'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelScorecard } from '@/lib/api';
import { ModelComparisonTable } from '@/components/research/ModelComparisonTable';
import { ModelDetailPanel } from '@/components/research/ModelDetailPanel';

export default function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR('model-scorecard', fetchModelScorecard, {
    revalidateOnFocus: false,
  });

  const selectedRow = data?.find((r) => r.model_id === selectedModel) ?? null;

  return (
    <div className="space-y-12">
      {/* Page header */}
      <div className="border-b border-black/5 pb-10 mb-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
            P02
          </span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Alpha Model Research · Walk-Forward Backtest
          </span>
        </div>
        <h1 className="text-4xl font-bold text-[#0F172A] tracking-tight">Alpha Model Analysis</h1>
        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium max-w-2xl">
          Walk-forward backtest results for sector-by-sector Random Forest alpha models.
          Each model is trained on an expanding window and predicts 1-month forward returns.
          The alpha score is the within-sector percentile rank of the raw model prediction.
          Click any row to expand the full diagnostic view.
        </p>
        <div className="flex flex-wrap gap-6 mt-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong className="text-slate-700">IC t-stat ≥ 3</strong> — statistically strong</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span><strong className="text-slate-700">IC t-stat ≥ 2</strong> — likely signal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 bg-slate-300" />
            <span>Q5−Q1 annualised = equal-weight long Q5 / short Q1 spread, annualised</span>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">Loading model scorecard…</p>
          <p className="text-xs text-slate-300 mt-2">
            If this is your first load, run:
            <code className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
              python -m alpha.scripts.compute_research_tables
            </code>
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-600">Failed to load model scorecard.</p>
          <p className="text-xs text-red-400 mt-1">
            Ensure the backtest has been run and compute_research_tables.py has been executed.
          </p>
        </div>
      )}

      {data && (
        <ModelComparisonTable
          rows={data}
          selectedModel={selectedModel}
          onSelect={(id) => setSelectedModel(id === selectedModel ? null : id)}
        />
      )}

      {selectedRow && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <ModelDetailPanel row={selectedRow} />
        </div>
      )}

      {data && !selectedRow && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-300">Click a model row to expand the diagnostic charts.</p>
        </div>
      )}
    </div>
  );
}
