'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelScorecard } from '@/lib/api';
import { ModelComparisonTable } from '@/components/research/ModelComparisonTable';
import { ModelDetailPanel } from '@/components/research/ModelDetailPanel';

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
            <p className="leading-relaxed mt-1.5">
              IC values in quantitative equity are always small in absolute terms. Industry benchmarks:
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1.5 font-mono">
              <div><span className="text-amber-600 font-semibold">0.00–0.02</span> — weak, marginal</div>
              <div><span className="text-blue-600 font-semibold">0.02–0.05</span> — good, commercially viable</div>
              <div><span className="text-emerald-600 font-semibold">&gt; 0.05</span> — strong, relatively rare</div>
            </div>
            <p className="leading-relaxed mt-1.5 text-slate-500">
              An IC of 0.01 sounds near-zero, but applied across a 500-stock universe it implies meaningful
              return predictability — see the Grinold-Kahn section below.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">t-Statistic — is it real or noise?</p>
            <p className="leading-relaxed">
              The t-stat tests whether the mean IC is statistically distinguishable from zero:{' '}
              <strong>t = mean IC ÷ (std IC ÷ √n)</strong>, where n is the number of monthly observations.
              This is the primary gate for whether a model has genuine predictive power.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-1.5">
              <div><span className="inline-block w-16 font-semibold text-blue-700">|t| &gt; 2.0</span> — likely real signal (95% confidence)</div>
              <div><span className="inline-block w-16 font-semibold text-emerald-700">|t| &gt; 3.0</span> — statistically strong (99% confidence)</div>
            </div>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">Hit Rate</p>
            <p className="leading-relaxed">
              Percentage of months where IC &gt; 0 — i.e., the model was right more often than not.
              A hit rate above 50% means the model predicts the direction of returns correctly in the majority of months.
              Above 55% is considered strong for equity factors.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">Q5−Q1 Annualized Spread</p>
            <p className="leading-relaxed">
              At each month-end, stocks are sorted into five equal groups (quintiles) by alpha score.
              Q5 is the top 20%, Q1 the bottom 20%. The spread is the average monthly return difference
              (Q5 − Q1), annualized by multiplying by 12. This is the most tangible metric — it approximates
              the gross P&amp;L of a long/short portfolio before transaction costs.
            </p>
            <p className="leading-relaxed mt-1.5 text-slate-500">
              A spread of 3–6%/year is typical for a working single-model signal before costs.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">Translating IC to portfolio value — Grinold-Kahn</p>
            <p className="leading-relaxed">
              The Fundamental Law of Active Management gives an intuition for why small IC is still useful:
            </p>
            <p className="mt-1.5 font-mono bg-white/70 rounded px-3 py-2 border border-slate-100 text-slate-700">
              Information Ratio ≈ IC × √Breadth
            </p>
            <p className="leading-relaxed mt-1.5">
              Breadth = number of independent bets per year. For a monthly-rebalancing model on ~500 stocks,
              breadth ≈ 500 × 12 = 6,000. So an IC of 0.01 implies an IR of approximately{' '}
              <strong>0.01 × √6,000 ≈ 0.77</strong> — a competitive information ratio for a systematic strategy.
              The key insight: high breadth (many stocks, monthly rebalance) makes even modest IC economically
              meaningful.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">Signal Stability — Rank Autocorrelation &amp; Quintile Persistence</p>
            <p className="leading-relaxed">
              A model that produces wildly different rankings each month generates high turnover and transaction costs.
              Stability metrics measure how consistent the rankings are over time:
            </p>
            <div className="mt-1.5 space-y-1">
              <div><strong>Rank Autocorrelation</strong> — Spearman correlation of a stock's score this month vs. next month.
                Higher is better; &gt; 0.5 indicates the model is not churning excessively.</div>
              <div><strong>Quintile Persistence</strong> — probability that a stock in Q5 (or Q1) this month remains in Q5 (or Q1) next month.
                Random walk baseline is 20% (1-in-5 chance). Above 35% indicates genuine persistence.</div>
            </div>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1">Universe vs. Sector IC</p>
            <p className="leading-relaxed">
              <strong>Universe IC</strong> — computed across all stocks simultaneously, ignoring sector.
              Picks up cross-sector return differences in addition to within-sector stock selection.{' '}
              <strong>Sector IC</strong> — computed within each sector independently, then averaged.
              This is a purer measure of the model's stock-picking ability since it removes the effect of
              sector rotation. A model with strong sector IC but weak universe IC may be picking good stocks
              but failing to identify which sectors will outperform.
            </p>
          </div>
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

      <ModelInterpretationBox />

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
