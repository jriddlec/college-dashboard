import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { SCHOOL_TZ } from "@/lib/school/time";
import { getSchoolData } from "@/lib/school";
import { courseHue } from "@/lib/school/derive";
import { getCourseOverrides } from "@/lib/config";
import { buildCourseLibrary, type CourseLibrary, type DirNode, type LibraryCourse } from "./catalog";

/**
 * LIBRARY_DIR holds the class folders (read-only to the app). PREVIEWS_DIR
 * holds PDFs of Office files, written by the converter (same relative path as
 * the original plus ".pdf").
 */
// Runtime data, not source: keep the bundler from tracing it into the build.
export const libraryDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.LIBRARY_DIR || "./library");
export const previewsDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.PREVIEWS_DIR || "./previews");

export function slugify(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class";
}

/**
 * The library's classes: the LMS's active courses (with courses.json
 * overrides), plus library-only classes from courses.json. Sorted by code.
 */
export async function getLibraryCourses(): Promise<LibraryCourse[]> {
  const [data, overrides] = await Promise.all([getSchoolData(), getCourseOverrides()]);
  const o = overrides.value;
  const used = new Set<string>();
  const out: LibraryCourse[] = [];
  for (const c of data.status === "ok" ? data.snapshot.courses : []) {
    const key = c.id in o ? c.id : c.code && c.code in o ? c.code : null;
    if (key) used.add(key);
    const ov = key ? o[key] : {};
    // Orientation and training enrollments aren't classes, unless courses.json names them.
    if (!c.isActive || ov.hidden || (!c.isClass && !key)) continue;
    const code = ov.code ?? c.code ?? c.name;
    out.push({
      slug: ov.slug ?? slugify(code),
      id: c.id,
      code,
      name: ov.name ?? c.name,
      instructor: ov.instructor ?? c.instructor,
      term: c.term,
      hue: courseHue(c.id),
      icon: ov.icon ?? null,
      folders: ov.folders ?? null,
    });
  }
  for (const [key, ov] of Object.entries(o)) {
    if (used.has(key) || ov.hidden) continue;
    const code = ov.code ?? key;
    out.push({ slug: ov.slug ?? slugify(code), id: null, code, name: ov.name ?? code, instructor: ov.instructor ?? null, term: null, hue: courseHue(code), icon: ov.icon ?? null, folders: ov.folders ?? null });
  }
  out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const seen = new Set<string>();
  for (const c of out) {
    let slug = c.slug;
    for (let n = 2; seen.has(slug); n++) slug = `${c.slug}-${n}`;
    seen.add((c.slug = slug));
  }
  return out;
}

// Never listed: dotfiles, Eclipse build output, and the asset folders that
// browsers save next to an .htm page (still served, so the page renders).
const SKIP_DIR = /^\.|^bin$|_files$/i;

async function walk(abs: string, rel: string): Promise<DirNode> {
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const node: DirNode = { name: path.basename(abs), path: rel, files: [], dirs: [] };
  await Promise.all(
    entries.map(async (e) => {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      // stat follows symlinks, so a linked folder is listed like a real one.
      const st = await fs.stat(childAbs).catch(() => null);
      if (!st) return;
      if (st.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) node.dirs.push(await walk(childAbs, childRel));
      } else if (st.isFile() && !e.name.startsWith(".")) {
        node.files.push({ name: e.name, path: childRel, size: st.size, mtimeMs: st.mtimeMs });
      }
    }),
  );
  node.dirs.sort((a, b) => a.name.localeCompare(b.name));
  return node;
}

async function walkPreviews(abs: string, rel: string, out: Set<string>): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (e) => {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walkPreviews(path.join(abs, e.name), childRel, out);
      else if (e.name.endsWith(".pdf")) out.add(childRel.slice(0, -4));
    }),
  );
}

export type Library = { ok: true; courses: CourseLibrary[]; scannedAt: string } | { ok: false; error: string };

/** Today in the school's time zone, as YYYY-MM-DD. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(now);
}

let cache: { at: number; value: Library } | null = null;
const TTL_MS = 30_000;

/** Scan the library (cached briefly: a scan reads ~1k directory entries). */
export async function getLibrary(): Promise<Library> {
  await connection(); // request-time: files change without a rebuild
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: Library;
  try {
    const root = await walk(libraryDir(), "");
    const previews = new Set<string>();
    await walkPreviews(previewsDir(), "", previews);
    const t = today();
    const courses = await getLibraryCourses();
    value = { ok: true, courses: courses.map((c) => buildCourseLibrary(c, root.dirs, previews, t)), scannedAt: new Date().toISOString() };
  } catch (e) {
    value = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function getCourseLibrary(slug: string): Promise<CourseLibrary | null | { error: string }> {
  const lib = await getLibrary();
  if (!lib.ok) return { error: lib.error };
  return lib.courses.find((c) => c.course.slug === slug) ?? null;
}

/**
 * Resolve URL path segments to a file under `root`, refusing anything that
 * escapes it or touches a dotfile. Returns null when invalid.
 */
export function safeResolve(root: string, segments: string[]): { abs: string; rel: string } | null {
  const parts: string[] = [];
  for (const raw of segments) {
    let s = raw;
    try {
      s = decodeURIComponent(raw);
    } catch {}
    if (!s || s === "." || s === ".." || s.startsWith(".") || /[\\/\0]/.test(s)) return null;
    parts.push(s);
  }
  if (!parts.length) return null;
  const abs = path.resolve(root, ...parts);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return null;
  return { abs, rel: parts.join("/") };
}
