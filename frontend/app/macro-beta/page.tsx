import { HealthSection } from '@/components/macro_beta/HealthSection';
import { HistorySection } from '@/components/macro_beta/HistorySection';
import { LatestInputsSection } from '@/components/macro_beta/LatestInputsSection';
import { LatestSignalSection } from '@/components/macro_beta/LatestSignalSection';
import { RegimeAnalyticsSection } from '@/components/macro_beta/RegimeAnalyticsSection';

export default function MacroBetaPage() {
  return (
    <div className="space-y-12">
      <div className="border-b border-black/5 pb-10 mb-12 max-w-3xl">
        <h1 className="text-4xl font-bold text-[#0F172A] tracking-tight">Macro Beta Signal</h1>
        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium">
          Daily macro regime signal built from PMI, CPI, S&amp;P 500 trend, and BBB credit conditions.
        </p>
      </div>
      <LatestSignalSection />
      <LatestInputsSection />
      <HistorySection />
      <RegimeAnalyticsSection />
      <HealthSection />
    </div>
  );
}
