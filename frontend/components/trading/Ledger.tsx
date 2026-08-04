'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchLedger, type Ledger, type LedgerStep, type StepState } from '@/lib/trading';

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
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchLedger(env).then(setData).catch((e) => setErr(String(e)));
  }, [env]);

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
        <table className="dtable w-full text-[12px]">
          <thead>
            <tr>
              <th className="text-left">Step</th>
              <th className="text-left">Mode</th>
              <th className="text-left">Scheduled</th>
              <th className="text-left">Ran</th>
              <th className="text-left">Status</th>
              <th className="text-left">Notes</th>
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
                  <td className="text-[11px] text-[var(--tx-dim)] max-w-[380px]">
                    {s.detail || (s.state === 'unbuilt' ? s.notes : '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--tx-dim)] mt-3 leading-relaxed">
        Step order and manual-by-nature flags come from <code>trading.cycle_steps</code>; the
        schedule is mirrored hourly from the real systemd timers and crontab — never a copy
        maintained here. <b>no record</b> means the step ran before it had telemetry, not that it
        did not happen; <b>not built</b> means nothing will write it yet.
      </p>
    </div>
  );
}
