'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetchPortfolioBacktests, fetchPortfolioDetail } from '@/lib/api';
import { PRODUCTS, productForSlug, slugForRow, fullLabelOf, INSAMPLE_END, type ProductDef } from '@/lib/products';
import { pct, pctSign, num, realizedMonth } from '@/lib/portfolio';
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
        <b>Production</b> strategies (is_production), tracked forward as <b>modeled paper portfolios</b> — our
        optimizer + $5M cost model continued past the in-sample window to latest data; IBKR paper and live
        tracks follow on the same pages. Two are the config-locked optimizer finalists; the third is the
        <b> S&amp;P 500 Extension 150/50</b>, our first strategy queued for IBKR paper trading. Below them,
        exploratory <b>research / paper</b> tracks. The research hub remains the in-sample decision surface.
      </p>

      {error && <div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load production portfolios.</div>}
      {!prod && !error && <div className="panel p-16 text-center muted text-sm">Loading portfolios…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* the 2 config-locked optimizer finalists (no explicit fullLabel → in-sample/OOS ProductCard) */}
        {(prod ?? []).filter((r) => r.strategy !== 'ext').map((r) => <ProductCard key={r.model_label} row={r} />)}
        {/* the S&P 500 Extension 150/50 — is_production, but a single materialized-blend track → full-track card */}
        {PRODUCTS.filter((p) => p.track === 'production' && p.fullLabel).map((p) => <ResearchCard key={p.slug} product={p} />)}
        {PRODUCTS.filter((p) => p.track === 'candidate').map((p) => <ResearchCard key={p.slug} product={p} />)}
        {PRODUCTS.filter((p) => p.track === 'research').map((p) => <ResearchCard key={p.slug} product={p} />)}
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
  // OOS return on the SAME collateral-credited excess-over-cash basis as the in-sample headline (L/S):
  // credited excess = net-vs-cash active_return + RF earned on collateral (= benchmark) − haircut.
  // (Long-only: plain net-active vs the equity benchmark.) HAIRCUT_M matches the API CREDIT_HAIRCUT_ANN
  // (0.5%/yr). Without the credit, OOS would read −11.9% net-vs-cash — a different basis than the headline.
  const HAIRCUT_M = 0.005 / 12;
  const oosActive = oos.length
    ? oos.reduce((a, m) => a * (1 + (m.active_return ?? 0) + (isLS ? (m.benchmark ?? 0) - HAIRCUT_M : 0)), 1) - 1
    : null;
  const lastDate = monthly.length ? monthly[monthly.length - 1].date : null;
  const activeLabel = isLS ? 'excess vs cash' : 'net active';

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
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
        <MiniStat label="Ann Return" value={pctSign(isLS ? row.ann_total_credited : row.ann_total_net)} color={((isLS ? row.ann_total_credited : row.ann_total_net) ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub={isLS ? 'incl. cash' : 'total'} />
        <MiniStat label={isLS ? 'Ann Excess' : 'Ann Active'} value={pctSign(isLS ? row.ann_credited : row.ann_active)} color={((isLS ? row.ann_credited : row.ann_active) ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub={isLS ? 'vs cash' : 'vs bench'} />
        <MiniStat label="Info Ratio" value={num(isLS ? row.ir_credited : row.ir)} />
        <MiniStat label={isLS ? 'Realized Vol' : 'Realized TE'} value={pct(row.realized_te, 1)} sub={row.te_target != null ? `${pct(row.te_target, 0)} tgt` : undefined} />
        <MiniStat label="Max DD" value={pct(row.max_drawdown, 0)} color="var(--neg)" />
      </div>

      {/* live-to-date secondary */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--tx-dim)' }}>
          LIVE · 2024 → {lastDate ? realizedMonth(lastDate).slice(0, 7) : '…'} <span style={{ color: 'var(--amber)' }}>(out-of-sample)</span>
        </div>
        <div className="text-[12px] font-bold mono" style={{ color: (oosActive ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {oosActive == null ? '…' : `${pctSign(oosActive, 1)} ${activeLabel}`}
        </div>
      </div>

      {/* full-track spark with in-sample/OOS boundary */}
      {monthly.length > 2 ? (
        <CumulativeChart dates={monthly.map((m) => realizedMonth(m.date))} boundaryDate={realizedMonth(INSAMPLE_END)} height={130} series={[
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

// RESEARCH/paper track: no is_production row exists, so we fetch the `_full` detail directly.
// `meta` = full-period (2005→latest, incl. OOS) summary — the honest all-in headline for a research
// track (vs the production cards' in-sample headline). Distinct amber "Research · Paper" badge.
function ResearchCard({ product }: { product: ProductDef }) {
  const label = product.fullLabel!;
  const { data: full } = useSWR(['pf-research', label], () => fetchPortfolioDetail(label), { revalidateOnFocus: false });
  const meta = full?.meta;
  const monthly = full?.monthly ?? [];
  const oos = monthly.filter((m) => m.date > INSAMPLE_END);
  const oosActive = oos.length ? oos.reduce((a, m) => a * (1 + (m.active_return ?? 0)), 1) - 1 : null;
  const lastDate = monthly.length ? monthly[monthly.length - 1].date : null;

  return (
    <Link href={`/portfolios/${product.slug}`} className="panel group block p-5 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {product.track === 'production'
          ? <><span className="pill pill-ok">★ Production</span><span className="pill" style={{ background: 'rgba(14,124,111,0.12)', color: 'var(--teal)' }}>Paper · Modeled</span></>
          : product.track === 'candidate'
          ? <span className="pill" style={{ background: 'rgba(30,64,175,0.13)', color: 'var(--cyan)' }}>◆ Production Candidate</span>
          : <span className="pill" style={{ background: 'rgba(180,83,9,0.13)', color: 'var(--amber)' }}>🔬 Research · Paper</span>}
        <span className="pill pill-cyan">{product.universe === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{product.strategy === 'ext' ? '150/50 Extension' : product.strategy === 'long_short' ? 'Long-short' : 'Long-only'}</span>
      </div>

      <h2 className="text-lg font-bold tracking-tight mb-0.5" style={{ color: 'var(--tx)' }}>{product.name}</h2>
      <p className="text-[11.5px] mb-3" style={{ color: 'var(--tx-mut)' }}>{product.blurb}</p>

      {/* full-period headline (incl. OOS) — the honest all-in number for a research track */}
      <div className="text-[10px] font-bold tracking-wider mb-1" style={{ color: 'var(--tx-dim)' }}>FULL TRACK 2005–2026 (incl. live)</div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
        <MiniStat label="Ann Return" value={pctSign((meta?.strategy === 'long_short' ? meta?.ann_total_credited : meta?.ann_total_net) ?? null)} color={((meta?.strategy === 'long_short' ? meta?.ann_total_credited : meta?.ann_total_net) ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub="total" />
        <MiniStat label="Ann Active" value={pctSign(meta?.ann_active ?? null)} color={(meta?.ann_active ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub="vs bench" />
        <MiniStat label="Info Ratio" value={num(meta?.ir ?? null)} />
        <MiniStat label="Realized TE" value={pct(meta?.realized_te ?? null, 1)} sub={meta?.te_target != null ? `${pct(meta.te_target, 0)} tgt` : undefined} />
        <MiniStat label="Max DD" value={pct(meta?.max_drawdown ?? null, 0)} color="var(--neg)" />
      </div>

      {/* live-to-date secondary */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--tx-dim)' }}>
          LIVE · 2024 → {lastDate ? realizedMonth(lastDate).slice(0, 7) : '…'} <span style={{ color: 'var(--amber)' }}>(out-of-sample)</span>
        </div>
        <div className="text-[12px] font-bold mono" style={{ color: (oosActive ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {oosActive == null ? '…' : `${pctSign(oosActive, 1)} net active`}
        </div>
      </div>

      {/* full-track spark with in-sample/OOS boundary */}
      {monthly.length > 2 ? (
        <CumulativeChart dates={monthly.map((m) => realizedMonth(m.date))} boundaryDate={realizedMonth(INSAMPLE_END)} height={130} series={[
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

function MiniStat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--tx-dim)' }}>{label}</div>
      <div className="text-[15px] font-bold mono" style={{ color: color ?? 'var(--tx)' }}>{value}</div>
      {sub && <div className="text-[8px] mono" style={{ color: 'var(--tx-dim)' }}>{sub}</div>}
    </div>
  );
}
