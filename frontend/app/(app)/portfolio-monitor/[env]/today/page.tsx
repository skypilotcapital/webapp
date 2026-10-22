'use client';

// Portfolio › Today ([08-TODAY]; design `08_website_and_tooling/today_page.md`). The book during the
// trading day: P&L so far, core vs sleeve, movers, exposure now vs the frozen live target, and on a
// trade day the orders as they were recorded.
//
// * ONE NUMBER PER DAY. The API's `phase` picks the headline — the latest poll while the market is
//   open or the official book has not been built yet, the official day (book_daily) once it has. The
//   page never shows both as headlines; the polls stay as the intraday path under an official day.
// * NO FLAGS (Portfolio Monitor rule). Nothing is coloured by sign or size; states are words.
// * EVERY BLOCK PRINTS THE TIME OF ITS DATA. Paper marks are delayed, and the broker re-marks its
//   cached position list every few minutes, so a poll's numbers are older than the poll.

import { use } from 'react';
import useSWR from 'swr';
import {
  clock, dayLabel, fetchToday, fetchTodayOrders, pct, pctSigned, shares, usd, usdSigned,
  type TodayData, type TodayMover, type TodayPhase,
} from '@/lib/portfolioMonitor';

const PHASE_LABEL: Record<TodayPhase, string> = {
  open: 'Today so far',
  closed_preliminary: 'Today, preliminary',
  closed_official: 'Today, official (closed)',
  preopen: 'Last trading day, official (closed)',
};

function phaseNote(d: TodayData): string {
  const h = d.headline;
  switch (d.phase) {
    case 'open':
      return `Market open. Numbers are the broker's marks at the latest poll, ${clock(h.as_of)} — `
        + 'paper account marks are delayed 15–20 minutes and re-marked every few minutes. '
        + 'The page refreshes every minute; the account is read every 15 minutes.';
    case 'closed_preliminary':
      return `Market closed. This is the last poll of the day (${clock(h.as_of)}), at broker marks. `
        + 'The official day replaces it when the daily book is built, about 02:00 UTC.';
    case 'closed_official':
      return `Official day from the daily book (our closing prices), built ${clock(h.built_at)}. `
        + 'The same number as the Paper Account page and the daily report. The line below is the intraday path.';
    case 'preopen':
    default:
      return 'No poll yet today — before the open, a weekend, or a market holiday. '
        + `Showing the last official day, ${dayLabel(h.date)}.`;
  }
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-[150px]">
      <div className="text-[11px] uppercase tracking-wide text-[var(--tx-dim)]">{label}</div>
      <div className="text-xl font-bold text-[var(--tx)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[var(--tx-mut)] mt-0.5">{sub}</div>}
    </div>
  );
}

/** Intraday path: the book's P&L % and the index move %, one point per poll. Neutral strokes only. */
function PathChart({ series }: { series: TodayData['series'] }) {
  const pts = series.filter((s) => s.pnl_pct != null);
  if (pts.length < 2) {
    return <div className="text-xs text-[var(--tx-dim)] mt-3">
      {pts.length ? 'One poll so far — the line starts at the second.' : 'No intraday polls for this day.'}
    </div>;
  }
  const W = 720, H = 160, L = 48, R = 12, T = 10, B = 22;
  const t0 = new Date(pts[0].ts).getTime(), t1 = new Date(pts[pts.length - 1].ts).getTime();
  const vals = pts.flatMap((p) => [p.pnl_pct ?? 0, p.index_move ?? p.pnl_pct ?? 0, 0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-4) { hi += 5e-4; lo -= 5e-4; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (ts: string) => L + ((new Date(ts).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (k: 'pnl_pct' | 'index_move') => pts.filter((p) => p[k] != null)
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p[k] as number).toFixed(1)}`).join(' ');
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[760px]" role="img"
        aria-label="Intraday P&L percent and index move percent">
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border-soft)" />
        {ticks.map((v) => (
          <text key={v} x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--tx-dim)">
            {pctSigned(v, 2)}
          </text>
        ))}
        <path d={path('index_move')} fill="none" stroke="var(--tx-dim)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path('pnl_pct')} fill="none" stroke="var(--tx)" strokeWidth="2" />
        <text x={L} y={H - 6} fontSize="10" fill="var(--tx-dim)">{clock(pts[0].ts)}</text>
        <text x={W - R} y={H - 6} fontSize="10" fill="var(--tx-dim)" textAnchor="end">
          {clock(pts[pts.length - 1].ts)}
        </text>
      </svg>
      <div className="text-[11px] text-[var(--tx-mut)]">
        Solid: the book&apos;s P&amp;L, % of yesterday&apos;s NAV. Dashed: SPY&apos;s move (price). One point per poll.
      </div>
    </div>
  );
}

function MandateBand({ d }: { d: TodayData }) {
  const m = d.mandates;
  if (!m.available) return <div className="text-sm text-[var(--tx-mut)]">{m.note}</div>;
  const rows: [string, number | null | undefined, string][] = [
    ['Core', m.core, 'long-only S&P 500 book'],
    ['Sleeve — long leg', m.sleeve_long, 'Russell 2500 longs'],
    ['Sleeve — short leg', m.sleeve_short, 'Russell 2500 shorts'],
    ['Unattributed', m.unattributed, 'names no mandate claims — shown, never re-allocated'],
    ['Cash and other', m.other,
      m.n_uncaptured ? `interest, commissions, and ${m.n_uncaptured} name(s) whose fills are not captured yet`
        : 'interest, commissions'],
  ];
  return (
    <>
      <table className="dtable mt-2">
        <thead><tr><th style={{ textAlign: 'left' }}>Engine</th><th>P&amp;L</th><th>% of NAV</th>
          <th style={{ textAlign: 'left' }}>What it is</th></tr></thead>
        <tbody>
          {rows.map(([k, v, why]) => (
            <tr key={k}>
              <td style={{ textAlign: 'left', fontFamily: 'inherit' }}>{k}</td>
              <td>{usdSigned(v)}</td>
              <td>{d.headline.nav && v != null ? pctSigned(v / (d.headline.nav - (d.headline.pnl ?? 0)), 3) : '—'}</td>
              <td style={{ textAlign: 'left', fontFamily: 'inherit' }} className="text-[var(--tx-mut)]">{why}</td>
            </tr>
          ))}
          <tr>
            <td style={{ textAlign: 'left', fontFamily: 'inherit' }}><b>Total</b></td>
            <td><b>{usdSigned(d.headline.pnl)}</b></td>
            <td><b>{pctSigned(d.headline.pnl_pct, 3)}</b></td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="text-[11px] text-[var(--tx-mut)] mt-1">
        {m.source === 'poll'
          ? `Each name's P&L split by the mandates' claims on ${dayLabel(m.shares_from)} (the ledger). As of ${clock(m.as_of)}.`
          : `From the official mandate split for ${dayLabel(m.as_of)}.`}
      </div>
    </>
  );
}

function MoverTable({ title, rows }: { title: string; rows: TodayMover[] }) {
  return (
    <div className="min-w-[320px] flex-1">
      <div className="text-xs font-bold text-[var(--tx)] mb-1">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-[var(--tx-dim)]">none</div> : (
        <table className="dtable">
          <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th>Move</th><th>Weight</th><th>P&amp;L</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.conid}>
                <td style={{ textAlign: 'left', fontFamily: 'inherit' }}><b>{r.ticker ?? r.conid}</b></td>
                <td>{pctSigned(r.move)}</td>
                <td>{pct(r.weight)}</td>
                <td>{usdSigned(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExposureBand({ d }: { d: TodayData }) {
  const e = d.exposure, t = e.target;
  const row = (k: string, now: React.ReactNode, tgt: React.ReactNode) => (
    <tr key={k}><td style={{ textAlign: 'left', fontFamily: 'inherit' }}>{k}</td><td>{now}</td><td>{tgt}</td></tr>
  );
  return (
    <>
      <table className="dtable mt-2">
        <thead><tr><th style={{ textAlign: 'left' }} /><th>Now</th>
          <th>Target{t ? ` (rebalance ${t.rebalance_id})` : ''}</th></tr></thead>
        <tbody>
          {row('Gross (% of NAV)', pct(e.now.gross, 1), pct(t?.gross, 1))}
          {row('Net (% of NAV)', pct(e.now.net, 1), pct(t?.net, 1))}
          {row('Long names', e.now.n_long ?? '—', t?.n_long ?? '—')}
          {row('Short names', e.now.n_short ?? '—', t?.n_short ?? '—')}
        </tbody>
      </table>
      <div className="text-[11px] text-[var(--tx-mut)] mt-1">
        Target = the frozen live book of the rebalance governing the held positions (the ledger&apos;s record), never the
        research book. {e.trading_rebalance_id ? `Rebalance ${e.trading_rebalance_id} is trading today. ` : ''}
        Now: {d.headline.source === 'poll' ? clock(e.as_of) : dayLabel(e.as_of)}.
      </div>
    </>
  );
}

function OrdersBand({ env, date }: { env: string; date: string }) {
  const { data } = useSWR(['pm-today-orders', env, date], () => fetchTodayOrders(env, date),
    { refreshInterval: 60_000, revalidateOnFocus: false });
  if (!data) return <div className="text-xs text-[var(--tx-dim)]">Loading orders…</div>;
  return (
    <>
      <div className="flex flex-wrap gap-x-6 text-xs text-[var(--tx-mut)]">
        <span>Orders <b className="text-[var(--tx)]">{data.n_orders}</b></span>
        <span>Filled <b className="text-[var(--tx)]">{data.n_filled}</b></span>
        <span>Working <b className="text-[var(--tx)]">{data.working.length}</b></span>
        <span>Cancelled by the broker <b className="text-[var(--tx)]">{data.cancelled.length}</b></span>
        <span>Fills recorded <b className="text-[var(--tx)]">{data.fills.length}</b></span>
        <span>Order status as of <b className="text-[var(--tx)]">{clock(data.as_of)}</b></span>
      </div>
      {[['Working', data.working], ['Cancelled', data.cancelled]].map(([title, rows]) =>
        (rows as typeof data.working).length ? (
          <div key={title as string} className="mt-2">
            <div className="text-xs font-bold text-[var(--tx)] mb-1">{title as string}</div>
            <table className="dtable">
              <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th>Side</th><th>Shares</th><th>Filled</th>
                <th style={{ textAlign: 'left' }}>Last broker message</th></tr></thead>
              <tbody>
                {(rows as typeof data.working).map((o) => (
                  <tr key={o.internal_order_id}>
                    <td style={{ textAlign: 'left', fontFamily: 'inherit' }}><b>{o.ticker ?? o.conid}</b></td>
                    <td>{o.side}</td><td>{shares(o.qty)}</td><td>{shares(o.filled_qty)}</td>
                    <td style={{ textAlign: 'left', fontFamily: 'inherit' }} className="text-[var(--tx-mut)]">{o.last_event ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null)}
      <div className="text-[11px] text-[var(--tx-mut)] mt-1">
        From the executor&apos;s and the fill-capture jobs&apos; records. The website never asks the broker, so an
        order&apos;s status is only as fresh as the last capture.
      </div>
    </>
  );
}

export default function TodayPage({ params }: { params: Promise<{ env: string }> }) {
  const { env } = use(params);
  const { data, error } = useSWR(['pm-today', env], () => fetchToday(env), {
    revalidateOnFocus: false,
    refreshInterval: (d?: TodayData) => (d?.phase === 'open' ? 60_000 : 0),
  });

  if (error) return <div className="text-sm text-[var(--tx-mut)]">Could not load today: {String(error)}</div>;
  if (!data) return <div className="text-sm text-[var(--tx-dim)]">Loading today…</div>;
  if (!data.phase) return <div className="text-sm text-[var(--tx-mut)]">{data.note}</div>;

  const h = data.headline, s = data.status;
  return (
    <div className="space-y-4">
      <div className="border-b border-[var(--border-soft)] pb-4">
        <h1 className="text-2xl font-bold text-[var(--tx)] tracking-tight">Today</h1>
        <p className="text-sm text-[var(--tx-dim)] mt-1">{phaseNote(data)}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--tx-mut)] mt-3">
          <span>Gateway session at the last poll <b className="text-[var(--tx)]">
            {s.session_up_at_last_poll == null ? '—' : s.session_up_at_last_poll ? 'up' : 'down'}</b></span>
          <span>Last poll <b className="text-[var(--tx)]">{clock(s.last_poll_ts)} · {s.last_poll_status ?? '—'}</b></span>
          <span>Last successful poll <b className="text-[var(--tx)]">{clock(s.last_ok_poll_ts)}</b></span>
          <span>Last official snapshot <b className="text-[var(--tx)]">{s.last_official_snapshot_ts?.slice(0, 10) ?? '—'} {clock(s.last_official_snapshot_ts)}</b></span>
          <span>Last official book <b className="text-[var(--tx)]">{dayLabel(s.last_official_book_date)}</b></span>
        </div>
        {s.last_poll_status && s.last_poll_status !== 'ok' && (
          <div className="text-xs mt-1.5 text-[var(--tx)]">Last poll: {s.last_poll_detail}</div>
        )}
      </div>

      <section className="panel p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">{PHASE_LABEL[data.phase]}</h2>
          <span className="text-xs text-[var(--tx-mut)]">
            {dayLabel(h.date)} · measured from {dayLabel(h.prev_date)}
            {h.source === 'poll' ? ` · as of ${clock(h.as_of)}` : ` · snapshot ${clock(h.as_of)}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-3">
          <Stat label="NAV" value={usd(h.nav)} />
          <Stat label="P&L" value={usdSigned(h.pnl)} sub={pctSigned(h.pnl_pct, 3) + ' of the starting NAV'} />
          <Stat label={h.index.name} value={pctSigned(h.index.move)}
            sub={h.index.as_of ? (h.source === 'poll' ? `quote ${clock(h.index.as_of)}` : dayLabel(h.index.as_of)) : undefined} />
          {h.source === 'poll' && (
            <Stat label="Broker's figure" value={usdSigned(h.pnl_broker)}
              sub={`NLV change since the ${clock(h.broker_prev_ts)} snapshot — a check, not blended`} />
          )}
        </div>
        {h.source === 'poll' && h.n_names != null && h.n_moved != null && h.n_moved < 0.05 * h.n_names && (
          <div className="text-xs mt-2 text-[var(--tx)]">
            Only {h.n_moved} of {h.n_names} prices have moved since yesterday&apos;s close — the market may be shut today.
          </div>
        )}
        <PathChart series={data.series} />
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Core vs sleeve</h2>
        <MandateBand d={data} />
      </section>

      <section className="panel p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Biggest movers</h2>
          <span className="text-xs text-[var(--tx-mut)]">
            by dollar contribution · {h.source === 'poll' ? clock(data.movers.as_of) : dayLabel(h.date)}
            {data.mandates.n_uncaptured ? ` · ${data.mandates.n_uncaptured} name(s) with uncaptured fills left out` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-6 mt-2">
          <MoverTable title="Contributors" rows={data.movers.top} />
          <MoverTable title="Detractors" rows={data.movers.bottom} />
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Exposure now</h2>
        <ExposureBand d={data} />
      </section>

      {data.trade_day && data.date && (
        <section className="panel p-4">
          <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Rebalance today</h2>
          <OrdersBand env={env} date={data.date} />
        </section>
      )}
    </div>
  );
}
