'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchTableStatus } from '@/lib/api';
import { lagColor, formatRowCount, secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export function TableStatusSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'table-status',
    fetchTableStatus,
    { refreshInterval: 60_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/[0.03] mb-4">
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Table Status</h2>
          {updatedAt && (
            <span className="text-xs text-xs text-[#0F172A]/80 uppercase tracking-[0.2em] font-black font-medium">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-300 mb-6">
          Latest date and row counts across all pipeline tables
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-slate-300 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/[0.03] text-left text-xs text-slate-300 font-medium tracking-wide">
                <th className="px-6 py-4">Table</th>
                <th className="px-6 py-4">Max Date</th>
                <th className="px-6 py-4 text-right">Row Count</th>
                <th className="px-6 py-4 text-right">Lag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.map((row) => (
                <tr key={`${row.schema_name}.${row.table_name}`} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-[#0F172A] font-mono">
                    <span className="text-slate-300">{row.schema_name}.</span>
                    {row.table_name}
                  </td>
                  <td className="px-6 py-3 tabular-nums text-[#0F172A]">
                    {row.max_date ?? '—'}
                  </td>
                  <td className="px-6 py-3 tabular-nums text-[#0F172A] text-right">
                    {formatRowCount(row.row_count)}
                  </td>
                  <td className={`px-6 py-3 tabular-nums text-right font-medium ${lagColor(row.lag_days, row.table_name)}`}>
                    {row.lag_days !== null ? `${row.lag_days}d` : '—'}
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
