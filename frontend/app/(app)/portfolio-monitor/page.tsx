import { redirect } from 'next/navigation';

// Portfolio Monitor is a section, not a page: Holdings and Exposures ([08-PMON]). Paper is the only
// account today.
export default function PortfolioMonitorIndex() {
  redirect('/portfolio-monitor/paper/holdings');
}
