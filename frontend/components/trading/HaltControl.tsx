'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearHalt, fetchHaltState, postHalt, type HaltState } from '@/lib/trading';

// THE METRIC THIS CONTROL IS JUDGED ON IS LATENCY-TO-HALT (IA §3.8), not feature count. So: one
// button, always visible, no navigation, no modal that needs loading. The confirm step is a
// second click on the same button — deliberately not a typed phrase, because the cost of an
// accidental halt is one click to clear it while the cost of a slow one is unbounded.
const ARM_MS = 6000;

export function HaltControl(
  { env, rebalanceId, active = false }: { env: string; rebalanceId?: number; active?: boolean },
) {
  const [state, setState] = useState<HaltState | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(
    () => fetchHaltState(env, rebalanceId).then(setState).catch(() => {}),
    [env, rebalanceId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);   // disarm itself
    return () => clearTimeout(t);
  }, [armed]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); await refresh(); setArmed(false); }
    catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  };

  const halted = state?.halted ?? false;

  // COMPACT UNLESS IT MATTERS. A red HALT block at the top of every page on every day is not
  // vigilance, it is wallpaper — and wallpaper is what you stop seeing on the day it counts. So
  // when nothing is in flight it collapses to a single line; when a halt is set it takes over.
  if (!halted && !active) {
    return (
      <div className="panel px-3 py-1.5 flex items-center gap-3">
        <button disabled={busy || !state?.can_write}
                onClick={() => (armed ? act(() =>
                  postHalt(env, 'web', 'halted from the operations page', rebalanceId))
                  : setArmed(true))}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${armed
                  ? 'bg-[var(--neg)] text-[#fffdf9]'
                  : 'border border-[var(--neg)] text-[var(--neg)]'}`}>
          {busy ? '…' : armed ? 'CONFIRM — stop trading' : '⛔ HALT'}
        </button>
        <span className="text-[10px] text-[var(--tx-dim)]">
          {armed ? 'click again to stop the submitter before its next order'
            : 'nothing is executing · stops the submitter between orders, never cancels working ones'}
        </span>
        <span className="text-[10px] text-[var(--tx-dim)] ml-auto font-mono">
          CLI: jobs.kill_switch --rebalance-id {rebalanceId ?? 'N'}
        </span>
      </div>
    );
  }

  return (
    <div className={`panel p-3 ${halted ? 'border-2 border-[var(--neg)]' : ''}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {halted ? (
          <>
            <span className="px-2 py-1 rounded bg-[var(--neg)] text-[#fffdf9] text-[12px] font-bold">
              ⛔ TRADING HALTED
            </span>
            <span className="text-[11px] text-[var(--tx-mut)]">
              by <b>{state?.active?.set_by}</b>
              <span className="text-[var(--tx-dim)]"> (claimed)</span>
              {' '}via {state?.active?.source} — {state?.active?.reason}
            </span>
            <button className="chip-btn text-[11px] ml-auto" disabled={busy}
                    onClick={() => act(() => clearHalt(env, 'web', rebalanceId))}>
              {busy ? 'clearing…' : 'Clear halt'}
            </button>
          </>
        ) : (
          <>
            <button
              disabled={busy || !state?.can_write}
              onClick={() => (armed
                ? act(() => postHalt(env, 'web', 'halted from the operations page', rebalanceId))
                : setArmed(true))}
              className={`px-3 py-1.5 rounded text-[12px] font-bold ${
                armed ? 'bg-[var(--neg)] text-[#fffdf9]'
                      : 'border-2 border-[var(--neg)] text-[var(--neg)]'}`}>
              {busy ? 'halting…' : armed ? 'CONFIRM — stop trading' : '⛔ HALT'}
            </button>
            <span className="text-[11px] text-[var(--tx-mut)]">
              {armed
                ? 'click again to stop the submitter before its next order'
                : 'stops the submitter between orders. Does not cancel working orders.'}
            </span>
          </>
        )}
      </div>

      {err && <p className="text-[11px] text-[var(--neg)] mt-2">{err}</p>}

      {/* THE WEB CONTROL MUST NEVER BE THE ONLY PATH (§3.8). The frontend is Vercel and the API is
          on the droplet: if the droplet is degraded this button dies at exactly the moment it is
          needed. So the CLI equivalent is printed here, always, not buried in a runbook — and the
          file half is invisible to this page by design, which the reader has to be told rather
          than left to infer from a reassuring "not halted". */}
      <p className="text-[10px] text-[var(--tx-dim)] mt-2 leading-relaxed">
        {!state?.can_write && (
          <span className="text-[var(--amber)]">
            This deployment has no halt write path configured — the button is disabled. </span>
        )}
        Always available, and independent of this page:{' '}
        <code>python -m jobs.kill_switch --rebalance-id {rebalanceId ?? 'N'} --halt-only</code>
        {' '}(add <code>--clear</code> to lift, drop <code>--halt-only</code> to also cancel
        working orders — cancelling is CLI-only). A halt set from the CLI also writes a file flag
        on the droplet that this page cannot see or clear.
      </p>
    </div>
  );
}
