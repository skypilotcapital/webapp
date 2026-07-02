'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchMacroBetaSpells } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { SpellRow, Universe } from '@/types/macroBeta';

const VERDICT_META: Record<SpellRow['verdict'], { label: string; cls: string }> = {
  episode: {
    label: 'Episode',
    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  },
  partial: {
    label: 'Partial',
    cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
  false_alarm: {
    label: 'False alarm',
    cls: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
  },
};

const TRIGGER_LABEL: Record<string, string> = {
  cycle: 'cycle vote',
  credit_force: 'credit force',
  correction: 'correction',
};

export function FalseAlarmLedger({ universe }: { universe: Universe }) {
  const { data, error, isLoading } = useSWR(['macro-beta-spells', universe], () =>
    fetchMacroBetaSpells(universe)
  );
  const [showAll, setShowAll] = useState(false);

  const summary = useMemo(() => {
    const fa = (data ?? []).filter((s) => s.verdict === 'false_alarm');
    return {
      n: fa.length,
      days: fa.reduce((a, s) => a + s.days, 0),
      costPp: fa.reduce((a, s) => a + (s.mkt_xs_pp ?? 0), 0),
      total: (data ?? []).length,
    };
  }, [data]);

  const rows = useMemo(() => {
    const all = data ?? [];
    return showAll ? all : all.filter((s) => s.verdict === 'false_alarm');
  }, [data, showAll]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
              False-Alarm Ledger
            </h2>
            <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
              The mirror of the report card: every defense spell that had <b>zero overlap</b>{' '}
              with a drawdown episode — insurance paid in good weather. This is the cost side
              of the signal, shown in full. Positive market return during a spell = upside a
              dialed portfolio would have given up.
            </p>
          </div>
          <button
            onClick={() => setShowAll(!showAll)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border shrink-0 ${
              showAll
                ? 'bg-indigo-500 text-white border-indigo-500'
                : 'bg-transparent text-[var(--tx-mut,#64748b)] border-[var(--border-soft,#e2e8f0)] hover:border-[var(--tx-dim,#94a3b8)]'
            }`}
          >
            {showAll ? 'Showing all spells' : 'Show all spells'}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading ledger…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load ledger.</p>}
        {data && (
          <>
            <div className="flex flex-wrap gap-6 mb-4 text-sm">
              <p className="text-[var(--tx-mut,#64748b)]">
                False alarms:{' '}
                <b className="text-[var(--tx,#1e293b)]">{summary.n}</b> of {summary.total}{' '}
                spells
              </p>
              <p className="text-[var(--tx-mut,#64748b)]">
                Days in false alarm:{' '}
                <b className="text-[var(--tx,#1e293b)]">{summary.days.toLocaleString()}</b>
              </p>
              <p className="text-[var(--tx-mut,#64748b)]">
                Cumulative market excess missed:{' '}
                <b className="text-rose-500">+{summary.costPp.toFixed(0)}pp</b>{' '}
                <span className="text-xs">(≈ half of that is the give-up at a 0.5 dial)</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--tx-dim,#94a3b8)] border-b border-[var(--border-soft,#e2e8f0)]">
                    <th className="py-2 pr-4 font-bold">Start</th>
                    <th className="py-2 pr-4 font-bold">End</th>
                    <th className="py-2 pr-4 font-bold text-right">Length</th>
                    <th className="py-2 pr-4 font-bold">Verdict</th>
                    <th className="py-2 pr-4 font-bold">Entered via</th>
                    <th className="py-2 pr-4 font-bold text-right">Episode overlap</th>
                    <th className="py-2 pr-0 font-bold text-right">Market during spell</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const meta = VERDICT_META[s.verdict];
                    const ret = s.mkt_return_during;
                    return (
                      <tr key={s.start_date} className="border-b border-[var(--border-soft,#f1f5f9)] last:border-0">
                        <td className="py-2.5 pr-4 font-semibold text-[var(--tx,#334155)]">
                          {s.start_date}
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--tx-mut,#475569)]">
                          {s.end_date}
                          {s.ongoing && (
                            <span className="ml-2 text-xs text-amber-500 font-bold">ongoing</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[var(--tx-mut,#475569)]">
                          {s.days}d
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--tx-mut,#475569)]">
                          {s.entry_trigger ? TRIGGER_LABEL[s.entry_trigger] ?? s.entry_trigger : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[var(--tx-mut,#475569)]">
                          {(s.episode_overlap * 100).toFixed(0)}%
                        </td>
                        <td
                          className={`py-2.5 pr-0 text-right font-bold ${
                            ret == null
                              ? 'text-[var(--tx-dim,#94a3b8)]'
                              : ret > 0
                                ? 'text-rose-500'
                                : 'text-emerald-500'
                          }`}
                          title="For false alarms, a positive market return is the premium paid"
                        >
                          {ret == null ? '—' : `${ret >= 0 ? '+' : ''}${(ret * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--tx-mut,#64748b)] mt-3 leading-relaxed">
              Color logic is inverted here on purpose: during a <i>false alarm</i>, a rising
              market (red) is the cost, a falling market (green) means the defense was
              accidentally useful. Spells overlapping an episode are the report card&apos;s
              territory — toggle &ldquo;show all spells&rdquo; to see both sides in one ledger.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
