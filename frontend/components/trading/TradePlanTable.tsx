'use client';

import { useMemo, useState } from 'react';
import type { PlanResponse, PlanRow } from '@/lib/trading';

// The pre-trade working surface. It arrives sorted by size because that is what a PM checks first,
// but every column sorts: "which names am I selling", "what is the biggest short", "is anything
// priced off a stale close" are all real questions and each is a different sort.
//
// [10-TACT], 2026-08-07 — A BOOK VIEW WITH A TRADE OVERLAY, NOT A TRADE LIST. The establishment
// trade was sized from 100% cash: every row was an open, TARGET == DELTA, and `side` alone said
// everything. From an existing book neither holds. Two changes follow:
//
//   1. ACTION. The same SELL can trim a long, close it, or sell THROUGH ZERO into a short, and
//      those used to render identically. `action` names the whole transition, so a flip is never
//      mistaken for a trim. It is NOT the submission wave — a wave says when an order may be
//      sent and files a zero-crossing by what it does first; see rebalance.py for the argument.
//   2. HOLDS ARE VISIBLE. At ~30% turnover on ~460 names most of the book is held and
//      deliberately untouched. "Held at target, no action" is a decision and it must not render
//      the same as "not in the book" — the [10-CAREP] rule applied to a table. Default is still
//      changes-only, because that is what a reviewer reads first; the full book is one click away.
type Key = 'ticker' | 'company' | 'sector' | 'sleeve' | 'action' | 'weight' | 'prior_wt'
         | 'current_qty' | 'target_qty' | 'delta' | 'side' | 'price' | 'est_notional';

const COLS: { key: Key; label: string; num?: boolean; title?: string }[] = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'company', label: 'Company' },
  { key: 'sector', label: 'Sector' },
  { key: 'sleeve', label: 'Sleeve' },
  { key: 'action', label: 'Action', title: 'What this trade does to the position' },
  { key: 'current_qty', label: 'Held', num: true, title: 'Shares held now — the broker position' },
  { key: 'target_qty', label: 'Target', num: true, title: 'Shares after this trade' },
  { key: 'delta', label: 'Delta', num: true },
  { key: 'side', label: 'Side' },
  { key: 'weight', label: 'Weight', num: true, title: 'Target weight in this book' },
  { key: 'prior_wt', label: 'Prior wt', num: true,
    title: 'Target weight at the LAST rebalance — what we intended to hold, not what we hold. '
         + 'The holding is the Held column.' },
  { key: 'price', label: 'Price', num: true },
  { key: 'est_notional', label: 'Notional', num: true },
];

const SLEEVE_LABEL: Record<string, string> = {
  core: 'LO core', sleeve: 'L/S sleeve', composite: 'both', unknown: 'unknown',
};

// Ordered as the transitions read: build a long, unwind a long, build a short, unwind a short.
const ACTION_LABEL: Record<string, string> = {
  open_long: 'OPEN LONG', add: 'ADD', trim: 'TRIM', close_long: 'CLOSE LONG',
  flip_short: 'FLIP → SHORT', open_short: 'OPEN SHORT', add_short: 'ADD SHORT',
  cover: 'COVER', close_short: 'CLOSE SHORT', flip_long: 'FLIP → LONG',
  hold: 'HOLD', dust: 'DUST',
};
const ACTION_ORDER = Object.keys(ACTION_LABEL);

// Colour carries direction (green builds/unwinds toward long, red toward short); WEIGHT carries
// risk. The distinction a reviewer actually reads is the LABEL — "FLIP → SHORT" cannot be mistaken
// for "TRIM" the way two identical `SELL`s could — and amber + semibold is reinforcement, not the
// signal itself. That ordering matters: amber (#b45309) and neg (#b91c1c) are close enough at 11px
// that colour alone would be a weak carrier, and useless to a colour-blind reader.
const ACTION_CLASS: Record<string, string> = {
  open_long: 'text-[var(--pos)]', add: 'text-[var(--pos)]',
  cover: 'text-[var(--pos)]', close_short: 'text-[var(--pos)]',
  trim: 'text-[var(--neg)]', close_long: 'text-[var(--neg)]',
  open_short: 'text-[var(--neg)]', add_short: 'text-[var(--neg)]',
  flip_short: 'text-[var(--amber)] font-semibold',
  flip_long: 'text-[var(--amber)] font-semibold',
  hold: 'text-[var(--tx-dim)]', dust: 'text-[var(--tx-dim)] italic',
};
const FLIPS = new Set(['flip_short', 'flip_long']);
const NEEDS_BORROW = new Set(['open_short', 'add_short', 'flip_short']);

/** A `composite` name is in BOTH mandates. One row per order (it IS one order), badged — so it
 *  shows up under either tab rather than being hidden from each because it is in the other. */
const inSleeve = (r: PlanRow, tag: 'core' | 'sleeve' | 'unknown') =>
  r.sleeve === tag || (r.sleeve === 'composite' && r.mandate_wt != null && tag in r.mandate_wt);

export function TradePlanTable({ plan }: { plan: PlanResponse }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'est_notional', dir: -1 });
  const [only, setOnly] = useState<'all' | 'core' | 'sleeve'>('all');
  const [action, setAction] = useState<string | null>(null);
  // Changes-only by default: the reviewer's first question is "what is moving". The full book is
  // one click away and the toggle says how many holds it would add, so the choice is informed.
  const [view, setView] = useState<'changes' | 'book'>('changes');

  const rows = useMemo(() => {
    let f = only === 'all' ? plan.plan : plan.plan.filter((r) => inSleeve(r, only));
    if (view === 'changes') f = f.filter((r) => r.action !== 'hold');
    if (action) f = f.filter((r) => r.action === action);
    const v = (r: PlanRow) => {
      // Actions sort in transition order, not alphabetically — 'ADD' next to 'ADD SHORT' would
      // put the two opposite sides of the book together.
      if (sort.key === 'action') return r.action ? ACTION_ORDER.indexOf(r.action) : 99;
      const x = r[sort.key as keyof PlanRow];
      return typeof x === 'number' ? x : String(x ?? '').toLowerCase();
    };
    return [...f].sort((a, b) => {
      const av = v(a), bv = v(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * sort.dir;
    });
  }, [plan.plan, sort, only, action, view]);

  // Numbers are interesting largest-first, names A-Z. Defaulting both to ascending would make half
  // the columns need two clicks before they say anything.
  const click = (k: Key) =>
    setSort((s) => (s.key === k
      ? { key: k, dir: (s.dir * -1) as 1 | -1 }
      : { key: k, dir: COLS.find((c) => c.key === k)?.num ? -1 : 1 }));

  // Counts describe WHAT IS ON SCREEN, not the whole plan. With a sleeve selected, plan-level
  // totals are a different book from the rows below them, and the reader has no way to tell.
  const shown = useMemo(() => {
    const traded = rows.filter((r) => r.side && !r.dust_filtered);
    return {
      n: rows.length,
      buy: traded.filter((r) => r.side === 'BUY').length,
      sell: traded.filter((r) => r.side === 'SELL').length,
      dust: rows.filter((r) => r.dust_filtered).length,
      hold: rows.filter((r) => r.action === 'hold').length,
      gross: traded.reduce((a, r) => a + Number(r.est_notional ?? 0), 0),
    };
  }, [rows]);

  // Action counts follow the SLEEVE filter but not the action filter — otherwise picking one chip
  // would zero every other chip and there would be no way back except a second click.
  const actionCounts = useMemo(() => {
    const base = only === 'all' ? plan.plan : plan.plan.filter((r) => inSleeve(r, only));
    const m = new Map<string, number>();
    base.forEach((r) => { if (r.action) m.set(r.action, (m.get(r.action) ?? 0) + 1); });
    return ACTION_ORDER.filter((a) => m.has(a)).map((a) => [a, m.get(a)!] as const);
  }, [plan.plan, only]);

  const bySleeve = plan.summary.by_sleeve ?? {};
  const nHold = plan.summary.n_hold ?? 0;

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold">
          Trade plan
          <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--tx-mut)]">
            PREVIEW — recomputed at submission
          </span>
        </h2>
        {/* The overlay switch. Labelled with the hold count so that turning it on is a decision
            about a known quantity, not a guess at what is hidden. */}
        <button onClick={() => setView((v) => (v === 'changes' ? 'book' : 'changes'))}
                className="px-2 py-1 rounded text-[11px] border border-[var(--border-soft)]
                           text-[var(--tx-mut)] hover:text-[var(--teal)]">
          {view === 'changes'
            ? `Show full book (+${nHold} held at target)`
            : 'Show changes only'}
        </button>
      </div>

      {/* Always open. This is the working surface — hiding it behind a toggle put a click between
          the reviewer and the only place the actual trades are visible, and the toggle's label
          ("Show 186 rows") could not follow the sleeve filter below it, so it contradicted the
          selection. */}
      <p className="text-[11px] text-[var(--tx-mut)] mt-1">
        {shown.buy + shown.sell} trades — {shown.buy} buys, {shown.sell} sells,
        {' '}{shown.dust} dust-filtered · est. gross ${Math.round(shown.gross).toLocaleString()}
        {view === 'book' && shown.hold > 0 && (
          <span className="text-[var(--tx-dim)]"> · {shown.hold} held at target, no action</span>
        )}
        {only !== 'all' && (
          <span className="text-[var(--tx-dim)]"> · {SLEEVE_LABEL[only]} only</span>
        )}
      </p>

      {/* THE TWO MANDATES, side by side. There is one account and one order per name — the broker
          nets them — but the book is built by two engines and the PM reviews them as two separate
          decisions. A name reachable from both is counted under each, which is why the tab totals
          can exceed the plan total; `n_composite` says by how much. */}
      {Object.keys(bySleeve).length > 1 && (
        <div className="flex gap-2 mt-2 flex-wrap items-center">
          {(['all', 'core', 'sleeve'] as const).map((t) => {
            const st = t === 'all' ? null : bySleeve[t];
            if (t !== 'all' && !st) return null;
            return (
              <button key={t} onClick={() => setOnly(t)}
                      className={`px-2 py-1 rounded text-[11px] border ${only === t
                        ? 'border-[var(--teal)] text-[var(--teal)] font-semibold'
                        : 'border-[var(--border-soft)] text-[var(--tx-mut)]'}`}>
                {t === 'all'
                  ? `All ${plan.summary.n_trades}`
                  : `${SLEEVE_LABEL[t]} · ${st!.n} names · $${Math.round(st!.gross_notional).toLocaleString()}`}
              </button>
            );
          })}
          {(plan.summary.n_composite ?? 0) > 0 && (
            <span className="text-[10px] text-[var(--tx-dim)]">
              {plan.summary.n_composite} name(s) in both mandates — one order each, counted under both
            </span>
          )}
        </div>
      )}

      {/* GROUP BY WHAT THE TRADES DO. Next month risk clusters by action, not by size: every flip
          is two economic acts in one order, every short open needs a locate, every close is the
          surprise-residual case. None of those are findable by sorting on notional. */}
      {actionCounts.length > 1 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <button onClick={() => setAction(null)}
                  className={`px-2 py-0.5 rounded text-[10px] border ${action === null
                    ? 'border-[var(--teal)] text-[var(--teal)] font-semibold'
                    : 'border-[var(--border-soft)] text-[var(--tx-mut)]'}`}>
            Any action
          </button>
          {actionCounts.map(([a, n]) => (
            <button key={a} onClick={() => setAction(action === a ? null : a)}
                    title={FLIPS.has(a) ? 'Crosses through zero — two economic acts in one order'
                          : NEEDS_BORROW.has(a) ? 'Creates or increases a short — needs a locate'
                          : undefined}
                    className={`px-2 py-0.5 rounded text-[10px] border ${action === a
                      ? 'border-[var(--teal)] text-[var(--teal)] font-semibold'
                      : `border-[var(--border-soft)] ${ACTION_CLASS[a] ?? 'text-[var(--tx-mut)]'}`}`}>
              {ACTION_LABEL[a] ?? a} {n}
              {NEEDS_BORROW.has(a) && <span className="ml-1" title="needs a locate">⚑</span>}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto mt-3 max-h-[560px] overflow-y-auto">
          <table className="dtable w-full text-[11px]">
            <thead className="sticky top-0 bg-[var(--panel)]">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => click(c.key)}
                      className={`cursor-pointer select-none ${c.num ? 'text-right' : 'text-left'}`}
                      title={c.title ?? 'sort by this column'}>
                    {c.label}
                    {sort.key === c.key && (
                      <span className="ml-1 text-[var(--teal)]">{sort.dir === 1 ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
                <th className="text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.conid} className={r.action === 'hold' ? 'opacity-60' : undefined}>
                  <td className="font-medium">{r.ticker}</td>
                  <td className="max-w-[190px] truncate" title={r.company ?? ''}>
                    {r.company ?? '—'}
                  </td>
                  <td className="max-w-[120px] truncate" title={r.industry ?? ''}>
                    {r.sector ?? '—'}
                  </td>
                  <td className="text-[var(--tx-mut)] whitespace-nowrap">
                    {SLEEVE_LABEL[r.sleeve] ?? r.sleeve}
                    {r.sleeve === 'composite' && (
                      <span className="ml-1 px-1 rounded bg-[var(--bg)] text-[9px] text-[var(--tx-dim)]"
                            title={`In both mandates: ${Object.entries(r.mandate_wt ?? {})
                              .map(([m, w]) => `${m} ${(w * 100).toFixed(2)}%`).join(' · ')
                              } — one order, netted`}>
                        both
                      </span>
                    )}
                    {/* An exit is in no sleeve today; this is where it WAS. Intent, not holding. */}
                    {r.sleeve_src === 'prior_intent' && (
                      <span className="ml-1 text-[9px] text-[var(--tx-dim)]"
                            title="Not in today's book — this is the mandate it was in at the last
                                   rebalance (what we intended to hold, not a holding).">
                        (prior)
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap ${ACTION_CLASS[r.action ?? ''] ?? 'text-[var(--tx-dim)]'}`}
                      title={r.action ? undefined : 'Not priced — see the note'}>
                    {r.action ? ACTION_LABEL[r.action] : '—'}
                    {r.action && NEEDS_BORROW.has(r.action) && (
                      <span className="ml-1" title="Creates or increases a short — needs a locate">⚑</span>
                    )}
                  </td>
                  <td className="text-right">{r.current_qty ?? '—'}</td>
                  <td className="text-right">{r.target_qty ?? '—'}</td>
                  <td className="text-right">{r.delta ?? '—'}</td>
                  <td className={r.side === 'BUY' ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}>
                    {r.side ?? ''}
                  </td>
                  <td className="text-right">{(Number(r.weight) * 100).toFixed(2)}%</td>
                  <td className="text-right text-[var(--tx-dim)]"
                      title="Target weight at the last rebalance — intent, not a holding">
                    {r.prior_wt == null ? '—' : `${(Number(r.prior_wt) * 100).toFixed(2)}%`}
                  </td>
                  <td className="text-right">{r.price ?? '—'}</td>
                  <td className="text-right">
                    {r.est_notional == null
                      ? '—'
                      : `$${Math.round(Number(r.est_notional)).toLocaleString()}`}
                  </td>
                  <td className="text-[10px] text-[var(--tx-dim)] max-w-[160px] truncate"
                      title={r.note ?? ''}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}
