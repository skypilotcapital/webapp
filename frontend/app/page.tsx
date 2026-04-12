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
      <div className="border-b border-white/10 pb-6 mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold text-white tracking-tight">SkyPilot Capital</h1>
        <p className="text-sm text-teal-400/80 mt-3 uppercase tracking-widest font-medium">Fund Operating Dashboard</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="block bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-xl hover:bg-white/10 hover:border-teal-500/50 hover:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-300 group"
            >
              <h2 className="text-xl font-semibold text-white border-b-2 border-transparent group-hover:border-teal-400/50 pb-1 inline-block mb-3 transition-colors">
                {panel.title}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">{panel.description}</p>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-white/5 border border-white/5 p-8 rounded-xl opacity-50 cursor-not-allowed"
            >
              <h2 className="text-xl font-semibold text-slate-400 mb-3">{panel.title}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">{panel.description}</p>
              <p className="text-xs text-slate-500/80 mt-6 uppercase tracking-widest font-bold">Coming soon</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
