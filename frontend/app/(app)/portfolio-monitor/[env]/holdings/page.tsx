'use client';

// Portfolio Monitor › Holdings ([08-PMON]; IA doc §3). One row per name: what we hold today beside
// the frozen target of the governing rebalance — the LIVE book we traded, never the research book.
//
// Present the data, flag nothing (owner, 2026-10-12): no row is coloured by how far it has drifted,
// and there is no threshold anywhere on this page. Sorting by drift is a sort, not a judgement.

import { use, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AsOfStrip } from '@/components/portfolio_monitor/AsOfStrip';
import {
  dayLabel, fetchMonitorHoldings, holdingsCsvUrl, MANDATE_LABEL, pct, pp, shares, usd, usdSigned,
  type HoldingRow,
} from '@/lib/portfolioMonitor';

type SortKey = keyof HoldingRow | 'abs_drift';

interface Col {
  key: SortKey;
  label: string;
  title?: string;
  right?: boolean;
  render: (r: HoldingRow) => React.ReactNode;
  value: (r: HoldingRow) => number | string | null;
}

const num = (v: number | null | undefined) => (v == null ? null : v);

// `.dtable` right-aligns every cell in a monospace face (numbers). Words read left, in the text face.
const TEXT_CELL: React.CSSProperties = { textAlign: 'left', fontFamily: 'inherit' };

const COLS: Col[] = [
  { key: 'ticker', label: 'Ticker', render: (r) => (
      <span title={r.isin ?? undefined}>
        <b className="text-[var(--tx)]">{r.ticker ?? '—'}</b>
        <span className="block text-[10px] text-[var(--tx-dim)] truncate max-w-[180px]">{r.name ?? ''}</span>
      </span>),
    value: (r) => r.ticker ?? '' },
  { key: 'side', label: 'Side', render: (r) => r.side, value: (r) => r.side },
  { key: 'mandate', label: 'Mandate',
    title: 'Which engine the position belongs to, as the ledger recorded it. Split = held by both; '
      + 'unattributed = the ledger could not place it (reported, never re-allocated here).',
    render: (r) => (
      <span title={r.mandate_split.length
        ? r.mandate_split.map((s) => `${s.mandate}: ${shares(s.qty)} sh`).join(' · ') : undefined}>
        {MANDATE_LABEL[r.mandate] ?? r.mandate}{!r.held && ' (target only)'}
      </span>),
    value: (r) => r.mandate },
  { key: 'sector', label: 'Sector', render: (r) => r.sector ?? '—', value: (r) => r.sector ?? '' },
  { key: 'qty', label: 'Shares', right: true, render: (r) => shares(r.qty), value: (r) => num(r.qty) },
  { key: 'price', label: 'Price', right: true,
    render: (r) => (
      <span title={r.price_source ? `price source: ${r.price_source}` : undefined}>
        {r.price == null ? '—' : r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>),
    value: (r) => num(r.price) },
  { key: 'mkt_value', label: 'Market value', right: true, render: (r) => usd(r.mkt_value),
    value: (r) => r.mkt_value },
  { key: 'weight', label: 'Weight', right: true, title: '% of NAV — the account’s own book',
    render: (r) => pct(r.weight), value: (r) => num(r.weight) },
  { key: 'target_weight', label: 'Target', right: true,
    title: 'The frozen target of the governing rebalance (the live book we traded), % of NAV. 0 = not in the target.',
    render: (r) => pct(r.target_weight), value: (r) => r.target_weight },
  { key: 'abs_drift', label: 'Drift', right: true, title: 'Weight − Target, percentage points',
    render: (r) => pp(r.drift_pp), value: (r) => (r.drift_pp == null ? null : Math.abs(r.drift_pp)) },
  { key: 'drift_usd', label: 'Drift $', right: true,
    title: 'Market value − Target × today’s NAV. Not an order.',
    render: (r) => usdSigned(r.drift_usd), value: (r) => num(r.drift_usd) },
  { key: 'pnl_d', label: 'Day P&L', right: true, render: (r) => usdSigned(r.pnl_d), value: (r) => num(r.pnl_d) },
  { key: 'pnl_since_rebalance', label: 'Since rebal.', right: true,
    title: 'P&L since the close of the last rebalance’s trade day',
    render: (r) => usdSigned(r.pnl_since_rebalance), value: (r) => num(r.pnl_since_rebalance) },
  { key: 'bench_weight', label: 'Benchmark', right: true,
    title: 'S&P 500 month-end cap weight — core names only (the sleeve is measured against cash)',
    render: (r) => pct(r.bench_weight), value: (r) => num(r.bench_weight) },
  { key: 'active_weight', label: 'Active', right: true,
    title: 'The core’s weight in the name minus its benchmark weight — core names only',
    render: (r) => pp(r.active_weight), value: (r) => num(r.active_weight) },
  { key: 'borrow_fee_pct', label: 'Borrow fee', right: true,
    title: 'IBKR stock-loan fee, % per year — shorts only, latest file usable on the book date',
    render: (r) => (r.borrow_fee_pct == null ? '—' : `${r.borrow_fee_pct.toFixed(2)}%`),
    value: (r) => num(r.borrow_fee_pct) },
  { key: 'borrow_available', label: 'Available', right: true, title: 'Shares available to borrow',
    render: (r) => (r.borrow_available == null ? '—' : r.borrow_available.toLocaleString('en-US')),
    value: (r) => num(r.borrow_available) },
  { key: 'last_fill', label: 'Last fill', render: (r) => r.last_fill ?? '—', value: (r) => r.last_fill ?? '' },
];

function Seg({ value, options, onChange }: {
  value: string; options: { v: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className="px-2.5 py-1 rounded-md text-xs font-semibold border"
          style={value === o.v
            ? { background: 'rgba(14,124,111,0.10)', color: 'var(--teal)', borderColor: 'var(--teal)' }
            : { color: 'var(--tx-mut)', borderColor: 'var(--border-soft)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function HoldingsPage({ params }: { params: Promise<{ env: string }> }) {
  const { env } = use(params);
  const { data, error } = useSWR(['pm-holdings', env], () => fetchMonitorHoldings(env),
    { revalidateOnFocus: false });
  const [side, setSide] = useState('');
  const [mandate, setMandate] = useState('');
  const [sector, setSector] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'abs_drift', desc: true });

  const sectors = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((r) => r.sector).filter(Boolean) as string[])).sort(),
    [data]);
  const mandates = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((r) => r.mandate))).sort(),
    [data]);

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    const f = (data?.rows ?? []).filter((r) =>
      (!side || r.side === side) && (!mandate || r.mandate === mandate)
      && (!sector || r.sector === sector));
    return [...f].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return sort.desc ? -c : c;
    });
  }, [data, side, mandate, sector, sort]);

  const tot = useMemo(() => {
    const s = (fn: (r: HoldingRow) => number | null) => rows.reduce((a, r) => a + (fn(r) ?? 0), 0);
    return {
      n: rows.filter((r) => r.held).length,
      net: s((r) => r.mkt_value),
      gross: s((r) => Math.abs(r.mkt_value)),
      weight: s((r) => r.weight),
      target: s((r) => r.target_weight),
      drift: s((r) => r.drift_pp),
      driftUsd: s((r) => r.drift_usd),
      pnl: s((r) => r.pnl_d),
      since: s((r) => r.pnl_since_rebalance),
    };
  }, [rows]);

  if (error) return <div className="text-sm text-[var(--tx-mut)]">Could not load holdings: {String(error)}</div>;
  if (!data) return <div className="text-sm text-[var(--tx-dim)]">Loading holdings…</div>;
  if (!data.date) return <div className="text-sm text-[var(--tx-mut)]">{data.note}</div>;

  const nav = data.nav ?? 0;
  const b = data.book;
  const share = (v: number | null | undefined) => (v == null || !nav ? '' : ` (${pct(v / nav, 1)})`);
  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <div className="space-y-4">
      <div className="border-b border-[var(--border-soft)] pb-4">
        <h1 className="text-2xl font-bold text-[var(--tx)] tracking-tight">Holdings</h1>
        <p className="text-sm text-[var(--tx-dim)] mt-1">
          What the account holds today, beside the target we traded to. Weights are % of NAV.
        </p>
        <AsOfStrip
          items={[
            { label: 'Account', value: data.account_id ?? '—' },
            { label: 'Book', value: dayLabel(data.date) },
            { label: 'NAV', value: usd(data.nav) },
            { label: 'Benchmark weights', value: `${data.benchmark_asof ?? '—'} (month-end)` },
            { label: 'P&L since', value: `close of ${data.since_rebalance_start}` },
          ]}
          target={data.target}
          notices={[...data.notices, ...(data.target_note ? [data.target_note] : [])]}
        />
      </div>

      {b && (
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-[var(--tx-mut)]">
          <span>Long <b className="text-[var(--tx)]">{usd(b.gross_long)}</b>{share(b.gross_long)} · {b.n_long} names</span>
          <span>Short <b className="text-[var(--tx)]">{usd(b.gross_short)}</b>{share(b.gross_short)} · {b.n_short} names</span>
          <span>Net <b className="text-[var(--tx)]">{usd(b.net)}</b>{share(b.net)}</span>
          <span>Cash <b className="text-[var(--tx)]">{usd(b.cash)}</b></span>
          <span>Day P&amp;L <b className="text-[var(--tx)]">{usdSigned(b.pnl_d)}</b></span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Seg value={side} onChange={setSide}
          options={[{ v: '', label: 'All' }, { v: 'long', label: 'Long' }, { v: 'short', label: 'Short' }]} />
        <Seg value={mandate} onChange={setMandate}
          options={[{ v: '', label: 'All mandates' },
            ...mandates.map((m) => ({ v: m, label: MANDATE_LABEL[m] ?? m }))]} />
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          className="px-2 py-1 rounded-md text-xs border bg-[var(--panel)] text-[var(--tx)]"
          style={{ borderColor: 'var(--border-soft)' }}>
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <a href={holdingsCsvUrl(env, { side, mandate, sector })}
          className="ml-auto px-3 py-1 rounded-md text-xs font-bold border"
          style={{ color: 'var(--teal)', borderColor: 'var(--teal)' }}>
          Download CSV
        </a>
      </div>

      <div className="panel overflow-auto max-h-[68vh]">
        <table className="dtable w-full text-xs tabular-nums">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--panel)' }}>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} title={c.title} onClick={() => clickSort(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap"
                  style={c.right ? undefined : TEXT_CELL}>
                  {c.label}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
            <tr className="font-semibold" style={{ background: 'var(--bg)' }}>
              <td>Total · {tot.n} held</td>
              <td /><td /><td /><td /><td />
              <td className="text-right" title={`gross ${usd(tot.gross)}`}>{usd(tot.net)}</td>
              <td className="text-right">{pct(tot.weight)}</td>
              <td className="text-right">{pct(tot.target)}</td>
              <td className="text-right">{pp(tot.drift)}</td>
              <td className="text-right">{usdSigned(tot.driftUsd)}</td>
              <td className="text-right">{usdSigned(tot.pnl)}</td>
              <td className="text-right">{usdSigned(tot.since)}</td>
              <td /><td /><td /><td /><td />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.conid}-${r.isin}`}>
                {COLS.map((c) => (
                  <td key={c.key} style={c.right ? undefined : TEXT_CELL}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-[var(--tx-dim)]">
        {rows.length} rows · gross {usd(tot.gross)} · net {usd(tot.net)}. The total row sums the
        rows shown (it follows the filters); its market value is the net, and the gross is on hover.
      </div>

      <div className="text-[11px] text-[var(--tx-dim)] space-y-1 leading-snug">
        {Object.entries(data.notes).map(([k, v]) => (
          <div key={k}><b className="text-[var(--tx-mut)]">{k.replace(/_/g, ' ')}</b> — {v}</div>
        ))}
      </div>
    </div>
  );
}
