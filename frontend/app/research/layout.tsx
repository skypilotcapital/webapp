'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const RESEARCH_TABS = [
  { href: '/research/factors',       label: 'S&P 500 — Factors' },
  { href: '/research/models',        label: 'S&P 500 — Models' },
  { href: '/research/r2500-factors', label: 'Russell 2500 — Factors' },
  { href: '/research/r2500-models',  label: 'Russell 2500 — Models' },
];

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-1">
        {RESEARCH_TABS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
                active
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50/60'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
