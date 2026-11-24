'use client';

// Portfolio › Today ([08-TODAY]; design `08_website_and_tooling/today_page.md`). The book during the
// trading day: P&L so far, where it came from by engine, movers, exposure now vs the frozen live
// target, and on a trade day the orders as they were recorded.
//
// * ONE NUMBER PER DAY. The API's `phase` picks the headline — the latest poll while the market is
//   open or the official book has not been built yet, the official day (book_daily) once it has. The
//   page never shows both as headlines; the polls stay as the intraday path under an official day.
// * ACTUAL − S&P 500 = EXCESS ON EVERY ROW (owner, 2026-11-23). Every engine shows what it made, what
//   the index made on the same money, and the difference, in $ and in % of yesterday's NAV (2 decimals,
//   no basis points). "Excess vs S&P 500" is the one name for the difference. The core (LO) is split by
//   whether it holds the name; the sleeve (LS) has benchmark zero (its whole P&L is excess — the fund's
//   index exposure sits in the core; interest lands in "cash and other"). LO and LS are separate blocks.
// * COLOUR = MONEY MADE OR LOST, nothing else (owner, 2026-11-23). P&L, return and excess return are
//   green / red text by sign (`signColor`). NAV, the index's own move, every stock's price move and
//   every weight stay plain: a short's rising price is a loss, and an underweight in a falling name
//   helps, so the sign of a move says nothing about us. Exposure is never coloured (no-flags rule).
// * EVERY BLOCK PRINTS THE TIME OF ITS DATA. Paper marks are delayed, and the broker re-marks its
//   cached position list every few minutes, so a poll's numbers are older than the poll.

import { use, useState } from 'react';
import useSWR from 'swr';
import { signColor } from '@/lib/shading';
import {
  clock, dayLabel, fetchToday, fetchTodayOrders, pct, pctSigned, shares, usd, usdSigned,
  type TodayCoreMover, type TodayData, type TodayMover, type TodayPhase, type TodaySleeveMover,
  type TopBottom,
} from '@/lib/portfolioMonitor';

const PHASE_LABEL: Record<TodayPhase, string> = {
  open: 'Today so far',
  closed_preliminary: 'Today, preliminary',
  closed_official: 'Today, official (closed)',
  preopen: 'Last trading day, official (closed)',
};

// `.dtable` right-aligns every cell in a monospace face (numbers). Words read left, in the text face.
const TEXT: React.CSSProperties = { textAlign: 'left', fontFamily: 'inherit' };
/** A thin line between column groups and between the core and sleeve blocks. */
const EDGE = '1px solid var(--border)';

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

function Stat({ label, value, sub, money }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; money?: number | null;
}) {
  return (
    <div className="min-w-[130px]">
      <div className="text-[11px] uppercase tracking-wide text-[var(--tx-dim)]">{label}</div>
      <div className="text-xl font-bold text-[var(--tx)] tabular-nums" style={signColor(money)}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--tx-mut)] mt-0.5">{sub}</div>}
    </div>
  );
}

/** A labelled cluster of stats; the second and later clusters carry a thin line on their left. */
function Cluster({ title, children, edge }: { title: string; children: React.ReactNode; edge?: boolean }) {
  return (
    <div className={edge ? 'pl-8' : ''} style={edge ? { borderLeft: EDGE } : undefined}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-mut)] mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">{children}</div>
    </div>
  );
}

type Line = { values: (number | null)[]; dashed?: boolean };

/** One small intraday chart, one point per poll. Neutral strokes only — nothing coloured by sign. */
function PathChart({ ts, lines, fmt, caption }: {
  ts: string[]; lines: Line[]; fmt: (v: number) => string; caption: string;
}) {
  const W = 720, H = 150, L = 60, R = 12, T = 10, B = 22;
  const t0 = new Date(ts[0]).getTime(), t1 = new Date(ts[ts.length - 1]).getTime();
  const vals = lines.flatMap((l) => l.values.filter((v): v is number => v != null)).concat([0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (i: number) => L + ((new Date(ts[i]).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (l: Line) => l.values
    .map((v, i) => [v, i] as const)
    .filter(([v]) => v != null)
    .map(([v, i], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v as number).toFixed(1)}`)
    .join(' ');
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  return (
    <div className="flex-1 min-w-[300px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={caption}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border-soft)" />
        {ticks.map((v) => (
          <text key={v} x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--tx-dim)">{fmt(v)}</text>
        ))}
        {lines.map((l, i) => (
          <path key={i} d={path(l)} fill="none" stroke={l.dashed ? 'var(--tx-dim)' : 'var(--tx)'}
            strokeWidth={l.dashed ? 1.5 : 2} strokeDasharray={l.dashed ? '4 3' : undefined} />
        ))}
        <text x={L} y={H - 6} fontSize="10" fill="var(--tx-dim)">{clock(ts[0])}</text>
        <text x={W - R} y={H - 6} fontSize="10" fill="var(--tx-dim)" textAnchor="end">{clock(ts[ts.length - 1])}</text>
      </svg>
      <div className="text-[11px] text-[var(--tx-mut)]">{caption}</div>
    </div>
  );
}

/** The day's path: the book against SPY, and the gap between them (the excess), both in %. */
function PathCharts({ series }: { series: TodayData['series'] }) {
  const pts = series.filter((s) => s.pnl_pct != null);
  if (pts.length < 2) {
    return <div className="text-xs text-[var(--tx-dim)] mt-3">
      {pts.length ? 'One poll so far — the lines start at the second.' : 'No intraday polls for this day.'}
    </div>;
  }
  const ts = pts.map((p) => p.ts);
  const gap = pts.map((p) => (p.index_move == null ? null : (p.pnl_pct as number) - p.index_move));
  return (
    <div className="flex flex-wrap gap-6 mt-4">
      <PathChart ts={ts} fmt={(v) => pctSigned(v, 2)}
        lines={[{ values: pts.map((p) => p.index_move), dashed: true }, { values: pts.map((p) => p.pnl_pct) }]}
        caption="Solid: the book's return today (P&L ÷ yesterday's NAV). Dashed: the index's move (SPY's price while the market is open)." />
      <PathChart ts={ts} fmt={(v) => pctSigned(v, 2)} lines={[{ values: gap }]}
        caption="Excess: the book's return minus the index's move, % of yesterday's NAV." />
    </div>
  );
}

function HeadlineBand({ d }: { d: TodayData }) {
  const h = d.headline, r = d.relative;
  const excess = r.available && r.nav0 ? (r.active ?? 0) / r.nav0 : null;
  const brokerGap = h.pnl_broker != null && h.pnl != null ? h.pnl - h.pnl_broker : null;
  return (
    <div className="flex flex-wrap gap-y-4 mt-3">
      <Cluster title="Dollars">
        <Stat label="NAV" value={usd(h.nav)} />
        <Stat label="P&L" value={usdSigned(h.pnl)} money={h.pnl}
          sub={h.source === 'poll' && h.pnl_broker != null
            ? <span title={`IBKR's own count: its account value now minus its ${clock(h.broker_prev_ts)} snapshot, at its marks. `
                + 'Ours starts from yesterday’s official book at our closing prices, so the two differ mainly by '
                + 'that starting point. A check, never blended.'}>
                broker&apos;s count {usdSigned(h.pnl_broker)} ({usdSigned(brokerGap)} apart) ⓘ
              </span>
            : 'since yesterday’s close'} />
      </Cluster>
      <div className="w-8" />
      <Cluster title="Returns · % of yesterday's NAV" edge>
        <Stat label="Book" value={pctSigned(h.pnl_pct, 2)} money={h.pnl_pct} />
        <Stat label={h.index.name} value={pctSigned(h.index.move, 2)}
          sub={h.index.as_of ? (h.source === 'poll' ? `quote ${clock(h.index.as_of)}` : dayLabel(h.index.as_of)) : undefined} />
        <Stat label="Excess vs S&P 500" value={pctSigned(excess, 2)} money={excess}
          sub={r.available ? `${usdSigned(r.active)} on the same NAV` : r.note} />
      </Cluster>
    </div>
  );
}

type EngineRow = {
  key: string; label: React.ReactNode; note?: React.ReactNode; weight?: React.ReactNode;
  actual: number | null | undefined; index: number | null | undefined; excess: number | null | undefined;
  sub?: boolean; bold?: boolean;
};
type EngineBlock = { key: string; title: React.ReactNode; rows: EngineRow[] };

/** Actual, the S&P 500, and the excess between them — by engine, in one table. On every row
 *  actual − S&P 500 = excess, and the rows add to the totals exactly. */
function EngineBand({ d }: { d: TodayData }) {
  const r = d.relative, m = d.mandates, h = d.headline;
  const rel = !!(r.available && r.parts && r.nav0 && r.held && r.not_held);
  const nav0 = rel ? (r.nav0 as number) : (h.nav != null && h.pnl != null ? h.nav - h.pnl : null);
  if (!rel && !m.available) return <div className="text-sm text-[var(--tx-mut)]">{m.note}</div>;

  const p = r.parts;
  const sl = rel ? p!.sleeve_long.usd : m.sleeve_long;
  const ss = rel ? p!.sleeve_short.usd : m.sleeve_short;
  const sw = r.sleeve_weight;
  const uncaptured = m.n_uncaptured
    ? `interest, commissions, and ${m.n_uncaptured} name(s) whose fills are not captured yet` : 'interest, commissions';
  const ours = (w: number | null | undefined, b: number | null | undefined) =>
    `${pct(w, 1)} / ${pct(b, 1)}`;
  // The sleeve and cash carry no benchmark: their whole P&L is excess.
  const zero = (v: number | null | undefined) => (rel ? v : null);
  // A group's OWN return: its P&L over the money in it. The table's % columns are shares of NAV,
  // which add up; these do not, but they say how the names themselves did (owner, 2026-11-24).
  const own = (pnl: number | null | undefined, w: number | null | undefined) =>
    pnl == null || w == null || !nav0 || Math.abs(w) < 1e-9 ? null : pnl / (nav0 * w);
  const ownLine = (ours: number | null, idx: number | null, idxLabel = 'index on these names') => (
    <>
      {ours != null && <>ours <b className="text-[var(--tx-mut)]">{pctSigned(ours, 1)}</b>{idx != null ? ' · ' : ''}</>}
      {idx != null && <>{idxLabel} <b className="text-[var(--tx-mut)]">{pctSigned(idx, 1)}</b></>}
    </>
  );

  const blocks: EngineBlock[] = [
    { key: 'lo', title: <>Long-only core (LO) <span className="font-normal">· measured against the S&amp;P 500</span></>,
      rows: [
        { key: 'core', label: 'Core (LO)', bold: true,
          note: rel ? ownLine(own(r.core_actual, r.core_weight), r.index_move ?? null, 'whole index') : undefined,
          weight: rel ? ours(r.core_weight, 1) : undefined,
          actual: rel ? r.core_actual : m.core, index: rel ? r.benchmark_pnl : null, excess: rel ? r.core_excess : null },
        ...(rel ? [
          { key: 'held', label: 'S&P 500 names we hold', sub: true,
            note: ownLine(own(r.held!.actual, r.held!.weight), own(r.held!.index_pnl, r.held!.index_weight)),
            weight: ours(r.held!.weight, r.held!.index_weight),
            actual: r.held!.actual, index: r.held!.index_pnl, excess: r.held!.actual - r.held!.index_pnl },
          { key: 'not', label: 'S&P 500 names we don’t hold', sub: true,
            note: <>we earn nothing on them · {ownLine(null, own(r.not_held!.index_pnl, r.not_held!.index_weight))}</>,
            weight: ours(0, r.not_held!.index_weight),
            actual: 0, index: r.not_held!.index_pnl, excess: -r.not_held!.index_pnl },
        ] : []),
      ] },
    { key: 'ls', title: <>Long/short sleeve (LS) <span className="font-normal">· benchmark zero — its whole P&amp;L is excess</span></>,
      rows: [
        { key: 'sleeve', label: 'Sleeve (LS)', bold: true,
          weight: sw ? `net ${pct(sw.long + sw.short, 1)}` : undefined,
          actual: sl != null && ss != null ? sl + ss : null, index: null,
          excess: zero(sl != null && ss != null ? sl + ss : null) },
        { key: 'sl', label: 'long leg', sub: true, note: 'Russell 2500 longs',
          weight: sw ? pct(sw.long, 1) : undefined, actual: sl, index: null, excess: zero(sl) },
        { key: 'ss', label: 'short leg', sub: true, note: 'Russell 2500 shorts — a rising price is a loss',
          weight: sw ? pct(sw.short, 1) : undefined, actual: ss, index: null, excess: zero(ss) },
      ] },
    { key: 'outside', title: 'Outside both engines',
      rows: [
        { key: 'un', label: 'Unattributed', note: 'names no mandate claims — shown, never re-allocated',
          actual: rel ? p!.unattributed.usd : m.unattributed, index: null, excess: zero(rel ? p!.unattributed.usd : null) },
        { key: 'cash', label: 'Cash and other', note: uncaptured,
          actual: rel ? p!.other.usd : m.other, index: null, excess: zero(rel ? p!.other.usd : null) },
      ] },
  ];

  const share = (v: number | null | undefined) => (v == null || !nav0 ? null : v / nav0);
  // A money pair: $ then % of NAV, coloured by sign; `plain` for the S&P 500's own column.
  const pair = (v: number | null | undefined, bold = false, plain = false) => {
    const f = share(v);
    const wrap = (x: string) => (bold ? <b>{x}</b> : x);
    return [
      <td key="u" style={{ ...(plain ? {} : signColor(v)), borderLeft: EDGE }}>{v == null ? '—' : wrap(usdSigned(v))}</td>,
      <td key="p" style={plain ? undefined : signColor(f)}>{f == null ? '' : wrap(pctSigned(f, 2))}</td>,
    ];
  };
  const NCOL = 8;

  return (
    <>
      <table className="dtable mt-2">
        <thead>
          <tr>
            <th style={{ borderBottom: 0 }} colSpan={2} />
            {['Actual', 'S&P 500', 'Excess vs S&P 500'].map((t) => (
              <th key={t} colSpan={2} style={{ textAlign: 'center', borderLeft: EDGE, color: 'var(--tx-mut)' }}>{t}</th>
            ))}
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>Engine</th>
            <th title="Starting weight, % of yesterday's NAV: ours / the S&P 500's">Weight · ours / S&amp;P</th>
            {[0, 1, 2].map((i) => [
              <th key={`u${i}`} style={{ borderLeft: EDGE }}>$</th>, <th key={`p${i}`}>% of NAV</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {blocks.map((blk) => [
            <tr key={blk.key}>
              <td colSpan={NCOL} style={{ ...TEXT, background: 'var(--bg)', borderTop: EDGE, paddingTop: 6, paddingBottom: 6 }}
                className="text-[11px] font-bold uppercase tracking-wide text-[var(--tx-mut)]">{blk.title}</td>
            </tr>,
            ...blk.rows.map((x) => (
              <tr key={x.key}>
                <td style={{ ...TEXT, paddingLeft: x.sub ? 26 : undefined, whiteSpace: 'normal' }}>
                  {x.bold ? <b>{x.label}</b> : <span className={x.sub ? 'text-[var(--tx-mut)]' : undefined}>{x.label}</span>}
                  {x.note && <span className="block text-[10.5px] text-[var(--tx-dim)]">{x.note}</span>}
                </td>
                <td className="text-[var(--tx-mut)]">{x.weight ?? ''}</td>
                {pair(x.actual, x.bold)}
                {pair(x.index, x.bold, true)}
                {pair(x.excess, x.bold)}
              </tr>
            )),
          ])}
          <tr style={{ borderTop: EDGE }}>
            <td style={{ ...TEXT, borderTop: EDGE }}><b>Total</b></td>
            <td style={{ borderTop: EDGE }} />
            {pair(h.pnl, true)}
            {pair(rel ? r.benchmark_pnl : null, true, true)}
            {pair(rel ? r.active : null, true)}
          </tr>
        </tbody>
      </table>
      <div className="text-[11px] text-[var(--tx-mut)] mt-2 leading-snug">
        {rel ? (
          <>
            On every row <b className="text-[var(--tx)]">actual − S&amp;P 500 = excess</b>; the rows add up to the
            totals exactly. The small grey line under each core row is the names&apos; own return (P&amp;L over the
            money in them) — ours and the index&apos;s; those do not add up, the % columns do. The S&amp;P 500 column is what the index earned on yesterday&apos;s NAV
            ({pctSigned(r.index_move, 2)}), split by whether the core holds the name. The two core rows can be large
            and opposite on a big day: the core puts about {pct(r.held!.weight, 0)} of NAV into names that are only{' '}
            {pct(r.held!.index_weight, 0)} of the index. Index weights are the month-end S&amp;P 500 weights
            ({r.benchmark_weights_asof ?? '—'}), not moved with prices
            since{h.source === 'poll' ? "; SPY's price move stands in for the index while the market is open" : ''}.
            As of {h.source === 'poll' ? clock(r.as_of) : dayLabel(r.as_of)}.
          </>
        ) : (
          <>Excess not computed: {r.note}. {m.source === 'poll'
            ? `Each name's P&L split by the mandates' claims on ${dayLabel(m.shares_from)}. As of ${clock(m.as_of)}.`
            : `From the official mandate split for ${dayLabel(m.as_of)}.`}</>
        )}
      </div>
    </>
  );
}

function CoreMoverTable({ title, rows, rankBy }: {
  title: string; rows: TodayCoreMover[]; rankBy: 'excess' | 'pnl';
}) {
  const mark = (k: 'excess' | 'pnl') => (rankBy === k ? ' ↓' : '');
  return (
    <div className="min-w-[460px] flex-1">
      <div className="text-xs font-bold text-[var(--tx)] mb-1">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-[var(--tx-dim)]">none</div> : (
        <table className="dtable">
          <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th>Move</th><th>vs index</th>
            <th>Our wt</th><th>Index wt</th>
            <th style={{ borderLeft: EDGE }}>Actual ${mark('pnl')}</th><th>Excess ${mark('excess')}</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.conid}>
                <td style={TEXT}><b>{x.ticker ?? x.conid}</b></td>
                <td>{pctSigned(x.move)}</td>
                <td>{pctSigned(x.move_vs_index)}</td>
                <td>{x.weight ? pct(x.weight) : '—'}</td>
                <td>{x.index_weight ? pct(x.index_weight) : '—'}</td>
                <td style={{ ...signColor(x.pnl), borderLeft: EDGE }}>{usdSigned(x.pnl)}</td>
                <td style={signColor(x.excess)}>{usdSigned(x.excess)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SleeveMoverTable({ title, rows }: { title: string; rows: TodaySleeveMover[] }) {
  return (
    <div className="min-w-[340px] flex-1">
      <div className="text-xs font-bold text-[var(--tx)] mb-1">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-[var(--tx-dim)]">none</div> : (
        <table className="dtable">
          <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Leg</th>
            <th>Move</th><th>Weight</th><th style={{ borderLeft: EDGE }}>P&amp;L $</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.conid}>
                <td style={TEXT}><b>{x.ticker ?? x.conid}</b></td>
                <td style={TEXT}>{x.leg ?? '—'}</td>
                <td>{pctSigned(x.move)}</td>
                <td>{pct(x.weight)}</td>
                <td style={{ ...signColor(x.pnl), borderLeft: EDGE }}>{usdSigned(x.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Fallback when no index move is available: whole-book movers by actual P&L only. */
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
                <td style={TEXT}><b>{r.ticker ?? r.conid}</b></td>
                <td>{pctSigned(r.move)}</td>
                <td>{pct(r.weight)}</td>
                <td style={signColor(r.pnl)}>{usdSigned(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Seg({ value, options, onChange }: {
  value: string; options: { v: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold border"
          style={value === o.v
            ? { background: 'rgba(14,124,111,0.10)', color: 'var(--teal)', borderColor: 'var(--teal)' }
            : { color: 'var(--tx-mut)', borderColor: 'var(--border-soft)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MoversBand({ d }: { d: TodayData }) {
  const [rankBy, setRankBy] = useState<'excess' | 'pnl'>('excess');
  const r = d.relative;
  if (!r.available || !r.core_movers || !r.sleeve_movers) {
    return (
      <>
        <div className="text-xs text-[var(--tx-mut)] mt-1">Whole book by actual P&amp;L — {r.note}</div>
        <div className="flex flex-wrap gap-6 mt-2">
          <MoverTable title="Contributors" rows={d.movers.top} />
          <MoverTable title="Detractors" rows={d.movers.bottom} />
        </div>
      </>
    );
  }
  const core: TopBottom<TodayCoreMover> = rankBy === 'excess' ? r.core_movers.by_excess : r.core_movers.by_actual;
  return (
    <>
      <div className="flex items-baseline gap-3 flex-wrap mt-2">
        <h3 className="text-sm font-bold text-[var(--tx)]">Core (LO)</h3>
        <span className="text-xs text-[var(--tx-mut)]">rank by</span>
        <Seg value={rankBy} onChange={(v) => setRankBy(v as 'excess' | 'pnl')}
          options={[{ v: 'excess', label: 'Excess vs S&P 500' }, { v: 'pnl', label: 'Actual P&L' }]} />
      </div>
      <div className="flex flex-wrap gap-6 mt-2">
        <CoreMoverTable title="Best 5" rows={core.top} rankBy={rankBy} />
        <CoreMoverTable title="Worst 5" rows={core.bottom} rankBy={rankBy} />
      </div>
      <div className="text-[11px] text-[var(--tx-mut)] mt-1">
        Excess per name = (our weight − its index weight) × (its move − the index move). The two rankings can
        disagree: an overweight name that falls less than the index loses money but helps against it; an index
        name we are underweight that rallies costs excess even while it makes us money.
      </div>
      <div className="mt-4 pt-3" style={{ borderTop: EDGE }}>
        <h3 className="text-sm font-bold text-[var(--tx)]">Sleeve (LS)</h3>
        <div className="flex flex-wrap gap-6 mt-2">
          <SleeveMoverTable title="Best 5" rows={r.sleeve_movers.top} />
          <SleeveMoverTable title="Worst 5" rows={r.sleeve_movers.bottom} />
        </div>
        <div className="text-[11px] text-[var(--tx-mut)] mt-1">
          One list: the sleeve&apos;s excess is its P&amp;L. A short whose price rises loses money.
        </div>
      </div>
    </>
  );
}

function ExposureBand({ d }: { d: TodayData }) {
  const e = d.exposure, t = e.target;
  const row = (k: string, now: React.ReactNode, tgt: React.ReactNode) => (
    <tr key={k}><td style={TEXT}>{k}</td><td>{now}</td><td>{tgt}</td></tr>
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
                    <td style={TEXT}><b>{o.ticker ?? o.conid}</b></td>
                    <td>{o.side}</td><td>{shares(o.qty)}</td><td>{shares(o.filled_qty)}</td>
                    <td style={TEXT} className="text-[var(--tx-mut)]">{o.last_event ?? '—'}</td>
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
        {h.base?.stale && (
          <div className="text-xs mt-2 px-3 py-2 border border-[var(--border)] rounded bg-[var(--bg)] text-[var(--tx)] leading-snug">
            <b>Not a one-day view.</b> {h.base.skipped.map(dayLabel).join(', ')} has no official book (its closing
            snapshot or closing prices are missing), so everything below runs from {dayLabel(h.base.prev_date)}&apos;s
            close: the P&amp;L, each stock&apos;s move, and the S&amp;P 500, which is carried across the missing
            day(s) so the excess compares like with like.
            {h.base.chain == null && ' The index level for the missing day is not in yet, so excess is not computed.'}
            {' '}It returns to normal once the missing day&apos;s book is built.
          </div>
        )}
        <HeadlineBand d={data} />
        {h.source === 'poll' && h.n_names != null && h.n_moved != null && h.n_moved < 0.05 * h.n_names && (
          <div className="text-xs mt-2 text-[var(--tx)]">
            Only {h.n_moved} of {h.n_names} prices have moved since yesterday&apos;s close — the market may be shut today.
          </div>
        )}
        <PathCharts series={data.series} />
      </section>

      <section className="panel p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Return by engine</h2>
          <span className="text-xs text-[var(--tx-mut)]">actual, and excess vs the S&amp;P 500 · % of yesterday&apos;s NAV</span>
        </div>
        <EngineBand d={data} />
      </section>

      <section className="panel p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">Movers</h2>
          <span className="text-xs text-[var(--tx-mut)]">
            {h.source === 'poll' ? clock(data.relative.as_of ?? data.movers.as_of) : dayLabel(h.date)}
            {data.mandates.n_uncaptured ? ` · ${data.mandates.n_uncaptured} name(s) with uncaptured fills left out` : ''}
          </span>
        </div>
        <MoversBand d={data} />
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
