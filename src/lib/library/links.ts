/**
 * Matches LMS assignments to library folders by name and number, so an
 * assignment row can open its folder: "Lab04 Part 2" ↔ Classwork/Labs/Lab 4,
 * "Assign 5: read aloud" ↔ Assignment 5, "Test 3 (5.1–5.6)" ↔ _Test 3 Material.
 */
import { examToken } from "../school/exams";
import type { Assignment } from "../school/types";
import type { CourseLibrary, Group } from "./catalog";

const WORDS: [RegExp, string][] = [
  [/^(assignment|assignm|assign|asgn)$/, "assignment"],
  [/^(homework|hw)$/, "homework"],
  [/^(problem set|pset)$/, "problem set"],
];

/** "Lab04 Part 2" → "lab 4"; "Assignm 4: weekend plans" → "assignment 4"; null without a numbered item. */
export function itemToken(title: string): string | null {
  const m = /\b(lab|project|assignment|assignm|assign|asgn|homework|hw|problem set|pset|defense summary|recitation|essay|conversation|presentation|module|chapter|unit|worksheet)\s*#?\s*0*(\d+)\b/i.exec(title);
  if (!m) return null;
  let word = m[1].toLowerCase();
  for (const [re, canon] of WORDS) if (re.test(word)) word = canon;
  return `${word} ${Number(m[2])}`;
}

function walk(groups: Group[]): Group[] {
  return groups.flatMap((g) => [g, ...walk(g.children)]);
}

export type FolderLink = { href: string; label: string };

/** Folder link per assignment id, for the classes that have a library. */
export function folderLinks(assignments: Assignment[], courses: CourseLibrary[]): Map<string, FolderLink> {
  const out = new Map<string, FolderLink>();
  const byCourse = new Map(courses.filter((c) => c.course.id).map((c) => [c.course.id!, c]));
  const link = (lib: CourseLibrary, g: Group): FolderLink => ({ href: `/library/${lib.course.slug}?open=${encodeURIComponent(g.id)}`, label: g.title });
  const index = new Map<string, { items: Map<string, Group>; exams: Map<string, Group> }>();
  for (const a of assignments) {
    const lib = byCourse.get(a.courseId);
    if (!lib) continue;
    let idx = index.get(a.courseId);
    if (!idx) {
      idx = { items: new Map(), exams: new Map() };
      for (const g of walk(lib.classwork)) {
        const t = itemToken(g.title) ?? examToken(g.title);
        if (t && !idx.items.has(t)) idx.items.set(t, g);
      }
      for (const g of lib.exams) {
        const t = examToken(g.title);
        if (t && !idx.exams.has(t)) idx.exams.set(t, g);
      }
      index.set(a.courseId, idx);
    }
    const exam = examToken(a.title);
    const item = itemToken(a.title);
    const g = (exam && (idx.exams.get(exam) ?? idx.items.get(exam))) || (item && idx.items.get(item));
    if (g) out.set(a.id, link(lib, g));
  }
  return out;
}
