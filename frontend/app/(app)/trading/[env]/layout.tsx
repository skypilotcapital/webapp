import { notFound } from 'next/navigation';

// The environment is a ROUTE, not a toggle (IA §2.2). A URL is shareable, screenshottable and
// bookmarkable: "which account is this?" must be answerable from the address bar and from any
// screenshot pasted into Slack. Component state cannot do that.
//
// `live` 404s rather than 403s until a live account is configured (Q3) — no reachable surface to
// probe by guessing the URL.
const ENVS: Record<string, { label: string; tone: string; note: string }> = {
  paper: {
    label: 'PAPER',
    tone: 'bg-[var(--teal)] text-[#fffdf9]',
    note: 'IBKR paper account · simulated fills · no client money',
  },
};

export default async function TradingEnvLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ env: string }> }) {
  const { env } = await params;
  const cfg = ENVS[env];
  if (!cfg) notFound();

  return (
    <div className="flex flex-col min-h-0">
      {/* Visual treatment is a safety control, not decoration (IA §6.2): the environment must be
          unmistakable at a glance, in the page and in a screenshot of it. */}
      <div className="flex items-center gap-3 mb-3">
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${cfg.tone}`}>
          {cfg.label}
        </span>
        <span className="text-[11px] text-[var(--tx-dim)]">{cfg.note}</span>
      </div>
      {children}
    </div>
  );
}
