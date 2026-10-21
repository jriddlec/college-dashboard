/**
 * "What do I need" for a class in one line: the average needed on the rest
 * of the work to keep the current letter and to reach the next one up.
 * Same math as the class page's calculator (syllabus drops when known).
 */
import { DEFAULT_SCALE } from "./gpa";
import { neededWithDrops } from "./whatif";
import type { CourseStanding } from "./types";

export interface Target {
  letter: string;
  /** Average (0–100+) needed on the remaining work; <= 0 means locked in. */
  need: number;
}

export function gradeTargets(st: CourseStanding): { keep: Target | null; next: Target | null } {
  const rest = 100 - st.gradedWeight;
  if (rest <= 0) return { keep: null, next: null };
  const scale = Object.entries(st.scale ?? DEFAULT_SCALE).sort((a, b) => b[1] - a[1]);
  const need = (min: number) => (st.whatIf ? neededWithDrops(st.whatIf, min) : (min * 100 - st.percent * st.gradedWeight) / rest);
  const i = scale.findIndex(([letter]) => letter === st.letter);
  const keep = i >= 0 ? { letter: scale[i][0], need: need(scale[i][1]) } : null;
  const next = i > 0 ? { letter: scale[i - 1][0], need: need(scale[i - 1][1]) } : null;
  return { keep: keep && Number.isFinite(keep.need) ? keep : null, next: next && Number.isFinite(next.need) && next.need <= 100 ? next : null };
}

/** "Keep B: 74% · A: 91%" (averages on what's left), or null when nothing is useful to say. */
export function targetLine(st: CourseStanding): string | null {
  const { keep, next } = gradeTargets(st);
  const parts = [
    keep ? (keep.need <= 0 ? `${keep.letter} locked in` : `Keep ${keep.letter}: ${Math.ceil(keep.need)}%`) : null,
    next ? `${next.letter}: ${Math.ceil(Math.max(0, next.need))}%` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
