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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Gap Detection</h2>
          {updatedAt && (
            <span className="text-xs text-gray-400">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Missing trading days in daily-frequency tables (last 90 days)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-gray-400 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Table</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Missing Dates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((row) => (
                <tr key={`${row.schema_name}.${row.table_name}`} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-gray-700">
                    <span className="text-gray-400">{row.schema_name}.</span>
                    {row.table_name}
                  </td>
                  <td className="px-6 py-3">
                    {row.gap_count === 0 ? (
                      <span className="text-green-600 font-medium text-xs">✓ No gaps</span>
                    ) : (
                      <span className="text-red-600 font-medium text-xs">✗ {row.gap_count} gap{row.gap_count > 1 ? 's' : ''}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs font-mono">
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
