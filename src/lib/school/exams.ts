/**
 * Upcoming exams with their study material: exam-kind assignments and
 * calendar events, each matched to the class's library exam-prep folder
 * (`_Test 2 Material` ↔ "Test 2", `_Final Test` ↔ "Final Exam").
 */
import type { SchoolSnapshot } from "./types";

export interface PrepFolder {
  courseId: string | null;
  slug: string;
  groupId: string;
  title: string;
}

export interface UpcomingExam {
  key: string;
  courseId: string | null;
  title: string;
  at: string;
  url: string | null;
  /** Library link for its prep folder, or the class's library page when no folder matches. */
  prep: { href: string; label: string; matched: boolean } | null;
}

/** "Test 2 Material" → "test 2"; "Final Exam Review" → "final"; "Midterm Exam (Exam 1)" → "midterm". */
export function examToken(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bfinal\b/.test(t)) return "final";
  if (/\bmidterm\b/.test(t)) return "midterm";
  const m = /\b(exam|test|quiz)\s*#?\s*(\d+)/.exec(t);
  if (m) return `${m[1] === "exam" ? "test" : m[1]} ${Number(m[2])}`;
  return null;
}

export function upcomingExams(
  s: Pick<SchoolSnapshot, "assignments" | "events">,
  prep: PrepFolder[],
  libraryOf: (courseId: string) => string | null,
  now: Date,
  days = 60,
): UpcomingExam[] {
  const end = now.getTime() + days * 864e5;
  const inRange = (iso: string | null) => !!iso && Date.parse(iso) >= now.getTime() && Date.parse(iso) <= end;
  const found: UpcomingExam[] = [];
  const seen = new Set<string>();
  const add = (key: string, courseId: string | null, title: string, at: string, url: string | null) => {
    const token = examToken(title);
    const dedupe = `${courseId}|${token ?? title.toLowerCase()}|${at.slice(0, 10)}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const folder = token ? prep.find((p) => p.courseId === courseId && examToken(p.title) === token) : undefined;
    const lib = courseId ? libraryOf(courseId) : null;
    found.push({
      key,
      courseId,
      title,
      at,
      url,
      prep: folder
        ? { href: `/library/${folder.slug}?open=${encodeURIComponent(folder.groupId)}`, label: folder.title, matched: true }
        : lib
          ? { href: `/library/${lib}`, label: "Library", matched: false }
          : null,
    });
  };
  for (const a of s.assignments) if (a.kind === "exam" && inRange(a.dueAt)) add(`a${a.id}`, a.courseId, a.title, a.dueAt!, a.url);
  for (const e of s.events) if (e.kind === "exam" && inRange(e.startsAt)) add(`e${e.id}`, e.courseId, e.title, e.startsAt, e.url);
  return found.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
