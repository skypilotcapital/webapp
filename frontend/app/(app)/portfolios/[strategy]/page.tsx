'use client';

// `/portfolios/[strategy]` — redirects to the strategy's DEFAULT track ([08-PTRK] §X.2).
//
// A redirect rather than rendering the default in place, deliberately: the whole argument for
// making the track a route segment is that the URL must say which book you are looking at. A bare
// `/portfolios/sp500-ext-te6` that silently renders the IBKR book would leave a screenshot
// ambiguous about the one thing this page most needs to be unambiguous about.
//
// The default is the book we OWN wherever one exists. Leading with a simulation when a real
// portfolio exists is a false equivalence — see `defaultTrack`.

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PRODUCTS, productForSlug, defaultTrack } from '@/lib/products';

export default function StrategyPage() {
  const router = useRouter();
  const slug = decodeURIComponent((useParams().strategy as string) || '');
  const product = productForSlug(slug);

  useEffect(() => {
    if (product) router.replace(`/portfolios/${product.slug}/${defaultTrack(product)}`);
  }, [product, router]);

  if (!product) {
    return (
      <div className="animate-in">
        <Link href="/portfolios" className="text-[11px] teal font-semibold">← All portfolios</Link>
        <div className="panel p-10 text-center mt-2">
          <div className="text-sm mb-2" style={{ color: 'var(--tx)' }}>No portfolio for “{slug}”.</div>
          <div className="flex gap-2 justify-center text-[12px] flex-wrap">
            {PRODUCTS.map((p) => (
              <Link key={p.slug} href={`/portfolios/${p.slug}`} className="teal font-semibold">{p.short}</Link>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <div className="panel p-16 text-center muted text-sm">Opening {product.name}…</div>;
}
