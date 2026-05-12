'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelICCorrelation, fetchModelScorecard } from '@/lib/api';
import type { ModelICCorrelationEntry } from '@/types/api';

// Blue → white → red diverging scale
function corrColor(rho: number | null): string {
  if (rho === null) return '#e2e8f0';
  const t = Math.max(-1, Math.min(1, rho));
  if (t >= 0) {
    // white (#f8fafc) → red (#dc2626)
    return `rgb(${Math.round(248 + (220 - 248) * t)},${Math.round(250 + (38 - 250) * t)},${Math.round(252 + (38 - 252) * t)})`;
  }
  // white → blue (#2563eb)
  const s = -t;
  return `rgb(${Math.round(248 + (37 - 248) * s)},${Math.round(250 + (99 - 250) * s)},${Math.round(252 + (235 - 252) * s)})`;
}

function textColor(rho: number | null): string {
  return rho !== null && Math.abs(rho) > 0.58 ? '#ffffff' : '#1e293b';
}

interface TooltipState {
  clientX: number;
  clientY: number;
  entry: ModelICCorrelationEntry;
  descA: string;
  descB: string;
}

const CELL = 40;
const LABEL_W = 58;
const LABEL_H = 74;

export function ModelICCorrelationMatrix() {
  const { data: corrData, isLoading } = useSWR(
    'model-ic-correlation',
    fetchModelICCorrelation,
    { revalidateOnFocus: false },
  );
  const { data: scorecard } = useSWR(
    'model-scorecard',
    fetchModelScorecard,
    { revalidateOnFocus: false },
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-8 text-center">
        <p className="text-xs text-slate-400">Loading IC correlation matrix…</p>
      </div>
    );
  }

  if (!corrData || corrData.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-8 text-center">
        <p className="text-xs text-slate-400">
          No correlation data — run{' '}
          <code className="font-mono bg-slate-100 px-1 rounded">compute_ic_correlation.py</code>
        </p>
      </div>
    );
  }

  // Build lookup maps
  const corrMap = new Map<string, ModelICCorrelationEntry>();
  for (const e of corrData) corrMap.set(`${e.model_a}||${e.model_b}`, e);

  const modelIds = [...new Set(corrData.map((e) => e.model_a))].sort();
  const descMap = new Map<string, string>(
    (scorecard ?? []).map((r) => [r.model_id, r.description]),
  );

  const N = modelIds.length;
  const svgW = LABEL_W + N * CELL;
  const svgH = LABEL_H + N * CELL;

  return (
    <div className="p-5">
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Pearson correlation of monthly universe IC series across base models.{' '}
        <span className="text-blue-600 font-medium">Blue = low correlation</span> — complementary signals,
        better ensemble candidates.{' '}
        <span className="text-red-500 font-medium">Red = high correlation</span> — similar bets,
        little diversification benefit.
      </p>

      <div className="relative overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          className="block"
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Column headers — rotated 45° */}
          {modelIds.map((mid, j) => {
            const cx = LABEL_W + j * CELL + CELL / 2;
            return (
              <text
                key={`col-${mid}`}
                x={cx}
                y={LABEL_H - 8}
                textAnchor="start"
                fontSize={10}
                fill="#64748b"
                fontFamily="ui-monospace, monospace"
                transform={`rotate(-45, ${cx}, ${LABEL_H - 8})`}
              >
                {mid}
              </text>
            );
          })}

          {modelIds.map((ma, i) => (
            <g key={`row-${ma}`}>
              {/* Row label */}
              <text
                x={LABEL_W - 6}
                y={LABEL_H + i * CELL + CELL / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill="#64748b"
                fontFamily="ui-monospace, monospace"
              >
                {ma}
              </text>

              {/* Cells */}
              {modelIds.map((mb, j) => {
                const entry = corrMap.get(`${ma}||${mb}`);
                const corr = entry?.ic_correlation ?? null;
                const cx = LABEL_W + j * CELL;
                const cy = LABEL_H + i * CELL;
                return (
                  <g
                    key={`${ma}-${mb}`}
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={(e) =>
                      setTooltip({
                        clientX: e.clientX,
                        clientY: e.clientY,
                        entry: entry ?? { model_a: ma, model_b: mb, ic_correlation: null, n_common_months: null },
                        descA: descMap.get(ma) ?? ma,
                        descB: descMap.get(mb) ?? mb,
                      })
                    }
                    onMouseMove={(e) =>
                      setTooltip((prev) => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)
                    }
                  >
                    <rect
                      x={cx} y={cy}
                      width={CELL} height={CELL}
                      fill={corrColor(corr)}
                      stroke="white"
                      strokeWidth={0.75}
                    />
                    <text
                      x={cx + CELL / 2}
                      y={cy + CELL / 2 + 3.5}
                      textAnchor="middle"
                      fontSize={9}
                      fill={textColor(corr)}
                      fontFamily="ui-monospace, monospace"
                    >
                      {corr !== null ? corr.toFixed(2) : '—'}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>

        {/* Tooltip rendered outside SVG for proper positioning */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none bg-slate-900/95 text-white text-xs rounded-xl px-3.5 py-2.5 shadow-2xl max-w-sm"
            style={{ left: tooltip.clientX + 14, top: tooltip.clientY - 14 }}
          >
            <p className="font-mono font-bold text-sm mb-1.5">
              {tooltip.entry.model_a} ↔ {tooltip.entry.model_b}
            </p>
            {tooltip.entry.model_a !== tooltip.entry.model_b && (
              <>
                <p className="text-slate-400 text-[10px] truncate">{tooltip.descA}</p>
                <p className="text-slate-400 text-[10px] truncate mb-2">{tooltip.descB}</p>
              </>
            )}
            <div className="flex gap-5">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide">IC Corr</p>
                <p className="font-semibold text-base tabular-nums">
                  {tooltip.entry.ic_correlation !== null
                    ? tooltip.entry.ic_correlation.toFixed(3)
                    : '—'}
                </p>
              </div>
              {tooltip.entry.n_common_months !== null && tooltip.entry.model_a !== tooltip.entry.model_b && (
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide">Months</p>
                  <p className="font-semibold">{tooltip.entry.n_common_months}</p>
                </div>
              )}
            </div>
            {tooltip.entry.model_a !== tooltip.entry.model_b &&
              tooltip.entry.ic_correlation !== null &&
              tooltip.entry.ic_correlation < 0.35 && (
                <p className="text-blue-300 text-[10px] mt-2 font-medium">
                  ↓ Low correlation — strong ensemble candidate
                </p>
              )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <div
            className="w-20 h-3 rounded"
            style={{ background: 'linear-gradient(to right, #2563eb, #f8fafc, #dc2626)' }}
          />
          <span>−1 → 0 → +1</span>
        </div>
        <span className="text-slate-200">|</span>
        <span>
          t-stat improvement from combining two models with correlation ρ:{' '}
          <span className="font-mono text-slate-500">× √(2/(1+ρ))</span>
        </span>
      </div>
    </div>
  );
}
