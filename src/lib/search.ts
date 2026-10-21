/**
 * One search over everything the dashboard knows: classes, assignments,
 * announcements and the library (titles, paths and the text inside study
 * guides and notes). Used by the Ctrl+K palette through /api/search.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSchoolData } from "@/lib/school";
import { courseHue, courseMap, isDone } from "@/lib/school/derive";
import { formatWeekdayDate } from "@/lib/school/time";
import { getLibrary, libraryDir } from "@/lib/library";
import { extOf, flatten, itemContexts, type Material } from "@/lib/library/catalog";
import { TEXT_EXT, extractText, matchesAll, snippet } from "@/lib/library/fulltext";

export type SearchHit = {
  type: "class" | "assignment" | "announcement" | "file";
  title: string;
  href: string;
  /** Where it is or what it belongs to ("MATH 2260 · Unit 5: Sequences and Series"). */
  context: string;
  snippet: string | null;
  external: boolean;
  hue: number;
};

const textCache = new Map<string, { mtimeMs: number; text: string }>();
const MAX_FILE = 4_000_000;

async function fileText(rel: string, ext: string): Promise<string> {
  const abs = path.join(libraryDir(), ...rel.split("/"));
  const st = await fs.stat(abs).catch(() => null);
  if (!st || !st.isFile() || st.size > MAX_FILE) return "";
  const hit = textCache.get(abs);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.text;
  const text = extractText(await fs.readFile(abs, "utf8").catch(() => ""), ext);
  textCache.set(abs, { mtimeMs: st.mtimeMs, text });
  return text;
}

/** The first format of a material that has readable text, if any. */
function textFormat(m: Material) {
  return [m.primary, ...m.alternates].find((f) => TEXT_EXT.has(f.ext)) ?? null;
}

export async function search(query: string, limit = 30): Promise<SearchHit[]> {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return [];
  const [data, lib] = await Promise.all([getSchoolData(), getLibrary().catch(() => null)]);
  const top: SearchHit[] = [];
  const content: SearchHit[] = [];

  if (data.status === "ok") {
    const s = data.snapshot;
    const courses = courseMap(s.courses);
    for (const c of s.courses.filter((c) => c.isActive && c.isClass)) {
      if (matchesAll(`${c.code} ${c.name} ${c.instructor ?? ""}`, terms))
        top.push({ type: "class", title: c.code ?? c.name, href: `/courses/${encodeURIComponent(c.id)}`, context: c.name, snippet: null, external: false, hue: courseHue(c.id) });
    }
    const now = Date.now();
    // Open work first, then by how close the due date is (undated last).
    const distance = (iso: string | null) => (iso ? Math.abs(Date.parse(iso) - now) : Number.MAX_SAFE_INTEGER);
    const assignments = s.assignments
      .filter((a) => matchesAll(`${a.title} ${courses.get(a.courseId)?.code ?? ""}`, terms))
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || distance(a.dueAt) - distance(b.dueAt));
    for (const a of assignments.slice(0, 10)) {
      const code = courses.get(a.courseId)?.code ?? "";
      top.push({
        type: "assignment",
        title: a.title,
        href: a.url ?? `/courses/${encodeURIComponent(a.courseId)}`,
        context: [code, a.dueAt ? `due ${formatWeekdayDate(a.dueAt)}` : null, isDone(a) ? "done" : null].filter(Boolean).join(" · "),
        snippet: null,
        external: !!a.url,
        hue: courseHue(a.courseId),
      });
    }
    for (const n of s.announcements) {
      if (!matchesAll(`${n.title} ${n.body ?? ""}`, terms)) continue;
      top.push({
        type: "announcement",
        title: n.title,
        href: `/courses/${encodeURIComponent(n.courseId)}#announcements`,
        context: `${courses.get(n.courseId)?.code ?? ""} · announcement · ${formatWeekdayDate(n.postedAt)}`,
        snippet: n.body ? snippet(n.body, terms) : null,
        external: false,
        hue: courseHue(n.courseId),
      });
    }
  }

  if (lib?.ok) {
    for (const c of lib.courses) {
      const ctx = itemContexts(c);
      for (const m of flatten([...c.exams, ...c.units, ...c.classwork, ...c.documents])) {
        const hit = { type: "file" as const, title: m.title, href: m.primary.href, context: ctx.get(m.id) ?? c.course.code, external: false, hue: c.course.hue };
        if (matchesAll(`${m.type ?? ""} ${m.title} ${m.variant ?? ""} ${m.primary.path}`, terms)) {
          top.push({ ...hit, snippet: null });
          continue;
        }
        const f = textFormat(m);
        if (!f) continue;
        const text = await fileText(f.path, extOf(f.path));
        if (text && matchesAll(text, terms)) content.push({ ...hit, snippet: snippet(text, terms) });
      }
    }
  }
  return [...top, ...content].slice(0, limit);
}
