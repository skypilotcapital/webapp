'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { fetchPortfolioDetail, fetchPortfolioHoldings, fetchPortfolioSectorAllocation } from '@/lib/api';
import { pct, pctSign, num, fmtSector, fmtTurn } from '@/lib/portfolio';
import { CumulativeChart, DrawdownChart } from '@/components/portfolio/charts';

export default function BacktestReportPage() {
  const label = decodeURIComponent((useParams().label as string) || '');
  const { data, error } = useSWR(['pf-detail', label], () => fetchPortfolioDetail(label), { revalidateOnFocus: false });
  const { data: holdings } = useSWR(['pf-hold', label], () => fetchPortfolioHoldings(label, undefined), { revalidateOnFocus: false });
  const { data: sectors } = useSWR(['pf-sec', label], () => fetchPortfolioSectorAllocation(label), { revalidateOnFocus: false });

  if (error) return <Back label={label}><div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load {label}.</div></Back>;
  if (!data) return <Back label={label}><div className="panel p-16 text-center muted text-sm">Loading report…</div></Back>;

  const m = data.meta;
  const uni = m.universe === 'r2500' ? 'r2500' : 'sp500';
  const modelsHref = uni === 'r2500' ? '/research/r2500-models' : '/research/models';
  const factorsHref = uni === 'r2500' ? '/research/r2500-factors' : '/research/factors';
  const dates = data.monthly.map((p) => p.date);
  const cons = [m.te_target != null ? `TE ${pct(m.te_target, 0)}` : null,
    `sector ${fmtSector(m.sector_tol)}`, `turnover ${fmtTurn(m.turnover_cap)}`, `λ${m.lambda_risk}`].filter(Boolean).join(' · ');

  const kpis: [string, string, string?][] = [
    ['Ann Active', pctSign(m.ann_active), 'vs cap-wtd universe'],
    ['Info Ratio', num(m.ir), ' '],
    ['Sharpe (net)', num(m.sharpe_net), ' '],
    ['Realized TE', pct(m.realized_te), `target ${pct(m.te_target, 0)}`],
    ['Pred TE', pct(m.pred_te), 'risk model'],
    ['Max Drawdown', pct(m.max_drawdown, 0), ' '],
    ['Turnover/mo', pct(m.avg_turnover, 0), `TC ${num(m.tc_drag_bps, 1)}bps`],
    ['Optimal', pct(m.opt_pct, 0), `${pct(m.inacc_pct, 0)} inacc`],
  ];

  return (
    <Back label={label}>
      {/* config header */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{m.signal_model_id} · {m.experiment}</h1>
        <span className="pill pill-cyan">{uni === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{m.strategy === 'long_short' ? 'Long-short' : 'Long-only'}</span>
        <span className="pill pill-ok">{pct(m.opt_pct, 0)} optimal</span>
        <span className="pill pill-warn">Out-of-sample 2005–2023</span>
        <span className="mono text-[11px] muted">{cons}</span>
        <span className="ml-auto text-[11px] muted">Drill ▸ <Link href={modelsHref} className="teal font-semibold">{m.signal_model_id} (P02)</Link> ▸ <Link href={factorsHref} className="teal font-semibold">Factors (P01)</Link></span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 mb-4">
        {kpis.map(([l, v, s]) => (
          <div key={l} className="kpi">
            <div className="kpi-l">{l}</div>
            <div className="kpi-v" style={{ color: v.startsWith('+') ? 'var(--pos)' : v.startsWith('-') || v.startsWith('−') ? 'var(--neg)' : 'var(--tx)' }}>{v}</div>
            <div className="kpi-s">{s}</div>
          </div>
        ))}
      </div>

      {/* performance */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4 xl:col-span-2">
          <div className="panel-head">Cumulative Net Return</div>
          <div className="panel-sub mb-1">Growth of 100 · net of cost · vs cap-weighted universe</div>
          <div className="flex gap-4 text-[10px] muted mb-1">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Portfolio</span>
            <span><span style={{ color: 'var(--bench)' }}>■</span> Benchmark (cap-wtd universe)</span>
          </div>
          <CumulativeChart dates={dates} series={[
            { label: 'Portfolio', color: 'var(--teal)', values: data.monthly.map((p) => p.cum_portfolio) },
            { label: 'Benchmark', color: 'var(--bench)', values: data.monthly.map((p) => p.cum_benchmark), dash: true },
          ]} />
          <div className="panel-head mt-3">Drawdown</div>
          <DrawdownChart dates={dates} dd={data.monthly.map((p) => p.drawdown)} />
        </div>

        <div className="panel p-4">
          <div className="panel-head">Sector Allocation <span className="muted" style={{ fontWeight: 400 }}>· latest</span></div>
          <div className="panel-sub mb-2">portfolio weight by sector</div>
          <div className="space-y-1.5">
            {(sectors ?? []).map((s) => (
              <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[10.5px]">
                <span className="w-28 truncate muted text-right">{s.sector ?? '—'}</span>
                <div className="flex-1 h-2.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="h-2.5 rounded" style={{ width: `${Math.min(100, (s.weight ?? 0) * 100)}%`, background: 'var(--teal)', opacity: 0.8 }} />
                </div>
                <span className="mono w-10" style={{ color: 'var(--tx)' }}>{pct(s.weight)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* holdings */}
      <div className="panel p-4 mt-4">
        <div className="panel-head">Top Holdings <span className="muted" style={{ fontWeight: 400 }}>· latest rebalance · {holdings?.length ?? 0} names</span></div>
        <div className="panel-sub mb-2">weight &amp; trade at the most recent month-end</div>
        <div className="overflow-x-auto" style={{ maxHeight: '40vh' }}>
          <table className="dtable">
            <thead><tr><th>Ticker</th><th>Name</th><th>Sector</th><th>Weight</th><th>Trade</th></tr></thead>
            <tbody>
              {(holdings ?? []).slice(0, 40).map((h) => (
                <tr key={h.isin}>
                  <td>{h.ticker ?? '—'}</td>
                  <td className="muted" style={{ textAlign: 'left', fontFamily: 'inherit' }}>{h.name ?? h.isin}</td>
                  <td className="dim" style={{ textAlign: 'left', fontFamily: 'inherit' }}>{h.sector ?? '—'}</td>
                  <td style={{ color: 'var(--tx)' }}>{pct(h.weight, 2)}</td>
                  <td style={{ color: (h.trade_pct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{h.trade_pct == null ? '—' : pctSign(h.trade_pct, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] dim mt-4" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
        Out-of-sample 2005–2023. Full institutional tearsheet (rolling vol/TE, regime table, factor-exposure attribution, published-index overlay) arrives in Phase 4. Config label: <span className="mono">{label}</span>
      </div>
    </Back>
  );
}

function Back({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <Link href="/research/portfolios" className="text-[11px] teal font-semibold">← Back to Portfolios</Link>
      <div className="mt-2">{children}</div>
    </div>
  );
}
