import { FactorCoverageSection } from '@/components/monitor/FactorCoverageSection';
import { TableStatusSection } from '@/components/monitor/TableStatusSection';
import { RunLogSection } from '@/components/monitor/RunLogSection';
import { GapDetectionSection } from '@/components/monitor/GapDetectionSection';

export default function MonitorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">
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
