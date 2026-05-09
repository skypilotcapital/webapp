'use client';

import React from 'react';
import type { ModelScorecardRow } from '@/types/api';

const TYPE_STYLE: Record<string, string> = {
  random_forest: 'bg-violet-100 text-violet-700',
  lightgbm:      'bg-sky-100 text-sky-700',
  lasso:         'bg-amber-100 text-amber-700',
  ensemble:      'bg-emerald-100 text-emerald-700',
};

const TYPE_LABEL: Record<string, string> = {
  random_forest: 'RF',
  lightgbm:      'LGBM',
  lasso:         'Lasso',
  ensemble:      'Ens.',
};

const TARGET_LABEL: Record<string, string> = {
  fwd_1w: '1w',
  fwd_1m: '1m',
  fwd_2m: '2m',
  fwd_3m: '3m',
};

function TStatDot({ t }: { t: number | null }) {
  if (t == null) return <span className="text-slate-300 text-[10px]">—</span>;
  const abs = Math.abs(t);
  const color =
    abs >= 3 ? 'text-emerald-600' :
    abs >= 2 ? 'text-blue-500' :
               'text-slate-400';
  const dot =
    abs >= 3 ? 'bg-emerald-500' :
    abs >= 2 ? 'bg-blue-400' :
               'bg-slate-300';
  return (
    <span className={`flex items-center gap-1 font-mono text-[10px] font-semibold ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${dot}`} />
      {t.toFixed(1)}
    </span>
  );
}

interface Props {
  rows: ModelScorecardRow[];
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
}

export function ModelSidebar({ rows, selectedModel, onSelect }: Props) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold">
          {rows.length} models
        </p>
      </div>

      {/* Column header */}
      <div className="px-3 py-1 grid grid-cols-[auto_1fr_auto_auto] gap-1.5 items-center">
        <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold w-10">ID</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Type</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">t-stat</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Q5−Q1</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const isSelected = row.model_id === selectedModel;
          const typeStyle = TYPE_STYLE[row.model_type] ?? 'bg-slate-100 text-slate-500';
          const typeLabel = TYPE_LABEL[row.model_type] ?? row.model_type;
          const targetLabel = TARGET_LABEL[row.target] ?? row.target;
          const spread = row.q5_minus_q1_ann;
          const spreadColor = spread != null && spread > 0 ? 'text-emerald-600' : 'text-red-500';

          return (
            <button
              key={row.model_id}
              onClick={() => onSelect(row.model_id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-indigo-50 border border-indigo-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              {/* Row 1: ID + type badges */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded ${
                  isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {row.model_id}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${typeStyle}`}>
                  {typeLabel}
                </span>
                <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                  {targetLabel}
                </span>
              </div>

              {/* Row 2: description (truncated) */}
              <p className="text-[9px] text-slate-400 truncate leading-tight mb-1.5">
                {row.description}
              </p>

              {/* Row 3: IC metrics */}
              <div className="flex items-center justify-between">
                <TStatDot t={row.univ_ic_tstat} />
                <span className={`font-mono text-[10px] font-semibold ${spreadColor}`}>
                  {spread != null
                    ? `${spread > 0 ? '+' : ''}${(spread * 100).toFixed(1)}%`
                    : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
