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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SkyPilot Capital</h1>
        <p className="text-sm text-gray-500 mt-1">Internal dashboard</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {panels.map((panel) =>
          panel.active ? (
            <Link
              key={panel.title}
              href={panel.href}
              className="block bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
                {panel.title}
              </h2>
              <p className="text-sm text-gray-500 mt-2">{panel.description}</p>
              <p className="text-xs text-blue-500 mt-4 font-medium">Open →</p>
            </Link>
          ) : (
            <div
              key={panel.title}
              className="bg-gray-50 border border-gray-200 rounded-lg p-6 opacity-60 cursor-not-allowed"
            >
              <h2 className="text-base font-semibold text-gray-500">{panel.title}</h2>
              <p className="text-sm text-gray-400 mt-2">{panel.description}</p>
              <p className="text-xs text-gray-400 mt-4 font-medium">Coming soon</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
