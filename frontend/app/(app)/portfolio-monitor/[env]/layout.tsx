import { notFound } from 'next/navigation';
import { MonitorTabs } from '@/components/portfolio_monitor/MonitorTabs';

// Portfolio Monitor ([08-PMON]) — the STATE of the book we hold. Design:
// `08_website_and_tooling/portfolio_monitor_IA.md`.
//
// The environment is a ROUTE, as on /trading: "which account is this?" must be answerable from the
// address bar and from a screenshot. Only `paper` exists; `live` 404s until a live account does.
const ENVS: Record<string, { label: string; tone: string; note: string }> = {
  paper: {
    label: 'PAPER',
    tone: 'bg-[var(--teal)] text-[#fffdf9]',
    note: 'live IBKR paper account · simulated fills · no client money',
  },
};

export default async function PortfolioMonitorEnvLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ env: string }> }) {
  const { env } = await params;
  const cfg = ENVS[env];
  if (!cfg) notFound();

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${cfg.tone}`}>
          {cfg.label}
        </span>
        <span className="text-[11px] text-[var(--tx-dim)]">{cfg.note}</span>
        <MonitorTabs env={env} />
      </div>
      {children}
    </div>
  );
}
