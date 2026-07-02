'use client';

import { useState } from 'react';
import { ComponentBoard } from '@/components/macro_beta/ComponentBoard';
import { CostOfInsurance } from '@/components/macro_beta/CostOfInsurance';
import { DialSimulator } from '@/components/macro_beta/DialSimulator';
import { EpisodeScorecard } from '@/components/macro_beta/EpisodeScorecard';
import { FalseAlarmLedger } from '@/components/macro_beta/FalseAlarmLedger';
import { HeroStatus } from '@/components/macro_beta/HeroStatus';
import { MethodologyNote } from '@/components/macro_beta/MethodologyNote';
import { RegimeTimeline } from '@/components/macro_beta/RegimeTimeline';
import { SignalHealth } from '@/components/macro_beta/SignalHealth';
import type { Universe } from '@/types/macroBeta';

const UNIVERSES: Array<{ key: Universe; label: string }> = [
  { key: 'sp500', label: 'S&P 500' },
  { key: 'smid', label: 'Russell 2000 · SMID' },
];

export default function MacroBetaPage() {
  const [universe, setUniverse] = useState<Universe>('sp500');

  return (
    <div className="space-y-10">
      <div className="border-b border-[var(--border-soft,#e2e8f0)] pb-8 mb-2">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
              Macro Beta Signal
            </h1>
            <p className="text-sm text-[var(--tx-dim,#64748b)] mt-4 leading-relaxed font-medium">
              A two-state equity drawdown-defense signal (v1.6): price trend, labor market,
              inflation momentum, credit stress and realized volatility, combined into a
              single daily NORMAL / DEFENSE state with frozen, fully interpretable rules.
              The SMID variant shares every rule and differs only in its credit input
              (high-yield spreads) and evaluation index.
            </p>
          </div>
          <div className="flex gap-1 pt-2">
            {UNIVERSES.map((u) => (
              <button
                key={u.key}
                onClick={() => setUniverse(u.key)}
                className={`px-4 py-2 rounded-full text-sm font-bold border ${
                  universe === u.key
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-transparent text-[var(--tx-mut,#64748b)] border-[var(--border-soft,#e2e8f0)] hover:border-[var(--tx-dim,#94a3b8)]'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <HeroStatus universe={universe} />
      <ComponentBoard universe={universe} />
      <RegimeTimeline universe={universe} />
      <EpisodeScorecard universe={universe} />
      <FalseAlarmLedger universe={universe} />
      <CostOfInsurance universe={universe} />
      <DialSimulator universe={universe} />
      <MethodologyNote />
      <SignalHealth />
    </div>
  );
}
