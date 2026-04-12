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
      <div className="border-b border-black pb-6 mb-8 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-black">SkyPilot Capital</h1>
        <p className="text-sm text-slate-500 mt-3 uppercase tracking-widest font-medium">Internal Dashboard Index</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="block bg-white border border-slate-300 p-8 hover:border-black transition-all group"
            >
              <h2 className="text-xl font-bold text-black border-b-2 border-transparent group-hover:border-black pb-1 inline-block mb-3 transition-colors">
                {panel.title}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">{panel.description}</p>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-slate-50 border border-slate-200 p-8 opacity-70 cursor-not-allowed"
            >
              <h2 className="text-xl font-bold text-slate-400 mb-3">{panel.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{panel.description}</p>
              <p className="text-xs text-slate-400 mt-6 uppercase tracking-widest font-bold">Coming soon</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
