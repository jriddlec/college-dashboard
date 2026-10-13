/**
 * Converts the raw Canvas REST API responses saved by scripts/canvas_sync.py
 * into the normalized model. This is the ONLY place that knows Canvas's
 * shapes (https://canvas.instructure.com/doc/api/).
 *
 * Written against the API docs and hand-made fixtures (./fixtures), not yet a
 * live school: every field is read defensively, and a record missing the
 * essentials is skipped with a warning instead of failing the snapshot.
 */
import type { Announcement, Assignment, AssignmentKind, AssignmentStatus, CalendarEvent, Course, CourseStanding, Grade, SchoolSnapshot } from "../types";
import { courseStanding, type Gradebook, type Syllabus } from "../standing";
import { withWebAssignGrades, type WebAssignCourse } from "../webassign";
import { withQuizLog } from "../quizlog";
import { cleanName, date, stripHtml, subjectCode } from "../d2l/normalize";
import { LMS_URL } from "@/lib/settings";

/** Files written by scripts/canvas_sync.py, already JSON-parsed. */
export interface CanvasRaw {
  fetchedAt: string;
  failures: string[];
  courses?: unknown;
  announcements?: unknown;
  calendar?: unknown;
  /** Keyed by course id. */
  perCourse: Record<string, { assignments?: unknown; assignmentGroups?: unknown }>;
  /** Quiz log markdown by course code, for syllabi with a `quizLog`. */
  quizLogs?: Record<string, string>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Obj | null => (isObj(v) ? v : null);

/** "course_101" → "101" */
const contextCourse = (v: unknown): string | null => str(v)?.match(/^course_(\d+)$/)?.[1] ?? null;

const EXAM = /\b(exam|midterm|final|test)\b/i;
/** Events about an exam that aren't the exam. */
const NOT_EXAM = /\b(review|study|prep|help|office hours?)\b/i;

export function normalizeCourses(raw: unknown, warnings: string[]): Course[] {
  const out: Course[] = [];
  for (const c of objs(raw)) {
    const id = str(c.id);
    const name = str(c.name);
    if (!id || !name) {
      warnings.push("Skipped a Canvas course without an id or name.");
      continue;
    }
    const rawCode = str(c.course_code);
    const subject = subjectCode(rawCode) ?? subjectCode(name);
    const term = obj(c.term);
    const teacher = objs(c.teachers)[0];
    out.push({
      id,
      code: subject,
      name: cleanName(name),
      // Canvas's "Default Term" is a placeholder, not a semester.
      term: str(term?.name) && !/^default term$/i.test(str(term?.name)!) ? str(term?.name) : null,
      instructor: str(teacher?.display_name),
      url: `${LMS_URL}/courses/${id}`,
      startsAt: date(c.start_at) ?? date(term?.start_at),
      endsAt: date(c.end_at) ?? date(term?.end_at),
      isActive: str(c.workflow_state) !== "completed",
      // Orientation and training courses have no subject code.
      isClass: subject !== null,
    });
  }
  return out;
}

function kindOf(a: Obj): AssignmentKind {
  const types = Array.isArray(a.submission_types) ? a.submission_types : [];
  if (a.is_quiz_assignment === true || a.quiz_id != null || types.includes("online_quiz")) return "quiz";
  if (isObj(a.discussion_topic) || types.includes("discussion_topic")) return "discussion";
  if (EXAM.test(str(a.name) ?? "")) return "exam";
  return "assignment";
}

/** Submission state independent of time; "unknown" when Canvas can't take the work online. */
function statusOf(a: Obj): AssignmentStatus {
  const s = obj(a.submission);
  const offline = (Array.isArray(a.submission_types) ? a.submission_types : []).every((t) => ["none", "on_paper", "not_graded", "external_tool"].includes(String(t)));
  if (!s) return "unknown";
  if (s.excused === true) return "graded";
  const state = str(s.workflow_state);
  if (state === "graded" && (num(s.score) != null || str(s.grade))) return "graded";
  if (state === "submitted" || state === "pending_review" || s.submitted_at) return "submitted";
  return offline ? "unknown" : "not_submitted";
}

export function normalizeAssignments(raw: CanvasRaw, known: Set<string>, warnings: string[]): Assignment[] {
  const out: Assignment[] = [];
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    if (known.size && !known.has(cid)) continue;
    for (const a of objs(c.assignments)) {
      const id = str(a.id);
      const title = str(a.name);
      if (!id || !title) {
        warnings.push(`Skipped a Canvas assignment without an id or name (course ${cid}).`);
        continue;
      }
      if (a.published === false || str(a.grading_type) === "not_graded") continue;
      const s = obj(a.submission);
      out.push({
        id: `${cid}:${id}`,
        courseId: cid,
        title,
        kind: kindOf(a),
        dueAt: date(a.due_at),
        status: statusOf(a),
        pointsPossible: num(a.points_possible),
        pointsEarned: s && s.excused !== true ? num(s.score) : null,
        url: str(a.html_url) ?? `${LMS_URL}/courses/${cid}/assignments/${id}`,
      });
    }
  }
  return out;
}

/**
 * Scored items. Canvas's own course total (enrollment computed_current_score)
 * is left out on purpose: `isCourseTotal` means a released final grade, and
 * the running current score is what the estimate (standings) already shows.
 */
export function normalizeGrades(raw: CanvasRaw, known: Set<string>): Grade[] {
  const out: Grade[] = [];
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    if (known.size && !known.has(cid)) continue;
    const groups = new Map(objs(c.assignmentGroups).map((g) => [str(g.id), str(g.name)]));
    for (const a of objs(c.assignments)) {
      const s = obj(a.submission);
      const score = num(s?.score);
      if (!s || score == null || s.excused === true || str(s.workflow_state) !== "graded") continue;
      const possible = num(a.points_possible);
      out.push({
        id: `${cid}:${str(a.id)}`,
        courseId: cid,
        name: str(a.name) ?? "Assignment",
        pointsEarned: score,
        pointsPossible: possible,
        percent: possible ? (score / possible) * 100 : null,
        display: str(s.grade),
        isCourseTotal: false,
        postedAt: date(s.posted_at) ?? date(s.graded_at),
        category: groups.get(str(a.assignment_group_id)) ?? null,
      });
    }
  }
  return out;
}

/** The course's Canvas gradebook in the estimator's terms (see standing.ts). */
export function gradebookFrom(course: Obj | undefined, c: CanvasRaw["perCourse"][string]): Gradebook {
  const groups = objs(c.assignmentGroups);
  const weighted = course?.apply_assignment_group_weights === true;
  const names = new Map(groups.map((g) => [str(g.id), str(g.name)]));
  const items = objs(c.assignments)
    .filter((a) => a.published !== false && str(a.grading_type) !== "not_graded")
    .map((a) => {
      const s = obj(a.submission);
      const graded = s && s.excused !== true && str(s.workflow_state) === "graded" ? num(s.score) : null;
      const group = str(a.assignment_group_id);
      return {
        id: str(a.id) ?? "",
        name: str(a.name) ?? "",
        categoryId: weighted ? group : null,
        categoryName: names.get(group) ?? null,
        weight: null,
        earned: graded,
        possible: num(a.points_possible),
        at: date(s?.posted_at) ?? date(s?.graded_at),
        // Excused work counts for nothing either way; Canvas drops it like an omitted item.
        excluded: a.omit_from_final_grade === true || s?.excused === true,
      };
    })
    .filter((i) => i.id);
  const categories = weighted
    ? groups.map((g) => ({ id: str(g.id) ?? "", weight: num(g.group_weight) ?? 0, dropLowest: num(obj(g.rules)?.drop_lowest) ?? 0 }))
    : [];
  return { system: weighted ? "weighted" : "points", items, categories };
}

export function normalizeStandings(
  raw: CanvasRaw,
  courses: Course[],
  syllabi: Record<string, Syllabus> = {},
  webassign: Record<string, WebAssignCourse> = {},
): CourseStanding[] {
  const byId = new Map(objs(raw.courses).map((c) => [str(c.id), c]));
  const out: CourseStanding[] = [];
  for (const course of courses) {
    const c = raw.perCourse[course.id];
    if (!c) continue;
    const syl = course.code ? syllabi[course.code] : undefined;
    let book = withWebAssignGrades(course.code, gradebookFrom(byId.get(course.id), c), webassign);
    if (course.code && syl?.quizLog) book = withQuizLog(book, raw.quizLogs?.[course.code], syl.quizLog.category);
    const s = courseStanding(course.id, book, syl);
    if (s) out.push(s);
  }
  return out;
}

export function normalizeEvents(raw: unknown, known: Set<string>): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of objs(raw)) {
    const id = str(e.id);
    const title = str(e.title);
    const startsAt = date(e.start_at);
    if (!id || !title || !startsAt || str(e.workflow_state) === "deleted") continue;
    const cid = contextCourse(e.context_code);
    if (cid && known.size && !known.has(cid)) continue;
    out.push({
      id: `event:${id}`,
      courseId: cid,
      title,
      kind: EXAM.test(title) && !NOT_EXAM.test(title) ? "exam" : "event",
      startsAt,
      endsAt: date(e.end_at),
      allDay: e.all_day === true,
      location: str(e.location_name),
      url: str(e.html_url),
    });
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function normalizeAnnouncements(raw: unknown, known: Set<string>): Announcement[] {
  const out: Announcement[] = [];
  for (const n of objs(raw)) {
    const id = str(n.id);
    const title = str(n.title);
    const cid = contextCourse(n.context_code);
    const postedAt = date(n.posted_at) ?? date(n.delayed_post_at);
    if (!id || !title || !cid || !postedAt || (known.size && !known.has(cid))) continue;
    const body = str(n.message);
    out.push({
      id: `${cid}:${id}`,
      courseId: cid,
      title,
      body: body ? stripHtml(body).slice(0, 2000) : null,
      postedAt,
      url: str(n.html_url) ?? `${LMS_URL}/courses/${cid}/discussion_topics/${id}`,
    });
  }
  return out.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export function normalizeCanvas(raw: CanvasRaw, syllabi: Record<string, Syllabus> = {}, webassign: Record<string, WebAssignCourse> = {}): SchoolSnapshot {
  const warnings = raw.failures.map((f) => `Sync step failed: ${f}`);
  const courses = normalizeCourses(raw.courses, warnings);
  const known = new Set(courses.map((c) => c.id));
  return {
    version: 1,
    source: "canvas",
    generatedAt: date(raw.fetchedAt) ?? new Date().toISOString(),
    courses,
    assignments: normalizeAssignments(raw, known, warnings),
    events: normalizeEvents(raw.calendar, known),
    grades: normalizeGrades(raw, known),
    announcements: normalizeAnnouncements(raw.announcements, known),
    standings: normalizeStandings(raw, courses, syllabi, webassign),
    warnings,
  };
}
