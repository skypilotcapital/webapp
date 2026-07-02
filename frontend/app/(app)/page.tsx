import Link from 'next/link';

const panels = [
  { title: 'Data Monitor', description: 'Pipeline health, data freshness, gap detection, and factor coverage.', href: '/monitor', active: true },
  { title: 'Macro Beta Signal', description: 'Macro regime signal, latest inputs, state history, and model health.', href: '/macro-beta', active: true },
  { title: 'Research', description: 'Factor quintile analysis (P01), alpha models (P02), and the Layer-2 portfolio backtests — the decision hub.', href: '/research/factors', active: true },
  { title: 'Portfolio', description: 'Live production portfolio, optimizer output, and performance vs benchmark.', href: '#', active: false },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="pill pill-teal">DASHBOARD</span>
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--tx-dim)' }}>
            Sky Pilot Capital · Systematic Quant Equity
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Fund Operating Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="panel group relative block p-7 transition-all duration-300"
              style={{ minHeight: 220 }}
            >
              <div
                className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[70px] -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{ background: 'rgba(45,212,191,0.18)' }}
              />
              <h2 className="text-xl font-bold mb-3 tracking-tight transition-colors" style={{ color: 'var(--tx)' }}>
                {panel.title}
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--tx-mut)' }}>{panel.description}</p>
              <div className="mt-8 flex items-center gap-2 text-[11px] font-bold" style={{ color: 'var(--teal)' }}>
                <span>Open</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ) : (
            <div key={panel.title} className="panel p-7 opacity-45" style={{ minHeight: 220 }}>
              <h2 className="text-xl font-bold mb-3 tracking-tight" style={{ color: 'var(--tx-dim)' }}>{panel.title}</h2>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--tx-dim)' }}>{panel.description}</p>
              <p className="text-[11px] mt-8 font-bold" style={{ color: 'var(--tx-dim)' }}>Planned — after strategy selection</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
