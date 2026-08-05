'use client';

import { useEffect, useState } from 'react';
import {
  fetchTradability, repairRebalance,
  type Tradability, type TradabilityName,
} from '@/lib/trading';

// THE PANEL THAT WOULD HAVE CAUGHT EA ([10-TRAD] / [10-CAEX]).
//
// On 2026-08-05 Electronic Arts was taken private between the freeze and the trade of rebalance 5.
// It sat in an APPROVED book as a 51-share / ~$10.7k buy with no bid, no ask and a previous-close
// marker, and every screen showed a clean 186-name book. The failure was visibility, not money.
//
// TWO DESIGN RULES, both from corporate_actions_policy.md:
//
// 1. REPORT THE OBSERVATION, NEVER THE CLASSIFICATION (§5). This panel may say "EA has no
//    two-sided market and is priced at previous close". It may NOT say "EA was acquired". We do
//    not assert a corporate action we have not confirmed — naming the event is the weekly report's
//    job, once Sharadar carries it. That is exactly what lets this be built on a signal which
//    cannot tell you WHY.
//
// 2. WEIGHT AND NOTIONAL PER NAME, NOT A COUNT (§3). The tiers treat a 1% name and a 6% name
//    completely differently, so "2 names flagged" is not a number anyone can act on.
//
// ⚠️ No bid/ask/last is rendered here and none is sent by the API — IBKR market data is licensed
// for internal use only (ibkr_data_ingestion_spec.md §8). The status is our own assessment.
export function TradabilityPanel({
  env, rebalanceId, status, canRequest, onQueued,
}: {
  env: string; rebalanceId: number; status: string; canRequest: boolean; onQueued: () => void;
}) {
  const [data, setData] = useState<Tradability | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetchTradability(env, rebalanceId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [env, rebalanceId]);

  if (err) {
    return (
      <div className="panel p-4">
        <h2 className="text-sm font-semibold">Tradability</h2>
        <p className="text-[11px] text-[var(--neg)] mt-1">Could not load: {err}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel p-4">
        <h2 className="text-sm font-semibold">Tradability</h2>
        <p className="text-[11px] text-[var(--tx-dim)] mt-1">checking…</p>
      </div>
    );
  }

  // Three states, not two. "We have never captured a quote" is not "everything is fine", and
  // rendering them the same way is the failure this panel exists to prevent.
  if (data.state === 'no_data') {
    return (
      <div className="panel p-4 border-l-4 border-[var(--amber)]">
        <h2 className="text-sm font-semibold text-[var(--amber)]">Tradability — unknown</h2>
        <p className="text-[11px] text-[var(--tx-mut)] mt-1">{data.note}</p>
      </div>
    );
  }

  if (data.state === 'clear') {
    return (
      <div className="panel p-4 border-l-4 border-[var(--pos)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--pos)]">
            Tradability — all {data.n_names} targets quote
          </h2>
          <span className="text-[10px] text-[var(--tx-dim)]">
            {data.captures_examined} captures, latest {fmtTs(data.as_of)}
          </span>
        </div>
      </div>
    );
  }

  const tier = tierOf(data.weight_flagged);

  return (
    <div className="panel p-4 border-2 border-[var(--neg)]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[var(--neg)]">
          {data.n_flagged} target{data.n_flagged === 1 ? '' : 's'} cannot be traded
        </h2>
        <span className="text-[10px] text-[var(--tx-dim)]">
          {data.captures_examined} captures, latest {fmtTs(data.as_of)}
        </span>
      </div>

      <p className="text-[11px] text-[var(--tx-mut)] mt-1">
        {pct(data.weight_flagged)} of gross · {usd(data.notional_flagged)} at the sized equity.
        {' '}<b>{tier.label}</b> — {tier.advice}
      </p>

      <table className="dtable mt-3 w-full">
        <thead>
          <tr>
            <th className="text-left">Name</th>
            <th className="text-left">Side</th>
            <th className="text-right">Weight</th>
            <th className="text-right">Notional</th>
            <th className="text-right">Seen</th>
            <th className="text-left">Observation</th>
          </tr>
        </thead>
        <tbody>
          {data.names.map((n) => <Row key={n.isin} n={n} />)}
        </tbody>
      </table>

      <p className="text-[10px] text-[var(--tx-dim)] mt-2">
        What we observe, not what we conclude — we do not assert a corporate action we have not
        confirmed. The actions feed lags by up to a week and would not have caught this.
        {' '}<b>Seen</b> = consecutive captures with no live quote; 1 is often a thin market, 2+ is
        a halt or a delisting.
      </p>

      {/* The repair control only exists while there is still a book to repair. */}
      {!['cancelled', 'closed', 'reconciled'].includes(status) && (
        open
          ? <RepairForm env={env} rebalanceId={rebalanceId} flagged={data.names}
                        canRequest={canRequest} onQueued={onQueued}
                        onCancel={() => setOpen(false)} />
          : (
            <button onClick={() => setOpen(true)}
                    className="mt-3 px-3 py-1.5 rounded text-[12px] font-semibold bg-[var(--neg)] text-[#fffdf9]">
              Repair this book — exclude and re-freeze
            </button>
          )
      )}
    </div>
  );
}

function Row({ n }: { n: TradabilityName }) {
  return (
    <tr>
      <td className="font-mono">{n.ticker ?? n.isin}</td>
      <td className={n.side === 'short' ? 'text-[var(--neg)]' : ''}>{n.side}</td>
      <td className="text-right tabular-nums">{pct(Math.abs(n.weight))}</td>
      <td className="text-right tabular-nums">{usd(n.notional)}</td>
      <td className="text-right tabular-nums">
        {n.consecutive >= 2
          ? <b className="text-[var(--neg)]">{n.consecutive}×</b>
          : `${n.consecutive}×`}
      </td>
      <td className="text-[var(--tx-mut)]">{n.why}</td>
    </tr>
  );
}

// The materiality tiers, stated as guidance and never as an automatic action. §3 is explicit that
// "the tier boundaries are judgement, not arithmetic" — a 1.5% name that is half the book's
// exposure to a theme is not a Tier 1 event just because it is under the threshold. So this
// suggests; it does not preselect a method or disable an option.
function tierOf(w: number) {
  if (w <= 0.02) {
    return { label: 'Tier 1 territory',
             advice: 'small enough to drop the line — the weight simply stays uninvested.' };
  }
  return { label: 'Tier 2 territory',
           advice: 'material — pro-rata may not be a good enough approximation; consider re-running '
                 + 'construction with the name excluded.' };
}

function RepairForm({
  env, rebalanceId, flagged, canRequest, onQueued, onCancel,
}: {
  env: string; rebalanceId: number; flagged: TradabilityName[];
  canRequest: boolean; onQueued: () => void; onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(flagged.map((f) => f.ticker));
  const [method, setMethod] = useState<'drop' | 'prorata' | ''>('');
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => { setName(localStorage.getItem('sp.operator') ?? ''); }, []);

  const ready = picked.length > 0 && method !== '' && reason.trim().length > 2
    && name.trim().length > 1 && phrase.trim().toLowerCase() === `repair ${rebalanceId}`;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      localStorage.setItem('sp.operator', name.trim());
      const r = await repairRebalance(env, rebalanceId, name.trim(), phrase.trim(),
                                      picked, method as 'drop' | 'prorata', reason.trim());
      setQueued(r.request_id);
      onQueued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (queued) {
    return (
      <div className="mt-3 p-3 rounded border-2 border-[var(--amber)]">
        <p className="text-[13px] font-semibold text-[var(--amber)]">
          Repair queued (request #{queued})
        </p>
        <p className="text-[11px] text-[var(--tx-mut)] mt-1">
          The worker cancels this book and freezes its replacement in one transaction, at the
          <b> same signal date and price as-of</b>. It re-checks the position-cap and sector gates
          and <b>refuses if the repaired book breaches something the original respected</b> — there
          is no override from the web. The replacement comes back as <b>proposed</b> and must be
          approved again.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded border border-[var(--border-soft)] bg-[var(--bg)]">
      <h3 className="text-[13px] font-semibold">Repair — exclude and re-freeze</h3>
      <p className="text-[11px] text-[var(--tx-mut)] mt-1 mb-3">
        Removes the names below and re-freezes at the <b>same signal date and price as-of</b>. This
        is a repair, not a re-decision: no fresher data is read and no signal is recomputed.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {flagged.map((f) => {
          const on = picked.includes(f.ticker);
          return (
            <button key={f.isin}
                    onClick={() => setPicked(on ? picked.filter((t) => t !== f.ticker)
                                                : [...picked, f.ticker])}
                    className={`px-2 py-1 rounded text-[11px] font-mono border ${
                      on ? 'bg-[var(--neg)] text-[#fffdf9] border-[var(--neg)]'
                         : 'border-[var(--border-soft)] text-[var(--tx-mut)]'}`}>
              {on ? '✓ ' : ''}{f.ticker} {pct(Math.abs(f.weight))}
            </button>
          );
        })}
      </div>

      {/* NO DEFAULT METHOD. The two produce different books and the choice is the operator's —
          corporate_actions_policy.md §3 requires it be explicitly chosen, not defaulted. */}
      <fieldset className="mb-3">
        <legend className="text-[11px] font-semibold mb-1">What happens to the weight?</legend>
        <label className="flex gap-2 items-start text-[11px] mb-1.5 cursor-pointer">
          <input type="radio" name="m" checked={method === 'drop'}
                 onChange={() => setMethod('drop')} className="mt-0.5" />
          <span>
            <b>Drop the line</b> (Tier 1) — the weight stays uninvested and net falls by it.
            Nothing else moves, so no constraint can be breached.
          </span>
        </label>
        <label className="flex gap-2 items-start text-[11px] cursor-pointer">
          <input type="radio" name="m" checked={method === 'prorata'}
                 onChange={() => setMethod('prorata')} className="mt-0.5" />
          <span>
            <b>Redistribute pro-rata</b> (Tier 1.5) — spread across the same mandate and side, so
            gross and net are preserved. Scales other positions up, so the cap and sector gates
            are re-checked and can refuse.
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder="reason (permanent record)"
               className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--panel)] flex-1 min-w-[200px]" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your name"
               className="px-2 py-1 text-[12px] rounded border border-[var(--border-soft)] bg-[var(--panel)] w-[120px]" />
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)}
               placeholder={`type: repair ${rebalanceId}`} autoComplete="off"
               className="px-2 py-1 text-[12px] font-mono rounded border border-[var(--border-soft)] bg-[var(--panel)] w-[140px]" />
        <button disabled={!ready || busy || !canRequest} onClick={submit}
                className="px-3 py-1.5 rounded text-[12px] font-bold bg-[var(--neg)] text-[#fffdf9] disabled:opacity-35">
          {busy ? 'queueing…' : 'QUEUE REPAIR'}
        </button>
        <button onClick={onCancel}
                className="px-2 py-1.5 rounded text-[12px] text-[var(--tx-mut)]">cancel</button>
      </div>

      {!canRequest && (
        <p className="text-[11px] text-[var(--amber)] mt-2">
          The run-request path is not configured on this deployment — run it from the terminal.
        </p>
      )}
      {err && <p className="text-[11px] text-[var(--neg)] mt-2">{err}</p>}

      <p className="text-[10px] text-[var(--tx-dim)] mt-3">
        Equivalent, and always available if this page is not:{' '}
        <code>python -m jobs.freeze_targets --repair-of {rebalanceId} --exclude{' '}
        {picked.join(' ') || 'TICKER'} --on-exclude {method || '{drop|prorata}'}{' '}
        --exclude-reason &quot;…&quot;</code>
      </p>
    </div>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const usd = (x: number) =>
  `$${Math.round(x).toLocaleString('en-US')}`;
const fmtTs = (s: string | null) =>
  s ? new Date(s).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
