/**
 * Adds syllabus deliverables ($CONFIG_DIR/syllabus.json) that Brightspace
 * doesn't list yet. Each row is hidden once the course has an assignment
 * whose title matches the row's `match` regex. An optional fifth element
 * `{ "inPerson": true }` marks things done in class (exams, in-class quizzes,
 * conversations): once their time passes they count as done instead of
 * "past due".
 */
import type { Assignment, AssignmentKind, SchoolSnapshot } from "./types";

type Row = [title: string, kind: AssignmentKind, due: string, match: string, options?: { inPerson?: boolean }];
export interface SyllabusCourse {
  items: Row[];
}

export function withSyllabusItems(snapshot: SchoolSnapshot, courses: Record<string, SyllabusCourse>): SchoolSnapshot {
  const extra: Assignment[] = [];
  for (const [code, cfg] of Object.entries(courses)) {
    const course = snapshot.courses.find((c) => c.code === code && c.isActive);
    if (!course) continue;
    const titles = snapshot.assignments.filter((a) => a.courseId === course.id).map((a) => a.title);
    for (const [title, kind, due, match, options] of cfg.items) {
      const re = new RegExp(match, "i");
      if (titles.some((t) => re.test(t))) continue;
      extra.push({
        id: `syl-${course.id}-${title}`,
        courseId: course.id,
        title,
        kind,
        dueAt: due,
        status: "unknown",
        pointsPossible: null,
        pointsEarned: null,
        url: null,
        source: "syllabus",
        ...(options?.inPerson ? { inPerson: true } : {}),
      });
    }
  }
  return extra.length ? { ...snapshot, assignments: [...snapshot.assignments, ...extra] } : snapshot;
}

/** In-person items whose time has passed count as done ("attended"). */
export function withAttendance(snapshot: SchoolSnapshot, now: Date): SchoolSnapshot {
  const t = now.getTime();
  return {
    ...snapshot,
    assignments: snapshot.assignments.map((a) =>
      a.inPerson && a.status === "unknown" && a.dueAt && Date.parse(a.dueAt) <= t ? { ...a, attended: true } : a,
    ),
  };
}
