'use client';

import useSWR from 'swr';
import { fetchMacroBetaEpisodes } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Universe } from '@/types/macroBeta';

function CoverageBadge({ share }: { share: number | null }) {
  if (share == null) return <span className="text-[var(--tx-dim,#94a3b8)]">—</span>;
  const pct = share * 100;
  const cls =
    pct >= 50
      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
      : pct > 0
        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
        : 'bg-rose-500/10 text-rose-500 border-rose-500/30';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

export function EpisodeScorecard({ universe }: { universe: Universe }) {
  const { data, error, isLoading } = useSWR(['macro-beta-episodes', universe], () =>
    fetchMacroBetaEpisodes(universe)
  );
  const thresholdPct = data?.[0]?.dd_threshold != null
    ? `${(data[0].dd_threshold * 100).toFixed(0)}%`
    : universe === 'smid' ? '20%' : '15%';

  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
          Drawdown Report Card
        </h2>
        <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
          Every ≥{thresholdPct} peak-to-trough episode in the signal&apos;s history, and what
          the model did. This is the product: coverage of the deep macro-led bears.
          {universe === 'smid'
            ? ' Relative small-cap bears without macro stress (1983-, 2024-type) are a documented gap — see the model document.'
            : ' Fast shocks (2018-, 2025-type) are a documented gap — see the model document.'}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading episodes…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load episodes.</p>}
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--tx-dim,#94a3b8)] border-b border-[var(--border-soft,#e2e8f0)]">
                  <th className="py-2 pr-4 font-bold">Peak</th>
                  <th className="py-2 pr-4 font-bold">Trough</th>
                  <th className="py-2 pr-4 font-bold text-right">Depth</th>
                  <th className="py-2 pr-4 font-bold text-right">Length</th>
                  <th className="py-2 pr-4 font-bold text-right">Defense coverage</th>
                  <th className="py-2 pr-4 font-bold text-right">Days to defense</th>
                  <th className="py-2 pr-0 font-bold text-right">Defensive in recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.map((ep) => (
                  <tr key={ep.peak_date} className="border-b border-[var(--border-soft,#f1f5f9)] last:border-0">
                    <td className="py-2.5 pr-4 font-semibold text-[var(--tx,#334155)]">{ep.peak_date}</td>
                    <td className="py-2.5 pr-4 text-[var(--tx-mut,#475569)]">
                      {ep.trough_date}
                      {!ep.recovered_date && (
                        <span className="ml-2 text-xs text-amber-500 font-bold">ongoing</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-bold text-rose-500">
                      {(ep.depth * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[var(--tx-mut,#475569)]">{ep.dd_days}d</td>
                    <td className="py-2.5 pr-4 text-right">
                      <CoverageBadge share={ep.defense_share} />
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[var(--tx-mut,#475569)]">
                      {ep.days_to_first_defense == null ? (
                        <span className="text-rose-500 font-bold">never</span>
                      ) : (
                        `${ep.days_to_first_defense}d`
                      )}
                    </td>
                    <td className="py-2.5 pr-0 text-right text-[var(--tx-mut,#475569)]">
                      {ep.recovery_defense_share == null
                        ? '—'
                        : `${(ep.recovery_defense_share * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
