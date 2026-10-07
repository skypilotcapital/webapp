import { redirect } from 'next/navigation';

// Model Monitor is a section, not a page: Factors is its first surface ([08-FMON]); model health
// ([04-MH]) joins it later.
export default function ModelMonitorIndex() {
  redirect('/model-monitor/factors');
}
