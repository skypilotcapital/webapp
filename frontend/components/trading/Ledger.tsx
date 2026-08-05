'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchLedger, fetchRunRequests, requestRun,
  type Ledger, type LedgerStep, type RunRequestRow, type StepState,
} from '@/lib/trading';

// FOUR STATES, NOT TWO (IA §3.7 rule b). "Not due yet" must not look like "ok", and neither may
// look like "failed" — collapsing them is precisely how a job reported success for months while
// its data rotted. Two more exist because the honest answer was neither:
//   unbuilt   — nothing will ever write this until [10-P4] lands
//   no_record — it demonstrably ran, before its telemetry existed
// Every one gets its own glyph, colour AND word: colour alone fails anyone who cannot see it,
// and on an operations screen that is not an acceptable way to lose a state.
const STATE: Record<StepState, { glyph: string; cls: string; word: string }> = {
  ok:        { glyph: '●', cls: 'text-[var(--pos)]',     word: 'ok' },
  warn:      { glyph: '▲', cls: 'text-[var(--amber)]',   word: 'warn' },
  failed:    { glyph: '■', cls: 'text-[var(--neg)]',     word: 'failed' },
  running:   { glyph: '◐', cls: 'text-[var(--cyan)]',    word: 'running' },
  awaiting:  { glyph: '◇', cls: 'text-[var(--cyan)]',    word: 'awaiting you' },
  not_due:   { glyph: '·', cls: 'text-[var(--tx-dim)]',  word: 'not due' },
  no_record: { glyph: '?', cls: 'text-[var(--tx-mut)]',  word: 'no record' },
  unbuilt:   { glyph: '–', cls: 'text-[var(--tx-dim)]',  word: 'not built' },
};

const ACTS: Record<string, string> = {
  data: 'Data', targets: 'Targets', orders: 'Orders', record: 'Record',
};

function when(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function scheduleText(s: LedgerStep): string {
  if (s.chained) return 'chained';
  if (!s.scheduled?.length) return s.manual_only ? 'manual (always)' : 'not scheduled';
  return s.scheduled.map((j) => j.schedule).join(' · ');
}

export function LedgerTable({ env }: { env: string }) {
  const [data, setData] = useState<Ledger | null>(null);
  const [runs, setRuns] = useState<RunRequestRow[]>([]);
  const [triggerable, setTriggerable] = useState<string[]>([]);
  const [canRequest, setCanRequest] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchLedger(env).then(setData).catch((e) => setErr(String(e)));
    fetchRunRequests(env).then((d) => {
      setRuns(d.requests); setTriggerable(d.triggerable); setCanRequest(d.can_request);
    }).catch(() => {});
  }, [env]);

  useEffect(() => { load(); }, [load]);

  // Poll while anything is in flight — a queued request is picked up by the droplet worker within
  // a minute, and a page that needed a manual refresh to show that would send people to the
  // terminal to find out, which defeats the purpose.
  const inFlight = runs.some((r) => r.status === 'queued' || r.status === 'running');
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [inFlight, load]);

  const trigger = async (step: string) => {
    setPending(step); setRunErr(null);
    try {
      await requestRun(env, step, 'web', data?.rebalance?.rebalance_id);
      load();
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally { setPending(null); }
  };

  if (err) return <div className="panel p-4 text-[var(--neg)] text-sm">Ledger unavailable: {err}</div>;
  if (!data) return <div className="panel p-4 text-sm text-[var(--tx-dim)]">Loading…</div>;

  const r = data.rebalance;
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold">Where are we in this month&apos;s rebalance?</h2>
          {r ? (
            <p className="text-[11px] text-[var(--tx-mut)] mt-0.5">
              <Link href={`/trading/${env}/rebalance/${r.rebalance_id}`}
                    className="underline decoration-dotted underline-offset-2">
                #{r.rebalance_id}
              </Link>{' '}
              {r.strategy} · signal {r.signal_date} · <b>{r.status}</b>
            </p>
          ) : (
            <p className="text-[11px] text-[var(--tx-mut)] mt-0.5">No open rebalance.</p>
          )}
        </div>
        {/* The mirror's OWN staleness. A schedule table that silently stopped refreshing is the
            reassuring-but-wrong artifact rule (a) is about, so it does not get to hide. */}
        <div className="text-[10px] text-[var(--tx-dim)] text-right">
          schedule mirrored from systemd + crontab<br />
          {data.schedule_collected_at ? when(data.schedule_collected_at) : 'never collected'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="dtable w-full text-[12px] table-fixed">
          <thead>
            <tr>
              <th className="text-left w-[190px]">Step</th>
              <th className="text-left w-[92px]">Mode</th>
              <th className="text-left w-[140px]">Scheduled</th>
              <th className="text-left w-[120px]">Ran</th>
              <th className="text-left w-[110px]">Status</th>
              <th className="text-left">Notes</th>
              <th className="text-left w-[80px]">Run</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((s, i) => {
              const st = STATE[s.state] ?? STATE.not_due;
              const newAct = i === 0 || data.steps[i - 1].act !== s.act;
              return (
                <tr key={s.step} className={newAct ? 'border-t border-[var(--border-soft)]' : ''}>
                  <td className="whitespace-nowrap">
                    {newAct && (
                      <div className="text-[9px] uppercase tracking-wider text-[var(--tx-dim)] pt-1">
                        {ACTS[s.act] ?? s.act}
                      </div>
                    )}
                    <span className="text-[var(--tx-dim)] mr-1.5">{s.ord}.</span>{s.label}
                  </td>
                  <td className="whitespace-nowrap text-[var(--tx-mut)]">
                    {s.mode}
                    {s.manual_only && (
                      <span className="ml-1 text-[9px] text-[var(--tx-dim)]" title="the human gate — manual forever">
                        (always)
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[var(--tx-mut)] font-mono text-[11px]">
                    {scheduleText(s)}
                  </td>
                  <td className="whitespace-nowrap text-[var(--tx-mut)]">{when(s.ran_at)}</td>
                  <td className={`whitespace-nowrap font-medium ${st.cls}`}>
                    <span className="mr-1">{st.glyph}</span>{st.word}
                  </td>
                  <td className="text-[11px] text-[var(--tx-dim)] max-w-[300px]">
                    <div className="truncate" title={s.detail || s.notes || ''}>
                      {s.detail || (s.state === 'unbuilt' ? s.notes : '')}
                    </div>
                  </td>
                  {/* THE WEBSITE REQUESTS, IT NEVER RUNS (§3.10). This writes an intent row; the
                      droplet worker executes it within a minute. The button stays here forever,
                      including after the step is scheduled — at which point it BECOMES the retry
                      and override path, i.e. by definition the thing you reach for when something
                      has already gone wrong, so it must be the best-tested path in the system. */}
                  <td className="whitespace-nowrap">
                    {(() => {
                      const live = runs.find(
                        (r) => r.step === s.step
                          && (r.status === 'queued' || r.status === 'running'));
                      if (live) {
                        return <span className="text-[10px] text-[var(--cyan)]">
                          {live.status}…
                        </span>;
                      }
                      if (!triggerable.includes(s.step)) {
                        // No button, by design. So say WHY and give the command — an unexplained
                        // dash on the execution row is the least helpful thing this page could do.
                        return <span className="text-[10px] text-[var(--tx-dim)]"
                                     title={s.manual_only
                                       ? 'the human gate — it has its own control'
                                       : 'runs from the terminal by design'}>
                          {s.step === 'execution' ? 'terminal only' : '—'}
                        </span>;
                      }
                      return (
                        <button className="chip-btn text-[10px]"
                                disabled={!canRequest || pending === s.step}
                                onClick={() => trigger(s.step)}>
                          {pending === s.step ? '…' : 'run'}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {runErr && <p className="text-[11px] text-[var(--neg)] mt-2">{runErr}</p>}

      {/* THE COMMANDS, IN CYCLE ORDER. §3.10 requires every step keep a documented CLI equivalent;
          a runbook you have to go and find is one you will not have open at 11:30 with the market
          open. Execution has no button on purpose — this is how you run it. */}
      <details className="mt-3">
        <summary className="text-[11px] text-[var(--tx-mut)] cursor-pointer">
          Run any step from the terminal — including <b>execution</b>, which has no button by design
        </summary>
        <div className="mt-2 text-[10px] font-mono space-y-1">
          <div className="text-[var(--tx-dim)]">ssh -i ~/.ssh/id_personal root@165.22.47.36</div>
          {data.steps.filter((s) => s.manual_cmd).map((s) => (
            <div key={s.step} className="flex gap-2">
              <span className="w-[104px] shrink-0 text-[var(--tx-dim)]">{s.step}</span>
              <span className={s.step === 'execution'
                ? 'text-[var(--neg)] font-semibold' : 'text-[var(--tx-mut)]'}>{s.manual_cmd}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--tx-dim)] mt-2">
          Execution requires the rebalance to be <b>approved</b> and is safely re-runnable — a
          repeat sends only what has not gone out, keyed on the cOID. Open a{' '}
          <b>second SSH session</b> before you start it, with the kill switch already typed:
          recalling an exact command under stress is the failure mode.
        </p>
      </details>

      {runs.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-[var(--tx-mut)] cursor-pointer">
            Recent run requests ({runs.length}) — who asked for what
          </summary>
          <ul className="mt-1 space-y-0.5">
            {runs.slice(0, 8).map((r) => (
              <li key={r.request_id} className="text-[10px] font-mono text-[var(--tx-dim)]">
                #{r.request_id} {r.step} · {r.status} · by {r.requested_by} ({r.source})
                {r.result ? ` — ${r.result.split('\n')[0].slice(0, 70)}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[10px] text-[var(--tx-dim)] mt-3 leading-relaxed">
        Step order and manual-by-nature flags come from <code>trading.cycle_steps</code>; the
        schedule is mirrored hourly from the real systemd timers and crontab — never a copy
        maintained here. <b>no record</b> means the step ran before it had telemetry, not that it
        did not happen; <b>not built</b> means nothing will write it yet.
      </p>
    </div>
  );
}
