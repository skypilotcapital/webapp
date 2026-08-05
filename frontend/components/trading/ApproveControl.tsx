'use client';

import { useEffect, useState } from 'react';
import { approveRebalance, type PlanResponse, type Review } from '@/lib/trading';

// THE ONLY DECISION ON THIS SITE. Everything else reports, stops, or re-runs.
//
// It sits directly beneath the pre-trade checks and nowhere else, because what you are ratifying
// is those checks. An approve button on a summary card elsewhere would be the "unexamined approval
// that feels examined" §3.1 is written against — the whole reason approve-by-exception exists.
//
// Two deliberate frictions, and neither is security theatre:
//   * a NAMED person (Q1: recorded, not authenticated — the UI must not overstate it)
//   * a typed word, so the most consequential control on the page cannot be fired by a stray click
//     or a browser autofilling its way through a form
export function ApproveControl({
  env, rebalanceId, review, plan, canApprove, status, onApproved,
}: {
  env: string; rebalanceId: number; review: Review | null; plan: PlanResponse | null;
  canApprove: boolean; status: string; onApproved: () => void;
}) {
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Typed once, not once per rebalance. Q1 wants the name on the record; it does not want it to be
  // a monthly chore that trains people to type "x".
  useEffect(() => { setName(localStorage.getItem('sp.operator') ?? ''); }, []);

  if (status !== 'proposed') return null;

  const blocked =
    !review ? 'No review has been computed — there is nothing to ratify.'
    : review.worst_state === 'fail'
      ? 'A pre-trade check FAILED. Approve from the CLI with --force if you have decided the '
        + 'failure is acceptable, so the full output is in front of you.'
    : review.is_stale
      ? `The review is ${(review.age_seconds / 3600).toFixed(1)} h old. Re-run it against current `
        + 'positions and quotes first — a stale pre-trade check is not a pre-trade check.'
    : !canApprove ? 'This deployment has no approval write path configured.'
    : null;

  const ready = phrase.trim().toLowerCase() === 'approve' && name.trim().length > 1;

  const submit = async () => {
    if (!review) return;
    setBusy(true); setErr(null);
    try {
      localStorage.setItem('sp.operator', name.trim());
      await approveRebalance(env, rebalanceId, name.trim(), review.review_id, 'approve');
      onApproved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-soft)]">
      {/* WHAT YOU ARE APPROVING, stated in words. The screen above proves the book is SOUND; this
          says what it IS. Those are different questions and the page previously answered only the
          first, which left "approve" meaning "the checks were green" rather than "send this." */}
      {review && plan && (
        <div className="mb-3 p-2 rounded bg-[var(--bg)] text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
            You are approving
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span><b>{plan.summary.n_trades}</b> trades</span>
            <span className="text-[var(--pos)]">{plan.summary.n_buy} buys</span>
            <span className="text-[var(--neg)]">{plan.summary.n_sell} sells</span>
            <span>~${Math.round(plan.summary.gross_notional).toLocaleString()} gross</span>
            {review.pct_margin != null && (
              <span>{(Number(review.pct_margin) * 100).toFixed(0)}% projected margin</span>
            )}
            <span className={review.worst_state === 'ok' ? 'text-[var(--pos)]' : 'text-[var(--amber)]'}>
              {review.checks.filter((c) => c.state === 'ok').length}/{review.checks.length} checks clear
            </span>
          </div>
          <p className="text-[10px] text-[var(--tx-dim)] mt-1">
            Approving does not send anything — it marks the book submittable. Share counts are
            recomputed at submission against live quotes, so the preview above is indicative.
          </p>
        </div>
      )}

      {blocked ? (
        <p className="text-[11px] text-[var(--amber)]">⚠ Cannot approve here — {blocked}</p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="your name"
            className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--bg)] w-[130px]"
          />
          <input
            value={phrase} onChange={(e) => setPhrase(e.target.value)}
            placeholder="type: approve" autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }}
            className="px-2 py-1 text-[12px] font-mono rounded border border-[var(--border-soft)] bg-[var(--bg)] w-[130px]"
          />
          <button disabled={busy || !ready} onClick={submit}
                  className="px-3 py-1.5 rounded text-[12px] font-semibold bg-[var(--teal)] text-[#fffdf9] disabled:opacity-35">
            {busy ? 'approving…' : `Approve #${rebalanceId}`}
          </button>

        </div>
      )}

      {err && <p className="text-[11px] text-[var(--neg)] mt-2">{err}</p>}
    </div>
  );
}
