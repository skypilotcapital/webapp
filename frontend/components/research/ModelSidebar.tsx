'use client';

import React from 'react';
import type { ModelScorecardRow } from '@/types/api';

const TYPE_STYLE: Record<string, string> = {
  random_forest: 'bg-[rgba(45,212,191,0.13)] text-[var(--teal)]',
  lightgbm:      'bg-[rgba(56,189,248,0.13)] text-[var(--cyan)]',
  lasso:         'bg-[rgba(251,191,36,0.13)] text-[var(--amber)]',
  ensemble:      'bg-[rgba(52,211,153,0.14)] text-[var(--pos)]',
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
  fwd_1m_sector_rel: '1m sr',
  fwd_1m_sector_rank: '1m rk',
  fwd_1m_voladj_63d: '1m vol',
  fwd_2m: '2m',
  fwd_3m: '3m',
};

function tColor(t: number | null) {
  if (t == null) return 'text-[var(--tx-dim)]';
  const abs = Math.abs(t);
  return abs >= 3 ? 'text-[var(--pos)]' : abs >= 2 ? 'text-[var(--cyan)]' : 'text-[var(--tx-dim)]';
}

function tDot(t: number | null) {
  if (t == null) return 'bg-[var(--border-soft)]';
  const abs = Math.abs(t);
  return abs >= 3 ? 'bg-[var(--pos)]' : abs >= 2 ? 'bg-[var(--cyan)]' : 'bg-[var(--tx-dim)]';
}

interface Props {
  rows: ModelScorecardRow[];
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
}

export function ModelSidebar({ rows, selectedModel, onSelect }: Props) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--border-soft)] mb-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--tx-mut)] font-bold">
          {rows.length} models
        </p>
      </div>

      {/* Column headers */}
      <div className="px-3 py-1 grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center border-b border-[var(--border-soft)] mb-0.5">
        <span className="text-[9px] uppercase tracking-wider text-[var(--tx-mut)] font-bold w-10">ID</span>
        <span className="text-[9px] uppercase tracking-wider text-[var(--tx-mut)] font-bold">Type / Target</span>
        <span className="text-[9px] uppercase tracking-wider text-[var(--tx-mut)] font-bold text-right">Mo. t</span>
        <span className="text-[9px] uppercase tracking-wider text-[var(--tx-mut)] font-bold text-right">Q5−Q1</span>
      </div>

      <div className="flex flex-col gap-0.5 px-1">
        {rows.map((row) => {
          const isSelected = row.model_id === selectedModel;
          const typeStyle = TYPE_STYLE[row.model_type] ?? 'bg-[var(--bg2)] text-[var(--tx-mut)]';
          const typeLabel = TYPE_LABEL[row.model_type] ?? row.model_type;
          const targetLabel = TARGET_LABEL[row.target] ?? row.target;
          const spread = row.q5_minus_q1_ann;
          const spreadColor = spread != null && spread > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]';
          const st = row.sector_ic_tstat_monthly ?? row.sector_ic_tstat;

          return (
            <button
              key={row.model_id}
              onClick={() => onSelect(row.model_id)}
              className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-[rgba(45,212,191,0.10)] border border-[var(--teal)]'
                  : 'hover:bg-[rgba(45,212,191,0.06)] border border-transparent'
              }`}
            >
              {/* Single compact row: ID · type · target · t-stat · spread */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
                <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded w-10 text-center ${
                  isSelected ? 'bg-[rgba(45,212,191,0.13)] text-[var(--teal)]' : 'bg-[var(--bg2)] text-[var(--tx-mut)]'
                }`}>
                  {row.model_id}
                </span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-none ${typeStyle}`}>
                    {typeLabel}
                  </span>
                  <span className="text-[9px] font-semibold text-[var(--tx-dim)] bg-[var(--bg2)] px-1 py-0.5 rounded flex-none">
                    {targetLabel}
                  </span>
                </div>
                {/* Sector IC t-stat */}
                <span className={`font-mono text-[10px] font-semibold flex items-center gap-0.5 ${tColor(st)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block flex-none ${tDot(st)}`} />
                  {st != null ? st.toFixed(1) : '—'}
                </span>
                {/* Q5-Q1 spread */}
                <span className={`font-mono text-[10px] font-semibold text-right ${spreadColor}`}>
                  {spread != null
                    ? `${spread > 0 ? '+' : ''}${(spread * 100).toFixed(1)}%`
                    : '—'}
                </span>
              </div>

              {/* Description row (only when selected or always?) — show always, small */}
              <p className={`text-[9px] mt-1 pl-0.5 truncate leading-tight ${
                isSelected ? 'text-[var(--tx-mut)]' : 'text-[var(--tx-dim)]'
              }`}>
                {row.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
