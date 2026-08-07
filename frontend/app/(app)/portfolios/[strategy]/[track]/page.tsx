'use client';

// `/portfolios/[strategy]/[track]` — one strategy, followed across implementation tracks
// ([08-PTRK] §X.1). Design: `08_website_and_tooling/website_research_hub_IA.md` §IX–§XV.
//
// The track is a ROUTE SEGMENT rather than component state, for the same reason `[env]` is one in
// the Trading section: a URL is shareable, screenshottable and bookmarkable, and "which book is
// this?" must be answerable from the address bar and from any screenshot pasted into Slack.
//
// IBKR is still a TRACK, not a section — §III's architectural call stands, and splitting the real
// book into its own section would destroy the modeled-vs-actual comparison and duplicate the
// report. What changed on 2026-08-07 is emphasis, not architecture: one of the tracks is now the
// portfolio we own, so it is the default (see `defaultTrack`) and it has its own door in the
// sidebar. Same page, two doors.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { fetchPortfolioBacktests } from '@/lib/api';
import {
  PRODUCTS, productForSlug, slugForRow, fullLabelOf, INSAMPLE_END,
  TRACKS, trackAvailable, type ProductDef, type TrackKey,
} from '@/lib/products';
import { BacktestReport } from '@/components/portfolio/BacktestReport';
import { PaperTrack } from '@/components/portfolio/PaperTrack';

export default function StrategyTrackPage() {
  const params = useParams();
  const slug = decodeURIComponent((params.strategy as string) || '');
  const track = decodeURIComponent((params.track as string) || '') as TrackKey;
  const product = productForSlug(slug);

  if (!product) return <Shell><NotFound slug={slug} /></Shell>;

  // An unavailable track is NOT rendered as an empty version of itself — that would look like a
  // book with nothing in it rather than a track that does not exist.
  if (!TRACKS.some((t) => t.key === track) || !trackAvailable(product, track)) {
    return <Shell><NoTrack product={product} track={track} /></Shell>;
  }

  if (track === 'ibkr') {
    return (
      <PaperTrack
        strategy={product.paperStrategy}
        topSlot={<TrackSelector product={product} active="ibkr" />}
      />
    );
  }
  return <ModeledTrack product={product} slug={slug} />;
}

/* ---------------------------------------------------------------- modeled track ---- */
function ModeledTrack({ product, slug }: { product: ProductDef; slug: string }) {
  const { data: prod, error } = useSWR(['pf-production'],
    () => fetchPortfolioBacktests({ production: true }), { revalidateOnFocus: false });

  const selector = <TrackSelector product={product} active="modeled" />;

  // A product with an EXPLICIT fullLabel is a single materialized-blend label — render it straight
  // with the honest full-period framing. The locked optimizer finalists derive theirs from the
  // is_production row and fall through to the DB path below.
  if (product.fullLabel) {
    return (
      <BacktestReport
        label={product.fullLabel}
        backHref="/portfolios"
        backLabel="← All portfolios"
        periodLabel={product.track === 'production'
          ? 'Full track 2005–2026 · modeled paper · the modeled twin of the book traded in IBKR paper'
          : product.track === 'candidate'
          ? 'Full track 2005–2026 · production candidate (config-locked and tracked, not held)'
          : 'Full track 2005–2026 · research (OOS descriptive)'}
        boundaryDate={INSAMPLE_END}
        costAum={product.costAum}
        topSlot={selector}
      />
    );
  }
  if (error) return <Shell><div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load {product.name}.</div></Shell>;
  if (!prod) return <Shell><div className="panel p-16 text-center muted text-sm">Loading {product.name}…</div></Shell>;

  const row = prod.find((r) => slugForRow(r) === slug);
  if (!row) return <Shell><NotFound slug={slug} /></Shell>;

  return (
    <BacktestReport
      label={fullLabelOf(row.model_label)}
      backHref="/portfolios"
      backLabel="← All portfolios"
      periodLabel="In-sample 2005–2023"
      boundaryDate={INSAMPLE_END}
      topSlot={selector}
    />
  );
}

/* -------------------------------------------------------------- track selector ---- */
export function TrackSelector({ product, active }: { product: ProductDef; active: TrackKey }) {
  return (
    <div className="panel p-4 mt-2 mb-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
            {product.name}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>{product.blurb}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-[1.5px] mr-1" style={{ color: 'var(--tx-dim)' }}>
            TRACK
          </span>
          {TRACKS.map((t) => {
            const avail = trackAvailable(product, t.key);
            const isActive = t.key === active;
            const cls = 'text-[11px] font-semibold px-2.5 py-1 rounded-md';
            const style = isActive
              ? { background: 'var(--teal)', color: '#fffdf9' }
              : avail
              ? { background: 'var(--panel2)', color: 'var(--tx)' }
              : { background: 'var(--panel2)', color: 'var(--tx-dim)', cursor: 'not-allowed' };
            return avail && !isActive ? (
              <Link key={t.key} href={`/portfolios/${product.slug}/${t.key}`}
                title={t.note} className={cls} style={style}>{t.label}</Link>
            ) : (
              <span key={t.key} title={t.note} className={cls} style={style}>
                {t.label}{!avail && <span className="ml-1 text-[8px] opacity-80">soon</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- fallbacks ---- */
function NoTrack({ product, track }: { product: ProductDef; track: string }) {
  return (
    <div className="panel p-10 text-center">
      <div className="text-sm mb-1" style={{ color: 'var(--tx)' }}>
        {product.name} has no <b>{track || 'unnamed'}</b> track.
      </div>
      <div className="text-[11.5px] mb-3" style={{ color: 'var(--tx-mut)' }}>
        {track === 'ibkr'
          ? 'No IBKR account holds this strategy. Only the traded extension has one.'
          : 'Real capital has not been committed to any strategy.'}
      </div>
      <div className="flex gap-3 justify-center text-[12px]">
        {TRACKS.filter((t) => trackAvailable(product, t.key)).map((t) => (
          <Link key={t.key} href={`/portfolios/${product.slug}/${t.key}`} className="teal font-semibold">
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="panel p-10 text-center">
      <div className="text-sm mb-2" style={{ color: 'var(--tx)' }}>No portfolio for “{slug}”.</div>
      <div className="flex gap-2 justify-center text-[12px] flex-wrap">
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
