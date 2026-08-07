'use client';

// `/portfolios/[strategy]/reports/[type]/[period]` — one report, as published ([08-WKLY]).
//
// The URL is the point. "What did the weekly say on 2026-W32?" has to be answerable by a link
// that keeps working, so the period is a route segment and a revision is a query parameter. A
// screenshot of this page can be traced back to the exact row in `trading.reports`.
//
// THE BODY IS SERVED, NOT REBUILT. `rendered_md` is displayed exactly as published; nothing on
// this page recomputes a figure from `payload` and renders it as part of the report. The payload
// is offered separately, as data. If that ever stops being true the archive stops being an
// archive and becomes a live view with historical dates on it.

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { productForSlug } from '@/lib/products';
import { fetchReport, statusColor, REPORT_TYPES, type ReportType } from '@/lib/reports';
import { ReportMarkdown } from '@/components/portfolio/ReportMarkdown';

export default function ReportPage() {
  const params = useParams();
  const search = useSearchParams();
  const slug = decodeURIComponent((params.strategy as string) || '');
  const type = decodeURIComponent((params.type as string) || '') as ReportType;
  const period = decodeURIComponent((params.period as string) || '');
  const revParam = search.get('revision');
  const revision = revParam ? Number(revParam) : undefined;

  const product = productForSlug(slug);
  const strategy = product?.paperStrategy;

  const { data, error } = useSWR(
    strategy ? ['report', strategy, type, period, revision ?? 'latest'] : null,
    () => fetchReport(strategy!, type, period, revision),
    { revalidateOnFocus: false },
  );

  const known = REPORT_TYPES.some((t) => t.key === type);
  const back = `/portfolios/${slug}/reports`;

  if (!product || !strategy || !known) {
    return (
      <Shell back={back}>
        <div className="panel p-10 text-center text-sm" style={{ color: 'var(--tx)' }}>
          No {known ? 'portfolio' : 'report type'} for “{known ? slug : type}”.
        </div>
      </Shell>
    );
  }

  return (
    <Shell back={back} product={product.name}>
      {error && (
        <div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>
          No {type} report for {period}.
        </div>
      )}
      {!data && !error && <div className="panel p-16 text-center muted text-sm">Loading report…</div>}

      {data && (
        <>
          {/* A superseded revision must announce itself BEFORE its text. Someone who reads the
              numbers first and the banner second has already taken away a figure we corrected. */}
          {!data.is_latest && (
            <div className="panel p-3 mb-3" style={{ borderLeft: '3px solid var(--amber)' }}>
              <div className="text-[12px] font-bold" style={{ color: 'var(--amber)' }}>
                Superseded — you are reading revision {data.revision}
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--tx-mut)' }}>
                This period was restated. Revision {data.superseded_by} is current; this text is kept
                because what we published on {fmtTs(data.built_at)} is part of the record.{' '}
                <Link href={`/portfolios/${slug}/reports/${type}/${encodeURIComponent(period)}`}
                      className="teal font-semibold">Read the current revision →</Link>
              </div>
            </div>
          )}

          <div className="panel p-4 mb-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
                {cap(type)} · {period}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
                {data.period_start === data.period_end
                  ? data.period_start : `${data.period_start} → ${data.period_end}`}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'var(--panel2)', color: statusColor(data.status) }}>
                  {data.status}
                </span>
              </div>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--tx-dim)' }}>
              book as of {data.book_asof ?? 'n/a'} · published {fmtTs(data.built_at)}
              {data.delivered_at ? ' · delivered to Slack' : ' · not delivered'}
              {data.revisions.length > 1 && ` · ${data.revisions.length} revisions`}
            </div>

            {data.revisions.length > 1 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[9px] font-bold tracking-[1.5px]" style={{ color: 'var(--tx-dim)' }}>
                  REVISION
                </span>
                {data.revisions.map((r) => {
                  const active = r.revision === data.revision;
                  return (
                    <Link key={r.revision}
                          href={`/portfolios/${slug}/reports/${type}/${encodeURIComponent(period)}`
                            + `?revision=${r.revision}`}
                          title={`published ${fmtTs(r.built_at)}`}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                          style={active
                            ? { background: 'var(--teal)', color: '#fffdf9' }
                            : { background: 'var(--panel2)', color: 'var(--tx)' }}>
                      {r.revision}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel p-5 mb-3">
            <ReportMarkdown md={data.rendered_md} />
          </div>

          {/* Commentary is stored beside the report rather than inside it, so a narration can
              never be mistaken for a measured line. Absent until [08-CMTY] ships. */}
          {data.commentary && (
            <div className="panel p-4 mb-3">
              <div className="text-[9px] font-bold tracking-[1.5px] mb-2" style={{ color: 'var(--tx-dim)' }}>
                COMMENTARY
              </div>
              <div className="text-[12.5px] leading-[1.65]" style={{ color: 'var(--tx-mut)' }}>
                {data.commentary}
              </div>
            </div>
          )}

          <Payload payload={data.payload} />
        </>
      )}
    </Shell>
  );
}

/* The payload as DATA — the closed contract the commentary agent narrates. Collapsed by default:
   it is here to be auditable, not to be read. */
function Payload({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel p-4">
      <button onClick={() => setOpen(!open)}
              className="flex items-center gap-2 w-full text-left">
        <span className="text-[9px] font-bold tracking-[1.5px]" style={{ color: 'var(--tx-dim)' }}>
          PAYLOAD
        </span>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          the frozen numbers this report was written from
        </span>
        <span className="ml-auto text-[11px] teal font-semibold">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <pre className="mt-3 p-3 rounded text-[10.5px] leading-[1.5] overflow-x-auto"
             style={{ background: 'var(--panel2)', color: 'var(--tx-mut)' }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtTs(ts: string | null) {
  if (!ts) return 'n/a';
  // Sliced rather than localized: a report's publication time is a fact about the pipeline, which
  // runs in UTC. Rendering it in the reader's zone would make the same report look like it went
  // out on different days to different people.
  return `${ts.slice(0, 10)} ${ts.slice(11, 16)} UTC`;
}

function Shell({ back, product, children }: { back: string; product?: string; children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <div className="flex items-center gap-3">
        <Link href={back} className="text-[11px] teal font-semibold">← Report archive</Link>
        {product && (
          <span className="text-[11px]" style={{ color: 'var(--tx-dim)' }}>{product}</span>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
