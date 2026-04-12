import Link from 'next/link';

const panels = [
  {
    title: 'Data Monitor',
    description: 'Pipeline health, data freshness, gap detection, and factor coverage.',
    href: '/monitor',
    active: true,
  },
  {
    title: 'Model Research',
    description: 'Quintile IC charts, factor scores, SHAP importance, and model version history.',
    href: '#',
    active: false,
  },
  {
    title: 'Portfolio Management',
    description: 'Optimizer output, portfolio recommendations, and performance vs benchmark.',
    href: '#',
    active: false,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <div className="border-b border-zinc-800 pb-6 mb-10 max-w-2xl">
        <h1 className="text-4xl font-serif text-zinc-100 tracking-wide">SkyPilot Capital</h1>
        <p className="text-sm text-amber-500/80 mt-3 uppercase tracking-widest font-medium">Internal Dashboard Index</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="block bg-zinc-900 border border-zinc-800 p-8 rounded-md hover:border-amber-500/50 hover:shadow-lg transition-all group"
            >
              <h2 className="text-xl font-serif text-zinc-200 border-b border-transparent group-hover:border-amber-500/30 pb-1 inline-block mb-3 transition-colors">
                {panel.title}
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed font-mono">{panel.description}</p>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-zinc-900/50 border border-zinc-800/50 p-8 rounded-md opacity-60 cursor-not-allowed"
            >
              <h2 className="text-xl font-serif text-zinc-500 mb-3">{panel.title}</h2>
              <p className="text-sm text-zinc-600 leading-relaxed font-mono">{panel.description}</p>
              <p className="text-xs text-zinc-700 mt-6 uppercase tracking-widest font-bold">Coming soon</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
