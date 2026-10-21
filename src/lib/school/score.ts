/**
 * How a score reads at a glance: "8/10 · 80%", with a tone for color.
 * Scores over 100% (early-submission bonus, extra credit) read as a bonus.
 */
export type ScoreTone = "bonus" | "good" | "fair" | "low" | "bad";

export interface Score {
  percent: number;
  tone: ScoreTone;
  /** "8/10" */
  points: string;
  /** "80%", "110%" */
  pct: string;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

export function toneOf(percent: number): ScoreTone {
  if (percent > 100.05) return "bonus";
  if (percent >= 80) return "good";
  if (percent >= 70) return "fair";
  if (percent >= 60) return "low";
  return "bad";
}

export function scoreOf(earned: number | null | undefined, possible: number | null | undefined): Score | null {
  if (earned == null || !possible) return null;
  const percent = (earned / possible) * 100;
  return { percent, tone: toneOf(percent), points: `${num(earned)}/${num(possible)}`, pct: `${Math.round(percent)}%` };
}

/** Text color class for a tone (fair stays neutral). */
export const SCORE_TEXT: Record<ScoreTone, string> = {
  bonus: "text-ok",
  good: "text-ok",
  fair: "text-muted",
  low: "text-warn",
  bad: "text-danger",
};
