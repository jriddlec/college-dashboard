/**
 * Adds WebAssign assignments ($CONFIG_DIR/webassign.json) to a snapshot.
 * Brightspace doesn't list them, so they're kept by hand and matched to a
 * course by its code.
 */
import type { Assignment, AssignmentKind, SchoolSnapshot } from "./types";
import type { Gradebook, GradebookItem } from "./standing";

type Row = [title: string, type: string, due: string, earned: number | null, possible: number, recorded?: string];

/** When a score counts as entered: the earlier of its due date and the day it was recorded in the config. */
function scoredAt(due: string, recorded: string | undefined): string {
  if (!recorded) return due;
  const r = new Date(`${recorded}T12:00:00-04:00`).toISOString();
  return Date.parse(r) < Date.parse(due) ? r : due;
}
export interface WebAssignCourse {
  url: string;
  earlyBonus?: { hours: number; percent: number; types: string[] };
  assignments: Row[];
}

const KINDS: Record<string, AssignmentKind> = { Homework: "assignment", "Pre-Class": "assignment", Quiz: "quiz" };

export function webAssignFor(courseId: string, cfg: WebAssignCourse): Assignment[] {
  const bonus = cfg.earlyBonus;
  return cfg.assignments.map(([title, type, due, earned, possible]) => {
    const hasBonus = !!bonus && bonus.types.includes(type);
    return {
      id: `wa-${courseId}-${title}`,
      courseId,
      title: `${title} (WebAssign)`,
      kind: KINDS[type] ?? "other",
      dueAt: due,
      status: earned === null ? "not_submitted" : "graded",
      pointsPossible: possible,
      pointsEarned: earned,
      url: cfg.url,
      earlyBonusAt: hasBonus ? new Date(Date.parse(due) - bonus.hours * 36e5).toISOString() : null,
      earlyBonusPercent: hasBonus ? bonus.percent : null,
    };
  });
}

export function withWebAssign(snapshot: SchoolSnapshot, courses: Record<string, WebAssignCourse>): SchoolSnapshot {
  const extra: Assignment[] = [];
  for (const [code, cfg] of Object.entries(courses)) {
    const course = snapshot.courses.find((c) => c.code === code && c.isActive);
    if (course) extra.push(...webAssignFor(course.id, cfg));
  }
  return extra.length ? { ...snapshot, assignments: [...snapshot.assignments, ...extra] } : snapshot;
}

/**
 * WebAssign scores as gradebook items, so a syllabus category matching
 * "webassign" (MATH 2260: 5%) counts them. Skipped when Brightspace already
 * carries a scored WebAssign item, to avoid counting it twice.
 */
export function withWebAssignGrades(code: string | null | undefined, book: Gradebook, courses: Record<string, WebAssignCourse> = {}): Gradebook {
  const cfg = code ? courses[code] : undefined;
  if (!cfg || book.items.some((i) => /webassign/i.test(i.name) && i.earned != null)) return book;
  const items: GradebookItem[] = cfg.assignments.map(([title, , due, earned, possible, recorded]) => ({
    id: `wa-${code}-${title}`,
    name: `${title} (WebAssign)`,
    categoryId: null,
    categoryName: "WebAssign",
    weight: null,
    earned,
    possible,
    at: earned === null ? null : scoredAt(due, recorded),
    excluded: false,
  }));
  return { ...book, items: [...book.items, ...items] };
}
