'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Two pages, not tabs on one page (owner, 2026-10-12) — each carries too much to share a screen.
// This is a second door between them; the sidebar is the first.
export function MonitorTabs({ env }: { env: string }) {
  const pathname = usePathname() || '';
  const items = [
    { label: 'Holdings', href: `/portfolio-monitor/${env}/holdings` },
    { label: 'Exposures', href: `/portfolio-monitor/${env}/exposures` },
  ];
  return (
    <div className="ml-auto flex gap-1">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(i.href + '/');
        return (
          <Link key={i.href} href={i.href}
            className="px-3 py-1 rounded-md text-xs font-bold border"
            style={active
              ? { background: 'rgba(14,124,111,0.10)', color: 'var(--teal)', borderColor: 'var(--teal)' }
              : { color: 'var(--tx-mut)', borderColor: 'var(--border-soft)' }}>
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
