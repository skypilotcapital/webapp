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
        <div className="flex items-center justify-between pb-3 border-b border-black/5/[0.03] mb-4">
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Pipeline Run Log</h2>
          {updatedAt && (
            <span className="text-xs text-xs text-[#0F172A]/80 uppercase tracking-widest tracking-[0.2em] font-black font-medium">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-300 mb-6">
          Latest pipeline step executions and their completion status
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-slate-300 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && data.length === 0 && (
          <p className="text-sm text-slate-300 px-6 py-4">No run log entries yet.</p>
        )}
        {data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5/[0.03] text-left text-xs text-slate-300 font-medium tracking-wide">
                <th className="px-6 py-4">Flow</th>
                <th className="px-6 py-4">Step</th>
                <th className="px-6 py-4 text-center">Mode</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4">Started (UTC)</th>
                <th className="px-6 py-4 text-right">Duration</th>
                <th className="px-6 py-4 text-right">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.map((row) => (
                <tr key={`${row.flow}.${row.step}`} className="hover:bg-white/60 backdrop-blur-xl/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-300 text-xs">{row.flow}</td>
                  <td className="px-6 py-4 font-mono text-[#0F172A] font-mono text-xs">{row.step}</td>
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
                  <td className="px-6 py-3 text-slate-300 text-xs tabular-nums">
                    {formatDatetime(row.started_at)}
                  </td>
                  <td className="px-6 py-3 text-slate-300 text-xs tabular-nums text-right">
                    {formatDuration(row.started_at, row.completed_at)}
                  </td>
                  <td className="px-6 py-3 text-[#0F172A] text-xs tabular-nums text-right">
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
