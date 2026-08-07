'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetchPortfolioBacktests, fetchPortfolioDetail } from '@/lib/api';
import { PRODUCTS, INSAMPLE_END, type ProductDef } from '@/lib/products';
import { pct, pctSign, num, realizedMonth } from '@/lib/portfolio';
import { CumulativeChart } from '@/components/portfolio/charts';
import { fetchPaperBook, fetchPaperNav } from '@/lib/paper';

const TIER_ORDER: Record<string, number> = { production: 0, candidate: 1, research: 2 };

export default function PortfoliosLanding() {
  const { data: prod, error } = useSWR(['pf-production'], () => fetchPortfolioBacktests({ production: true }),
    { revalidateOnFocus: false });
  // The DB is the authority on what is production; `track` below only orders the grid and picks the
  // report copy. Undefined until the feed lands, so the badge doesn't flash the wrong tier.
  const prodLabels = prod ? new Set(prod.map((r) => r.model_label)) : undefined;

  return (
    <div className="animate-in">
      <div className="flex items-center gap-3 mb-1">
        <span className="pill pill-teal">PORTFOLIOS</span>
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--tx-dim)' }}>The traded book · candidates · paper-tracked</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--tx)' }}>Live / Paper Portfolios</h1>
      <p className="text-[13px] mb-5 max-w-3xl" style={{ color: 'var(--tx-mut)' }}>
        Strategies tracked forward as <b>modeled paper portfolios</b> — our optimizer + the realistic
        per-name cost model, continued past the in-sample window to latest data. The production book
        is now also traded in an <b>IBKR paper account</b>, and its card leads with that real book;
        the modeled track sits below it as the record, since a book days old is not a track record.
        Costs are accounted at the fund size each track is run for:
        <b>$1M</b> for the S&amp;P 500 Extensions (the paper-account size), <b>$5M</b> for the research
        lens on everything else — each report states its own. <b>★ Production</b> marks the one book we
        actually hold: the <b>S&amp;P 500 Extension
        150/50 (te6 sleeve)</b>, traded in the IBKR paper account. <b>◆ Production Candidates</b> are
        config-locked and rebuilt every month but not held — including the equity core and the L/S sleeve
        that the traded extension is built from. Below them, exploratory <b>research / paper</b> tracks.
        The research hub remains the in-sample decision surface.
      </p>

      {error && <div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load production portfolios.</div>}
      {!prod && !error && <div className="panel p-16 text-center muted text-sm">Loading portfolios…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* One rendering path for every card. Order = production → candidate → research; the ★ badge
            is derived from the DB `is_production` feed inside the card, never from `track`, so the
            flag and the site cannot disagree (the `[10-OT7]` defect). */}
        {PRODUCTS.filter((p) => p.fullLabel)
          .sort((a, b) => TIER_ORDER[a.track ?? 'research'] - TIER_ORDER[b.track ?? 'research'])
          .map((p) => <ResearchCard key={p.slug} product={p} prodLabels={prodLabels} />)}
      </div>
    </div>
  );
}

// Every card on this page. `meta` = full-period (2005→latest, incl. OOS) summary — the honest all-in
// headline, and the same framing for the held book as for everything else. The tier badge comes from
// `prodLabels` (the DB is_production feed), NOT from `product.track`.
function ResearchCard({ product, prodLabels }: { product: ProductDef; prodLabels?: Set<string> }) {
  const label = product.fullLabel!;
  const { data: full } = useSWR(['pf-research', label], () => fetchPortfolioDetail(label), { revalidateOnFocus: false });
  const meta = full?.meta;
  const monthly = full?.monthly ?? [];
  // A product is production iff the DB flags one of its labels. Both are checked because the ext
  // books ARE their `_full` label, while the optimizer books carry the flag on the in-sample twin.
  const isProd = !!prodLabels && ((product.fullLabel != null && prodLabels.has(product.fullLabel))
    || (product.prodLabel != null && prodLabels.has(product.prodLabel)));
  // L/S books report on the collateral-credited excess-over-cash basis — the skill/IR number
  // (reference_ls_return_conventions). Reading plain `ann_active`/`ir` here would quietly put the two
  // market-neutral books on the uncredited net-vs-cash basis, i.e. a different (worse) yardstick than
  // every other surface shows them on.
  const isLS = product.strategy === 'long_short';
  const annTotal = (isLS ? meta?.ann_total_credited : meta?.ann_total_net) ?? null;
  const annActive = (isLS ? meta?.ann_credited : meta?.ann_active) ?? null;
  const oos = monthly.filter((m) => m.date > INSAMPLE_END);
  // Credited excess = net-vs-cash active_return + RF earned on collateral (= benchmark) − haircut.
  // HAIRCUT_M matches the API CREDIT_HAIRCUT_ANN (0.5%/yr).
  const HAIRCUT_M = 0.005 / 12;
  const oosActive = oos.length
    ? oos.reduce((a, m) => a * (1 + (m.active_return ?? 0) + (isLS ? (m.benchmark ?? 0) - HAIRCUT_M : 0)), 1) - 1
    : null;
  const lastDate = monthly.length ? monthly[monthly.length - 1].date : null;

  return (
    <Link href={`/portfolios/${product.slug}`} className="panel group block p-5 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {isProd
          ? <><span className="pill pill-ok">★ Production</span><span className="pill" style={{ background: 'rgba(14,124,111,0.12)', color: 'var(--teal)' }}>{product.paperStrategy ? 'Paper · IBKR' : 'Paper · Modeled'}</span></>
          : product.track === 'research'
          ? <span className="pill" style={{ background: 'rgba(180,83,9,0.13)', color: 'var(--amber)' }}>🔬 Research · Paper</span>
          : <span className="pill" style={{ background: 'rgba(30,64,175,0.13)', color: 'var(--cyan)' }}>◆ Production Candidate</span>}
        <span className="pill pill-cyan">{product.universe === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{product.strategy === 'ext' ? '150/50 Extension' : product.strategy === 'long_short' ? 'Long-short' : 'Long-only'}</span>
      </div>

      <h2 className="text-lg font-bold tracking-tight mb-0.5" style={{ color: 'var(--tx)' }}>{product.name}</h2>
      <p className="text-[11.5px] mb-3" style={{ color: 'var(--tx-mut)' }}>{product.blurb}</p>

      {/* THE BOOK WE OWN LEADS. Only a product with an account behind it renders this; everything
          else is unchanged. Below it the modeled track continues as the record — demoted in
          position, not removed, because a week of paper is not a track record and the 21-year
          series is still the thing that says whether the strategy is any good. */}
      {product.paperStrategy && <PaperBand strategy={product.paperStrategy} />}

      {/* full-period headline (incl. OOS) — the honest all-in number */}
      <div className="text-[10px] font-bold tracking-wider mb-1" style={{ color: 'var(--tx-dim)' }}>
        {product.paperStrategy ? 'MODELED TRACK 2005–2026 (the same strategy, simulated)'
                               : 'FULL TRACK 2005–2026 (incl. live)'}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
        <MiniStat label="Ann Return" value={pctSign(annTotal)} color={(annTotal ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub={isLS ? 'incl. cash' : 'total'} />
        <MiniStat label={isLS ? 'Ann Excess' : 'Ann Active'} value={pctSign(annActive)} color={(annActive ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} sub={isLS ? 'vs cash' : 'vs bench'} />
        <MiniStat label="Info Ratio" value={num((isLS ? meta?.ir_credited : meta?.ir) ?? null)} />
        <MiniStat label={isLS ? 'Realized Vol' : 'Realized TE'} value={pct(meta?.realized_te ?? null, 1)} sub={meta?.te_target != null ? `${pct(meta.te_target, 0)} tgt` : undefined} />
        <MiniStat label="Max DD" value={pct(meta?.max_drawdown ?? null, 0)} color="var(--neg)" />
      </div>

      {/* live-to-date secondary */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--tx-dim)' }}>
          LIVE · 2024 → {lastDate ? realizedMonth(lastDate).slice(0, 7) : '…'} <span style={{ color: 'var(--amber)' }}>(out-of-sample)</span>
        </div>
        <div className="text-[12px] font-bold mono" style={{ color: (oosActive ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {oosActive == null ? '…' : `${pctSign(oosActive, 1)} ${isLS ? 'excess vs cash' : 'net active'}`}
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

/** The live IBKR paper account, at the top of the card for the one product that has one.
 *
 *  WHAT IT DELIBERATELY DOES NOT SHOW. No annualized return, no IR, no drawdown: the account is
 *  days old and the API withholds ratio statistics below 60 observations for exactly this reason
 *  (a one-week paper IR gets screenshotted and quoted back). This band shows STATE plus a
 *  since-inception total — what is actually knowable — and sends the reader to the track page for
 *  the rest.
 *
 *  THE CASH DAYS ARE MARKED, NOT RESTATED. The account was funded before it traded, so a
 *  since-inception number reaches back through days the book held nothing. Re-basing to the first
 *  fill would flatter the track on precisely the days it is most fragile; the house rule
 *  (`performance_reporting_plan.md`, "Two presentation rules") is to label it and move on.
 *
 *  It renders nothing at all if the account has no book yet — an empty band on the production card
 *  would read as "the strategy is flat", which is a different claim from "we have not traded".
 */
function PaperBand({ strategy }: { strategy: string }) {
  const { data: bk } = useSWR(['pf-paper-book', strategy], () => fetchPaperBook('paper', strategy),
    { revalidateOnFocus: false });
  const { data: nav } = useSWR(['pf-paper-nav', strategy], () => fetchPaperNav('paper', strategy),
    { revalidateOnFocus: false });

  if (!bk?.book) return null;
  const b = bk.book;
  const last = nav?.series?.[nav.series.length - 1];
  const benchLast = nav?.series ? [...nav.series].reverse().find((p) => p.bench_idx != null)?.bench_idx ?? null : null;
  const sinceIncept = last?.nav_idx != null ? last.nav_idx / 100 - 1 : null;
  const benchSince = benchLast != null ? benchLast / 100 - 1 : null;
  const names = (b.n_long ?? 0) + (b.n_short ?? 0);
  // "Has this account ever held a position?" — not "does it right now". A book that traded and was
  // later flattened still has a relative track worth showing; one that has never traded does not.
  const invested = !!nav?.first_invested;

  return (
    <div className="mb-3 p-3 rounded-lg" style={{ background: 'rgba(14,124,111,0.06)', border: '1px solid rgba(14,124,111,0.18)' }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
        <div className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--teal)' }}>
          IBKR PAPER · {b.account_id} · {b.date}
        </div>
        <div className="flex items-center gap-2">
          {nav?.incl_cash_days && (
            <span className="text-[9px] font-semibold px-1.5 py-px rounded"
              style={{ background: 'var(--panel2)', color: 'var(--tx-dim)' }}>incl. cash days</span>
          )}
          <span className="text-[9px] font-bold px-1.5 py-px rounded"
            style={b.tied_out
              ? { background: 'rgba(21,128,61,0.12)', color: 'var(--pos)' }
              : { background: 'rgba(185,28,28,0.12)', color: 'var(--neg)' }}>
            {b.tied_out ? '✓ tied' : '✗ not tied'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <MiniStat label="NAV" value={b.nav == null ? '—' : `$${Math.round(b.nav).toLocaleString()}`} />
        <MiniStat label="Since inception" value={pctSign(sinceIncept, 2)}
          color={(sinceIncept ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'}
          sub={nav?.inception ? `from ${nav.inception}` : undefined} />
        {/* RELATIVE PERFORMANCE IS SUPPRESSED WHILE THE ACCOUNT IS CASH — the reports' first
            presentation rule, and it earns its keep here. A funded-but-untraded account sitting
            through a benchmark rally shows a real opportunity cost, but rendering it beside the
            book's own return reads as the STRATEGY having lost to the index, on precisely the days
            a track record is most fragile. Once invested, the marking takes over instead. */}
        {invested
          ? <MiniStat label="S&P 500 TR" value={pctSign(benchSince, 2)} sub="same window" />
          : <MiniStat label="S&P 500 TR" value="—" sub="held while in cash" />}
        <MiniStat label="Names" value={names ? String(names) : '—'}
          sub={names ? `${b.n_long ?? 0}L / ${b.n_short ?? 0}S` : 'not invested'} />
        <MiniStat label="Gross" value={pct(b.gross_pct, 0)} sub={`net ${pct(b.net_pct, 0)}`} />
      </div>

      {/* No ratio statistics, and the reason — rather than a blank the reader has to interpret. */}
      {nav?.stats_suppressed && (
        <div className="text-[9.5px] mt-1.5" style={{ color: 'var(--tx-dim)' }}>
          {nav.n_obs} trading day{nav.n_obs === 1 ? '' : 's'} — no annualized return, IR or drawdown
          yet; they appear once the track can carry them.
        </div>
      )}
      {!!bk.degradations?.length && (
        <div className="text-[9.5px] mt-1" style={{ color: 'var(--neg)' }}>
          ⚠ {bk.degradations.join(' · ')}
        </div>
      )}
    </div>
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
