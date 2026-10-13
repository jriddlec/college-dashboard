/**
 * Adds syllabus deliverables ($CONFIG_DIR/syllabus.json) that Brightspace
 * doesn't list yet. Each row is hidden once the course has an assignment
 * whose title matches the row's `match` regex.
 */
import type { Assignment, AssignmentKind, SchoolSnapshot } from "./types";

type Row = [title: string, kind: AssignmentKind, due: string, match: string];
export interface SyllabusCourse {
  items: Row[];
}

export function withSyllabusItems(snapshot: SchoolSnapshot, courses: Record<string, SyllabusCourse>): SchoolSnapshot {
  const extra: Assignment[] = [];
  for (const [code, cfg] of Object.entries(courses)) {
    const course = snapshot.courses.find((c) => c.code === code && c.isActive);
    if (!course) continue;
    const titles = snapshot.assignments.filter((a) => a.courseId === course.id).map((a) => a.title);
    for (const [title, kind, due, match] of cfg.items) {
      const re = new RegExp(match, "i");
      if (titles.some((t) => re.test(t))) continue;
      extra.push({
        id: `syl-${course.id}-${title}`,
        courseId: course.id,
        title: `${title} (syllabus)`,
        kind,
        dueAt: due,
        status: "unknown",
        pointsPossible: null,
        pointsEarned: null,
        url: null,
      });
    }
  }
  return extra.length ? { ...snapshot, assignments: [...snapshot.assignments, ...extra] } : snapshot;
}
