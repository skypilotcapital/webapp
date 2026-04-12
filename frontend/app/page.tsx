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
    <div className="space-y-16">
      <div className="border-b border-slate-200 pb-10 mb-12 max-w-4xl">
        <h1 className="text-5xl font-bold text-[#0F172A] tracking-tight">
          Operating Dashboard
        </h1>
        <p className="text-sm text-slate-500 mt-4 uppercase tracking-[0.3em] font-bold">
          SkyPilot Capital Internal Systems
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="group relative block bg-white border border-slate-200 p-10 rounded-3xl hover:border-[#0284C7] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-all duration-500 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h2 className="text-2xl font-bold text-[#0F172A] mb-4 group-hover:text-[#0284C7] transition-colors">
                {panel.title}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed font-medium group-hover:text-slate-800 transition-colors">
                {panel.description}
              </p>
              <div className="mt-10 flex items-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#0284C7]">
                <span>Access Module</span>
                <svg className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-slate-50 border border-slate-100 p-10 rounded-3xl opacity-60"
            >
              <h2 className="text-2xl font-bold text-slate-400 mb-4">{panel.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">{panel.description}</p>
              <p className="text-[10px] text-slate-400 mt-10 uppercase tracking-[0.2em] font-bold">Planned Feature</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
