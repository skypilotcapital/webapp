'use client';

import type { ModelScorecardRow } from '@/types/api';

const TARGET_LABEL: Record<string, string> = {
  fwd_1w: '1w',
  fwd_1m: '1m',
  fwd_1m_sector_rel: '1m sr',
  fwd_1m_sector_rank: '1m rk',
  fwd_1m_voladj_63d: '1m vol',
  fwd_2m: '2m',
  fwd_3m: '3m',
  fwd_3m_voladj_63d: '3m vol',
};

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

function fmt(v: number | null, decimals = 4, pct = false): string {
  if (v == null) return '—';
  const val = pct ? v * 100 : v;
  return val.toFixed(decimals) + (pct ? '%' : '');
}

function TStatBadge({ t }: { t: number | null }) {
  if (t == null) return <span className="text-slate-300">—</span>;
  const abs = Math.abs(t);
  const color =
    abs >= 3 ? 'bg-emerald-100 text-emerald-700' :
    abs >= 2 ? 'bg-blue-100 text-blue-700' :
               'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${color}`}>
      {t.toFixed(2)}
    </span>
  );
}

interface Props {
  rows: ModelScorecardRow[];
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
}

export function ModelComparisonTable({ rows, selectedModel, onSelect }: Props) {
  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-100/90 backdrop-blur-sm">
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider w-20">Model</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Description</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider w-14">Tgt</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider w-16">Type</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider w-20">Sector IC</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500 uppercase tracking-wider w-24">Monthly t-stat</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider w-20">Hit Rate</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wider w-24">Q5−Q1 Ann.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const isSelected = row.model_id === selectedModel;
              const typeStyle = TYPE_STYLE[row.model_type] ?? 'bg-slate-100 text-slate-500';
              const typeLabel = TYPE_LABEL[row.model_type] ?? row.model_type;
              return (
                <tr
                  key={row.model_id}
                  onClick={() => onSelect(row.model_id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 hover:bg-indigo-50'
                      : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.model_id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[280px]">
                    <span className="block truncate">{row.description}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {TARGET_LABEL[row.target] ?? row.target}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeStyle}`}>
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={row.sector_mean_ic_monthly != null && row.sector_mean_ic_monthly > 0 ? 'text-emerald-700' : 'text-red-500'}>
                      {fmt(row.sector_mean_ic_monthly ?? row.sector_mean_ic, 4)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <TStatBadge t={row.sector_ic_tstat_monthly ?? row.sector_ic_tstat} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {fmt(row.univ_ic_hit_rate, 1, true)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={row.q5_minus_q1_ann != null && row.q5_minus_q1_ann > 0 ? 'text-emerald-700' : 'text-red-500'}>
                      {fmt(row.q5_minus_q1_ann, 1, true)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 bg-slate-50/80 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
        <span>{rows.length} models — headline sector t-stat uses one average sector IC per month</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> t ≥ 3</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> t ≥ 2</span>
        </div>
      </div>
    </div>
  );
}
