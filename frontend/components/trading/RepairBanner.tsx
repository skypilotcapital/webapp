'use client';

import Link from 'next/link';
import type { RebalanceDetail } from '@/lib/trading';

// "IS THIS BOOK A REPAIR, OR A NEW DECISION?" — the question corporate_actions_policy.md §7 says a
// reader must be able to answer at a glance, and the reason `repair` is a first-class block in the
// provenance stamp rather than a sentence in the notes field.
//
// It matters because the two look identical from outside: both are a fresh rebalance_id, both
// supersede a cancelled one, both need approving. Only one of them re-decided anything. If that
// distinction is not on the screen, then in three months nobody can say whether the August book
// traded the July signal or a hurried re-run — and Rule 2 exists precisely to make that answerable.
//
// Rendered on BOTH ends of the lineage: the replacement says what it removed, the superseded book
// says what replaced it. A cancelled rebalance with no forward link reads as abandoned.
export function RepairBanner({ detail, env }: { detail: RebalanceDetail; env: string }) {
  const rep = detail.repair;
  const succ = detail.superseded_by ?? [];

  if (!rep && succ.length === 0) return null;

  return (
    <>
      {rep && (
        <div className="panel p-4 border-l-4 border-[var(--amber)]">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-[var(--amber)]">
              This book is a repair, not a new decision
            </h2>
            {rep.repair_of != null && (
              <Link href={`/trading/${env}/rebalance/${rep.repair_of}`}
                    className="text-[11px] underline decoration-dotted underline-offset-2">
                supersedes #{rep.repair_of} →
              </Link>
            )}
          </div>

          <p className="text-[12px] mt-2">
            Removed{' '}
            {rep.excluded_detail.map((d, i) => (
              <span key={d.isin}>
                {i > 0 && ', '}
                <b className="font-mono">{d.ticker}</b>{' '}
                <span className="text-[var(--tx-mut)]">
                  ({pct(Math.abs(d.weight))}, {d.mandate})
                </span>
              </span>
            ))}
            {rep.method === 'drop'
              ? ' — weight left uninvested.'
              : ' — weight redistributed pro-rata within the same mandate and side.'}
          </p>

          {rep.reason && (
            <p className="text-[11px] text-[var(--tx-mut)] mt-1">Reason: {rep.reason}</p>
          )}

          {/* The whole point of Rule 2, stated as a fact about THIS book rather than as policy. */}
          <p className="text-[11px] text-[var(--tx-mut)] mt-2">
            Same signal date and same price as-of as #{rep.repair_of}. No fresher data was read and
            no signal was recomputed — <b>only the excluded names changed</b>.
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] tabular-nums">
            <span>names <b>{rep.n_before} → {rep.n_after}</b></span>
            <span>gross <b>{rep.gross_before.toFixed(4)} → {rep.gross_after.toFixed(4)}</b></span>
            <span>net <b>{rep.net_before.toFixed(5)} → {rep.net_after.toFixed(5)}</b></span>
          </div>

          <ul className="mt-3 space-y-0.5">
            {rep.gates.map((g, i) => (
              <li key={i} className="text-[11px]">
                <span className={GATE[g.state].cls}>{GATE[g.state].glyph}</span>{' '}
                <span className="text-[var(--tx-mut)]">{g.mandate}</span>{' '}
                {g.gate === 'position_cap' ? 'position cap' : 'sector exposure'}
                <span className="text-[var(--tx-dim)]"> — {g.basis}</span>
              </li>
            ))}
          </ul>

          {rep.overridden && (
            <p className="text-[11px] text-[var(--neg)] mt-2">
              ⚠ A failing gate was OVERRIDDEN by {rep.actor ?? 'an operator'} at the terminal.
            </p>
          )}

          <p className="text-[10px] text-[var(--tx-dim)] mt-3">
            Not re-checked by the repair: {rep.unchecked_gates.join('; ')}. Pro-rata moves weights
            by roughly the excluded weight, so the exposure is small — but it is not nil.
          </p>
        </div>
      )}

      {succ.length > 0 && (
        <div className="panel p-4 border-l-4 border-[var(--tx-dim)]">
          <h2 className="text-sm font-semibold">Superseded</h2>
          <p className="text-[12px] mt-1">
            Replaced by{' '}
            {succ.map((s, i) => (
              <span key={s.rebalance_id}>
                {i > 0 && ', '}
                <Link href={`/trading/${env}/rebalance/${s.rebalance_id}`}
                      className="underline decoration-dotted underline-offset-2">
                  #{s.rebalance_id}
                </Link>{' '}
                <span className="text-[var(--tx-mut)]">({s.status})</span>
              </span>
            ))}
            {' '}— a repair of this book, at the same signal date and price as-of.
          </p>
        </div>
      )}
    </>
  );
}

const GATE: Record<string, { glyph: string; cls: string }> = {
  ok:   { glyph: '●', cls: 'text-[var(--pos)]' },
  warn: { glyph: '▲', cls: 'text-[var(--amber)]' },
  fail: { glyph: '■', cls: 'text-[var(--neg)]' },
};

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
