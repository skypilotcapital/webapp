import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function MethodologyNote() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
          What This Signal Is — and Is Not
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-500 font-black mb-2">
              It is
            </p>
            <ul className="text-sm text-[var(--tx,#334155)] space-y-2 list-disc pl-5 leading-relaxed">
              <li>
                <b>Drawdown insurance for macro-led bear markets</b> — the 2000-02, 2008,
                2022 class of −25% to −55% declines, where deteriorating cycle data, credit
                stress and broken trend align.
              </li>
              <li>
                Fully interpretable: two states, three cycle votes, two fast latches — every
                state reproducible by hand from the component board.
              </li>
              <li>
                Point-in-time honest: every input enters only from its public release date;
                parameters are frozen as researched (no live re-tuning).
              </li>
            </ul>
          </div>
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-500 font-black mb-2">
              It is not
            </p>
            <ul className="text-sm text-[var(--tx,#334155)] space-y-2 list-disc pl-5 leading-relaxed">
              <li>
                <b>Not an alpha source.</b> The 2026 research review found no statistically
                robust forward-return skill across cycles for this model class — including
                our own prior version. We do not claim any.
              </li>
              <li>
                <b>Not fast-shock protection.</b> Exogenous crashes without macro
                deterioration (2018Q4-, 2025-type) are largely outside its sensing range;
                only the volatility gate partially responds. For SMID, the analogous gap
                is relative small-cap bears with no macro stress (1983-, 2024-type).
              </li>
              <li>Not a forecast of recessions, rates, or anything else beyond its states.</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-[var(--tx-mut,#475569)] leading-relaxed">
          The complete methodology — construction, every threshold and its provenance, the
          research program that produced v1.5 (including everything that failed), validation
          evidence, and change-control rules — is in the model document:{' '}
          <a
            href="/docs/macro_beta_v1_5_model_document.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 font-bold hover:underline"
          >
            Macro Beta Signal v1.5 — Model Document (PDF)
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
