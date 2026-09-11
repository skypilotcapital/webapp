'use client';

// The IBKR paper track ([08-PTRK] Phase A; reorganised 2026-09-10 after the owner's review).
//
// Design: `08_website_and_tooling/website_research_hub_IA.md` §IX–§XV (+ the 2026-09-10 addendum).
//
// THIS IS NOT A COPY OF `BacktestReport`, and the difference is the whole reason the page exists:
//
//   the modeled report answers "is the strategy any good?" — 258 months, IR, drawdown, factor
//   attribution; a statistical claim.
//   this answers "are we running the strategy we said we'd run, and what is it doing?" — a real
//   account a few weeks old, where NO statistical claim is available. Its job is FIDELITY and
//   DECOMPOSITION, not track record.
//
// THE 2026-09-10 REORGANISATION. The first version stacked nine panels in build order, which
// interleaved three questions (what do we hold NOW · how did the LAST TRADE go · how are we DOING)
// and three horizons (now · one day · since inception) with no cue for which was which. It also
// carried a hardcoded "not yet available" list that kept saying the recon writer and the
// corporate-actions feed did not exist months after they did. The page is now four bands, each
// answering one question, in the order a PM reads them:
//
//   STATUS       — the book at a glance, tie-out, since first trade vs the index
//   PERFORMANCE  — one PERIOD SELECTOR shared by the chart, the engine split and the contributors,
//                  so every number in the band describes the same days
//   BOOK         — what we hold and what it is betting on (exposures + tracking error)
//   REBALANCE    — how the last trade went: fidelity + shortfall FOR THE SAME REBALANCE, and the
//                  post-rebalance report in the archive
//   INTEGRITY    — reconciliation breaks and corporate actions, READ from their tables
//
// Two rules follow from the page's purpose and are enforced here rather than left to care:
//
//  1. **Ratio statistics are not rendered below the API's observation threshold.** The API returns
//     `stats_suppressed` and the reason; this component prints the reason where the number would
//     have been. It never computes its own IR from the series to fill the gap.
//  2. **A section that cannot be built yet says so, and names its owner — and that list is DRIVEN
//     BY THE DATA, never hand-maintained.** An absent section is indistinguishable from a section
//     with nothing to report, which is how silent degradation survives (F-006 → F-008); a
//     hardcoded list is how it survives its own fix.
//
// PERFORMANCE INCEPTION = the close of the first TRADED day (2026-08-07), not the funding date
// (2026-07-30). Owner decision 2026-09-10: the eight cash days handed the benchmark a permanent
// ~4-point head start that said nothing about the strategy. The funded date is still stated.

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  fetchPaperBook, fetchPaperNav, fetchPaperFidelity, fetchPaperShortfall,
  fetchPaperEngines, fetchPaperContributors, fetchPaperRecon, fetchPaperCorporateActions,
  type PeriodKey, type PaperPeriods, type PaperContributorRow, type PaperContributors,
  type PaperEngines, type PaperNavResponse, type PaperBookResponse, type PaperFidelity,
  type PaperShortfall, type PaperRecon, type PaperCorporateActions,
} from '@/lib/paper';
import { CumulativeChart, MultiLineChart } from '@/components/portfolio/charts';
import { BookRisk } from '@/components/portfolio/BookRisk';

// Break kinds, in the order a reader should scan them. `price` first because it is the expected
// noise; the rest are the ones that mean something. ALWAYS_SHOWN carries the zeros that are
// reassuring to see — a reader must not have to infer "cash is fine" from its absence.
const BREAK_KINDS = ['price', 'cash', 'position', 'fill', 'nav', 'other'] as const;
const ALWAYS_SHOWN: readonly string[] = ['price', 'cash', 'position'];

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(d)}%`;
const pctS = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
const usd = (v: number | null | undefined) =>
  v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString()}`;
const bps = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v.toFixed(d)} bp`;
const bpsS = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const num = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString();
const sign = (v: number | null | undefined) =>
  (v ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)';

const MANDATE_NAME: Record<string, string> = { core: 'LO core', sleeve: 'L/S sleeve', unattributed: 'unattributed', cash_other: 'cash, dividends & financing' };
const MANDATE_COLOR: Record<string, string> = { core: 'var(--teal)', sleeve: '#b45309', unattributed: 'var(--tx-dim)', cash_other: 'var(--tx-mut)' };

// Owner's set (2026-09-10 review): "since rebalance" dropped (month-to-date covers it on a monthly
// book); trailing windows added so the page grows into them — they collapse onto inception and
// render greyed until the book is old enough. "Last day" = the latest marked book date.
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '1d', label: 'Last day' },
  { key: 'wtd', label: 'Week to date' },
  { key: 'mtd', label: 'Month to date' },
  { key: '1m', label: 'Trailing 1M' },
  { key: '3m', label: 'Trailing 3M' },
  { key: 'incep', label: 'Since inception' },
];

const SECTIONS = [
  ['status', 'Status'], ['performance', 'Performance'], ['book', 'Book'],
  ['rebalance', 'Last rebalance'], ['integrity', 'Integrity'],
] as const;

export function PaperTrack({ strategy, slug, productName, topSlot }: {
  strategy?: string; slug?: string; productName?: string; topSlot?: React.ReactNode;
}) {
  const [period, setPeriod] = useState<PeriodKey>('incep');

  const { data: bk } = useSWR(['paper-book', strategy], () => fetchPaperBook('paper', strategy),
    { revalidateOnFocus: false });
  const { data: nav } = useSWR(['paper-nav', strategy], () => fetchPaperNav('paper', strategy),
    { revalidateOnFocus: false });
  const { data: fid } = useSWR(['paper-fid'], () => fetchPaperFidelity('paper'),
    { revalidateOnFocus: false });
  const rid = fid?.rebalance?.rebalance_id;
  // Shortfall is asked for the SAME rebalance Fidelity shows. Two trades under one heading is
  // what this page did until 2026-09-10 (fidelity #28, shortfall #13 — the establishment trade).
  const { data: sf } = useSWR(fid ? ['paper-sf', rid, strategy] : null,
    () => fetchPaperShortfall('paper', 8, rid, strategy), { revalidateOnFocus: false });
  const { data: eng } = useSWR(['paper-eng', strategy, period],
    () => fetchPaperEngines('paper', strategy, period), { revalidateOnFocus: false, keepPreviousData: true });
  const { data: ctb } = useSWR(['paper-ctb', strategy, period],
    () => fetchPaperContributors('paper', strategy, period, 8), { revalidateOnFocus: false, keepPreviousData: true });
  const { data: rc } = useSWR(['paper-recon', strategy], () => fetchPaperRecon('paper', strategy, 10),
    { revalidateOnFocus: false });
  const { data: ca } = useSWR(['paper-ca', strategy], () => fetchPaperCorporateActions('paper', strategy, 30),
    { revalidateOnFocus: false });

  return (
    <div className="animate-in">
      {topSlot}
      <SubNav />

      {/* Degradations lead. Published and labelled, never withheld — the reports' rule. */}
      {!!bk?.degradations?.length && (
        <div className="panel p-3 mb-3" style={{ borderLeft: '3px solid var(--neg)' }}>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--neg)' }}>
            DEGRADED
          </div>
          {bk.degradations.map((d) => (
            <div key={d} className="text-[11.5px]" style={{ color: 'var(--tx)' }}>· {d}</div>
          ))}
        </div>
      )}

      <section id="status"><StatusBand bk={bk} nav={nav} fid={fid} slug={slug} name={productName} /></section>
      <section id="performance">
        <PerformanceBand nav={nav} eng={eng} ctb={ctb} period={period} setPeriod={setPeriod} />
      </section>
      <section id="book"><BookBand bk={bk} strategy={strategy} /></section>
      <section id="rebalance"><RebalanceBand fid={fid} sf={sf} slug={slug} /></section>
      <section id="integrity">
        <IntegrityBand rc={rc} ca={ca} eng={eng} sf={sf} fid={fid} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- sub-nav ---- */
function SubNav() {
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-1 px-2 py-1.5 rounded-md"
      style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)' }}>
      <span className="text-[9px] font-bold tracking-[1.5px] mr-2" style={{ color: 'var(--tx-dim)' }}>
        ON THIS PAGE
      </span>
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} className="text-[11px] font-semibold px-2 py-0.5 rounded"
          style={{ color: 'var(--tx)' }}>
          {label}
        </a>
      ))}
    </div>
  );
}

function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 flex-wrap mb-3">
      <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{title}</h2>
      {sub && <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>{sub}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------------- status ---- */
function StatusBand({ bk, nav, fid, slug, name }: {
  bk?: PaperBookResponse; nav?: PaperNavResponse; fid?: PaperFidelity; slug?: string; name?: string;
}) {
  if (!bk) return <div className="panel p-8 text-center muted text-sm">Loading the book…</div>;
  const b = bk.book;
  if (!b) {
    return (
      <div className="panel p-8 text-center text-sm" style={{ color: 'var(--tx-mut)' }}>
        No book has been built yet. The daily build marks date D at 02:00 UTC on D+1.
      </div>
    );
  }
  const last = nav?.series.length ? nav.series[nav.series.length - 1] : null;
  const bookRet = last?.nav_idx != null ? last.nav_idx / 100 - 1 : null;
  const benchRet = last?.bench_idx != null ? last.bench_idx / 100 - 1 : null;
  const r = fid?.rebalance;

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          {name ?? 'The book'} · IBKR paper
        </h2>
        <span className="text-[11px] font-mono" style={{ color: 'var(--tx-mut)' }}>
          {b.account_id} · book as of {b.date}
        </span>
        {/* `[10-P4]`: no performance number is reported that has not tied out. The marker is the
            precondition made visible — we do not hide the numbers when it is false. */}
        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={b.tied_out
            ? { background: 'rgba(21,128,61,0.12)', color: 'var(--pos)' }
            : { background: 'rgba(185,28,28,0.12)', color: 'var(--neg)' }}>
          {b.tied_out ? '✓ tied to broker' : '✗ NOT tied out'}
        </span>
        {/* WHICH KIND broke, beside the badge ([10-PXCAL]). On the current price threshold the
            badge reads red most days on thin-name marks alone; the composition is what says
            whether cash and positions are fine. Zeros shown on purpose. */}
        {b.tied_out === false && b.unresolved_breaks ? (
          <span className="text-[10px] font-mono" style={{ color: 'var(--tx-mut)' }}>
            {BREAK_KINDS
              .filter((k) => (b[`unresolved_${k}`] ?? 0) > 0 || ALWAYS_SHOWN.includes(k))
              .map((k) => {
                const n = b[`unresolved_${k}`] ?? 0;
                return (
                  <span key={k} className="mr-2"
                    style={n > 0 && k !== 'price' ? { color: 'var(--neg)', fontWeight: 700 } : undefined}>
                    {n} {k}
                  </span>
                );
              })}
            <a href="#integrity" className="teal">details ↓</a>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="NAV" value={usd(b.nav)} sub={`broker ${usd(b.broker_nlv)}`} />
        <Stat label="Day P&L" value={usd(b.pnl_d)} color={sign(b.pnl_d)} sub={`${bps((b.pnl_d ?? 0) / (b.nav || 1) * 1e4)} of NAV`} />
        <Stat label="Since inception" value={pctS(bookRet)} color={sign(bookRet)}
          sub={nav?.perf_inception ? `from ${nav.perf_inception} close (first trade)` : undefined} />
        <Stat label="S&P 500 TR" value={pctS(benchRet)} color={sign(benchRet)} sub="same window" />
        <Stat label="Active" value={bookRet != null && benchRet != null ? pctS(bookRet - benchRet) : '—'}
          color={bookRet != null && benchRet != null ? sign(bookRet - benchRet) : undefined}
          sub="book − index" />
        <div>
          <div className="text-[9px] font-bold tracking-[1.2px]" style={{ color: 'var(--tx-dim)' }}>LAST REBALANCE</div>
          {r ? (
            <>
              <div className="text-[17px] font-bold tabular-nums" style={{ color: 'var(--tx)' }}>#{r.rebalance_id}</div>
              <div className="text-[10px]" style={{ color: 'var(--tx-dim)' }}>
                traded {r.submitted_at?.slice(0, 10)} · signal {r.signal_date} ·{' '}
                <a href="#rebalance" className="teal">how it went ↓</a>
              </div>
            </>
          ) : <div className="text-[17px] font-bold" style={{ color: 'var(--tx-dim)' }}>—</div>}
        </div>
      </div>

      <div className="text-[10.5px] mt-3" style={{ color: 'var(--tx-dim)' }}>
        Account funded <b>{nav?.inception_funded ?? '—'}</b>, first traded <b>{nav?.first_invested ?? '—'}</b>;
        performance is measured from the first traded close. Marked on our own closes (quality{' '}
        <b>{b.mark_quality ?? '—'}</b>), not the broker&apos;s — the broker NLV beside NAV is the tie-out, not
        the source. Built {b.built_at?.slice(0, 16)?.replace('T', ' ')} UTC from the {b.snap_ts?.slice(11, 16)} UTC snapshot.
        {slug && <> · <Link href={`/portfolios/${slug}/reports`} className="teal font-semibold">Report archive →</Link></>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- performance ---- */
function PeriodSelector({ period, setPeriod, periods }: {
  period: PeriodKey; setPeriod: (p: PeriodKey) => void; periods?: PaperPeriods | null;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[9px] font-bold tracking-[1.5px] mr-1" style={{ color: 'var(--tx-dim)' }}>PERIOD</span>
      {PERIODS.map((p) => {
        const active = p.key === period;
        // A period the book is too young for collapses onto inception; label it so a "month to
        // date" that starts on the first traded day is not mistaken for a full month.
        const start = periods?.[p.key];
        const collapsed = !!periods && p.key !== 'incep' && start === periods.incep;
        return (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            title={start ? `from the ${start} close${collapsed ? ' — not yet a full window; same as since inception' : ''}` : undefined}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
            style={active
              ? { background: 'var(--teal)', color: '#fffdf9' }
              : { background: 'var(--panel2)', color: collapsed ? 'var(--tx-dim)' : 'var(--tx)' }}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function PerformanceBand({ nav, eng, ctb, period, setPeriod }: {
  nav?: PaperNavResponse; eng?: PaperEngines; ctb?: PaperContributors;
  period: PeriodKey; setPeriod: (p: PeriodKey) => void;
}) {
  if (!nav) return null;
  if (!nav.series.length) return <Panel title="Performance"><Muted>no book yet</Muted></Panel>;

  const w = eng?.window;
  const start = nav.periods?.[period] ?? nav.perf_inception ?? nav.series[0].date;
  // The chart is the NAV series from the window's start close, both lines rebased there.
  const i0 = Math.max(0, nav.series.findIndex((p) => p.date >= start));
  const sl = nav.series.slice(i0);
  const n0 = sl[0]?.nav_idx ?? 100, b0 = sl.find((p) => p.bench_idx != null)?.bench_idx ?? 100;
  const dates = sl.map((p) => p.date);
  const core = eng?.by_mandate.find((m) => m.mandate === 'core');
  const sleeve = eng?.by_mandate.find((m) => m.mandate === 'sleeve');

  const bpsFmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`;
  const engSeries = eng ? [
    ...eng.by_mandate.map((m) => ({
      label: MANDATE_NAME[m.mandate] ?? m.mandate, color: MANDATE_COLOR[m.mandate] ?? 'var(--tx)',
      values: eng.series.map((p) => (p[m.mandate] as number | null) ?? null),
    })),
    { label: 'Book', color: 'var(--tx)', values: eng.series.map((p) => p.book) },
    { label: 'S&P 500 TR', color: 'var(--tx-dim)', dash: true, values: eng.series.map((p) => p.bench) },
  ] : [];

  return (
    <div className="panel p-4 mb-3">
      <SectionHead title="Performance"
        sub={w ? `${w.start} close → ${w.end} · ${w.n_days} trading day${w.n_days === 1 ? '' : 's'}` : 'net · vs S&P 500 TR'}
        right={<PeriodSelector period={period} setPeriod={setPeriod} periods={nav.periods} />} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-3">
        <Stat label="Book" value={pctS(w?.book_return)} color={sign(w?.book_return)} sub="net, NAV to NAV" />
        <Stat label="S&P 500 TR" value={pctS(w?.bench_return)} color={sign(w?.bench_return)} sub="same days" />
        <Stat label="Active"
          value={w?.book_return != null && w?.bench_return != null ? pctS(w.book_return - w.bench_return) : '—'}
          color={w?.book_return != null && w?.bench_return != null ? sign(w.book_return - w.bench_return) : undefined}
          sub="book − index" />
        <Stat label="LO core" value={bpsS(core?.contrib_bps)} color={sign(core?.contrib_bps)} sub="bp of start NAV" />
        <Stat label="L/S sleeve" value={bpsS(sleeve?.contrib_bps)} color={sign(sleeve?.contrib_bps)} sub="bp · blend (0.5×)" />
        <Stat label="Cash & financing" value={bpsS(eng?.cash_other.contrib_bps)} color={sign(eng?.cash_other.contrib_bps)}
          sub="dividends · interest · commission" />
        <Stat label="Book total" value={bpsS(eng?.total.contrib_bps)} color={sign(eng?.total.contrib_bps)}
          sub={(eng?.unattributed.contrib_bps ?? 0) !== 0 ? `incl. ${bpsS(eng?.unattributed.contrib_bps)} unattributed` : 'engines + cash'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--tx-dim)' }}>
            GROWTH OF 100 · from the {start} close
          </div>
          <CumulativeChart
            dates={dates}
            series={[
              { label: 'Paper book', color: 'var(--teal)', values: sl.map((p) => (p.nav_idx == null ? null : p.nav_idx / n0 * 100)) },
              { label: 'S&P 500 TR', color: 'var(--tx-dim)', dash: true, values: sl.map((p) => (p.bench_idx == null ? null : p.bench_idx / b0 * 100)) },
            ]}
            height={210}
          />
          <Legend items={[['Paper book', 'var(--teal)'], ['S&P 500 TR', 'var(--tx-dim)']]} />
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--tx-dim)' }}>
            BY ENGINE · cumulative bp of start NAV
          </div>
          {eng?.series.length ? (
            <>
              <MultiLineChart dates={eng.series.map((p) => p.date)} series={engSeries} height={210}
                refY={0} yFmt={bpsFmt} />
              <Legend items={[
                ...eng.by_mandate.map((m) => [MANDATE_NAME[m.mandate] ?? m.mandate, MANDATE_COLOR[m.mandate] ?? 'var(--tx)'] as [string, string]),
                ['Book', 'var(--tx)'], ['S&P 500 TR', 'var(--tx-dim)'],
              ]} />
            </>
          ) : <Muted>{eng?.note ?? 'loading…'}</Muted>}
        </div>
      </div>

      {nav.stats_suppressed && (
        <div className="text-[10.5px] mt-3 p-2 rounded" style={{ background: 'var(--panel2)', color: 'var(--tx-mut)' }}>
          <b>No ratio statistics.</b> {nav.reason}. Sharpe, information ratio and drawdown statistics
          appear once the track is long enough to carry them — this page is a fidelity record first
          and a track record later.
        </div>
      )}

      {/* ---- engines table ---- */}
      {eng?.window && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
            BY ENGINE · the netted account split back to its two mandates
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--tx-dim)' }}>
                  {['Engine', 'P&L', 'Contribution', 'Share of book'].map((h, i) => (
                    <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1"
                      style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...eng.by_mandate, { mandate: 'unattributed', ...eng.unattributed },
                  { mandate: 'cash_other', pnl: eng.cash_other.pnl ?? 0, contrib_bps: eng.cash_other.contrib_bps }].map((m) => (
                  <tr key={m.mandate} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="py-1.5 font-semibold" style={{ color: MANDATE_COLOR[m.mandate] ?? 'var(--tx)' }}>
                      {MANDATE_NAME[m.mandate] ?? m.mandate}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: sign(m.pnl) }}>{usd(m.pnl)}</td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: sign(m.contrib_bps) }}>{bpsS(m.contrib_bps)} bp</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--tx-mut)' }}>
                      {eng.total.pnl ? `${(m.pnl / eng.total.pnl * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-1.5 font-bold" style={{ color: 'var(--tx)' }}>book</td>
                  <td className="text-right tabular-nums font-bold" style={{ color: sign(eng.total.pnl) }}>{usd(eng.total.pnl)}</td>
                  <td className="text-right tabular-nums font-bold" style={{ color: sign(eng.total.contrib_bps) }}>{bpsS(eng.total.contrib_bps)} bp</td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--tx-mut)' }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
            {eng.basis}. The book row is the NAV move; the cash row is what the engines cannot own
            (dividends received on longs and PAID on shorts, interest, trade-day commission). Split READ
            from the ledger&apos;s daily attribution, never recomputed here; a name
            the book exits still earns its exit-day P&L, attributed to the mandate that held it the day
            before ({eng.carried_rows} row{eng.carried_rows === 1 ? '' : 's'} carried this window).
          </div>
        </div>
      )}

      {/* ---- contributors ---- */}
      <Contributors ctb={ctb} />
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-3 flex-wrap mt-1">
      {items.map(([l, c]) => (
        <span key={l} className="text-[10px] flex items-center gap-1" style={{ color: 'var(--tx-mut)' }}>
          <span className="inline-block w-3 h-[2px]" style={{ background: c }} />{l}
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- contributors ---- */
function Contributors({ ctb }: { ctb?: PaperContributors }) {
  if (!ctb) return null;
  if (!ctb.window) return <div className="mt-4"><Muted>{ctb.note}</Muted></div>;
  const engines = ['core', 'sleeve'].filter((m) => ctb.by_mandate[m]);
  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <div className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'var(--tx-dim)' }}>
          CONTRIBUTORS AND DETRACTORS · by engine · {ctb.window.start} close → {ctb.window.end}
        </div>
        <span className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
          S&P 500 TR over the window {pctS(ctb.window.bench_return)} · benchmark weights as of {ctb.bench_weights_asof ?? '—'}
        </span>
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        {engines.map((m) => <EngineTable key={m} mandate={m} data={ctb.by_mandate[m]} />)}
      </div>
      <div className="text-[10.5px] mt-3" style={{ color: 'var(--tx-dim)' }}>
        <b>Contribution</b> is exact: the engine&apos;s share of each day&apos;s P&L summed over the window, in
        basis points of the NAV at the window start — so a 40% move on a 0.1% position reads as the
        noise it is. <b>w×r</b> is held weight at the window start × the stock&apos;s return over the window,
        the simple product a reader would do by hand; the gap between it and the exact number is
        trades, drift and partial holding, shown rather than hidden. <b>Core</b> is long-only against
        the S&P 500, so a name held at its benchmark weight is a zero active bet — the Active column is
        the bet. <b>Sleeve</b> is market-neutral against cash: no benchmark column; Held is its blend
        weight (the sleeve enters at 0.5×) and Native its own book. A short&apos;s contribution has the
        opposite sign to its stock return. <sup>↑</sup> entered inside the window · <sup>↓</sup> exited.
      </div>
    </div>
  );
}

function EngineTable({ mandate, data }: {
  mandate: string;
  data: { n_names: number; total_bps: number | null; contributors: PaperContributorRow[]; detractors: PaperContributorRow[] };
}) {
  const core = mandate === 'core';
  const cols = core
    ? ['Name', 'Sector', 'Held', 'Bench', 'Active', 'Stock', 'w×r', 'Contrib']
    : ['Name', 'Side', 'Held', 'Native', 'Stock', 'w×r', 'Contrib'];
  const Row = ({ r }: { r: PaperContributorRow }) => (
    <tr style={{ borderTop: '1px solid var(--border-soft)' }}>
      <td className="py-1 font-semibold whitespace-nowrap" style={{ color: 'var(--tx)' }}>
        {r.ticker ?? r.conid}
        {r.entered && <sup title="entered inside the window"> ↑</sup>}
        {r.exited && <sup title="exited inside the window"> ↓</sup>}
      </td>
      {core
        ? <td className="text-[10px] truncate max-w-[110px]" style={{ color: 'var(--tx-dim)' }} title={r.sector ?? ''}>{r.sector ?? '—'}</td>
        : <td className="text-[10px]" style={{ color: r.side === 'short' ? '#b45309' : 'var(--tx-dim)' }}>{r.side ?? '—'}</td>}
      <td className="text-right tabular-nums">{pct(r.held_weight, 2)}</td>
      {core
        ? <>
            <td className="text-right tabular-nums" style={{ color: 'var(--tx-mut)' }}>{pct(r.bench_weight, 2)}</td>
            <td className="text-right tabular-nums font-semibold" style={{ color: sign(r.active_weight) }}>
              {r.active_weight == null ? '—' : `${r.active_weight >= 0 ? '+' : ''}${(r.active_weight * 100).toFixed(2)}pp`}
            </td>
          </>
        : <td className="text-right tabular-nums" style={{ color: 'var(--tx-mut)' }}>{pct(r.native_weight, 2)}</td>}
      <td className="text-right tabular-nums" style={{ color: sign(r.stock_return) }}>{pctS(r.stock_return, 1)}</td>
      <td className="text-right tabular-nums" style={{ color: 'var(--tx-dim)' }}>{r.approx_bps == null ? '—' : bpsS(r.approx_bps)}</td>
      <td className="text-right tabular-nums font-bold" style={{ color: sign(r.contrib_bps) }}>{bpsS(r.contrib_bps)}</td>
    </tr>
  );
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11.5px] font-bold" style={{ color: MANDATE_COLOR[mandate] }}>{MANDATE_NAME[mandate]}</span>
        <span className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
          {core ? 'long-only · vs S&P 500' : 'market-neutral · vs cash'} · {data.n_names} names · engine total{' '}
          <b style={{ color: sign(data.total_bps) }}>{bpsS(data.total_bps)} bp</b>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--tx-dim)' }}>
              {cols.map((h, i) => (
                <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1 whitespace-nowrap"
                  style={{ textAlign: i < 2 ? 'left' : 'right' }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={cols.length} className="pt-1 text-[9px] font-bold tracking-[1.2px]" style={{ color: 'var(--pos)' }}>TOP</td></tr>
            {data.contributors.map((r) => <Row key={`c${r.conid}`} r={r} />)}
            <tr><td colSpan={cols.length} className="pt-2 text-[9px] font-bold tracking-[1.2px]" style={{ color: 'var(--neg)' }}>BOTTOM</td></tr>
            {data.detractors.map((r) => <Row key={`d${r.conid}`} r={r} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ book ---- */
function BookBand({ bk, strategy }: { bk?: PaperBookResponse; strategy?: string }) {
  const b = bk?.book;
  return (
    <div className="panel p-4 mb-3">
      <SectionHead title="The book" sub={b ? `what we hold as of ${b.date}, and what it is betting on` : undefined} />
      {b && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat label="Gross" value={pct(b.gross_pct, 0)} sub={`${pct(b.gross_long_pct, 0)} L · ${pct(b.gross_short_pct, 0)} S`} />
          <Stat label="Net" value={pct(b.net_pct, 0)} sub="of NAV" />
          <Stat label="Names" value={num((b.n_long ?? 0) + (b.n_short ?? 0))} sub={`${b.n_long ?? 0}L / ${b.n_short ?? 0}S`} />
          <Stat label="Margin util" value={pct(b.margin_util, 0)} />
          <Stat label="Cash" value={usd(b.cash)} sub={`accrued ${usd(b.accrued_cash)}`} />
          <Stat label="Mandate" value="150 / 50" sub="LO core 1.0× + L/S sleeve 0.5×" />
        </div>
      )}
      {/* Exposures + tracking error, per mandate — the existing panel, moved under the question
          it answers. Its own header carries the as-of and the fund line. */}
      <BookRisk strategy={strategy} />
    </div>
  );
}

/* ------------------------------------------------------------------------- rebalance ---- */
function RebalanceBand({ fid, sf, slug }: { fid?: PaperFidelity; sf?: PaperShortfall; slug?: string }) {
  if (!fid) return null;
  if (!fid.rebalance) {
    return <Panel title="Last rebalance"><Muted>{fid.note ?? 'no rebalance has been executed yet'}</Muted></Panel>;
  }
  const r = fid.rebalance;
  return (
    <div className="panel p-4 mb-3">
      <SectionHead title="Last rebalance"
        sub={`#${r.rebalance_id} · signal ${r.signal_date} · traded ${r.submitted_at?.slice(0, 10)} · ${r.status}`}
        right={
          <span className="text-[11px] flex gap-3">
            {slug && (
              <Link href={`/portfolios/${slug}/reports/rebalance/r${r.rebalance_id}`} className="teal font-semibold">
                post-rebalance report →
              </Link>
            )}
            <Link href={`/trading/paper/rebalance/${r.rebalance_id}`} className="teal font-semibold">
              trading desk view →
            </Link>
          </span>
        } />
      <Fidelity data={fid} />
      <Shortfall data={sf} rid={r.rebalance_id} />
    </div>
  );
}

function Fidelity({ data }: { data: PaperFidelity }) {
  const { coverage: c, execution: e, cost, plan_drift: pd } = data;
  const unfilled = c.n_planned - c.n_dust_filtered - c.n_filled_names;
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
        FIDELITY · did we build the book we approved?
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Target names" value={num(c.n_target)} sub="frozen book" />
        <Stat label="Orders filled" value={num(c.n_filled_names)}
          sub={unfilled > 0 ? `${unfilled} not filled` : 'every order sent'}
          color={unfilled > 0 ? 'var(--neg)' : undefined} />
        <Stat label="Dust-filtered" value={num(c.n_dust_filtered)} sub="below min trade" />
        <Stat label="Traded" value={usd(e.filled_notional)} sub={`${e.n_fills} fills`} />
        <Stat label="Execution" value={bps(cost.exec_bps)} sub="vs arrival mid" />
        <Stat label="Commission" value={bps(cost.commission_bps)} sub={usd(cost.commission_usd)} />
      </div>

      {/* The T7 line. Realized and predicted sit side by side or the comparison is not made. */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
          REALIZED COST vs THE MODEL · [06-T7]
        </div>
        <div className="flex gap-6 flex-wrap items-baseline">
          <Stat label="Realized" value={bps(cost.realized_bps)} sub="execution + commission" />
          <Stat label="Model predicted" value={bps(cost.model_predicted_bps)}
            sub={cost.model_predicted_bps == null ? 'unavailable' : 'per traded dollar'} />
          <Stat label="Residual" value={bps(cost.residual_bps)}
            color={(cost.residual_bps ?? 0) < 0 ? 'var(--pos)' : 'var(--neg)'}
            sub={cost.residual_bps == null ? 'unavailable'
                 : (cost.residual_bps < 0 ? 'model over-predicted' : 'model under-predicted')} />
          <Stat label="Delay" value={bps(cost.delay_bps)} sub="reported, not charged" />
        </div>
        <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
          Measured from the <b>arrival mid</b> (the mid at submission), not the decision price the
          share count was sized on. <b>Delay is reported separately and not charged here</b>: not
          trading instantly is a real implementation cost, but it is not the cost model&apos;s quantity.
          ⚠ This calibrates <b>{cost.calibrates}</b> — the paper simulator crosses the spread and does
          nothing else, so a conservative residual here is not evidence the impact model is wrong.
        </div>
        {cost.prediction_source && cost.prediction_source !== 'plan' && (
          <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-mut)' }}>
            ⓘ This prediction was <b>computed after the trade</b>
            {cost.prediction_source === 'mixed' && ' for part of the book'} — the plan was frozen
            before the planner recorded one. Priced from the cost panel dated <b>{cost.prediction_panel_date}</b>
            {cost.prediction_panel_lag_days != null && `, ${cost.prediction_panel_lag_days} days before the trade`}.
          </div>
        )}
        <div className="text-[10.5px] mt-1" style={{ color: 'var(--tx-dim)' }}>ⓘ {data.impact_note}</div>
      </div>

      <div className="mt-3 pt-3 text-[10.5px]" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--tx-dim)' }}>
        <b>Plan drift</b> — preview {usd(pd.preview_notional)} → final {usd(pd.final_notional)}. {pd.note}
      </div>
    </div>
  );
}

function Shortfall({ data, rid }: { data?: PaperShortfall; rid: number }) {
  if (!data) return null;
  const w = data.window;
  if (!w) {
    const lc = data.latest_computed;
    return (
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--tx-dim)' }}>
          IMPLEMENTATION SHORTFALL · rebalance #{rid}
        </div>
        <Muted>
          {data.note}
          {lc && (
            <> The only window computed so far is rebalance #{lc.rebalance_id} ({lc.window_start}
              {lc.is_establishment ? ', the establishment trade' : ''}{lc.is_open ? ', still open' : ''}),
              which is a different trade and is not shown here as if it were this one.</>
          )}
        </Muted>
      </div>
    );
  }
  const chain = data.chain ?? [];
  const maxAbs = Math.max(1e-9, ...chain.map((c) => Math.abs(c.bps ?? 0)));
  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
      <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
        IMPLEMENTATION SHORTFALL · what the trade cost against the book we intended
      </div>
      {(w.is_establishment || w.is_open || w.window_days === 0) && (
        <div className="mb-2 p-2.5 rounded text-[11px]" style={{ background: 'rgba(180,83,9,0.10)', color: 'var(--tx)' }}>
          {w.is_establishment && <><b>This is the establishment trade, not a monthly shortfall.</b> The account started flat, so the whole book was built in one go. </>}
          {w.window_days === 0 && 'The window spans zero days — the cost of building the book, not of running it. '}
          {w.is_open && 'The window is still OPEN and will be restated when the next rebalance closes it. '}
        </div>
      )}
      <div className="flex gap-6 flex-wrap mb-1">
        <Stat label="Total" value={bps(w.total_bps)} sub={usd(w.total_usd)} color={(w.total_bps ?? 0) > 0 ? 'var(--neg)' : 'var(--pos)'} />
        <Stat label="Window" value={w.window_days === 0 ? 'trade date' : `${w.window_days}d`} sub={`${w.window_start} → ${w.window_end}`} />
        <Stat label="Names" value={String(w.n_names)} sub={w.n_unfilled ? `${w.n_unfilled} unfilled` : 'all filled'} />
        <Stat label="On AUM" value={usd(w.aum)} sub={w.method ?? undefined} />
      </div>
      <div className="mt-2">
        {chain.map((c) => {
          const v = c.bps ?? 0;
          return (
            <div key={c.term} className="flex items-center gap-2 py-1" style={{ borderTop: '1px solid var(--border-soft)' }}>
              <div className="w-[86px] text-[11.5px] font-semibold" style={{ color: 'var(--tx)' }}>{c.term}</div>
              <div className="flex-1 h-[9px] rounded-sm" style={{ background: 'var(--panel2)' }}>
                <div className="h-full rounded-sm" style={{ width: `${(Math.abs(v) / maxAbs) * 100}%`, background: v > 0 ? 'var(--neg)' : 'var(--pos)' }} />
              </div>
              <div className="w-[62px] text-right text-[11.5px] tabular-nums font-semibold" style={{ color: v > 0 ? 'var(--neg)' : 'var(--pos)' }}>{bps(v)}</div>
              <div className="w-[230px] text-[10px]" style={{ color: 'var(--tx-dim)' }}>{c.step}</div>
            </div>
          );
        })}
      </div>
      <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
        Delay is the market moving between decision and arrival — counted here, excluded from the cost
        calibration above. The terms sum to the total by construction: <b>the total is the robust number,
        the split is interpretive</b>. This is also the Track B vs Track C comparison (live target vs what
        the broker holds) — one measurement, not two.
      </div>
      {!!data.names?.length && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--tx-dim)' }}>
              {['Name', 'Engine', 'Delay', 'Fill', 'Total'].map((h, i) => (
                <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1" style={{ textAlign: i < 2 ? 'left' : 'right' }}>{h.toUpperCase()}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.names.map((n) => (
                <tr key={n.ticker} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td className="py-1 font-semibold" style={{ color: 'var(--tx)' }}>{n.ticker}</td>
                  <td style={{ color: 'var(--tx-dim)' }}>{n.mandate}</td>
                  <td className="text-right tabular-nums">{usd(n.delay_usd)}</td>
                  <td className="text-right tabular-nums">{usd(n.fill_usd)}</td>
                  <td className="text-right tabular-nums font-semibold" style={{ color: (n.total_usd ?? 0) > 0 ? 'var(--neg)' : 'var(--pos)' }}>{usd(n.total_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- integrity ---- */
function IntegrityBand({ rc, ca, eng, sf, fid }: {
  rc?: PaperRecon; ca?: PaperCorporateActions; eng?: PaperEngines; sf?: PaperShortfall; fid?: PaperFidelity;
}) {
  return (
    <div className="panel p-4 mb-3">
      <SectionHead title="Integrity" sub="what could make a number above wrong — read from the tables that hold it" />
      <div className="grid xl:grid-cols-2 gap-6">
        <Recon rc={rc} />
        <CorporateActions ca={ca} />
      </div>
      <Unavailable eng={eng} sf={sf} fid={fid} rc={rc} ca={ca} />
    </div>
  );
}

function Recon({ rc }: { rc?: PaperRecon }) {
  const [showAll, setShowAll] = useState(false);
  if (!rc) return null;
  const latest = rc.dates[0];
  const rows = rc.breaks.filter((b) => showAll || (b.date === latest?.date && !b.resolved));
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
        RECONCILIATION · [10-P4] · last {rc.dates.length} book dates
      </div>
      {/* The strip: one cell per date, tied or not, with the composition. */}
      <div className="flex gap-1 flex-wrap mb-2">
        {[...rc.dates].reverse().map((d) => (
          <div key={d.date} title={`${d.date}: ${Object.entries(d.by_kind).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'clean'}`}
            className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={d.tied_out
              ? { background: 'rgba(21,128,61,0.12)', color: 'var(--pos)' }
              : (d.by_kind.cash || d.by_kind.position || d.by_kind.fill)
              ? { background: 'rgba(185,28,28,0.14)', color: 'var(--neg)', fontWeight: 700 }
              : { background: 'rgba(180,83,9,0.12)', color: '#b45309' }}>
            {d.date.slice(5)} · {d.unresolved}
          </div>
        ))}
      </div>
      <div className="text-[10px] mb-2" style={{ color: 'var(--tx-dim)' }}>
        green = tied out · amber = price breaks only (thin-name marks, expected noise) · red = a cash,
        position or fill break. Count = unresolved breaks that day.
      </div>
      {rows.length ? (
        <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
          <table className="w-full text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--tx-dim)' }}>
              {['Date', 'Kind', 'Name', 'Diff', 'Note'].map((h, i) => (
                <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1" style={{ textAlign: i === 3 ? 'right' : 'left' }}>{h.toUpperCase()}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} style={{ borderTop: '1px solid var(--border-soft)', opacity: b.resolved ? 0.55 : 1 }}>
                  <td className="py-1 font-mono whitespace-nowrap" style={{ color: 'var(--tx-dim)' }}>{b.date.slice(5)}</td>
                  <td className="font-semibold" style={{ color: b.kind === 'price' ? 'var(--tx-mut)' : 'var(--neg)' }}>{b.kind}{b.resolved ? ' ✓' : ''}</td>
                  <td className="font-semibold" style={{ color: 'var(--tx)' }}>{b.ticker ?? '—'}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{b.diff == null ? '—' : b.diff.toFixed(2)}</td>
                  <td style={{ color: 'var(--tx-mut)' }}>{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Muted>no unresolved breaks on {latest?.date ?? 'the latest book'}.</Muted>}
      <button onClick={() => setShowAll((v) => !v)} className="text-[10.5px] teal font-semibold mt-2">
        {showAll ? 'show only the latest unresolved' : `show all ${rc.n_breaks} breaks in the window (incl. resolved)`}
      </button>
      <div className="text-[10px] mt-1" style={{ color: 'var(--tx-dim)' }}>{rc.note}</div>
    </div>
  );
}

function CorporateActions({ ca }: { ca?: PaperCorporateActions }) {
  const [showDivs, setShowDivs] = useState(false);
  if (!ca) return null;
  const f = ca.feed;
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
        CORPORATE ACTIONS · [10-CAREP] · names held {ca.window?.start} → {ca.window?.end}
      </div>
      <div className="text-[10.5px] mb-2" style={{ color: f?.stale ? 'var(--neg)' : 'var(--tx-mut)' }}>
        Feed: {f?.latest ? `latest effective date ${f.latest} (${f.age_days} days ago)` : 'EMPTY'}
        {f?.stale && ' — STALE: an empty list below means "not looking", not "nothing happened"'}.
      </div>
      {ca.actions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--tx-dim)' }}>
              {['Date', 'Name', 'Side', 'Action', 'Value', 'Contra'].map((h) => (
                <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1 text-left">{h.toUpperCase()}</th>
              ))}
            </tr></thead>
            <tbody>
              {ca.actions.map((a, i) => (
                <tr key={`${a.isin}-${a.action}-${a.date}-${i}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td className="py-1 font-mono whitespace-nowrap" style={{ color: 'var(--tx-dim)' }}>{a.date}</td>
                  <td className="font-semibold" style={{ color: 'var(--tx)' }}>{a.ticker ?? a.isin}</td>
                  <td style={{ color: a.side === 'short' ? '#b45309' : 'var(--tx-dim)' }}>{a.side ?? '—'}</td>
                  <td className="font-semibold" style={{ color: 'var(--neg)' }}>{a.action}</td>
                  <td className="tabular-nums">{a.value == null ? '—' : a.value}</td>
                  <td style={{ color: 'var(--tx-mut)' }}>{a.contraticker ? `${a.contraticker}${a.contraname ? ` · ${a.contraname}` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Muted>no split, merger, spin-off, delisting or ticker change on a held name in the window{f?.stale ? ' (feed stale — see above)' : ''}.</Muted>}
      <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-mut)' }}>
        <b>{ca.n_dividends}</b> dividend{ca.n_dividends === 1 ? '' : 's'} on held names in the window
        {ca.n_dividends > 0 && (
          <button onClick={() => setShowDivs((v) => !v)} className="ml-2 teal font-semibold">{showDivs ? 'hide' : 'list'}</button>
        )}
      </div>
      {showDivs && (
        <div className="overflow-x-auto max-h-[220px] overflow-y-auto mt-1">
          <table className="w-full text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {ca.dividends.map((a, i) => (
                <tr key={`${a.isin}-${a.date}-${i}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td className="py-0.5 font-mono" style={{ color: 'var(--tx-dim)' }}>{a.date}</td>
                  <td className="font-semibold" style={{ color: 'var(--tx)' }}>{a.ticker ?? a.isin}</td>
                  <td style={{ color: a.side === 'short' ? '#b45309' : 'var(--tx-dim)' }}>{a.side === 'short' ? 'short · PAID' : 'long · received'}</td>
                  <td className="tabular-nums text-right">{a.value == null ? '—' : `$${a.value}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10px] mt-2" style={{ color: 'var(--tx-dim)' }}>{ca.note}</div>
    </div>
  );
}

/* ------------------------------------------------------- not buildable yet (data-driven) ---- */
function Unavailable({ eng, sf, fid, rc, ca }: {
  eng?: PaperEngines; sf?: PaperShortfall; fid?: PaperFidelity; rc?: PaperRecon; ca?: PaperCorporateActions;
}) {
  // Every row here is a CONDITION on a payload, never a sentence someone has to remember to
  // delete. The one standing row is a genuinely open build, stated precisely.
  const rows: string[][] = [];
  if (eng && !eng.window) rows.push(['Core vs sleeve over the period', '[08-PTRK]', eng.note ?? 'no attribution for this window']);
  if (fid?.rebalance && sf && !sf.window) {
    rows.push(['Implementation shortfall for the last rebalance', '[10-SHFL]',
      `no window computed yet for rebalance #${fid.rebalance.rebalance_id}`]);
  }
  if (rc && !rc.dates.length) rows.push(['Reconciliation breaks', '[10-P4]', 'no reconciled book dates yet']);
  if (ca && !ca.feed) rows.push(['Corporate actions', '[10-CAREP]', 'the actions feed is empty']);
  rows.push(['Dividend and split netting in the cash check', '[10-CAACC]',
    'partial: a cash break NAMES the expected dividend but does not yet subtract it, so dividend days read as cash breaks until a human clears them; splits still surface as unexplained quantity. Unblocked since 2026-08-25 (paper processes corporate actions — 30 dividends reconciled to the cent).']);
  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
      <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--tx-dim)' }}>
        NOT YET AVAILABLE · listed rather than omitted, driven by the data
      </div>
      {rows.map(([what, owner, why]) => (
        <div key={what} className="py-1.5 text-[11.5px]" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <span style={{ color: 'var(--tx)' }}>{what}</span>
          <span className="ml-2 font-mono text-[10.5px]" style={{ color: 'var(--teal)' }}>{owner}</span>
          <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>{why}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- primitives ---- */
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[1.2px]" style={{ color: 'var(--tx-dim)' }}>{label.toUpperCase()}</div>
      <div className="text-[17px] font-bold tabular-nums" style={{ color: color ?? 'var(--tx)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--tx-dim)' }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4 mb-3">
      <h2 className="text-base font-bold tracking-tight mb-2" style={{ color: 'var(--tx)' }}>{title}</h2>
      {children}
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11.5px]" style={{ color: 'var(--tx-mut)' }}>{children}</div>
);
