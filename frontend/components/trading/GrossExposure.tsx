'use client';

import { useEffect, useState } from 'react';
import { fetchGrossExposure, type GrossExposure, type RiskDiagnostic } from '@/lib/trading';
import { GrossDiffFoot, GrossDiffSleeve, ProposedVsLast, useBookDiff } from './BookDiff';

// HOW BIG IS THIS BOOK, AND WHY IS IT THAT SIZE?
//
// The exposures panel above says what the book is betting ON. This says how large the bet is — and
// the part that is genuinely not obvious, what DETERMINED that size. The provoking case: a frozen
// book at gross 1.31 against a design documented as 150/50, with the page silent on the gap.
//
// THE SHAPE IS THE DELIVERABLE, not just the numbers. A reader who does not already know the answer
// has to be able to follow it, so the panel is ordered: the number first, then the chain that
// produced it, each step showing its input and its output. The single most useful thing to take
// away is that GROSS IS AN OUTPUT, not a setting — it is stated in words, not left to be inferred
// from the arithmetic.
//
// REPORT THE CHANGE, NOT THE LEVEL (the pipeline/coverage.py rule). A gross of 0.63 means nothing
// alone: this sleeve ran 1.75–2.0 in 2005–19, when a different constraint was binding. Every
// reading here carries its month-over-month move, the book's own trailing range, and its percentile
// in its own history.

const DOC = '05_risk_optimizer/degrossing_review_2026-07.md';

const SLEEVE_NAME: Record<string, string> = {
  core: 'LO core — S&P 500', sleeve: 'L/S sleeve — R2500',
};

const pct = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 3) =>
  v == null || !isFinite(v) ? '—' : v.toFixed(d);

type HistRow = GrossExposure['sleeves'][0]['history'][number];

/** The size measure for this mandate — see the note at the call site. */
const sizeOf = (h: HistRow, isLS: boolean) => (isLS ? h.gross : (h.active_share ?? 0));

// Sparkline: the size measure and, for the L/S sleeve, cap_calibration — on INDEPENDENT scales,
// over the same months. Together, because the ratchet's effect on the book is only legible against
// time and against the cap driving it. Independent scales because they are different quantities in
// different units; a shared axis would flatten one into a straight line and imply it never moved.
// The cap line is omitted where the cap is static, rather than drawn as a flat line that looks like
// a finding.
function Spark({ rows, isLS }: { rows: HistRow[]; isLS: boolean }) {
  if (rows.length < 3) return null;
  const W = 220, H = 46, P = 3;
  const path = (get: (r: HistRow) => number, color: string, dash?: string) => {
    const vs = rows.map(get);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || 1;
    const d = vs.map((v, i) => {
      const x = P + (i / (vs.length - 1)) * (W - 2 * P);
      const y = H - P - ((v - lo) / span) * (H - 2 * P);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={dash} />;
  };
  return (
    <svg width={W} height={H} className="shrink-0" role="img"
         aria-label={isLS ? 'gross and cap history' : 'active share history'}>
      {path((r) => sizeOf(r, isLS), 'var(--teal)')}
      {isLS && path((r) => r.cap_calibration, 'var(--cyan)', '2 2')}
    </svg>
  );
}

// One link in the chain. `from` is what went in, `value` is what came out — so the panel reads as a
// derivation rather than as a row of unrelated statistics.
function Step({ n, label, from, value, note, emphasis }: {
  n: number; label: string; from: string; value: string; note?: string; emphasis?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-2 text-[11px]">
      <span className="w-[14px] shrink-0 text-[var(--tx-dim)] tabular-nums">{n}</span>
      <span className="w-[120px] shrink-0 text-[var(--tx-mut)]">{label}</span>
      <span className="w-[210px] shrink-0 text-[var(--tx-dim)] font-mono text-[10px]">{from}</span>
      <span className={`w-[76px] shrink-0 text-right tabular-nums ${
        emphasis ? 'font-semibold text-[13px]' : ''}`}>{value}</span>
      {note && <span className="text-[10px] text-[var(--tx-dim)]">{note}</span>}
    </li>
  );
}

// THE CHAIN BRANCHES BY MANDATE, and it has to.
//
// For the L/S sleeve, gross is the size and the derivation is real: budget → spent → vol-per-gross
// → gross. For a LONG-ONLY book, gross is ~1.00 by construction (it is fully invested), so
// σ_eff = pred/gross reduces to pred and "gross = pred ÷ σ_eff" is the identity 1 = 1. Rendering
// that would be a derivation in appearance only — four steps of arithmetic saying nothing. A
// long-only book's size is not its gross, it is how far it sits from its benchmark, so the core
// gets ACTIVE SHARE where the sleeve gets gross.
function Chain({ c, isLS }: { c: RiskDiagnostic; isLS: boolean }) {
  const clipped = c.cap_bound === 'floor' || c.cap_bound === 'ceiling';
  const binds = Math.abs(c.pred_vol / c.vol_budget - 1) < 0.02;
  const budget = (
    <Step n={1} label="Risk budget"
          from={`${isLS ? 'vol target' : 'TE target'} ${pct(c.te_target, 1)} × cap ${num(c.cap_calibration)}`}
          value={pct(c.vol_budget)}
          note={c.cap_bound === 'static' ? 'cap fixed by config' : 'cap set by the W4 estimator'} />
  );
  // The clip gets its own line rather than a footnote: a cap ON a bound means the estimator wanted
  // to go FURTHER and was overruled, which is a materially different state from a cap it chose —
  // and it is precisely the fact nothing surfaced for five months.
  const clip = clipped && (
    <li className="flex items-baseline gap-2 text-[11px]">
      <span className="w-[14px] shrink-0" />
      <span className="text-[var(--amber)]">
        ⚠ the cap is CLIPPED at its {c.cap_bound}{' '}
        ({num(c.cap_bound === 'floor' ? c.cap_lo : c.cap_hi)}) — the estimator wants to go further
        and is being held at the bound.
      </span>
    </li>
  );
  const spent = (
    <Step n={2} label="Risk spent" from={`optimizer solved (${c.status})`} value={pct(c.pred_vol)}
          note={binds ? 'the cap binds — it spends the budget' : 'inside the cap'} />
  );
  const names = (n: number) => (
    <Step n={n} label="Names"
          from={`floor ${pct(c.min_position, 2)} · median position ${pct(c.median_abs_w, 2)}`}
          value={`${c.n_names}`}
          note={`${c.n_long}L${c.n_short ? ` / ${c.n_short}S` : ''}`
            + (c.n_at_floor ? ` · ${c.n_at_floor} at the floor` : '')} />
  );

  return (
    <ol className="mt-2 space-y-1">
      {budget}
      {clip}
      {/* The size on this page is always the published book. On a backfilled row the CHAIN is a
          reconstruction, and saying so is the difference between a number a reviewer can act on
          and one they later discover they could not. */}
      {c.source === 'backfill' && (
        <li className="flex items-baseline gap-2 text-[11px]">
          <span className="w-[14px] shrink-0" />
          <span className="text-[var(--tx-dim)]">
            chain reconstructed — gross and names below are the book as frozen; the budget above is
            from a later re-run of the same config.
          </span>
        </li>
      )}
      {spent}
      {isLS ? (
        <>
          <Step n={3} label="Vol per gross"
                from={`σ_eff = predicted ${pct(c.pred_vol)} ÷ gross ${num(c.gross)}`}
                value={pct(c.sigma_eff)} note="rises as the book holds fewer names" />
          <Step n={4} label="Gross"
                from={`= predicted ${pct(c.pred_vol)} ÷ σ_eff ${pct(c.sigma_eff)}`}
                value={`${num(c.gross)}×`} emphasis />
          {names(5)}
        </>
      ) : (
        <>
          {/* Stated, not derived — a long-only book is fully invested and that is a fact about the
              mandate, not an outcome of the risk budget. Saying so stops a reader hunting for a
              cause of "1.00×" that does not exist. */}
          <Step n={3} label="Gross" from="fully invested — fixed by the mandate"
                value={`${num(c.gross)}×`} />
          {c.active_share != null && (
            <Step n={4} label="Active share" from="½·Σ|w − benchmark| — the size of the actual bet"
                  value={pct(c.active_share, 1)} emphasis />
          )}
          {names(c.active_share != null ? 5 : 4)}
        </>
      )}
    </ol>
  );
}

export function GrossExposureSection({ env, id }: { env: string; id: number }) {
  const [d, setD] = useState<GrossExposure | null>(null);
  // WHAT CHANGES — the right-hand column (BookDiff.tsx). Fetched beside the panel's own data,
  // never blocking it: a diff that fails to load leaves the panel intact and the column empty
  // with its header, not a blank panel.
  const diff = useBookDiff(env, id);

  useEffect(() => { fetchGrossExposure(env, id).then(setD).catch(() => {}); }, [env, id]);
  if (!d || !d.sleeves.length) return null;
  const comp = d.composite;

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">
        Gross exposure
        <span className="ml-2 text-[11px] font-normal text-[var(--tx-mut)]">
          how big this book is, and what decided that
        </span>
        <span className="ml-3 text-[11px] font-normal text-[var(--tx-dim)]">
          · and what changes vs the last frozen book
        </span>
      </h2>
      <ProposedVsLast d={diff}
        core={diff ? <GrossDiffSleeve d={diff} sleeve="core" /> : null}
        sleeve={diff ? <GrossDiffSleeve d={diff} sleeve="sleeve" /> : null}
        foot={diff ? <GrossDiffFoot d={diff} /> : null}
        left={<>

      {/* LEAD WITH THE NUMBER. It comes from the frozen rows, so it is the book being approved —
          not a model book that resembles it. */}
      {comp && (
        <div className="mt-2 flex items-baseline gap-4 flex-wrap">
          <span className="text-[22px] font-semibold tabular-nums">{num(comp.gross)}×</span>
          {/* The leg split IS the answer to the question the number provokes. A book described as
              150/50 that arrives as 115/16 has not shrunk symmetrically — the short side is most of
              what went missing, and total gross alone hides that. */}
          <span className="text-[11px] text-[var(--tx-mut)] tabular-nums">
            gross = <span className="text-[var(--teal)]">{pct(comp.long_gross, 0)} long</span>
            {' + '}
            <span className="text-[var(--amber)]">{pct(comp.short_gross, 0)} short</span>
            {' · '}net {pct(comp.net, 0)} · {comp.n} names ({comp.n_long}L / {comp.n_short}S)
          </span>
          <span className="text-[10px] text-[var(--tx-dim)]">
            the frozen book, {d.signal_date}
          </span>
        </div>
      )}

      {/* THE TAKEAWAY, IN WORDS. It is not obvious and it is the whole point of the panel, so it is
          not left to be inferred from the arithmetic below. */}
      <p className="mt-2 text-[11px] text-[var(--tx-mut)]">
        <b>Gross is an output, not a setting.</b> Nobody picks it. Each sleeve is given a risk
        budget, the optimizer spends that budget, and the gross is whatever size the book had to be
        to spend it. So the way to read a surprising gross is to read the chain that produced it.
      </p>

      {d.sleeves.map((s) => {
        const c = s.current;
        const isLS = s.sleeve === 'sleeve';
        // THE SIZE MEASURE FOLLOWS THE MANDATE. Gross is the size of a long/short book and a
        // constant (1.00) for a fully-invested long-only one — so the core is tracked on active
        // share, the thing that actually moves for it. Quoting a range or a percentile over a
        // constant would not be a small signal, it would be a fabricated one.
        const key = isLS ? 'gross' : 'active_share';
        const label = isLS ? 'gross' : 'active share';
        const cur = c ? (isLS ? c.gross : c.active_share) : null;
        const prv = s.prev ? (isLS ? s.prev.gross : s.prev.active_share) : null;
        const ctx = s.context?.[key] ?? null;
        const fmt = (v: number | null | undefined) => (isLS ? num(v, 2) : pct(v, 0));
        const dPct = cur != null && prv ? (cur / prv - 1) * 100 : null;
        return (
          <div key={s.label} className="mt-4 pt-3 border-t border-[var(--border-soft)]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[12px] font-semibold">{SLEEVE_NAME[s.sleeve] ?? s.sleeve}</span>
              {c && cur != null && (
                <>
                  <span className="text-[11px] tabular-nums">
                    {label} <b>{fmt(cur)}</b>
                    {dPct != null && Math.abs(dPct) >= 0.05 && (
                      <span className={dPct < 0 ? 'text-[var(--neg)]' : 'text-[var(--pos)]'}>
                        {' '}{dPct >= 0 ? '+' : ''}{dPct.toFixed(1)}% MoM
                      </span>
                    )}
                  </span>
                  {/* A LEVEL WITHOUT ITS RANGE IS NOT A READING. */}
                  {ctx && (
                    <span className="text-[10px] text-[var(--tx-dim)] tabular-nums">
                      12m {fmt(ctx.lo12)}–{fmt(ctx.hi12)} ·
                      {' '}all-time {fmt(ctx.lo)}–{fmt(ctx.hi)} ·
                      {' '}p{(ctx.pctile * 100).toFixed(0)} of {ctx.months} months
                    </span>
                  )}
                </>
              )}
              {/* STALENESS IS PART OF THE READING — same rule as Exposures. Diagnostics are written
                  by the monthly run; a sleeve whose newest row predates the signal date describes a
                  DIFFERENT book, and rendering it as current would be worse than showing nothing. */}
              {s.as_of ? (
                <span className={`text-[10px] ${s.is_current
                  ? 'text-[var(--tx-dim)]' : 'text-[var(--amber)]'}`}>
                  as of {String(s.as_of)}
                  {!s.is_current && ` — NOT the ${d.signal_date} book; diagnostics have not been `
                    + 'written for this month yet'}
                </span>
              ) : (
                <span className="text-[10px] text-[var(--amber)]">
                  {s.note ?? 'no risk diagnostics for this book yet'}
                </span>
              )}
            </div>

            {c && (
              <div className="flex flex-wrap gap-x-8 gap-y-2 mt-1 items-start">
                <Chain c={c} isLS={isLS} />
                <div>
                  {/* EACH SERIES IS DRAWN TO ITS OWN SCALE, so each states its own range — bars or
                      lines of comparable size meaning different magnitudes is how a chart lies, and
                      the Exposures panel next door labels its scales for the same reason. */}
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
                    <span className="text-[var(--teal)]">
                      {label} {fmt(Math.min(...s.history.map((h) => sizeOf(h, isLS))))}–
                      {fmt(Math.max(...s.history.map((h) => sizeOf(h, isLS))))}
                    </span>
                    {/* The cap line is drawn only where it MOVES. On a static-cap book it is a
                        flat line at 1.000 pretending to be information. */}
                    {isLS && (
                      <>
                        {' · '}
                        <span className="text-[var(--cyan)]">
                          cap {num(Math.min(...s.history.map((h) => h.cap_calibration)), 2)}–
                          {num(Math.max(...s.history.map((h) => h.cap_calibration)), 2)}
                        </span>
                      </>
                    )}
                    <span className="ml-2 normal-case tracking-normal">
                      {s.history.length}m{isLS ? ', own scales' : ''}
                    </span>
                  </div>
                  <Spark rows={s.history} isLS={isLS} />
                  {/* IS THE SIZE APPROPRIATE? The budget question and the breadth question have
                      different answers (§10.4), so the vol check is shown rather than implied by
                      the chain — a book can be correctly sized on vol and too narrow at once. */}
                  {c.realized_vol_12m != null && (
                    <div className="text-[10px] text-[var(--tx-dim)] mt-1 tabular-nums">
                      realized {pct(c.realized_vol_12m, 1)} (12m)
                      {/* 24m alongside 12m because a 12-observation vol estimate is noisy, and a
                          de-grossing book's own recent months are partly the CONSEQUENCE of the
                          de-grossing — reading the short window as the regime is the trap the
                          review warns about. */}
                      {c.realized_vol_24m != null && ` / ${pct(c.realized_vol_24m, 1)} (24m)`}
                      {' '}vs target {pct(c.te_target, 1)}
                      {c.implied_b != null && ` · implied B ${c.implied_b.toFixed(2)}`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3 space-y-1">
        <div className="text-[10px] text-[var(--tx-dim)]">
          <b>Why the gross drifts.</b> The risk budget is the target times a calibration factor that
          tracks how badly the risk model has been under-predicting this book (implied <b>B</b>
          {' '}above; a B of 1.6 means realized vol ran 1.6× predicted, so the cap is cut to ~1/1.6).
          Separately, the <b>position-size floor</b> stops the optimizer scaling every position down
          proportionally, so a book that must shrink sheds <i>names</i> instead — which costs
          diversification, raises the vol per unit of gross, and shrinks the gross again. That loop
          runs even with the budget held constant.
        </div>
        <div className="text-[10px] text-[var(--tx-dim)]">
          Monitor only — nothing here blocks approval. Full analysis:{' '}
          <span className="font-mono">{DOC}</span>.
        </div>
      </div>
      </>} />
    </div>
  );
}
