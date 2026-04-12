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
      <div className="border-b border-black/5 pb-10 mb-12 max-w-4xl">
        <h1 className="text-6xl font-black text-[#0F172A] tracking-tighter">
          SkyPilot Capital
        </h1>
        <p className="text-sm text-slate-500 mt-4 uppercase tracking-[0.2em] font-bold">
          Fund Operating Dashboard
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="group relative block bg-white/60 backdrop-blur-3xl border border-black/5 p-10 rounded-[2.5rem] hover:bg-white hover:border-[#4F46E5] hover:ring-4 hover:ring-[#4F46E5]/10 hover:shadow-[0_40px_80px_-15px_rgba(79,70,229,0.15)] transition-all duration-500 overflow-hidden outline-none"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#4F46E5]/10 rounded-full blur-[60px] -mr-24 -mt-24 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <h2 className="text-2xl font-bold text-[#0F172A] mb-4 group-hover:text-[#4F46E5] transition-colors tracking-tight">
                {panel.title}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed font-medium group-hover:text-slate-800 transition-colors">
                {panel.description}
              </p>
              <div className="mt-12 flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-[#4F46E5]">
                <span className="group-hover:mr-3 transition-all">Access Terminal</span>
                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-black/[0.02] border border-black/5 p-10 rounded-[2.5rem] opacity-40 grayscale"
            >
              <h2 className="text-2xl font-bold text-slate-400 mb-4 tracking-tight">{panel.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">{panel.description}</p>
              <p className="text-[10px] text-slate-400 mt-12 uppercase tracking-[0.2em] font-bold">Coming Soon</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
