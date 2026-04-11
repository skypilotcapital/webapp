'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchFactorCoverage } from '@/lib/api';
import { coverageColor, secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export function FactorCoverageSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'factor-coverage',
    fetchFactorCoverage,
    { refreshInterval: 300_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Factor Coverage</h2>
          {updatedAt && (
            <span className="text-xs text-gray-400">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          % of current S&P 500 constituents with valid factor.scores at last month-end
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {error   && <p className="text-sm text-red-500">Failed to load</p>}
        {data && (
          <div className="flex items-end gap-6">
            <div>
              <span className={`text-4xl font-bold tabular-nums ${coverageColor(data.coverage_pct)}`}>
                {data.coverage_pct !== null ? `${data.coverage_pct}%` : '—'}
              </span>
            </div>
            <div className="text-sm text-gray-500 pb-1">
              <p>{data.covered_count} / {data.universe_count} stocks covered</p>
              <p>As of {data.as_of_date ?? '—'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
