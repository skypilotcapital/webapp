'use client';

// Model Monitor › Factors ([08-FMON]). Design: the [08-FMON] task (design passes 1 + 2) and
// 04_alpha_models/shap_reliance_panel.md §9. Page order is DIAGNOSIS FIRST (owner, 2026-10-07):
// selector + edges → caveats → headline tiles → panel 5 → quadrant | named features → history →
// drill-down. Every number comes precomputed from research.fmon_* — this page formats and arranges.

import { useEffect, useMemo, useState } from 'react';
import { FamilyDrilldown } from '@/components/model_monitor/FamilyDrilldown';
import { FamilyGapPanel } from '@/components/model_monitor/FamilyGapPanel';
import { FamilyHistory } from '@/components/model_monitor/FamilyHistory';
import { NamedFeatures } from '@/components/model_monitor/NamedFeatures';
import { RelianceQuadrant } from '@/components/model_monitor/RelianceQuadrant';
import type { ModelView, MonitorSummary, Universe } from '@/lib/modelMonitor';
import { componentLabel, fetchModel, fetchModels, monthLabel, pctileText } from '@/lib/modelMonitor';

const UNIVERSES: { key: Universe; label: string }[] = [
  { key: 'sp500', label: 'S&P 500' },
  { key: 'russell2500', label: 'Russell 2500' },
];

function tone(p: number | null) {
  if (p == null) return 'var(--tx-dim)';
  if (p <= 10) return 'var(--neg)';
  if (p >= 90) return 'var(--pos)';
  return 'var(--tx)';
}

function Tile({ label, pctile, detail, asof }: { label: string; pctile: number | null; detail: string; asof: string }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-xs font-semibold text-[var(--tx-mut)]">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: tone(pctile) }}>
        {pctile == null ? 'withheld' : pctileText(pctile)}
      </div>
      <div className="text-[11px] text-[var(--tx-dim)] mt-1 leading-snug">{detail}</div>
      <div className="text-[11px] text-[var(--tx-dim)] mt-1">12 months to {asof}</div>
    </div>
  );
}

export default function FactorMonitorPage() {
  const [models, setModels] = useState<MonitorSummary[] | null>(null);
  const [universe, setUniverse] = useState<Universe>('sp500');
  const [modelId, setModelId] = useState<string | null>(null);
  const [view, setView] = useState<ModelView | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetchModels().then(setModels).catch((e) => setErr(String(e))); }, []);

  const inUniverse = useMemo(
    () => (models ?? []).filter((m) => m.universe === universe)
      .sort((a, b) => a.horizon_months - b.horizon_months),
    [models, universe]);

  // default to the 1M component of the chosen universe
  useEffect(() => {
    if (inUniverse.length && !inUniverse.some((m) => m.model_id === modelId)) {
      setModelId(inUniverse[0].model_id);
    }
  }, [inUniverse, modelId]);

  useEffect(() => {
    if (!modelId) return;
    setView(null); setFamily(null);
    fetchModel(modelId).then(setView).catch((e) => setErr(String(e)));
  }, [modelId]);

  const s = view?.summary;
  const families = useMemo(() => {
    if (!view) return [];
    const order = [...view.families].sort((a, b) => (b.attention ?? 0) - (a.attention ?? 0));
    return order.map((f) => f.family);
  }, [view]);
  const blend = inUniverse[0];

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border-soft)] pb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold text-[var(--tx)] tracking-tight">Factor monitor</h1>
            <p className="text-sm text-[var(--tx-dim)] mt-3 leading-relaxed">
              What each production model leans on, what each factor itself paid, and what the model&apos;s
              use of each factor earned — three different questions. Where they disagree is the point.
            </p>
          </div>
          <div className="flex gap-1 pt-1">
            {UNIVERSES.map((u) => (
              <button key={u.key} onClick={() => setUniverse(u.key)}
                      className="px-4 py-2 rounded-full text-sm font-bold border"
                      style={universe === u.key
                        ? { background: 'var(--teal)', color: '#fffdf9', borderColor: 'var(--teal)' }
                        : { color: 'var(--tx-mut)', borderColor: 'var(--border-soft)' }}>
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {inUniverse.map((m) => (
            <button key={m.model_id} onClick={() => setModelId(m.model_id)}
                    className="px-3 py-1.5 rounded-md text-xs font-bold border"
                    style={m.model_id === modelId
                      ? { background: 'rgba(14,124,111,0.10)', color: 'var(--teal)', borderColor: 'var(--teal)' }
                      : { color: 'var(--tx-mut)', borderColor: 'var(--border-soft)' }}>
              {componentLabel(m)}
            </button>
          ))}
          {blend?.book_role && (
            <span className="text-xs text-[var(--tx-dim)] ml-1">
              {blend.blend_label} is the signal of the {blend.book_role}
              {blend.blend_smooth ? ` (blended, then smoothed: ${blend.blend_smooth})` : ''}.
            </span>
          )}
        </div>
        {s && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-[var(--tx-mut)]">
            <span>Contribution through <b className="text-[var(--tx)]">{monthLabel(s.panel_edge)}</b>
              {s.horizon_months > 1 ? ` (a ${s.horizon_months}-month model: its newest month lands ${s.horizon_months} months late)` : ''}</span>
            <span>Factor payoff through <b className="text-[var(--tx)]">{monthLabel(s.payoff_edge)}</b></span>
            <span>Compared as of <b className="text-[var(--tx)]">{monthLabel(s.compared_asof)}</b> — the last month both have</span>
          </div>
        )}
      </div>

      <div className="text-xs leading-relaxed px-4 py-3 rounded-md"
           style={{ background: 'rgba(180,83,9,0.08)', color: 'var(--amber)' }}>
        Explains one component model&apos;s <b>forecast</b> — not the portfolio (the optimizer sits in
        between; see each book&apos;s attribution for that) and not the blend (the blend re-ranks, so its
        reliance is not the weighted average of the components). Contribution is the Pearson analogue of
        the Spearman IC the models are judged on. 2024 onward is spent holdout: read it, never tune on it.
      </div>

      {err && <p className="text-sm text-[var(--neg)]">Couldn&apos;t load the factor monitor: {err}</p>}
      {!view && !err && <p className="text-sm text-[var(--tx-dim)]">Loading…</p>}

      {view && s && (
        <>
          {!s.contribution_valid && (
            <div className="panel px-5 py-4" style={{ borderLeft: '3px solid var(--amber)', borderRadius: 0 }}>
              <div className="text-sm font-bold text-[var(--tx)]">Contribution withheld for {s.model_id}</div>
              <p className="text-xs text-[var(--tx-mut)] mt-1 leading-relaxed">{s.contribution_note}</p>
            </div>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Tile label="Factor environment" pctile={s.env_pctile}
                  detail="Equal-weighted payoff of this model's factors — the ground it stands on."
                  asof={monthLabel(s.payoff_edge)} />
            <Tile label="The model's own skill" pctile={s.skill_pctile}
                  detail="How well its forecasts lined up with returns: Cov(prediction, return)."
                  asof={monthLabel(s.panel_edge)} />
            <Tile label="Leaning on what works" pctile={s.align_pctile}
                  detail="Whether the features it listens to most are the ones earning. Shown, not alarmed on."
                  asof={monthLabel(s.panel_edge)} />
          </div>
          <p className="text-[11px] text-[var(--tx-dim)] -mt-3">
            Each tile is a percentile of the 2015–23 distribution of 12-month averages — 0th means below
            every 12-month stretch in that window, which covers eleven years and no 2000–02 or 2008.
          </p>

          <FamilyGapPanel rows={view.families} asof={s.compared_asof} onPick={setFamily} />

          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
            <RelianceQuadrant rows={view.families} history={view.history} onPick={setFamily} selected={family} />
            <NamedFeatures movers={view.movers} nFeatures={s.n_features}
                           withheldNote={s.contribution_note} onPick={setFamily} />
          </div>

          <FamilyHistory history={view.history} families={families}
                         contributionValid={s.contribution_valid} onPick={setFamily} />

          {family && (
            <FamilyDrilldown modelId={s.model_id} family={family}
                             contributionValid={s.contribution_valid} onClose={() => setFamily(null)} />
          )}

          <p className="text-[11px] text-[var(--tx-dim)]">
            Built {s.built_at.slice(0, 10)} from research.fmon_* (monthly chain step <code>fmon</code>).
            {s.n_unmapped > 0 ? ` Features with no factor series: ${s.unmapped}.` : ''}
          </p>
        </>
      )}
    </div>
  );
}
