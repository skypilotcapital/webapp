'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelICCorrelation, fetchModelScorecard } from '@/lib/api';
import type { ModelICCorrelationEntry } from '@/types/api';

// Blue → cream → red diverging scale (light-theme: neutral pole = cream rgb 240,233,220)
function corrColor(rho: number | null): string {
  if (rho === null) return 'var(--panel2)';
  const t = Math.max(-1, Math.min(1, rho));
  if (t >= 0) {
    // cream → red (#dc2626)
    return `rgb(${Math.round(240 + (220 - 240) * t)},${Math.round(233 + (38 - 233) * t)},${Math.round(220 + (38 - 220) * t)})`;
  }
  // cream → blue (#2563eb)
  const s = -t;
  return `rgb(${Math.round(240 + (37 - 240) * s)},${Math.round(233 + (99 - 233) * s)},${Math.round(220 + (235 - 220) * s)})`;
}

function textColor(rho: number | null): string {
  return rho !== null && Math.abs(rho) > 0.55 ? '#ffffff' : '#26303c';
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
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-8 text-center">
        <p className="text-xs text-[var(--tx-dim)]">Loading IC correlation matrix…</p>
      </div>
    );
  }

  if (!corrData || corrData.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-8 text-center">
        <p className="text-xs text-[var(--tx-dim)]">
          No correlation data — run{' '}
          <code className="font-mono bg-[var(--bg2)] px-1 rounded">compute_ic_correlation.py</code>
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
      <p className="text-xs text-[var(--tx-dim)] mb-4 leading-relaxed">
        Pearson correlation of monthly universe IC series across base models.{' '}
        <span className="text-[var(--cyan)] font-medium">Blue = low correlation</span> — complementary signals,
        better ensemble candidates.{' '}
        <span className="text-[var(--neg)] font-medium">Red = high correlation</span> — similar bets,
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
                fill="var(--tx-dim)"
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
                fill="var(--tx-dim)"
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
                      stroke="var(--border-soft)"
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
            className="fixed z-50 pointer-events-none bg-[var(--panel2)] border border-[var(--border-soft)] text-[var(--tx)] text-xs rounded-xl px-3.5 py-2.5 shadow-2xl max-w-sm"
            style={{ left: tooltip.clientX + 14, top: tooltip.clientY - 14 }}
          >
            <p className="font-mono font-bold text-sm mb-1.5">
              {tooltip.entry.model_a} ↔ {tooltip.entry.model_b}
            </p>
            {tooltip.entry.model_a !== tooltip.entry.model_b && (
              <>
                <p className="text-[var(--tx-dim)] text-[10px] truncate">{tooltip.descA}</p>
                <p className="text-[var(--tx-dim)] text-[10px] truncate mb-2">{tooltip.descB}</p>
              </>
            )}
            <div className="flex gap-5">
              <div>
                <p className="text-[var(--tx-dim)] text-[10px] uppercase tracking-wide">IC Corr</p>
                <p className="font-semibold text-base tabular-nums">
                  {tooltip.entry.ic_correlation !== null
                    ? tooltip.entry.ic_correlation.toFixed(3)
                    : '—'}
                </p>
              </div>
              {tooltip.entry.n_common_months !== null && tooltip.entry.model_a !== tooltip.entry.model_b && (
                <div>
                  <p className="text-[var(--tx-dim)] text-[10px] uppercase tracking-wide">Months</p>
                  <p className="font-semibold">{tooltip.entry.n_common_months}</p>
                </div>
              )}
            </div>
            {tooltip.entry.model_a !== tooltip.entry.model_b &&
              tooltip.entry.ic_correlation !== null &&
              tooltip.entry.ic_correlation < 0.35 && (
                <p className="text-[var(--cyan)] text-[10px] mt-2 font-medium">
                  ↓ Low correlation — strong ensemble candidate
                </p>
              )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 text-[10px] text-[var(--tx-dim)]">
        <div className="flex items-center gap-1.5">
          <div
            className="w-20 h-3 rounded"
            style={{ background: 'linear-gradient(to right, #2563eb, #f0e9dc, #dc2626)' }}
          />
          <span>−1 → 0 → +1</span>
        </div>
        <span className="text-[var(--border-soft)]">|</span>
        <span>
          t-stat improvement from combining two models with correlation ρ:{' '}
          <span className="font-mono text-[var(--tx-mut)]">× √(2/(1+ρ))</span>
        </span>
      </div>
    </div>
  );
}
