'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { fetchPortfolioBacktests } from '@/lib/api';
import { PRODUCTS, productForSlug, slugForRow, fullLabelOf, INSAMPLE_END, type ProductDef } from '@/lib/products';
import { BacktestReport } from '@/components/portfolio/BacktestReport';

export default function StrategyPage() {
  const slug = decodeURIComponent((useParams().strategy as string) || '');
  const product = productForSlug(slug);
  const { data: prod, error } = useSWR(['pf-production'], () => fetchPortfolioBacktests({ production: true }),
    { revalidateOnFocus: false });

  if (!product) return <Shell><NotFound slug={slug} /></Shell>;
  if (error) return <Shell><div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load {product.name}.</div></Shell>;
  if (!prod) return <Shell><div className="panel p-16 text-center muted text-sm">Loading {product.name}…</div></Shell>;

  const row = prod.find((r) => slugForRow(r) === slug);
  if (!row) return <Shell><NotFound slug={slug} /></Shell>;

  const fullLabel = fullLabelOf(row.model_label);
  return (
    <BacktestReport
      label={fullLabel}
      backHref="/portfolios"
      backLabel="← All portfolios"
      periodLabel="In-sample 2005–2023 · live to 2026-03"
      boundaryDate={INSAMPLE_END}
      topSlot={<TrackSelector product={product} />}
    />
  );
}

function TrackSelector({ product }: { product: ProductDef }) {
  const tracks = [
    { key: 'modeled', label: 'Modeled paper', active: true, note: 'our optimizer + $5M cost model, continued to latest' },
    { key: 'ibkr', label: 'IBKR paper', active: false, note: 'coming soon — same strategy in IBKR paper (real margin/fees/borrow)' },
    { key: 'live', label: 'Live', active: false, note: 'coming soon — real capital' },
  ];
  return (
    <div className="panel p-4 mt-2 mb-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{product.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>{product.blurb}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-[1.5px] mr-1" style={{ color: 'var(--tx-dim)' }}>TRACK</span>
          {tracks.map((t) => (
            <span key={t.key} title={t.note}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
              style={t.active
                ? { background: 'var(--teal)', color: '#fffdf9' }
                : { background: 'var(--panel2)', color: 'var(--tx-dim)', cursor: 'not-allowed' }}>
              {t.label}{!t.active && <span className="ml-1 text-[8px] opacity-80">soon</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="panel p-10 text-center">
      <div className="text-sm mb-2" style={{ color: 'var(--tx)' }}>No production portfolio for “{slug}”.</div>
      <div className="flex gap-2 justify-center text-[12px]">
        {PRODUCTS.map((p) => (
          <Link key={p.slug} href={`/portfolios/${p.slug}`} className="teal font-semibold">{p.short}</Link>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <Link href="/portfolios" className="text-[11px] teal font-semibold">← All portfolios</Link>
      <div className="mt-2">{children}</div>
    </div>
  );
}
