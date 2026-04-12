import { FactorCoverageSection } from '@/components/monitor/FactorCoverageSection';
import { TableStatusSection } from '@/components/monitor/TableStatusSection';
import { RunLogSection } from '@/components/monitor/RunLogSection';
import { GapDetectionSection } from '@/components/monitor/GapDetectionSection';

export default function MonitorPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-6 mb-8 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-black">Data Monitor</h1>
        <p className="text-sm text-slate-500 mt-3 font-medium uppercase tracking-widest">
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
