'use client';

import { useState } from 'react';
import { executeRebalance } from '@/lib/trading';

// THE ONLY CONTROL ON THIS SITE THAT CAN MOVE MONEY. Everything else reports, decides, or stops.
//
// Two secrets, because they prove different things (and neither is the real protection):
//   * the PHRASE proves intent, and carries the rebalance id so muscle memory cannot fire on the
//     wrong book — you cannot type "execute 5" while looking at #6
//   * the PASSCODE proves authority. The site is behind one shared login, so having this page open
//     is not evidence of who is clicking
// The real protection is that this cannot execute anything: it queues a request, and the droplet
// worker re-reads the database and refuses unless the book is approved and nothing is halted.
export function ExecuteControl({
  env, rebalanceId, status, canExecute, onQueued,
}: {
  env: string; rebalanceId: number; status: string; canExecute: boolean; onQueued: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);

  // Only an APPROVED book can be executed, so the control does not exist before then. A disabled
  // execute button sitting under an unapproved book is an invitation to look for the way around it.
  if (status !== 'approved') return null;

  const want = `execute ${rebalanceId}`;
  const ready = phrase.trim().toLowerCase() === want && passcode.length > 0 && name.trim().length > 1;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await executeRebalance(env, rebalanceId, name.trim(), phrase.trim(), passcode);
      setQueued(r.request_id);
      setPasscode('');
      onQueued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (queued) {
    return (
      <div className="panel p-4 border-2 border-[var(--amber)]">
        <p className="text-[13px] font-semibold text-[var(--amber)]">
          Execution queued (request #{queued})
        </p>
        <p className="text-[11px] text-[var(--tx-mut)] mt-1">
          The worker picks it up within a minute, re-checks that the book is approved and unhalted,
          then submits in waves with a measured margin check between them. Watch the blotter below.
          <b> HALT is at the top of this page</b> and stops it between any two orders.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4 border-2 border-[var(--neg)]">
      <h2 className="text-sm font-semibold text-[var(--neg)]">Execute — this sends real orders</h2>
      <p className="text-[11px] text-[var(--tx-mut)] mt-1 mb-3">
        Paper account, simulated fills. It queues the submission; it does not run in your browser,
        so closing this tab cannot leave a half-sent basket.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your name"
               className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--bg)] w-[130px]" />
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)}
               placeholder={`type: ${want}`}
               className="px-2 py-1 text-[12px] font-mono rounded border border-[var(--border-soft)] bg-[var(--bg)] w-[150px]" />
        <input value={passcode} onChange={(e) => setPasscode(e.target.value)}
               type="password" placeholder="execution passcode" autoComplete="off"
               className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--bg)] w-[170px]" />
        <button disabled={!ready || busy || !canExecute} onClick={submit}
                className="px-3 py-1.5 rounded text-[12px] font-bold bg-[var(--neg)] text-[#fffdf9] disabled:opacity-35">
          {busy ? 'queueing…' : 'SUBMIT ORDERS'}
        </button>
      </div>

      {/* Say which condition is unmet, rather than leaving a dead button and no explanation. */}
      {!canExecute && (
        <p className="text-[11px] text-[var(--amber)] mt-2">
          Execution from the web is not configured on this deployment — run it from the terminal.
        </p>
      )}
      {err && <p className="text-[11px] text-[var(--neg)] mt-2">{err}</p>}

      <p className="text-[10px] text-[var(--tx-dim)] mt-3">
        Always available and independent of this page:{' '}
        <code>cd /root/trading &amp;&amp; .venv/bin/python run_rebalance.py --rebalance-id
        {' '}{rebalanceId} --execute</code>. Safely re-runnable either way — a repeat sends only
        what has not gone out, keyed on the cOID.
      </p>
    </div>
  );
}
