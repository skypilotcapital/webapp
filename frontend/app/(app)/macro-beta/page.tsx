import { ComponentBoard } from '@/components/macro_beta/ComponentBoard';
import { CostOfInsurance } from '@/components/macro_beta/CostOfInsurance';
import { DialSimulator } from '@/components/macro_beta/DialSimulator';
import { EpisodeScorecard } from '@/components/macro_beta/EpisodeScorecard';
import { HeroStatus } from '@/components/macro_beta/HeroStatus';
import { MethodologyNote } from '@/components/macro_beta/MethodologyNote';
import { RegimeTimeline } from '@/components/macro_beta/RegimeTimeline';
import { SignalHealth } from '@/components/macro_beta/SignalHealth';

export default function MacroBetaPage() {
  return (
    <div className="space-y-10">
      <div className="border-b border-[var(--border-soft,#e2e8f0)] pb-8 mb-2 max-w-3xl">
        <h1 className="text-4xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
          Macro Beta Signal
        </h1>
        <p className="text-sm text-[var(--tx-dim,#64748b)] mt-4 leading-relaxed font-medium">
          A two-state US equity drawdown-defense signal (v1.5): price trend, labor market,
          inflation momentum, credit stress and realized volatility, combined into a single
          daily NORMAL / DEFENSE state with frozen, fully interpretable rules.
        </p>
      </div>
      <HeroStatus />
      <ComponentBoard />
      <RegimeTimeline />
      <EpisodeScorecard />
      <CostOfInsurance />
      <DialSimulator />
      <MethodologyNote />
      <SignalHealth />
    </div>
  );
}
