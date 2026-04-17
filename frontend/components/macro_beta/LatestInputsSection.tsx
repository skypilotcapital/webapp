'use client';

import useSWR from 'swr';
import { fetchMacroBetaLatestInputs } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function LatestInputsSection() {
  const { data, error, isLoading } = useSWR('macro-beta-inputs', fetchMacroBetaLatestInputs, { refreshInterval: 60_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Latest Raw Inputs Used</h2>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-slate-500">Loading latest inputs...</p>}
        {error && <p className="text-sm text-red-500">Failed to load latest inputs.</p>}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50">
              <p className="font-bold text-slate-800">PMI</p>
              <p className="text-slate-600 mt-1">Value: {data.mfg_pmi ?? '-'}</p>
              <p className="text-slate-500">Data: {data.pmi_data_date ?? '-'}</p>
              <p className="text-slate-500">Release: {data.pmi_release_date ?? '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50">
              <p className="font-bold text-slate-800">CPI</p>
              <p className="text-slate-600 mt-1">Value: {data.cpi_level ?? '-'}</p>
              <p className="text-slate-500">Data: {data.cpi_data_date ?? '-'}</p>
              <p className="text-slate-500">Release: {data.cpi_release_date ?? '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50">
              <p className="font-bold text-slate-800">S&amp;P 500</p>
              <p className="text-slate-600 mt-1">Model TR level: {data.sp500_level?.toFixed(2) ?? '-'}</p>
              <p className="text-slate-500">Model date: {data.sp500_date ?? '-'}</p>
              <p className="text-slate-500 mt-2">Spot index: {data.sp500_spot_level?.toFixed(2) ?? '-'}</p>
              <p className="text-slate-500">Spot date: {data.sp500_spot_date ?? '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50">
              <p className="font-bold text-slate-800">BBB Credit</p>
              <p className="text-slate-600 mt-1">OAS: {data.bbb_oas_bps != null ? `${data.bbb_oas_bps.toFixed(0)} bps` : '-'}</p>
              <p className="text-slate-500">Decimal: {data.bbb_oas_decimal?.toFixed(4) ?? '-'}</p>
              <p className="text-slate-500">Date: {data.credit_date ?? '-'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
