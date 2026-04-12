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
      <div className="border-b border-black/5 pb-10 mb-12">
        <h1 className="text-4xl font-bold text-[#0F172A] tracking-tight">
          Fund Operating Dashboard
        </h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="group relative block bg-white/40 backdrop-blur-3xl border border-black/5 p-10 rounded-[2.5rem] hover:bg-white hover:border-[#4F46E5] hover:ring-8 hover:ring-[#4F46E5]/10 hover:shadow-[0_45px_90px_-20px_rgba(79,70,229,0.2)] transition-all duration-700 overflow-hidden outline-none"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/[0.03] to-[#4F46E5]/[0.03] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#4F46E5]/10 rounded-full blur-[80px] -mr-32 -mt-32 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
              
              <h2 className="text-2xl font-bold text-[#0F172A] mb-4 group-hover:text-[#4F46E5] transition-colors tracking-tight">
                {panel.title}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold group-hover:text-slate-800 transition-colors">
                {panel.description}
              </p>
              <div className="mt-14 flex items-center text-xs font-bold text-[#4F46E5]">
                <span className="group-hover:mr-4 transition-all">Access Dashboard</span>
                <div className="w-8 h-8 rounded-full bg-[#4F46E5]/10 flex items-center justify-center group-hover:bg-[#4F46E5] group-hover:text-white transition-all duration-500">
                  <svg className="w-4 h-4 transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-black/[0.02] border border-black/5 p-10 rounded-[2.5rem] opacity-40 grayscale"
            >
              <h2 className="text-2xl font-bold text-slate-400 mb-4 tracking-tight">{panel.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">{panel.description}</p>
              <p className="text-xs text-slate-400 mt-14 font-bold">Planned Feature</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
