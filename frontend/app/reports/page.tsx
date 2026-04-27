'use client';

import React from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ReportItem {
  filename: string;
  category: string;
  category_label: string;
  generated_at: string | null;
  size_kb: number;
  has_pdf: boolean;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<string, string> = {
  gate_validation: 'bg-indigo-50 text-indigo-700',
  db_health:       'bg-teal-50 text-teal-700',
  factor_research: 'bg-violet-50 text-violet-700',
  model:           'bg-sky-50 text-sky-700',
  portfolio:       'bg-lime-50 text-lime-700',
};

function CategoryPill({ category, label }: { category: string; label: string }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit' });
}

function getReportTitle(filename: string): string {
  // "gate_validation_20260427_1440.html" → "Gate Validation Report"
  const base = filename.replace(/\.html?$/i, '').replace(/_\d{8}_\d{4}$/, '');
  return base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Report';
}

// Group reports by category_label
function groupByCategory(items: ReportItem[]): Record<string, ReportItem[]> {
  const groups: Record<string, ReportItem[]> = {};
  for (const item of items) {
    if (!groups[item.category_label]) groups[item.category_label] = [];
    groups[item.category_label].push(item);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------
function ReportCard({ item }: { item: ReportItem }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
  const htmlUrl = `${apiBase}/api/v1/reports/${encodeURIComponent(item.filename)}/html`;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 flex items-start justify-between gap-4 hover:border-indigo-100 hover:shadow-sm transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <CategoryPill category={item.category} label={item.category_label} />
          {item.has_pdf && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
              PDF available
            </span>
          )}
        </div>
        <p className="font-semibold text-slate-800 text-sm leading-snug">
          {getReportTitle(item.filename)}
        </p>
        <p className="text-xs font-mono text-slate-400 mt-0.5">{item.filename}</p>
        {item.description && (
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
          <span>{formatDate(item.generated_at)}</span>
          <span>·</span>
          <span>{item.size_kb} KB</span>
        </div>
      </div>
      <a
        href={htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
      >
        Open
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ReportsPage() {
  const { data, error, isLoading } = useSWR<ReportItem[]>(
    'reports-list',
    () => apiFetch<ReportItem[]>('/api/v1/reports'),
    { revalidateOnFocus: false }
  );

  const groups = data ? groupByCategory(data) : {};
  const totalCount = data?.length ?? 0;

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="border-b border-black/5 pb-10 mb-4 max-w-3xl">
        <h1 className="text-4xl font-bold text-[#0F172A] tracking-tight">Reports</h1>
        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium max-w-2xl">
          Generated analytical reports for team review. Each report opens in a new browser tab.
          Gate Validation reports include sign-off blocks — print or annotate a copy for the record.
        </p>
        {totalCount > 0 && (
          <p className="text-xs text-slate-400 mt-3">{totalCount} report{totalCount !== 1 ? 's' : ''} available</p>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">Loading reports…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-600">Failed to load reports.</p>
          <p className="text-xs text-red-400 mt-1">
            Ensure REPORTS_DIR is set in the API .env and the reports directory exists on the droplet.
          </p>
        </div>
      )}

      {/* Empty state */}
      {data && totalCount === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-16 text-center">
          <p className="text-sm text-slate-400">No reports found.</p>
          <p className="text-xs text-slate-300 mt-2">
            Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">gate_validation_report.py</code> or{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">db_health_report.py</code> on the droplet to generate reports.
          </p>
        </div>
      )}

      {/* Report groups */}
      {Object.entries(groups).map(([categoryLabel, items]) => (
        <div key={categoryLabel}>
          <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-slate-400 mb-4">
            {categoryLabel}
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <ReportCard key={item.filename} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
