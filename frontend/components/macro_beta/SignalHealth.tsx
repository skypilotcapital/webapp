'use client';

import useSWR from 'swr';
import { fetchMacroBetaHealth } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function SignalHealth() {
  const { data, error, isLoading } = useSWR('macro-beta-health', fetchMacroBetaHealth, {
    refreshInterval: 300_000,
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">Data Health</h2>
        <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
          Freshness of every input feed and the latest pipeline runs. All inputs are used
          strictly point-in-time (values only enter the signal from their public release date).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading health…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load health.</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.freshness.map((f) => (
                <div
                  key={f.label}
                  className={`rounded-2xl p-4 border ${
                    f.status === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : f.status === 'stale'
                        ? 'bg-rose-500/10 border-rose-500/25'
                        : 'bg-slate-400/10 border-[var(--border-soft,#f1f5f9)]'
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">
                    {f.label}
                  </p>
                  <p className="text-sm font-bold text-[var(--tx,#1e293b)]">{f.max_date ?? '—'}</p>
                  <p className="text-xs text-[var(--tx-mut,#64748b)]">
                    {f.lag_days == null ? 'no data' : `${f.lag_days}d old · ${f.status}`}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim,#94a3b8)] font-black mb-2">
                Recent pipeline runs
              </h3>
              <div className="space-y-1">
                {data.runs.map((r) => (
                  <div
                    key={`${r.step}-${r.started_at}`}
                    className="flex items-center gap-3 text-xs text-[var(--tx-mut,#475569)]"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        r.status === 'complete'
                          ? 'bg-emerald-400'
                          : r.status === 'error'
                            ? 'bg-rose-500'
                            : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-semibold">{r.step}</span>
                    <span>{new Date(r.started_at).toLocaleString()}</span>
                    <span className="text-[var(--tx-dim,#94a3b8)]">
                      {r.rows_affected != null ? `${r.rows_affected} rows` : ''}
                    </span>
                    {r.error_msg && <span className="text-rose-500">{r.error_msg}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
