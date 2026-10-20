/**
 * Final-grade projection that applies the syllabus's drop-lowest rules to
 * future work: every remaining item scores `x` (0–1), then each category
 * keeps its best scores.
 *
 * - Category with a `count` (items that count after drops): it will have
 *   count + dropLowest items; the ones not graded yet score x, and the best
 *   `count` are averaged. With nothing graded it's simply x.
 * - Category without a count: the remaining number of items is unknown, so
 *   its graded part keeps its drop-applied average and x fills the rest
 *   (`gradedShare`).
 *
 * Pure (no React), shared by the calculator and its tests.
 */
import type { CourseStanding } from "./types";

export type WhatIf = NonNullable<CourseStanding["whatIf"]>;

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

function categoryPercent(c: WhatIf["categories"][number], x: number): number {
  if (c.count != null) {
    const remaining = Math.max(0, c.count + c.dropLowest - c.scores.length);
    const all = [...c.scores, ...Array<number>(remaining).fill(x)].sort((a, b) => b - a);
    const kept = all.slice(0, Math.max(1, c.count));
    return kept.length ? mean(kept) : x;
  }
  if (!c.scores.length) return x;
  const kept = c.scores.length > c.dropLowest ? [...c.scores].sort((a, b) => b - a).slice(0, c.scores.length - c.dropLowest) : c.scores;
  return mean(kept) * c.gradedShare + x * (1 - c.gradedShare);
}

/** Projected final percent (0–100+) if every remaining item scores `percent`. */
export function projectWithDrops(m: WhatIf, percent: number): number {
  const x = percent / 100;
  const total = m.categories.reduce((s, c) => s + c.weight, 0);
  if (!total) return percent;
  const sum = m.categories.reduce((s, c) => s + c.weight * categoryPercent(c, x), 0);
  return (sum / total) * 100 + m.bonus;
}

/**
 * Lowest average on the remaining work that reaches `target`, or Infinity /
 * -Infinity when even 150% can't / even 0% can't miss.
 */
export function neededWithDrops(m: WhatIf, target: number): number {
  if (projectWithDrops(m, 0) >= target) return -Infinity;
  if (projectWithDrops(m, 150) < target) return Infinity;
  let lo = 0, hi = 150;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (projectWithDrops(m, mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
