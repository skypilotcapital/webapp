'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetchPortfolioBacktests, fetchPortfolioDetail } from '@/lib/api';
import { productForSlug, slugForRow, fullLabelOf, INSAMPLE_END } from '@/lib/products';
import { pct, pctSign, num } from '@/lib/portfolio';
import { CumulativeChart } from '@/components/portfolio/charts';
import type { PortfolioBacktest } from '@/types/api';

export default function PortfoliosLanding() {
  const { data: prod, error } = useSWR(['pf-production'], () => fetchPortfolioBacktests({ production: true }),
    { revalidateOnFocus: false });

  return (
    <div className="animate-in">
      <div className="flex items-center gap-3 mb-1">
        <span className="pill pill-teal">PORTFOLIOS</span>
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--tx-dim)' }}>Production candidates · paper-tracked</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--tx)' }}>Live / Paper Portfolios</h1>
      <p className="text-[13px] mb-5 max-w-3xl" style={{ color: 'var(--tx-mut)' }}>
        The two production finalists, tracked forward as <b>modeled paper portfolios</b> — our optimizer and $5M
        cost model continued past the in-sample window to latest available data. IBKR paper and live tracks
        follow on the same pages. The research hub remains the in-sample decision surface.
      </p>

      {error && <div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load production portfolios.</div>}
      {!prod && !error && <div className="panel p-16 text-center muted text-sm">Loading portfolios…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {(prod ?? []).map((r) => <ProductCard key={r.model_label} row={r} />)}
      </div>
    </div>
  );
}

function ProductCard({ row }: { row: PortfolioBacktest }) {
  const slug = slugForRow(row);
  const product = productForSlug(slug);
  const isLS = row.strategy === 'long_short';
  const fullLabel = fullLabelOf(row.model_label);
  const { data: full } = useSWR(['pf-full', fullLabel], () => fetchPortfolioDetail(fullLabel), { revalidateOnFocus: false });

  const monthly = full?.monthly ?? [];
  const oos = monthly.filter((m) => m.date > INSAMPLE_END);
  const oosActive = oos.length ? oos.reduce((a, m) => a * (1 + (m.active_return ?? 0)), 1) - 1 : null;
  const lastDate = monthly.length ? monthly[monthly.length - 1].date : null;
  const activeLabel = isLS ? 'net vs cash' : 'net active';

  return (
    <Link href={`/portfolios/${slug}`} className="panel group block p-5 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="pill pill-ok">★ Production</span>
        <span className="pill" style={{ background: 'rgba(14,124,111,0.12)', color: 'var(--teal)' }}>Paper · Modeled</span>
        <span className="pill pill-cyan">{row.universe === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{isLS ? 'Long-short' : 'Long-only'}</span>
      </div>

      <h2 className="text-lg font-bold tracking-tight mb-0.5" style={{ color: 'var(--tx)' }}>{product?.name ?? slug}</h2>
      <p className="text-[11.5px] mb-3" style={{ color: 'var(--tx-mut)' }}>{product?.blurb}</p>

      {/* in-sample headline */}
      <div className="text-[10px] font-bold tracking-wider mb-1" style={{ color: 'var(--tx-dim)' }}>IN-SAMPLE 2005–2023 (validated)</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label={isLS ? 'Ann Return' : 'Ann Active'} value={pctSign(row.ann_active)} color={(row.ann_active ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <MiniStat label="Info Ratio" value={num(row.ir)} />
        <MiniStat label="Max DD" value={pct(row.max_drawdown, 0)} color="var(--neg)" />
      </div>

      {/* live-to-date secondary */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--tx-dim)' }}>
          LIVE · 2024 → {lastDate ? lastDate.slice(0, 7) : '…'} <span style={{ color: 'var(--amber)' }}>(out-of-sample)</span>
        </div>
        <div className="text-[12px] font-bold mono" style={{ color: (oosActive ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {oosActive == null ? '…' : `${pctSign(oosActive, 1)} ${activeLabel}`}
        </div>
      </div>

      {/* full-track spark with in-sample/OOS boundary */}
      {monthly.length > 2 ? (
        <CumulativeChart dates={monthly.map((m) => m.date)} boundaryDate={INSAMPLE_END} height={130} series={[
          { label: 'Portfolio', color: 'var(--teal)', values: monthly.map((m) => m.cum_portfolio) },
          { label: 'Benchmark', color: 'var(--bench)', values: monthly.map((m) => m.cum_benchmark), dash: true },
        ]} />
      ) : <div className="h-[130px] flex items-center justify-center dim text-[11px]">Loading track…</div>}

      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--teal)' }}>
        <span>Open report</span><span className="transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--tx-dim)' }}>{label}</div>
      <div className="text-[15px] font-bold mono" style={{ color: color ?? 'var(--tx)' }}>{value}</div>
    </div>
  );
}
