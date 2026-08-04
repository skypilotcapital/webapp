'use client';

import { useState } from 'react';
import { approveRebalance, type Review } from '@/lib/trading';

// THE ONLY DECISION ON THIS SITE. Everything else in Trading reports; this commits a human to a
// book. So the control is deliberately narrow: it ratifies the review shown ABOVE it, it names
// what it read, and it can do strictly less than the CLI.
//
// What it cannot do, and why:
//   * override a FAILED check — that judgement belongs in the terminal with the full output in
//     front of you, not behind a button (the server refuses too; this just does not offer it)
//   * submit — approval marks the book submittable, execution is a separate deliberate action
//   * approve a stale review — the server refuses past 4h, and this says so before you click
export function ApproveControl({
  env, rebalanceId, review, canApprove, status, onApproved,
}: {
  env: string; rebalanceId: number; review: Review | null;
  canApprove: boolean; status: string; onApproved: () => void;
}) {
  const [name, setName] = useState('');
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const submit = async () => {
    if (!review) return;
    setBusy(true); setErr(null);
    try {
      await approveRebalance(env, rebalanceId, name.trim(), review.review_id);
      onApproved();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setArmed(false);
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-soft)]">
      {blocked ? (
        <p className="text-[11px] text-[var(--amber)]">⚠ Cannot approve here — {blocked}</p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={name} onChange={(e) => { setName(e.target.value); setArmed(false); }}
            placeholder="your name"
            className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--bg)]"
          />
          <button
            disabled={busy || name.trim().length < 2}
            onClick={() => (armed ? submit() : setArmed(true))}
            className={`px-3 py-1.5 rounded text-[12px] font-semibold disabled:opacity-40 ${
              armed ? 'bg-[var(--teal)] text-[#fffdf9]'
                    : 'border border-[var(--teal)] text-[var(--teal)]'}`}>
            {busy ? 'approving…'
              : armed ? `CONFIRM — approve #${rebalanceId} against review #${review!.review_id}`
              : 'Approve'}
          </button>
          {/* Q1, verbatim in the UI: this name is recorded, not verified, and the doc requires the
              interface not to overstate it. A paper-era record must never later read as audited. */}
          <span className="text-[10px] text-[var(--tx-dim)]">
            recorded, not authenticated — the site is behind one shared passcode
          </span>
        </div>
      )}

      {err && <p className="text-[11px] text-[var(--neg)] mt-2">{err}</p>}

      <p className="text-[10px] text-[var(--tx-dim)] mt-2">
        Approving marks the book submittable. It sends nothing — execution is a separate action and
        stays on the CLI:{' '}
        <code>python run_rebalance.py --rebalance-id {rebalanceId} --execute</code>
      </p>
    </div>
  );
}
