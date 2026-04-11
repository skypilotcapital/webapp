'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchRunLog } from '@/lib/api';
import { statusBadgeClass, formatDatetime, formatDuration, secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function RunLogSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'run-log',
    fetchRunLog,
    { refreshInterval: 30_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Pipeline Run Log</h2>
          {updatedAt && (
            <span className="text-xs text-gray-400">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Most recent execution of each pipeline step
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-gray-400 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && data.length === 0 && (
          <p className="text-sm text-gray-400 px-6 py-4">No run log entries yet.</p>
        )}
        {data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Flow</th>
                <th className="px-6 py-3 font-medium">Step</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Started</th>
                <th className="px-6 py-3 font-medium text-right">Duration</th>
                <th className="px-6 py-3 font-medium text-right">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((row) => (
                <tr key={`${row.flow}.${row.step}`} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-gray-600 text-xs">{row.flow}</td>
                  <td className="px-6 py-3 font-mono text-gray-700 text-xs">{row.step}</td>
                  <td className="px-6 py-3">
                    <Badge className={statusBadgeClass(row.status)}>
                      {row.status}
                    </Badge>
                    {row.status === 'error' && row.error_msg && (
                      <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={row.error_msg}>
                        {row.error_msg}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs tabular-nums">
                    {formatDatetime(row.started_at)}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs tabular-nums text-right">
                    {formatDuration(row.started_at, row.completed_at)}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-xs tabular-nums text-right">
                    {row.rows_affected !== null ? row.rows_affected.toLocaleString() : '—'}
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
