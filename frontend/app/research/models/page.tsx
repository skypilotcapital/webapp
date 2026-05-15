'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelScorecard } from '@/lib/api';
import { ModelSidebar } from '@/components/research/ModelSidebar';
import { ModelDetailPanel } from '@/components/research/ModelDetailPanel';
import { ModelICCorrelationMatrix } from '@/components/research/ModelICCorrelationMatrix';

const NAV_HEIGHT = 92; // px — sticky site header

function ModelInterpretationBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-600">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-slate-700 hover:bg-slate-100/60 rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400">ℹ</span>
          How to interpret model backtest results
        </span>
        <span className="text-slate-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-200">
          <div>
            <p className="font-semibold text-slate-700 mb-1">Mean IC — Information Coefficient</p>
            <p className="leading-relaxed">
              At each month-end, all stocks in a sector are ranked by the model's predicted alpha score and by their
              realized forward return. IC is the <strong>Spearman rank correlation</strong> between those two rankings.
              A positive IC means higher-scored stocks tended to outperform that month.
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1.5 font-mono">
              <div><span className="text-amber-600 font-semibold">0.00–0.02</span> — weak, marginal</div>
              <div><span className="text-blue-600 font-semibold">0.02–0.05</span> — good, commercially viable</div>
              <div><span className="text-emerald-600 font-semibold">&gt; 0.05</span> — strong, relatively rare</div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">t-Statistic</p>
            <p className="leading-relaxed">
              <strong>t = mean IC ÷ (std IC ÷ √n)</strong>. Primary gate for genuine signal.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-1.5">
              <div><span className="inline-block w-16 font-semibold text-blue-700">|t| &gt; 2.0</span> — likely real signal (95% confidence)</div>
              <div><span className="inline-block w-16 font-semibold text-emerald-700">|t| &gt; 3.0</span> — statistically strong (99% confidence)</div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">Q5−Q1 Annualized Spread</p>
            <p className="leading-relaxed">
              Stocks sorted into quintiles by alpha score. Q5 − Q1 average monthly return, annualized ×12.
              A spread of 3–6%/year is typical for a working single-model signal before transaction costs.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">Grinold-Kahn: IR ≈ IC × √Breadth</p>
            <p className="leading-relaxed">
              Breadth ≈ 500 stocks × 12 months = 6,000. IC of 0.01 → IR ≈ 0.01 × √6,000 ≈ 0.77 —
              competitive for a systematic strategy. Small IC matters when breadth is high.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleCorrelationMatrix() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-xs text-slate-700 hover:bg-slate-100/60 rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400">⊞</span>
          IC Correlation Matrix — ensemble design tool
        </span>
        <span className="text-slate-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200">
          <ModelICCorrelationMatrix />
        </div>
      )}
    </div>
  );
}

export default function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR('model-scorecard', fetchModelScorecard, {
    revalidateOnFocus: false,
  });

  const selectedRow = data?.find((r) => r.model_id === selectedModel) ?? null;

  const handleSelect = (id: string) => {
    setSelectedModel(id === selectedModel ? null : id);
  };

  return (
    <div>
      {/* Page header — above the split layout */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
            P02
          </span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Alpha Model Research · Walk-Forward Backtest
          </span>
        </div>
        <h1 className="text-3xl font-bold text-[#0F172A] tracking-tight">Alpha Model Analysis</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed font-medium max-w-3xl">
          Walk-forward backtest results — sector-by-sector models (RF, LightGBM, Lasso, ensemble variants).
          Each model is trained on an expanding window; alpha score = within-sector percentile of raw prediction.
          Select a model to expand the diagnostic view.
        </p>
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">Loading model scorecard…</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-600">Failed to load model scorecard.</p>
        </div>
      )}

      {/* Always-visible info boxes — above the split layout */}
      {data && (
        <div className="mb-4 space-y-2">
          <ModelInterpretationBox />
          <CollapsibleCorrelationMatrix />
        </div>
      )}

      {/* Two-column layout: sidebar + detail */}
      {data && (
        <div className="flex gap-6 items-start">

          {/* Left sidebar — sticky, scrolls independently */}
          <div
            className="w-80 flex-none sticky overflow-y-auto rounded-2xl border border-slate-100 bg-white/80 backdrop-blur-sm shadow-sm"
            style={{
              top: `${NAV_HEIGHT + 16}px`,
              maxHeight: `calc(100vh - ${NAV_HEIGHT + 32}px)`,
            }}
          >
            <ModelSidebar
              rows={data}
              selectedModel={selectedModel}
              onSelect={handleSelect}
            />
          </div>

          {/* Right panel — scrolls with page */}
          <div className="flex-1 min-w-0">
            {!selectedRow && (
              <div className="rounded-xl border border-slate-100 bg-white/40 px-6 py-4 flex items-center gap-6 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>IC t-stat ≥ 3 — statistically strong</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>IC t-stat ≥ 2 — likely signal</span>
                </div>
                <span className="ml-auto text-slate-300">← Select a model for diagnostics</span>
              </div>
            )}

            {selectedRow && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                <ModelDetailPanel row={selectedRow} sectorStickyTop={NAV_HEIGHT + 16} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
