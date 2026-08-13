'use client';

// The IBKR paper track ([08-PTRK] Phase A).
//
// Design: `08_website_and_tooling/website_research_hub_IA.md` §IX–§XV.
//
// THIS IS NOT A COPY OF `BacktestReport`, and the difference is the whole reason the page exists:
//
//   the modeled report answers "is the strategy any good?" — 258 months, IR, drawdown, factor
//   attribution; a statistical claim.
//   this answers "are we running the strategy we said we'd run, and what is it doing?" — a real
//   account roughly a week old, where NO statistical claim is available. Its job is FIDELITY and
//   DECOMPOSITION, not track record.
//
// Two rules follow from that and are enforced here rather than left to editorial care:
//
//  1. **Ratio statistics are not rendered below the API's observation threshold.** The API returns
//     `stats_suppressed` and the reason; this component prints the reason where the number would
//     have been. It never computes its own IR from the series to fill the gap.
//  2. **A section that cannot be built yet says so, and names its owner.** An absent section is
//     indistinguishable from a section with nothing to report — which is how a silent degradation
//     survives for weeks (F-006 → F-008). Same convention the reports use.

import useSWR from 'swr';
import Link from 'next/link';
import {
  fetchPaperBook, fetchPaperNav, fetchPaperFidelity, fetchPaperPositions, fetchPaperShortfall,
  type PaperPosition,
} from '@/lib/paper';
import { CumulativeChart, HBarChart } from '@/components/portfolio/charts';
import { BookRisk } from '@/components/portfolio/BookRisk';

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(d)}%`;
const usd = (v: number | null | undefined) =>
  v == null ? '—' : `$${Math.round(v).toLocaleString()}`;
const bps = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : `${v.toFixed(d)} bp`;
const num = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString();

export function PaperTrack({ strategy, topSlot }: { strategy?: string; topSlot?: React.ReactNode }) {
  const { data: bk } = useSWR(['paper-book', strategy], () => fetchPaperBook('paper', strategy),
    { revalidateOnFocus: false });
  const { data: nav } = useSWR(['paper-nav', strategy], () => fetchPaperNav('paper', strategy),
    { revalidateOnFocus: false });
  const { data: fid } = useSWR(['paper-fid'], () => fetchPaperFidelity('paper'),
    { revalidateOnFocus: false });
  const { data: pos } = useSWR(['paper-pos'], () => fetchPaperPositions('paper', 10),
    { revalidateOnFocus: false });
  const { data: sf } = useSWR(['paper-sf'], () => fetchPaperShortfall('paper', 8),
    { revalidateOnFocus: false });

  return (
    <div className="animate-in">
      {topSlot}

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

      <BookBand data={bk} />
      <Fidelity data={fid} />
      {/* Beside Fidelity on purpose: "did we build the book we approved?" and "what is that book
          betting on NOW?" are the two halves of one question, and only the second keeps moving
          after the rebalance closes. Its RISK row is the reserved slot for [10-LTE]. */}
      <BookRisk strategy={strategy} />
      <Performance nav={nav} />
      <ByEngine pos={pos} />
      <Contribution pos={pos} />
      <Shortfall data={sf} />
      <Unavailable hasSplit={!!pos?.mandate_split} hasShortfall={!!sf?.window} />
    </div>
  );
}

/* ------------------------------------------------------------------ the book band ---- */
function BookBand({ data }: { data: Awaited<ReturnType<typeof fetchPaperBook>> | undefined }) {
  if (!data) return <div className="panel p-8 text-center muted text-sm">Loading the book…</div>;
  const b = data.book;
  if (!b) {
    return (
      <div className="panel p-8 text-center text-sm" style={{ color: 'var(--tx-mut)' }}>
        No book has been built yet. The daily build marks date D at 02:00 UTC on D+1.
      </div>
    );
  }
  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>The Book</h2>
        <span className="text-[11px] font-mono" style={{ color: 'var(--tx-mut)' }}>
          {b.account_id} · {b.date}
        </span>
        {/* `[10-P4]`: no performance number is reported that has not tied out. The marker is the
            precondition made visible — we do not hide the numbers when it is false. */}
        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={b.tied_out
            ? { background: 'rgba(21,128,61,0.12)', color: 'var(--pos)' }
            : { background: 'rgba(185,28,28,0.12)', color: 'var(--neg)' }}>
          {b.tied_out ? '✓ tied to broker' : '✗ NOT tied out'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="NAV" value={usd(b.nav)} sub={`broker ${usd(b.broker_nlv)}`} />
        <Stat label="Day P&L" value={usd(b.pnl_d)}
          color={(b.pnl_d ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <Stat label="Gross" value={pct(b.gross_pct, 0)}
          sub={`${pct(b.gross_long_pct, 0)} L · ${pct(b.gross_short_pct, 0)} S`} />
        <Stat label="Net" value={pct(b.net_pct, 0)} sub="of NAV" />
        <Stat label="Names" value={num((b.n_long ?? 0) + (b.n_short ?? 0))}
          sub={`${b.n_long ?? 0}L / ${b.n_short ?? 0}S`} />
        <Stat label="Margin util" value={pct(b.margin_util, 0)} />
        <Stat label="Cash" value={usd(b.cash)} sub={`accrued ${usd(b.accrued_cash)}`} />
      </div>

      <div className="text-[10.5px] mt-3" style={{ color: 'var(--tx-dim)' }}>
        Marked on our own closes (quality <b>{b.mark_quality ?? '—'}</b>), not the broker's — the
        broker NLV beside NAV is the tie-out, not the source. Built {b.built_at?.slice(0, 16)?.replace('T', ' ')} UTC
        from the {b.snap_ts?.slice(11, 16)} UTC snapshot.
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- fidelity ---- */
function Fidelity({ data }: { data: Awaited<ReturnType<typeof fetchPaperFidelity>> | undefined }) {
  if (!data) return null;
  if (!data.rebalance) {
    return <Panel title="Fidelity"><Muted>{data.note ?? 'no rebalance has been executed yet'}</Muted></Panel>;
  }
  const { coverage: c, execution: e, cost, plan_drift: pd, rebalance: r } = data;
  const unfilled = c.n_planned - c.n_filled_names;
  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Fidelity</h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          did we build the book we approved?
        </span>
        <Link href={`/trading/paper/rebalance/${r.rebalance_id}`}
          className="ml-auto text-[11px] teal font-semibold">
          rebalance #{r.rebalance_id} · signal {r.signal_date} →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <Stat label="Target names" value={num(c.n_target)} sub="frozen book" />
        <Stat label="Filled" value={num(c.n_filled_names)}
          sub={unfilled > 0 ? `${unfilled} unfilled` : 'all names'}
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
        {/* The correction that matters most on this panel, stated rather than implied. */}
        <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
          Measured from the <b>arrival mid</b> (the mid at submission), not the decision price the
          share count was sized on. Measured the naive way this book reads ~20 bps against a ~20 bp
          prediction — an apparently perfect model that is mostly the overnight market. <b>Delay is
          reported separately and not charged here</b>: not trading instantly is a real
          implementation cost, but it is not the cost model's quantity. Full chain decomposition
          lives in the shortfall report → [10-SHFL].
        </div>
        <div className="text-[10.5px] mt-1" style={{ color: 'var(--neg)' }}>
          ⚠ This calibrates <b>{cost.calibrates}</b>. The paper simulator crosses the spread and
          does nothing else — there is no queue and no impact to measure, so a conservative residual
          here is not evidence the impact model is wrong.
        </div>
        {/* A prediction written at plan time and one computed afterwards are different claims. */}
        {cost.prediction_source && cost.prediction_source !== 'plan' && (
          <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-mut)' }}>
            ⓘ This prediction was <b>computed after the trade</b>
            {cost.prediction_source === 'mixed' && ' for part of the book'} — the plan was frozen
            before the planner recorded one. Priced from the cost panel dated{' '}
            <b>{cost.prediction_panel_date}</b>
            {cost.prediction_panel_lag_days != null && `, ${cost.prediction_panel_lag_days} days before the trade`}.
            Panel inputs are trailing windows, so this is a fair estimate of what the model would
            have said, not a record that it said it. Plans from here on carry the prediction written
            at plan time.
          </div>
        )}
        <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
          ⓘ {data.impact_note}
        </div>
      </div>

      <div className="mt-3 pt-3 text-[10.5px]" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--tx-dim)' }}>
        <b>Plan drift</b> — preview {usd(pd.preview_notional)} → final {usd(pd.final_notional)}.{' '}
        {pd.note}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ performance ---- */
function Performance({ nav }: { nav: Awaited<ReturnType<typeof fetchPaperNav>> | undefined }) {
  if (!nav) return null;
  if (!nav.series.length) return <Panel title="Return"><Muted>no book yet</Muted></Panel>;

  const dates = nav.series.map((p) => p.date);
  const last = nav.series[nav.series.length - 1];
  const benchLast = [...nav.series].reverse().find((p) => p.bench_idx != null)?.bench_idx ?? null;

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Return</h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          growth of 100 · net · vs S&amp;P 500 TR
        </span>
        {nav.incl_cash_days && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ background: 'var(--panel2)', color: 'var(--tx-dim)' }}>
            incl. cash days
          </span>
        )}
      </div>

      <div className="flex gap-6 flex-wrap mt-3 mb-2">
        <Stat label="Since inception" value={pct((last.nav_idx ?? 100) / 100 - 1, 2)}
          sub={`from ${nav.inception}`} />
        <Stat label="S&P 500 TR" value={benchLast == null ? '—' : pct(benchLast / 100 - 1, 2)}
          sub="same window" />
        <Stat label="Observations" value={String(nav.n_obs)} sub="trading days" />
      </div>

      <CumulativeChart
        dates={dates}
        series={[
          { label: 'Paper book', color: 'var(--teal)', values: nav.series.map((p) => p.nav_idx) },
          { label: 'S&P 500 TR', color: 'var(--tx-dim)', dash: true, values: nav.series.map((p) => p.bench_idx) },
        ]}
        height={220}
        boundaryDate={nav.first_invested ?? undefined}
      />

      {nav.stats_suppressed && (
        <div className="text-[10.5px] mt-2 p-2 rounded"
          style={{ background: 'var(--panel2)', color: 'var(--tx-mut)' }}>
          <b>No ratio statistics.</b> {nav.reason}. Sharpe, information ratio and drawdown
          statistics appear once the track is long enough to carry them — this page is a fidelity
          record first and a track record later.
        </div>
      )}
      {nav.first_invested && (
        <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
          The marker is the first invested day ({nav.first_invested}); days before it are the funded
          cash period. They are labelled, not restated away — holding cash through a benchmark rally
          is a real opportunity cost.
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- by engine ---- */
function ByEngine({ pos }: { pos: Awaited<ReturnType<typeof fetchPaperPositions>> | undefined }) {
  if (!pos) return null;
  const ms = pos.mandate_split;
  if (!ms) {
    return (
      <Panel title="By Engine — core vs sleeve">
        <Muted>{pos.mandate_split_note}</Muted>
      </Panel>
    );
  }
  const total = ms.by_mandate.reduce((a, m) => a + (m.contrib_bps ?? 0), 0);
  const anyFallback = ms.by_mandate.some((m) => m.n_fallback_rule > 0);
  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>By Engine</h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          the netted account, split back to its two mandates · {pos.date}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--tx-dim)' }}>
              {['Engine', 'Names', 'Net wt', 'Gross wt', 'Market value', 'Day P&L', 'Contribution'].map((h, i) => (
                <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1"
                  style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ms.by_mandate.map((m) => (
              <tr key={m.mandate} style={{ borderTop: '1px solid var(--border-soft)' }}>
                <td className="py-1.5 font-semibold" style={{ color: 'var(--tx)' }}>
                  {m.mandate}
                  {m.n_fallback_rule > 0 && (
                    <span className="ml-2 text-[9px] font-bold px-1.5 py-px rounded"
                      style={{ background: 'var(--panel2)', color: 'var(--tx-dim)' }}>
                      {m.n_fallback_rule} by fallback
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{m.n_names}</td>
                <td className="text-right tabular-nums">{pct(m.net_weight)}</td>
                <td className="text-right tabular-nums">{pct(m.gross_weight)}</td>
                <td className="text-right tabular-nums">{usd(m.mkt_value)}</td>
                <td className="text-right tabular-nums"
                  style={{ color: (m.pnl_d ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{usd(m.pnl_d)}</td>
                <td className="text-right tabular-nums font-semibold"
                  style={{ color: (m.contrib_bps ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {bps(m.contrib_bps)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td className="py-1.5 font-bold" style={{ color: 'var(--tx)' }}>total</td>
              <td colSpan={5} />
              <td className="text-right tabular-nums font-bold" style={{ color: 'var(--tx)' }}>
                {bps(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Reported, never absorbed — the ledger doc's rule, made visible. */}
      <div className="mt-3 pt-2 text-[10.5px]" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <span style={{ color: ms.residual.n_names ? 'var(--neg)' : 'var(--tx-dim)' }}>
          <b>Residual:</b>{' '}
          {ms.residual.n_names
            ? `${ms.residual.n_names} position(s), ${usd(ms.residual.mkt_value)} — held but not
               attributable to a mandate. Shown rather than absorbed into one.`
            : 'none — every position attributed.'}
        </span>
        <div className="mt-1" style={{ color: 'var(--tx-dim)' }}>{ms.basis}</div>
        {anyFallback && (
          <div className="mt-1" style={{ color: 'var(--tx-dim)' }}>
            A name marked <i>by fallback</i> was not in the governing target, so it was placed by
            prior book or universe membership rather than by intended weight — judgement, not
            arithmetic.
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- contribution ---- */
function Contribution({ pos }: { pos: Awaited<ReturnType<typeof fetchPaperPositions>> | undefined }) {
  if (!pos) return null;
  if (!pos.n_positions) {
    return (
      <Panel title="Contribution">
        <Muted>
          The marked book for {pos.date ?? 'the latest date'} holds no positions yet — the daily
          build marks date D at 02:00 UTC on D+1, so a book traded today appears tomorrow.
        </Muted>
      </Panel>
    );
  }
  const bar = (p: PaperPosition) => ({ label: p.ticker ?? String(p.conid), value: p.contrib_bps ?? 0 });
  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Contribution</h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          basis points of NAV · {pos.date} · {pos.n_positions} positions
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-6 mt-3">
        <div>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
            TOP CONTRIBUTORS
          </div>
          <HBarChart bars={pos.contributors.map(bar)} valFmt={(v) => v.toFixed(1)} diverging={false} />
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
            TOP DETRACTORS
          </div>
          <HBarChart bars={pos.detractors.map(bar)} valFmt={(v) => v.toFixed(1)} diverging={false} />
        </div>
      </div>
      <div className="text-[10.5px] mt-3" style={{ color: 'var(--tx-dim)' }}>
        Contribution is in basis points <b>of NAV</b>, not position return — a 40% move on a 0.1%
        position is noise, and showing it as a return invites the reader to deflate it by hand.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- shortfall ---- */
function Shortfall({ data }: { data: Awaited<ReturnType<typeof fetchPaperShortfall>> | undefined }) {
  if (!data) return null;
  const w = data.window;
  if (!w) return <Panel title="Implementation Shortfall"><Muted>{data.note}</Muted></Panel>;

  const maxAbs = Math.max(1e-9, ...data.chain.map((c) => Math.abs(c.bps ?? 0)));

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Implementation Shortfall
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          what the trade cost against the book we intended · rebalance #{w.rebalance_id}
        </span>
      </div>

      {/* The framing comes FIRST. This window is not a monthly shortfall and the number is not
          comparable to the ones that follow it; leading with 36 bps and qualifying underneath
          would invite exactly the reading the qualification exists to prevent. */}
      {(w.is_establishment || w.is_open || w.window_days === 0) && (
        <div className="mt-2 p-2.5 rounded text-[11px]"
          style={{ background: 'rgba(180,83,9,0.10)', color: 'var(--tx)' }}>
          <b>This is the establishment trade, not a monthly shortfall.</b>{' '}
          {w.is_establishment && 'The account started flat, so the whole book was built in one go — there was no turnover constraint and nothing to hold onto. '}
          {w.window_days === 0 && 'The window spans zero days (it opened and is measured on the trade date itself), so this is the cost of building the book, not of running it for a month. '}
          {w.is_open && 'The window is still OPEN and will be restated when the next rebalance closes it. '}
          It should be excluded from ongoing shortfall reporting rather than averaged in.
        </div>
      )}

      <div className="flex gap-6 flex-wrap mt-3 mb-1">
        <Stat label="Total" value={bps(w.total_bps)} sub={usd(w.total_usd)}
          color={(w.total_bps ?? 0) > 0 ? 'var(--neg)' : 'var(--pos)'} />
        <Stat label="Window" value={w.window_days === 0 ? 'trade date' : `${w.window_days}d`}
          sub={`${w.window_start} → ${w.window_end}`} />
        <Stat label="Names" value={String(w.n_names)}
          sub={w.n_unfilled ? `${w.n_unfilled} unfilled` : 'all filled'} />
        <Stat label="On AUM" value={usd(w.aum)} sub={w.method ?? undefined} />
      </div>

      {/* The chain. Five books each one effect apart, so the terms sum to the total by
          construction rather than by an attribution formula. */}
      <div className="mt-3">
        <div className="text-[10px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
          B0 → B4 CHAIN
        </div>
        {data.chain.map((c) => {
          const v = c.bps ?? 0;
          const pctW = (Math.abs(v) / maxAbs) * 100;
          return (
            <div key={c.term} className="flex items-center gap-2 py-1"
              style={{ borderTop: '1px solid var(--border-soft)' }}>
              <div className="w-[86px] text-[11.5px] font-semibold" style={{ color: 'var(--tx)' }}>
                {c.term}
              </div>
              <div className="flex-1 h-[9px] rounded-sm" style={{ background: 'var(--panel2)' }}>
                <div className="h-full rounded-sm"
                  style={{ width: `${pctW}%`, background: v > 0 ? 'var(--neg)' : 'var(--pos)' }} />
              </div>
              <div className="w-[62px] text-right text-[11.5px] tabular-nums font-semibold"
                style={{ color: v > 0 ? 'var(--neg)' : 'var(--pos)' }}>{bps(v)}</div>
              <div className="w-[230px] text-[10px]" style={{ color: 'var(--tx-dim)' }}>{c.step}</div>
            </div>
          );
        })}
      </div>

      <div className="text-[10.5px] mt-2" style={{ color: 'var(--tx-dim)' }}>
        <b>Delay is the largest term and it is the market, not execution quality</b> — the book moved
        between the price the share counts were sized on and the mid at submission. It is counted
        here because not trading instantly is a real cost, and deliberately excluded from the cost
        calibration above, because fitting an impact coefficient to market drift would fit direction.
        Same dollars, two questions. The terms sum to the total by construction, so{' '}
        <b>the total is the robust number and the split is interpretive</b>.
      </div>

      {!!data.names.length && (
        <div className="mt-3">
          <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color: 'var(--tx-dim)' }}>
            LARGEST CONTRIBUTORS
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: 'var(--tx-dim)' }}>
                {['Name', 'Engine', 'Delay', 'Fill', 'Total'].map((h, i) => (
                  <th key={h} className="text-[9px] font-bold tracking-[1.2px] py-1"
                    style={{ textAlign: i < 2 ? 'left' : 'right' }}>{h.toUpperCase()}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.names.map((n) => (
                  <tr key={n.ticker} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="py-1 font-semibold" style={{ color: 'var(--tx)' }}>{n.ticker}</td>
                    <td style={{ color: 'var(--tx-dim)' }}>{n.mandate}</td>
                    <td className="text-right tabular-nums">{usd(n.delay_usd)}</td>
                    <td className="text-right tabular-nums">{usd(n.fill_usd)}</td>
                    <td className="text-right tabular-nums font-semibold"
                      style={{ color: (n.total_usd ?? 0) > 0 ? 'var(--neg)' : 'var(--pos)' }}>
                      {usd(n.total_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[10.5px] mt-3 pt-2" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--tx-dim)' }}>
        This is also the <b>Track B vs Track C</b> comparison — the live target book against what the
        broker actually holds. They are one measurement, not two.{' '}
        {w.shape_source === 'reconstructed' && <>Book shape <b>reconstructed</b> rather than read from a stored snapshot. </>}
        A <b>series</b> begins once the September rebalance closes this window.
      </div>
    </div>
  );
}

/* ------------------------------------------------------- not buildable yet ---- */
function Unavailable({ hasSplit, hasShortfall }: { hasSplit: boolean; hasShortfall: boolean }) {
  // Named owners, not silence. A section that is absent looks identical to one with nothing to
  // report, and that ambiguity is how every silent degradation in this project survived.
  const rows = [
    ...(hasSplit ? [] : [['Core vs sleeve contribution', '[08-PTRK]',
      'no attribution snapshot for this date — it rides the daily book build, so a date whose book has not been built has none'] as string[]]),
    ...(hasShortfall ? [] : [['Implementation shortfall', '[10-SHFL]',
      'no window computed yet'] as string[]]),
    ['Reconciliation breaks', '[10-P4]',
      'the recon writer is unbuilt; the tie-out marker above comes from book_daily_status'],
    ['Corporate actions', '[10-CAREP] / [10-CAACC]',
      'an unaccounted dividend or split shows up as either a fake break or a fake return'],
  ];
  return (
    <div className="panel p-4 mb-3">
      <h2 className="text-base font-bold tracking-tight mb-1" style={{ color: 'var(--tx)' }}>
        Not yet available
      </h2>
      <div className="text-[11px] mb-3" style={{ color: 'var(--tx-mut)' }}>
        Listed rather than omitted: an absent section is indistinguishable from one with nothing to
        report.
      </div>
      {rows.map(([what, owner, why]) => (
        <div key={what} className="py-1.5 text-[11.5px]"
          style={{ borderTop: '1px solid var(--border-soft)' }}>
          <span style={{ color: 'var(--tx)' }}>{what}</span>
          <span className="ml-2 font-mono text-[10.5px]" style={{ color: 'var(--teal)' }}>{owner}</span>
          <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>{why}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- primitives ---- */
function Stat({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[1.2px]" style={{ color: 'var(--tx-dim)' }}>
        {label.toUpperCase()}
      </div>
      <div className="text-[17px] font-bold tabular-nums" style={{ color: color ?? 'var(--tx)' }}>
        {value}
      </div>
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
