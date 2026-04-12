import { FactorCoverageSection } from '@/components/monitor/FactorCoverageSection';
import { TableStatusSection } from '@/components/monitor/TableStatusSection';
import { RunLogSection } from '@/components/monitor/RunLogSection';
import { GapDetectionSection } from '@/components/monitor/GapDetectionSection';

export default function MonitorPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-white/10 pb-6 mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold text-white tracking-tight">Data Monitor</h1>
        <p className="text-sm text-teal-400/80 mt-3 font-medium uppercase tracking-widest">
          Pipeline health, data freshness, and factor coverage
        </p>
      </div>
      <FactorCoverageSection />
      <TableStatusSection />
      <RunLogSection />
      <GapDetectionSection />
    </div>
  );
}
