'use client';

import useSWR from 'swr';
import { fetchLatestMacroBetaSignal } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function stateLabel(state: string) {
  return state.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function LatestSignalSection() {
  const { data, error, isLoading } = useSWR('macro-beta-latest', fetchLatestMacroBetaSignal, { refreshInterval: 60_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">Current Macro Beta Signal</h2>
        <p className="text-sm text-slate-500 mt-2">Latest daily production state and model components.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading latest signal…</p>}
        {error && <p className="text-sm text-red-500">Failed to load latest signal.</p>}
        {data && (
          <>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">As Of</p>
                <p className="text-sm text-slate-700 font-semibold">{data.signal_date}</p>
              </div>
              <div className="px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-black">State</p>
                <p className="text-2xl font-black text-indigo-700">{stateLabel(data.final_beta_target)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Tier 1</p>
                <p className="text-lg font-bold text-slate-800">{data.tier1_result ?? 'Insufficient Inputs'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">RSI State</p>
                <p className="text-lg font-bold text-slate-800">{data.tier2_rsi ?? '—'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Credit State</p>
                <p className="text-lg font-bold text-slate-800">{data.tier2_credit ?? '—'}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
