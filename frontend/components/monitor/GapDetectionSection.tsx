'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchGapDetection } from '@/lib/api';
import { secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export function GapDetectionSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'gap-detection',
    fetchGapDetection,
    { refreshInterval: 300_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
          <h2 className="text-xl font-serif text-zinc-200 tracking-wide">Gap Detection</h2>
          {updatedAt && (
            <span className="text-xs text-xs text-amber-500/80 uppercase tracking-widest font-mono">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Daily tables missing trading days present in raw.prices (last 90 days)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-zinc-500 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400 font-serif tracking-wider">
                <th className="px-6 py-4">Table</th>
                <th className="px-6 py-4">Missing Dates</th>
                <th className="px-6 py-4 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {data.map((row) => (
                <tr key={`${row.schema_name}.${row.table_name}`} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-zinc-300 font-mono">
                    <span className="text-zinc-500">{row.schema_name}.</span>
                    {row.table_name}
                  </td>
                  <td className="px-6 py-3">
                    {row.gap_count === 0 ? (
                      <span className="text-green-600 font-medium text-xs">✓ No gaps</span>
                    ) : (
                      <span className="text-red-600 font-medium text-xs">✗ {row.gap_count} gap{row.gap_count > 1 ? 's' : ''}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-zinc-400 text-xs font-mono">
                    {row.gap_count === 0
                      ? '—'
                      : row.missing_dates.slice(0, 5).join(', ') + (row.missing_dates.length > 5 ? ` +${row.missing_dates.length - 5} more` : '')
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
