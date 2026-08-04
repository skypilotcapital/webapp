'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  fetchLedger, fetchPlan, fetchRebalance, fetchReview,
  type Ledger, type PlanResponse, type RebalanceDetail, type Review,
} from '@/lib/trading';
import { BlotterSection } from './Blotter';
import { ApproveControl } from './ApproveControl';
import { HaltControl } from './HaltControl';

const CHECK: Record<string, { glyph: string; cls: string }> = {
  ok:   { glyph: '●', cls: 'text-[var(--pos)]' },
  warn: { glyph: '▲', cls: 'text-[var(--amber)]' },
  fail: { glyph: '■', cls: 'text-[var(--neg)]' },
};

const fmtUsd = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString('en-US')}`;

function age(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} days ago`;
}

export function RebalanceReview({ env, id }: { env: string; id: number }) {
  const [detail, setDetail] = useState<RebalanceDetail | null>(null);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [canApprove, setCanApprove] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRebalance(env, id).then(setDetail).catch((e) => setErr(String(e)));
    fetchReview(env, id).then((d) => { setReview(d.review); setCanApprove(d.can_approve); })
      .catch(() => setReview(null));
    fetchPlan(env, id, 'preview').then(setPlan).catch(() => setPlan(null));
    fetchLedger(env, id).then(setLedger).catch(() => setLedger(null));
  }, [env, id]);

  if (err) return <div className="panel p-4 text-[var(--neg)] text-sm">Unavailable: {err}</div>;
  if (!detail) return <div className="panel p-4 text-sm text-[var(--tx-dim)]">Loading…</div>;

  const h = detail.header;
  const src = (h.source ?? {}) as Record<string, string>;
  const approvalStep = ledger?.steps.find((s) => s.step === 'approval');

  return (
    <div className="space-y-4">
      {/* Top of the page, above everything: during an execution this is the control you reach
          for, and it must not require scrolling past a provenance table to find. */}
      <HaltControl env={env} rebalanceId={id} />

      {/* (a) Provenance — what produced this book. Unseen, an audit trail is not real (§3.9). */}
      <div className="panel p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold">
            Rebalance #{h.rebalance_id} · {h.strategy}
          </h2>
          <span className="text-[11px] text-[var(--tx-mut)]">
            signal {h.signal_date} · <b>{h.status}</b> · {fmtUsd(h.sized_equity)} sized equity
          </span>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-[11px]">
          {[
            ['label', src.label], ['price as-of', src.price_asof],
            ['code SHA', src.code_sha], ['frozen', h.proposed_at?.slice(0, 16).replace('T', ' ')],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[var(--tx-dim)]">{k}</dt>
              <dd className="font-mono text-[10px] break-all">{v as string}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* (b) Pre-trade checks, ABOVE anything resembling an approve action (§3.9). */}
      <div className="panel p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-semibold">Pre-trade checks</h2>
          {review && (
            <span className={`text-[11px] ${review.is_stale ? 'text-[var(--amber)]' : 'text-[var(--tx-mut)]'}`}>
              computed {age(review.age_seconds)}
              {review.is_stale && ' — STALE, re-run before approving'}
            </span>
          )}
        </div>

        {review === undefined && <p className="text-[11px] text-[var(--tx-dim)]">Loading…</p>}

        {/* Never render an empty checklist: absence of checks would read as "all clear", which is
            the single most dangerous thing this screen could imply. */}
        {review === null && (
          <div className="text-[12px] text-[var(--tx-mut)]">
            <p className="mb-1">No review has been computed for this rebalance.</p>
            <p className="text-[11px] text-[var(--tx-dim)]">
              A review needs a broker session, so it is computed on the droplet, not by this page:
              <code className="ml-1">python -m jobs.approve_rebalance --rebalance-id {id} --review</code>
            </p>
          </div>
        )}

        {review && (
          <>
            <ul className="space-y-1.5">
              {review.checks.map((c) => {
                const g = CHECK[c.state] ?? CHECK.warn;
                return (
                  <li key={c.name} className="text-[12px]">
                    <div className="flex gap-2">
                      <span className={`${g.cls} font-medium`}>{g.glyph}</span>
                      <span className="w-[168px] shrink-0 text-[var(--tx-mut)]">{c.name}</span>
                      <span className={c.state === 'ok' ? '' : g.cls}>{c.headline}</span>
                    </div>
                    {c.state !== 'ok' && c.detail?.length > 0 && (
                      <div className="ml-[190px] mt-0.5 space-y-0.5">
                        {c.detail.map((d, i) => (
                          <div key={i} className="text-[10px] text-[var(--tx-dim)] font-mono">{d}</div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-[var(--tx-dim)] mt-3">{review.summary}</p>
          </>
        )}
      </div>

      {/* (c) The approval gate — READ-ONLY here. Approving from the web needs the dedicated
          skypilot_approver role (Q2), which lands in a later phase; until then the CLI is the
          gate and the runbook stays authoritative (§3.10). */}
      <div className="panel p-4">
        <h2 className="text-sm font-semibold mb-2">Approval</h2>
        {h.approved_at ? (
          <p className="text-[12px]">
            <span className="text-[var(--pos)]">●</span> approved {h.approved_at.slice(0, 16).replace('T', ' ')} UTC
            by <b>{h.approved_by}</b>
            <span className="text-[var(--tx-dim)]"> (claimed, not authenticated)</span>
          </p>
        ) : h.status === 'cancelled' ? (
          // State the fact from the rebalance row, never a ledger inference: this book was
          // cancelled and no human ever approved it.
          <p className="text-[12px] text-[var(--tx-mut)]">
            — cancelled without approval
          </p>
        ) : (
          <p className="text-[12px] text-[var(--cyan)]">
            ◇ {approvalStep?.detail ?? 'awaiting a human'}
          </p>
        )}
        <p className="text-[10px] text-[var(--tx-dim)] mt-2">
          Approve <b>during the session</b>: outside market hours the broker returns prices that are
          not trade-time, and the quote check above says so rather than pretending otherwise.
        </p>
        {/* The gate itself. Deliberately BELOW the checks — the decision is the last thing on the
            panel, never the first (§3.1: approve by exception). */}
        <ApproveControl
          env={env} rebalanceId={id} review={review ?? null} canApprove={canApprove}
          status={h.status}
          onApproved={() => {
            fetchRebalance(env, id).then(setDetail).catch(() => {});
            fetchLedger(env, id).then(setLedger).catch(() => {});
          }} />
      </div>

      {/* (d) The trade table — collapsed. Nobody checks 186 rows, and a UI that presents them all
          with a button underneath produces false assurance, not diligence (§3.1). */}
      {plan && plan.plan.length > 0 && (
        <div className="panel p-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold">
              Trade plan
              <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--tx-mut)]">
                PREVIEW — recomputed at submission
              </span>
            </h2>
            <button className="chip-btn text-[11px]" onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Hide' : `Show ${plan.summary.n_rows} rows`}
            </button>
          </div>
          <p className="text-[11px] text-[var(--tx-mut)] mt-1">
            {plan.summary.n_trades} trades — {plan.summary.n_buy} buys, {plan.summary.n_sell} sells,
            {' '}{plan.summary.n_dust} dust-filtered · est. gross {fmtUsd(plan.summary.gross_notional)}
          </p>
          {showTable && (
            <div className="overflow-x-auto mt-3 max-h-[520px] overflow-y-auto">
              <table className="dtable w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left">Ticker</th><th className="text-right">Weight</th>
                    <th className="text-right">Now</th><th className="text-right">Target</th>
                    <th className="text-right">Δ</th><th className="text-left">Side</th>
                    <th className="text-right">Price</th><th className="text-left">Src</th>
                    <th className="text-right">Notional</th><th className="text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.plan.map((p) => (
                    <tr key={p.conid}>
                      <td>{p.ticker}</td>
                      <td className="text-right">{(Number(p.weight) * 100).toFixed(2)}%</td>
                      <td className="text-right">{p.current_qty ?? '—'}</td>
                      <td className="text-right">{p.target_qty ?? '—'}</td>
                      <td className="text-right">{p.delta ?? '—'}</td>
                      <td className={p.side === 'BUY' ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}>
                        {p.side ?? ''}
                      </td>
                      <td className="text-right">{p.price ?? '—'}</td>
                      <td className="text-[var(--tx-dim)]">{p.price_src ?? ''}</td>
                      <td className="text-right">{fmtUsd(p.est_notional)}</td>
                      <td className="text-[10px] text-[var(--tx-dim)] max-w-[220px]">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* (e) What actually happened. Renders itself away when there are no orders — a rebalance
          that has not been submitted has no blotter, and an empty table would only ask the reader
          to work out that nothing is wrong. */}
      <BlotterSection env={env} id={id} status={h.status} />

      {/* (f) History — append-only, trigger-written. */}
      <div className="panel p-4">
        <h2 className="text-sm font-semibold mb-2">History</h2>
        <ul className="text-[11px] space-y-1">
          {detail.events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-[var(--tx-dim)] font-mono w-[130px] shrink-0">
                {e.at.slice(0, 16).replace('T', ' ')}
              </span>
              <span>
                {e.from_status ? `${e.from_status} → ` : ''}<b>{e.to_status}</b>
                {e.actor && <span className="text-[var(--tx-mut)]"> by {e.actor}</span>}
                {e.detail && <span className="text-[var(--tx-dim)]"> — {e.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link href={`/trading/${env}/rebalance`}
            className="inline-block text-[11px] underline decoration-dotted underline-offset-2">
        ← all rebalances
      </Link>
    </div>
  );
}
