'use client';

import useSWR from 'swr';
import { fetchMacroBetaStats } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const WINDOW_LABELS: Record<string, string> = {
  full: 'Full history (1973+)',
  since_1990: 'Since 1990',
  trailing_10y: 'Trailing 10 years',
};

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">{label}</p>
      <p className="text-lg font-bold text-[var(--tx,#1e293b)]">{value}</p>
    </div>
  );
}

export function CostOfInsurance() {
  const { data, error, isLoading } = useSWR('macro-beta-stats', fetchMacroBetaStats);

  const byWindow: Record<string, Record<string, number | null>> = {};
  (data ?? []).forEach((r) => {
    byWindow[r.window] = byWindow[r.window] ?? {};
    byWindow[r.window][r.metric] = r.value;
  });

  const windows = Object.keys(WINDOW_LABELS).filter((w) => byWindow[w]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
          The Cost of Insurance
        </h2>
        <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
          A defense signal is an insurance contract: the premium is upside given up while
          defensive in markets that kept rising. We state it plainly rather than hide it.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading stats…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load stats.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {windows.map((w) => {
            const s = byWindow[w];
            const fmtPct = (v: number | null | undefined, dp = 1) =>
              v == null ? '—' : `${(v * 100).toFixed(dp)}%`;
            return (
              <div key={w} className="rounded-2xl bg-slate-400/10 border border-[var(--border-soft,#f1f5f9)] p-5 space-y-3">
                <p className="text-sm font-black text-[var(--tx,#334155)]">{WINDOW_LABELS[w]}</p>
                <StatCell label="Time in defense" value={fmtPct(s.time_in_defense_pct, 0)} />
                <StatCell
                  label="Mkt excess while defensive (ann)"
                  value={fmtPct(s.mkt_xs_during_defense_ann)}
                />
                <StatCell
                  label="Mkt excess while normal (ann)"
                  value={fmtPct(s.mkt_xs_during_normal_ann)}
                />
                <StatCell
                  label="State changes / year"
                  value={s.switches_per_year == null ? '—' : s.switches_per_year.toFixed(1)}
                />
                <StatCell
                  label="Episodes ≥50% covered"
                  value={
                    s.episodes_covered_50 == null || s.episodes_total == null
                      ? '—'
                      : `${s.episodes_covered_50.toFixed(0)} of ${s.episodes_total.toFixed(0)}`
                  }
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[var(--tx-mut,#64748b)] mt-4 leading-relaxed">
          Reading guide: when &ldquo;market excess while defensive&rdquo; is positive, defense
          days on average occurred in rising markets — that is the premium paid. The signal
          earns its keep in the episode table above, not in average months. Full statistical
          treatment (including why no forward-return skill is claimed) is in the model document.
        </p>
      </CardContent>
    </Card>
  );
}
