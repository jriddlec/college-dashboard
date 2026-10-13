"use client";
/**
 * Estimated-grade history for one class, with a pin on each day a grade was
 * entered. Hovering (or tapping/focusing) a pin shows the date, the estimate
 * after that day, its change and the items graded that day.
 */
import { useState } from "react";

export interface TrendPoint {
  at: string;
  /** Date label, formatted on the server in the school timezone. */
  label: string;
  percent: number;
  items: { name: string; earned: number | null; possible: number | null }[];
}

const COLOR = "hsl(var(--hue) var(--course-s) var(--course-l))";

export function GradeTrend({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const w = 640, h = 180, l = 34, r = 12, t = 22, b = 22;
  const pts = points.map((p) => ({ ...p, ms: Date.parse(p.at) }));
  const vals = pts.map((p) => p.percent);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 3) / 5) * 5);
  const hi = Math.min(110, Math.ceil((Math.max(...vals) + 3) / 5) * 5);
  const t0 = pts[0].ms, t1 = pts[pts.length - 1].ms;
  const x = (ms: number) => (t1 === t0 ? (l + w - r) / 2 : l + ((ms - t0) / (t1 - t0)) * (w - l - r));
  const y = (v: number) => t + ((hi - v) / (hi - lo)) * (h - t - b);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.ms).toFixed(1)},${y(p.percent).toFixed(1)}`).join("");
  const ticks = [lo, (lo + hi) / 2, hi];
  const cur = active != null ? pts[active] : null;
  const delta = active ? pts[active].percent - pts[active - 1].percent : null;

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Estimated grade over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} stroke="var(--color-border)" />
            <text x={l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} className="fill-subtle tabular-nums">
              {Math.round(v)}
            </text>
          </g>
        ))}
        <text x={l} y={h - 5} fontSize={10.5} className="fill-subtle">{pts[0].label}</text>
        {pts.length > 1 && (
          <text x={w - r} y={h - 5} textAnchor="end" fontSize={10.5} className="fill-subtle">{pts[pts.length - 1].label}</text>
        )}
        <path d={d} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {cur && <line x1={x(cur.ms)} x2={x(cur.ms)} y1={t - 10} y2={h - b} stroke={COLOR} strokeOpacity={0.25} />}
        {pts.map((p, i) => {
          const cx = x(p.ms), cy = y(p.percent), on = i === active;
          return (
            <g
              key={p.at}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: ${p.percent.toFixed(1)}%`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(on ? null : i)}
            >
              <line x1={cx} x2={cx} y1={cy - 4} y2={cy - 13} stroke={COLOR} strokeWidth={1.5} />
              <circle cx={cx} cy={cy - 15} r={on ? 5 : 3.5} fill={COLOR} />
              <circle cx={cx} cy={cy} r={2.5} fill={COLOR} />
              <circle cx={cx} cy={cy - 8} r={12} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {cur && (
        <div
          className="pointer-events-none absolute z-10 w-72 max-w-[85%] rounded-lg border border-border bg-surface px-3 py-2 shadow-md text-[12px]"
          style={{
            left: `${(x(cur.ms) / w) * 100}%`,
            top: `${((y(cur.percent) - 18) / h) * 100}%`,
            transform: `translate(${x(cur.ms) > w * 0.6 ? "-100%" : x(cur.ms) < w * 0.4 ? "0" : "-50%"}, -100%)`,
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted">{cur.label}</span>
            <span className="tabular-nums font-medium">
              {cur.percent.toFixed(1)}%
              {delta != null && Math.abs(delta) >= 0.05 && (
                <span className={`ml-1.5 font-normal ${delta > 0 ? "text-muted" : "text-subtle"}`}>
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta).toFixed(1)}
                </span>
              )}
            </span>
          </div>
          {cur.items.length > 0 && (
            <ul className="mt-1.5 border-t border-border divide-y divide-border">
              {cur.items.map((it, j) => {
                const m = /^(.*?)\s*\((WebAssign)\)$/i.exec(it.name);
                const pct = it.earned != null && it.possible ? (it.earned / it.possible) * 100 : null;
                return (
                  <li key={j} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="min-w-0 leading-snug">
                      {m ? m[1] : it.name}
                      {m && <span className="ml-1 text-[10.5px] text-subtle">{m[2]}</span>}
                    </span>
                    {pct != null && (
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="font-medium">{Math.round(pct)}%</span>
                        <span className="block text-[10.5px] text-subtle">
                          {+it.earned!.toFixed(2)}/{+it.possible!.toFixed(2)}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
