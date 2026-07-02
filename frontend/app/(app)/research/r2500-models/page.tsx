'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelScorecard } from '@/lib/api';
import { ModelSidebar } from '@/components/research/ModelSidebar';
import { ModelDetailPanel } from '@/components/research/ModelDetailPanel';

function ModelInterpretationBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel text-xs text-[var(--tx-mut)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-semibold text-[var(--tx-mut)] hover:bg-[rgba(45,212,191,0.06)] rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[var(--tx-dim)]">ℹ</span>
          How to interpret model backtest results
        </span>
        <span className="text-[var(--tx-dim)] text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-[var(--border-soft)]">
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Mean IC — Information Coefficient</p>
            <p className="leading-relaxed">
              At each month-end, all stocks in a sector are ranked by the model&apos;s predicted alpha score and by
              their realized forward return. IC is the <strong>Spearman rank correlation</strong> between those two
              rankings. A positive IC means higher-scored stocks tended to outperform that month.
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1.5 font-mono">
              <div><span className="text-[var(--amber)] font-semibold">0.00–0.02</span> — weak, marginal</div>
              <div><span className="text-[var(--cyan)] font-semibold">0.02–0.05</span> — good, commercially viable</div>
              <div><span className="text-[var(--pos)] font-semibold">&gt; 0.05</span> — strong, relatively rare</div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">t-Statistic</p>
            <p className="leading-relaxed">
              <strong>t = mean IC ÷ (std IC ÷ √n)</strong>. Primary gate for genuine signal.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-1.5">
              <div><span className="inline-block w-16 font-semibold text-[var(--cyan)]">|t| &gt; 2.0</span> — likely real signal (95% confidence)</div>
              <div><span className="inline-block w-16 font-semibold text-[var(--pos)]">|t| &gt; 3.0</span> — statistically strong (99% confidence)</div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Q5−Q1 Annualized Spread</p>
            <p className="leading-relaxed">
              Stocks sorted into quintiles by alpha score. Q5 − Q1 average monthly return, annualized ×12.
              A spread of 3–6%/year is typical for a working single-model signal before transaction costs.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--tx-mut)] mb-1">Grinold-Kahn: IR ≈ IC × √Breadth</p>
            <p className="leading-relaxed">
              Breadth ≈ 2500 stocks × 12 months = 30,000 for Russell 2500.
              IC of 0.01 → IR ≈ 0.01 × √30,000 ≈ 1.73 — potentially high information ratio from SMID breadth.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function R2500ModelsPage() {
  const universe = 'russell2500';
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(
    ['model-scorecard', universe],
    () => fetchModelScorecard(universe),
    { revalidateOnFocus: false }
  );

  const selectedRow = data?.find((r) => r.model_id === selectedModel) ?? null;
  const handleSelect = (id: string) => setSelectedModel(id === selectedModel ? null : id);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header + info box — frozen, condensed to one row */}
      <div className="flex-none">
        <div className="mb-2 flex items-baseline gap-2.5 flex-wrap">
          <h1 className="text-base font-bold text-[var(--tx)] tracking-tight">Alpha Model Analysis — Russell 2500</h1>
          <span className="px-1.5 py-0.5 rounded bg-[rgba(45,212,191,0.13)] text-[var(--teal)] text-[9px] font-bold uppercase tracking-wider">P02</span>
          <span className="text-[10px] text-[var(--tx-dim)] font-medium uppercase tracking-wider">Walk-Forward Backtest · SMID (ranks 501–3000) · RF within-sector</span>
          <span className="text-[11px] text-[var(--tx-dim)] ml-auto hidden xl:inline">Select a model for diagnostics →</span>
        </div>
        {data && (
          <div className="mb-2.5">
            <ModelInterpretationBox />
          </div>
        )}
      </div>

      {isLoading && (
        <div className="panel p-16 text-center"><p className="text-sm text-[var(--tx-dim)]">Loading model scorecard…</p></div>
      )}
      {error && (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(248,113,113,0.10)] p-8"><p className="text-sm font-semibold text-[var(--neg)]">Failed to load model scorecard.</p></div>
      )}

      {/* Two independent scroll panes: models list | detail */}
      {data && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-80 flex-none min-h-0 overflow-y-auto rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] shadow-sm">
            <ModelSidebar rows={data} selectedModel={selectedModel} onSelect={handleSelect} />
          </div>
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            {!selectedRow && (
              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel)] px-6 py-4 flex items-center gap-6 text-xs text-[var(--tx-dim)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--pos)]" />
                  <span>IC t-stat ≥ 3 — statistically strong</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--cyan)]" />
                  <span>IC t-stat ≥ 2 — likely signal</span>
                </div>
                <span className="ml-auto text-[var(--tx-dim)]">← Select a model for diagnostics</span>
              </div>
            )}
            {selectedRow && (
              <div className="animate-in fade-in duration-200">
                <ModelDetailPanel row={selectedRow} sectorStickyTop={0} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
