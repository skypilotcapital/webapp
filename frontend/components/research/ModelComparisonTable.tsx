'use client';

import type { ModelScorecardRow } from '@/types/api';

const TARGET_LABEL: Record<string, string> = {
  fwd_1w: '1-Week',
  fwd_1m: '1-Month',
  fwd_2m: '2-Month',
  fwd_3m: '3-Month',
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
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
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
    <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Model</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Features</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Months</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Mean IC</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">IC t-stat</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Hit Rate</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Q5−Q1 Ann.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => {
            const isSelected = row.model_id === selectedModel;
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
                <td className="px-4 py-3">
                  <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${
                    isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {row.model_id}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700 text-xs">{row.description}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {TARGET_LABEL[row.target] ?? row.target}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-slate-500 text-xs">{row.feature_count ?? '—'}</td>
                <td className="px-4 py-3 text-center text-slate-500 text-xs">{row.n_months ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  <span className={row.univ_mean_ic != null && row.univ_mean_ic > 0 ? 'text-emerald-700' : 'text-red-500'}>
                    {fmt(row.univ_mean_ic, 4)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <TStatBadge t={row.univ_ic_tstat} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                  {fmt(row.univ_ic_hit_rate, 1, true)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">
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
  );
}
