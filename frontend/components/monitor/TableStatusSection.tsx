'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchTableStatus } from '@/lib/api';
import { lagColor, formatRowCount, secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

function LayerAccordion({ layer, data }: { layer: string, data: any[] }) {
  // Default to open for the core layers
  const [isOpen, setIsOpen] = useState(layer === 'raw' || layer === 'clean' || layer === 'factor');

  return (
    <div className="mb-4 border border-slate-200/60 rounded-xl overflow-hidden bg-white shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 bg-slate-50/50 hover:bg-slate-50 transition-colors focus:outline-none"
      >
        <span className="text-sm font-black text-indigo-500 uppercase tracking-widest flex items-center">
          {layer} Layer 
          <span className="ml-3 px-2 py-0.5 rounded-full bg-slate-200/50 text-slate-500 text-[10px]">
            {data.length}
          </span>
        </span>
        <svg 
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 border-t border-slate-100 bg-slate-50/20">
          {data.map((row) => (
            <div key={`${row.schema_name}.${row.table_name}`} className="bg-white border border-slate-200/80 rounded-xl p-5 flex flex-col hover:border-indigo-300 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-mono text-[#0F172A] text-sm font-bold tracking-tight">{row.table_name}</h3>
                <span className={`text-[10px] font-bold px-2 py-1 rounded bg-slate-100 ${lagColor(row.lag_days, row.table_name)}`}>
                  {row.lag_days !== null ? `${row.lag_days}d lag` : '—'}
                </span>
              </div>
              
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 mb-4">
                <span className="flex items-center font-medium tabular-nums">
                  <svg className="w-3.5 h-3.5 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  {formatRowCount(row.row_count)} rows
                </span>
                <span className="flex items-center font-medium tabular-nums">
                  <svg className="w-3.5 h-3.5 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {row.max_date ?? 'No metadata'}
                </span>
              </div>
              
              <div className="mt-auto border-t border-slate-50 pt-3">
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  {row.description ?? "No description available."}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TableStatusSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'table-status',
    fetchTableStatus,
    { refreshInterval: 60_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  const layers = ['secmaster', 'raw', 'clean', 'factor', 'targets'];

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between pb-3 border-b border-black/5 mb-2">
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">Database Architecture</h2>
          {updatedAt && (
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-500 font-medium">
          Comprehensive view of all pipeline tables, metrics, and descriptions structured by data layer.
        </p>
      </CardHeader>
      <CardContent className="p-0 mt-8">
        {isLoading && (
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-slate-100 rounded-xl"></div>
            <div className="h-16 bg-slate-100 rounded-xl"></div>
          </div>
        )}
        {error && <p className="text-sm text-red-500 font-medium bg-red-50 p-4 rounded-xl">Failed to load table architecture</p>}
        {data && (
          <div className="space-y-4">
            {layers.map((layer) => {
              const layerData = data.filter((row: any) => row.schema_name === layer);
              if (layerData.length === 0) return null;
              return <LayerAccordion key={layer} layer={layer} data={layerData} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
