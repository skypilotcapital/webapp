import { FactorCoverageSection } from '@/components/monitor/FactorCoverageSection';
import { TableStatusSection } from '@/components/monitor/TableStatusSection';
import { RunLogSection } from '@/components/monitor/RunLogSection';
import { GapDetectionSection } from '@/components/monitor/GapDetectionSection';

export default function MonitorPage() {
  return (
    <div className="space-y-12">
      <div className="border-b border-black/5 pb-10 mb-12 max-w-2xl">
        <h1 className="text-4xl font-black text-[#0F172A] tracking-tighter">
          Data Monitor
        </h1>
        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium">
          Real-time pipeline health, factor coverage, and data freshness protocols.
        </p>
      </div>
      <FactorCoverageSection />
      <TableStatusSection />
      <RunLogSection />
      <GapDetectionSection />
    </div>
  );
}
