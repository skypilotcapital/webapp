'use client';

// Panel 4 — "Who specifically?" The features whose USE earned the most and the least over the trailing
// 12 months, with how loudly the model consulted each beside it. The 2025 reading this panel exists to
// make legible: the loudest feature was the worst contributor while what worked sat far down the
// reliance ranking (shap_reliance_panel.md §9.5).
//
// Correlated sisters (z_rsi_14/20/30, the MACD pair) SPLIT credit between them, so a single feature's
// rank among its sisters is noise — read the family first.

import type { Mover } from '@/lib/modelMonitor';
import { familyColor, monthLabel, signedPct } from '@/lib/modelMonitor';

function Table({ title, rows, onPick }: { title: string; rows: Mover[]; onPick: (f: string) => void }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[var(--tx-dim)] mb-1">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--tx-dim)]">
            <th className="text-left font-semibold py-1">Feature</th>
            <th className="text-right font-semibold">Contribution</th>
            <th className="text-right font-semibold">Attention rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} style={{ borderTop: '1px solid var(--border-soft)' }}>
              <td className="py-1.5">
                <button onClick={() => onPick(r.family)} className="text-left hover:underline">
                  <span className="font-mono text-[12px] text-[var(--tx)]">{r.feature}</span>
                  <span className="text-[11px] ml-1.5" style={{ color: familyColor(r.family) }}>{r.family}</span>
                </button>
              </td>
              <td className="text-right tabular-nums font-semibold"
                  style={{ color: r.contribution_12m >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {signedPct(r.contribution_12m)}
              </td>
              <td className="text-right tabular-nums text-[var(--tx-mut)]">#{r.reliance_rank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NamedFeatures({ movers, nFeatures, withheldNote, onPick }: {
  movers: { asof: string | null; best: Mover[]; worst: Mover[] };
  nFeatures: number;
  withheldNote: string | null;
  onPick: (family: string) => void;
}) {
  return (
    <section className="panel h-full">
      <header className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <h2 className="text-base font-bold text-[var(--tx)]">Who specifically?</h2>
        <p className="text-xs text-[var(--tx-dim)] mt-1">
          {movers.asof
            ? <>Trailing 12 months to {monthLabel(movers.asof)}. Contribution as a share of the month&apos;s
               gross contribution; attention rank out of {nFeatures} this month (#1 = loudest).</>
            : 'Contribution withheld for this model.'}
        </p>
      </header>
      {movers.asof ? (
        <div className="px-5 py-3 space-y-4">
          <Table title="Earned the most" rows={movers.best} onPick={onPick} />
          <Table title="Cost the most" rows={movers.worst} onPick={onPick} />
          <p className="text-[11px] text-[var(--tx-dim)]">
            Correlated sister features split credit, so read the family before the individual feature.
          </p>
        </div>
      ) : (
        <p className="px-5 py-10 text-sm text-[var(--tx-dim)] text-center">{withheldNote}</p>
      )}
    </section>
  );
}
