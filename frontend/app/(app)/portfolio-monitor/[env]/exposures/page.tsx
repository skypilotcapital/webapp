'use client';

// Portfolio Monitor › Exposures ([08-PMON]; IA doc §4). Per mandate: Benchmark · Target · Today ·
// Change · Band for every sector and style, the sleeve's legs, and the risk rows.
//
// * TARGET is the frozen target of the governing rebalance — the LIVE book we traded — measured on
//   the same risk-model data and benchmark as today's book, so Change is purely what the book did
//   since the trade. Never the research book (owner, 2026-10-12).
// * NO FLAGS. A band is a column beside the number; nothing is coloured by where the number sits.
//   The risk rows reuse the paper page's renderer with `plain`, which drops its colour cues.
// * PER MANDATE, never one fund-level exposure table: the core is relative to the S&P 500 and the
//   sleeve is absolute, so a blended row would add two different quantities. The fund appears only
//   as the risk line, where the two do combine (live_book_exposure.md §8, §11.1).

import { use } from 'react';
import useSWR from 'swr';
import { AsOfStrip } from '@/components/portfolio_monitor/AsOfStrip';
import { ExposureTable, LegTable } from '@/components/portfolio_monitor/ExposureTables';
import { FundLine, RiskRow } from '@/components/portfolio/BookRisk';
import { dayLabel, fetchMonitorExposures, pct } from '@/lib/portfolioMonitor';

const MANDATE_TITLE: Record<string, { title: string; sub: string }> = {
  core: { title: 'Core', sub: 'long-only S&P 500 book · measured against the S&P 500' },
  sleeve: { title: 'Sleeve', sub: 'market-neutral Russell 2500 long/short · measured absolute (against cash)' },
};

export default function ExposuresPage({ params }: { params: Promise<{ env: string }> }) {
  const { env } = use(params);
  const { data, error } = useSWR(['pm-exposures', env], () => fetchMonitorExposures(env),
    { revalidateOnFocus: false });

  if (error) return <div className="text-sm text-[var(--tx-mut)]">Could not load exposures: {String(error)}</div>;
  if (!data) return <div className="text-sm text-[var(--tx-dim)]">Loading exposures…</div>;
  if (!data.date) return <div className="text-sm text-[var(--tx-mut)]">{data.note}</div>;

  return (
    <div className="space-y-4">
      <div className="border-b border-[var(--border-soft)] pb-4">
        <h1 className="text-2xl font-bold text-[var(--tx)] tracking-tight">Exposures</h1>
        <p className="text-sm text-[var(--tx-dim)] mt-1">
          What the book is betting on today, beside the target we traded to, the benchmark, and the
          limits it was built inside. Each engine on its own book.
        </p>
        <AsOfStrip
          items={[
            { label: 'Account', value: data.account_id ?? '—' },
            { label: 'Book', value: dayLabel(data.date) },
            { label: 'Risk-model data', value: `${data.b_asof ?? '—'} (${data.b_age_days ?? '—'}d old)` },
            { label: 'Benchmark weights', value: `${data.benchmark_asof ?? '—'} (month-end)` },
          ]}
          target={data.target}
          notices={data.notices}
        />
      </div>

      {data.fund && (
        <div className="panel px-4 py-2">
          <FundLine r={data.fund} plain />
        </div>
      )}

      {data.mandates.map((m) => {
        const t = MANDATE_TITLE[m.mandate] ?? { title: m.mandate, sub: '' };
        const bandText = m.band == null ? 'no sector band'
          : `sector band ±${pct(m.band, 1)} (${m.band_kind})`;
        return (
          <section key={m.mandate} className="panel p-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">{t.title}</h2>
              <span className="text-xs text-[var(--tx-mut)]">{t.sub}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--tx-mut)] mt-1">
              <span>Today <b className="text-[var(--tx)]">{m.n_names} names · gross {m.gross?.toFixed(3) ?? '—'}</b></span>
              <span>Target <b className="text-[var(--tx)]">
                {m.target ? `${m.target.n_names} names · gross ${m.target.gross?.toFixed(3) ?? '—'}` : '—'}
              </b></span>
              <span>Coverage <b className="text-[var(--tx)]">{pct(m.coverage_weight, 1)}</b> of gross</span>
              <span>{bandText}</span>
            </div>
            {m.target_note && <div className="text-xs mt-1 text-[var(--tx)]">{m.target_note}</div>}
            <div className="mt-2">
              <RiskRow m={m} plain />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-3">
              <ExposureTable title="Sectors" rows={m.sectors}
                benchmarkLabel={m.benchmark ? 'S&P 500 weight' : 'none (cash)'}
                valueLabel={m.benchmark ? 'active weight' : 'net weight'} showBand />
              <ExposureTable title="Styles" rows={m.styles}
                benchmarkLabel={m.benchmark ? 'S&P 500' : 'none (cash)'}
                valueLabel={m.benchmark ? 'active tilt' : 'net tilt'}
                footnote="Styles carry no band in production — the per-style constraint is off. The
                  limit on style bets is the mandate's total risk budget in the risk row above." />
            </div>
            {m.legs.length > 0 && <LegTable legs={m.legs} />}
          </section>
        );
      })}

      <div className="text-[11px] text-[var(--tx-dim)] space-y-1 leading-snug">
        {Object.entries(data.notes).map(([k, v]) => (
          <div key={k}><b className="text-[var(--tx-mut)]">{k}</b> — {v}</div>
        ))}
      </div>
    </div>
  );
}
