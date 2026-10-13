/**
 * Letter grades and GPA math. Each syllabus sets its own percent cutoffs
 * ($CONFIG_DIR/grading.json); courses without one use a common US
 * plus/minus scale. Anything derived from an estimated percent is an estimate.
 */
import type { CourseStanding } from "./types";

/** Letter → minimum percent, e.g. { "A": 93, "A-": 90, ... }. Below every cutoff is F. */
export type Scale = Record<string, number>;

export const DEFAULT_SCALE: Scale = { A: 93, "A-": 90, "B+": 87, B: 83, "B-": 80, "C+": 77, C: 73, "C-": 70, D: 60 };

/** 4.0-scale quality points (no D+/D-, as at many US schools; a syllabus that uses them is read as D). */
const QUALITY_POINTS: Record<string, number> = { A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, D: 1, F: 0 };

export function qualityPoints(letter: string): number {
  return QUALITY_POINTS[letter] ?? QUALITY_POINTS[letter.charAt(0)] ?? 0;
}

export function letterFor(percent: number, scale: Scale = DEFAULT_SCALE): { letter: string; points: number } {
  const hit = Object.entries(scale)
    .sort((a, b) => b[1] - a[1])
    .find(([, min]) => percent >= min);
  const letter = hit?.[0] ?? "F";
  return { letter, points: qualityPoints(letter) };
}

export interface Transcript {
  /** Cumulative GPA hours and quality points from completed terms. */
  gpaHours: number;
  qualityPoints: number;
  /** Credit hours for in-progress courses, keyed by code ("CSCI 1301"). */
  inProgress: { code: string; credits: number }[];
}

export interface GpaSummary {
  /** Completed terms only, exactly as the transcript states. */
  cumulative: number;
  /** Estimated GPA for the in-progress term from current standings. */
  term: number | null;
  /** Cumulative including the in-progress term at estimated letters. */
  projected: number | null;
  /** In-progress courses that couldn't be estimated (no standing yet or no matching course). */
  missing: string[];
  termHours: number;
}

export function gpaSummary(t: Transcript, standings: CourseStanding[], codeOf: (courseId: string) => string | null): GpaSummary {
  const byCode = new Map<string, CourseStanding>();
  for (const s of standings) {
    const code = codeOf(s.courseId);
    if (code) byCode.set(code, s);
  }
  let hours = 0, points = 0;
  const missing: string[] = [];
  for (const c of t.inProgress) {
    const s = byCode.get(c.code);
    if (!s) {
      missing.push(c.code);
      continue;
    }
    hours += c.credits;
    points += c.credits * qualityPoints(s.letter);
  }
  return {
    cumulative: t.gpaHours ? t.qualityPoints / t.gpaHours : 0,
    term: hours ? points / hours : null,
    projected: hours ? (t.qualityPoints + points) / (t.gpaHours + hours) : null,
    missing,
    termHours: hours,
  };
}
