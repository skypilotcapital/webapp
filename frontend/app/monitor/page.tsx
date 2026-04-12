import { FactorCoverageSection } from '@/components/monitor/FactorCoverageSection';
import { TableStatusSection } from '@/components/monitor/TableStatusSection';
import { RunLogSection } from '@/components/monitor/RunLogSection';
import { GapDetectionSection } from '@/components/monitor/GapDetectionSection';

export default function MonitorPage() {
  return (
    <div className="space-y-12">
      <div className="border-b border-black/5 pb-8 mb-10 max-w-2xl">
        <h1 className="text-4xl font-black text-[#0F172A] tracking-tighter uppercase">
          Data Monitor
        </h1>
        <p className="text-[10px] text-[#4F46E5] mt-3 font-black uppercase tracking-[0.4em]">
          Pipeline_Health // Factor_Coverage // Freshness_Check
        </p>
      </div>
      <FactorCoverageSection />
      <TableStatusSection />
      <RunLogSection />
      <GapDetectionSection />
    </div>
  );
}
