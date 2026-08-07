'use client';

// `/portfolios/[strategy]/reports` — the frozen report archive index ([08-WKLY]).
//
// Design: `08_website_and_tooling/performance_reporting_plan.md`. The archive lives INSIDE
// Portfolios rather than in its own section, per `website_research_hub_IA.md` §III–IV and
// `trading_ui_IA.md` §0.5: it would still make sense as a chart in a monthly report, so it is
// analytics, so it belongs here. Trading links to it; Trading does not host it.
//
// ROUTING NOTE. `reports` is a STATIC segment sitting beside the dynamic `[track]`. Next.js
// resolves static before dynamic, so `/portfolios/x/reports` lands here and never on the track
// page. It is unambiguous by construction because `TrackKey` is a closed union
// ('modeled' | 'ibkr' | 'live') that does not and must not contain 'reports' — an archive is not
// an implementation track, and modelling it as one would put it in the track selector where it
// would read as a fourth kind of book.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { productForSlug, PRODUCTS } from '@/lib/products';
import {
  fetchReportIndex, REPORT_TYPES, statusColor,
  type ReportIndexItem, type ReportType,
} from '@/lib/reports';

export default function ReportArchivePage() {
  const params = useParams();
  const slug = decodeURIComponent((params.strategy as string) || '');
  const product = productForSlug(slug);

  if (!product) {
    return (
      <Shell slug={slug}>
        <div className="panel p-10 text-center">
          <div className="text-sm mb-2" style={{ color: 'var(--tx)' }}>No portfolio for “{slug}”.</div>
          <div className="flex gap-2 justify-center text-[12px] flex-wrap">
            {PRODUCTS.map((p) => (
              <Link key={p.slug} href={`/portfolios/${p.slug}/reports`} className="teal font-semibold">
                {p.short}
              </Link>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // Reports are written against a real account's book, so a product with no IBKR track has no
  // archive — and says so, rather than rendering an empty list that reads like a reporting
  // failure. The two states must not look alike.
  if (!product.paperStrategy) {
    return (
      <Shell slug={slug} product={product.name}>
        <div className="panel p-10 text-center">
          <div className="text-sm mb-1" style={{ color: 'var(--tx)' }}>
            {product.name} has no report archive.
          </div>
          <div className="text-[11.5px] mb-4" style={{ color: 'var(--tx-mut)' }}>
            Reports are published against a book held in a broker account. This strategy is tracked
            as a modeled portfolio only, so there is nothing to archive — the modeled track carries
            its full history instead.
          </div>
          <Link href={`/portfolios/${product.slug}/modeled`} className="teal font-semibold text-[12px]">
            Modeled track →
          </Link>
        </div>
      </Shell>
    );
  }

  return <Archive slug={slug} strategy={product.paperStrategy} name={product.name} />;
}

function Archive({ slug, strategy, name }: { slug: string; strategy: string; name: string }) {
  const { data, error } = useSWR(['report-archive', strategy],
    () => fetchReportIndex(strategy), { revalidateOnFocus: false });

  return (
    <Shell slug={slug} product={name}>
      <div className="panel p-4 mb-3">
        <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Report archive
        </div>
        <div className="text-[11.5px] mt-1 leading-[1.6]" style={{ color: 'var(--tx-mut)' }}>
          Every report as it was published. The text is frozen at publication and served verbatim —
          it is not re-rendered from stored numbers, so a report reads today exactly as it read on
          the day it went out. A period that is later corrected gains a new revision; the earlier
          one stays readable.
        </div>
      </div>

      {error && (
        <div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>
          Failed to load the archive.
        </div>
      )}
      {!data && !error && (
        <div className="panel p-16 text-center muted text-sm">Loading archive…</div>
      )}

      {data && data.items.length === 0 && (
        <div className="panel p-10 text-center">
          <div className="text-sm" style={{ color: 'var(--tx)' }}>No reports published yet.</div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--tx-mut)' }}>
            The daily publishes Tue–Sat 03:00 UTC, the weekly Sat 03:15, the monthly on the 1st.
          </div>
        </div>
      )}

      {data && data.items.length > 0 && REPORT_TYPES.map(({ key, label, note }) => {
        const items = data.items.filter((r) => r.report_type === key);
        if (!items.length) return null;
        return (
          <div key={key} className="panel p-4 mb-3">
            <div className="flex items-baseline gap-2 mb-3">
              <div className="text-[13px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
                {label}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>{note}</div>
              <div className="ml-auto text-[11px]" style={{ color: 'var(--tx-dim)' }}>
                {items.length}
              </div>
            </div>
            <div className="space-y-1">
              {items.map((r) => <Row key={`${r.period_key}`} slug={slug} r={r} type={key} />)}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}

function Row({ slug, r, type }: { slug: string; r: ReportIndexItem; type: ReportType }) {
  return (
    <Link href={`/portfolios/${slug}/reports/${type}/${encodeURIComponent(r.period_key)}`}
          className="flex items-center gap-3 py-1.5 px-2 rounded transition-colors"
          style={{ background: 'transparent' }}>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--tx)', minWidth: 92 }}>
        {r.period_key}
      </span>
      <span className="text-[11px] tabular-nums" style={{ color: 'var(--tx-dim)' }}>
        {r.period_start === r.period_end ? r.period_start : `${r.period_start} → ${r.period_end}`}
      </span>

      {/* `warn` is the ordinary state — a report is published degraded and LABELLED rather than
          withheld — so the count is shown plainly and only `fail` reads as red. */}
      {r.n_degradations > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--panel2)', color: statusColor(r.status) }}>
          {r.n_degradations} degradation{r.n_degradations > 1 ? 's' : ''}
        </span>
      )}
      {r.restated && (
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'var(--panel2)', color: 'var(--amber)' }}
              title={`${r.n_revisions} revisions — this period was restated after first publication`}>
          restated ·  rev {r.revision}
        </span>
      )}
      {r.book_asof && r.book_asof !== r.period_end && (
        <span className="text-[10px]" style={{ color: 'var(--tx-dim)' }}
              title="the book this report was built from was older than the period it covers">
          book {r.book_asof}
        </span>
      )}
      <span className="ml-auto text-[11px] teal font-semibold">→</span>
    </Link>
  );
}

function Shell({ slug, product, children }: { slug: string; product?: string; children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <div className="flex items-center gap-3">
        <Link href={`/portfolios/${slug}`} className="text-[11px] teal font-semibold">
          ← {product || 'Portfolio'}
        </Link>
        <Link href="/portfolios" className="text-[11px] font-semibold" style={{ color: 'var(--tx-dim)' }}>
          All portfolios
        </Link>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
