"use client";

import { useState } from "react";
import clsx from "clsx";
import { neededWithDrops, projectWithDrops, type WhatIf } from "@/lib/school/whatif";

type Scale = Record<string, number>;

function letterFor(percent: number, scale: Scale): string {
  return Object.entries(scale).sort((a, b) => b[1] - a[1]).find(([, min]) => percent >= min)?.[0] ?? "F";
}

/**
 * What-if math over the estimate. Plain: the graded part keeps its current
 * percent and the rest of the final grade is filled at the average you pick:
 *   final = (current × graded + remaining-average × (100 − graded)) / 100
 * With drops (syllabus drop-lowest rules): see lib/school/whatif.ts.
 */
export function GradeCalculator({ percent, gradedWeight, scale, whatIf }: { percent: number; gradedWeight: number; scale: Scale; whatIf?: WhatIf | null }) {
  const rest = 100 - gradedWeight;
  const [avg, setAvg] = useState(() => Math.round(percent));
  const [drops, setDrops] = useState(true);
  if (rest <= 0) return null;
  const useDrops = drops && !!whatIf;
  const project = (x: number) => (useDrops ? projectWithDrops(whatIf!, x) : (percent * gradedWeight + x * rest) / 100);
  const need = (target: number) => (useDrops ? neededWithDrops(whatIf!, target) : (target * 100 - percent * gradedWeight) / rest);
  const final = project(avg);
  const targets = Object.entries(scale).sort((a, b) => b[1] - a[1]);
  const dropped = whatIf?.categories.filter((c) => c.dropLowest > 0) ?? [];

  return (
    <div className="card p-4 space-y-4">
      {whatIf && (
        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer select-none">
          <input type="checkbox" checked={drops} onChange={(e) => setDrops(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            Apply syllabus drops
            <span className="block text-[11.5px] text-subtle">
              {dropped.map((c) => `${c.name}: lowest ${c.dropLowest} dropped`).join(" · ")}
            </span>
          </span>
        </label>
      )}
      <div>
        <label htmlFor="what-if" className="flex items-baseline justify-between gap-3 text-[13px]">
          <span>
            If you average <strong className="tabular-nums">{avg}%</strong> on the remaining {rest}%
          </span>
          <span className="tabular-nums whitespace-nowrap">
            → <strong>{letterFor(final, scale)}</strong> <span className="text-muted">{final.toFixed(1)}%</span>
          </span>
        </label>
        <input id="what-if" type="range" min={0} max={110} value={avg} onChange={(e) => setAvg(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)]" />
      </div>
      <div>
        <div className="text-[12px] text-muted mb-1.5">Average needed on the rest for…</div>
        <ul className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {targets.map(([letter, min]) => {
            const n = need(min);
            const out = n > 100 ? "out" : n <= 0 ? "safe" : null;
            return (
              <li key={letter} className={clsx("rounded-md border border-border px-2 py-1.5 text-center", out === "out" && "opacity-50")}>
                <div className="text-[13px] font-medium">{letter}</div>
                <div className={clsx("text-[11.5px] tabular-nums", out === "safe" ? "text-ok" : "text-muted")}>
                  {out === "safe" ? "locked in" : out === "out" ? (Number.isFinite(n) ? `${Math.round(n)}%` : "out of reach") : `${Math.ceil(n)}%`}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-[11.5px] text-subtle">
        {useDrops
          ? "Every remaining item scores the slider value, then each category keeps its best scores per the syllabus. Ignores curves."
          : `Based on the current estimate (${percent.toFixed(1)}% over ${gradedWeight}% graded). Ignores future drops, bonus and curves.`}
      </p>
    </div>
  );
}
