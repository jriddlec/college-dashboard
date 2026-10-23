/**
 * Turns the library's folder tree into what the pages render. Pure: the
 * filesystem walk lives in library/index.ts, so this is unit-tested on plain objects.
 *
 * A class owns the top-level folders listed in its config, or else the ones
 * named after its code ("CSCI3030 Notes", "CSCI 3030", ...). Inside them, these
 * names are recognized; everything else is shown as a plain folder tree:
 *   … Notes/<n> - <Unit title> (Ch x)/...   units, numbered in course order
 *   … Notes/_<Exam or quiz>/...             exam prep
 *   … Notes/*.md                            running notes and logs
 *   … Classwork/<Assignment>/...            classwork, nested folders allowed
 *   … Important Documents/...               syllabus, rubrics, schedules
 * The role can be in the top-level name ("CSCI3030 Notes") or one level down
 * ("CSCI 3030/Notes"). Files that differ only by extension (Guide.html +
 * Guide.pdf) become one item.
 *
 * File names that follow the recommended pattern (docs/library.md)
 *   [YYYY-MM-DD ]<Type> - <Topic>[ (<variant>)].<ext>
 * are read exactly: the Type (from TYPE_KIND) sets the kind and badge, the
 * Topic is the title and the variant becomes a chip. Other names fall back to
 * keyword matching. Folders named "YYYY-MM-DD <Title>" are dated the same way.
 */
import { examToken } from "../school/exams";
import { dayKey, daysBetween } from "../school/time";

/** A class as the library sees it (from the LMS snapshot and courses.json). */
export type LibraryCourse = {
  slug: string;
  /** LMS course id, or null for a library-only class. */
  id: string | null;
  code: string;
  name: string;
  instructor: string | null;
  term: string | null;
  hue: number;
  icon: string | null;
  /** Top-level folders this class owns; null = match by code. */
  folders: string[] | null;
};

export type FileEntry = { name: string; path: string; size: number; mtimeMs: number };
export type DirNode = { name: string; path: string; files: FileEntry[]; dirs: DirNode[] };

export type Kind =
  | "guide"
  | "review"
  | "practice"
  | "notes"
  | "preclass"
  | "slides"
  | "reading"
  | "activity"
  | "assignment"
  | "work"
  | "info"
  | "guidelines"
  | "log"
  | "video"
  | "audio"
  | "image"
  | "code"
  | "text"
  | "archive"
  | "document";

export type Filter = "study" | "practice" | "notes" | "slides" | "reading" | "activity" | "classwork" | "media" | "info";

export const KIND_FILTER: Record<Kind, Filter> = {
  guide: "study",
  review: "study",
  practice: "practice",
  notes: "notes",
  preclass: "notes",
  slides: "slides",
  reading: "reading",
  activity: "activity",
  assignment: "classwork",
  work: "classwork",
  code: "classwork",
  video: "media",
  audio: "media",
  image: "media",
  info: "info",
  guidelines: "info",
  log: "info",
  text: "info",
  archive: "info",
  document: "info",
};

export const FILTER_LABEL: Record<Filter, string> = {
  study: "Study guides",
  practice: "Practice",
  notes: "Notes",
  slides: "Slides",
  reading: "Readings",
  activity: "Activities",
  classwork: "Classwork",
  media: "Media",
  info: "Course info",
};
export const FILTER_ORDER: Filter[] = ["study", "practice", "notes", "slides", "reading", "activity", "classwork", "media", "info"];

/** How a format opens: in the browser as-is, as a converted PDF, in the app's viewer, or as a download. */
export type OpenMode = "raw" | "preview" | "viewer" | "download";

export type Format = { ext: string; path: string; size: number; href: string; mode: OpenMode };

export type Material = {
  id: string;
  title: string;
  date: string | null;
  kind: Kind;
  /** The name's Type ("Study Guide", "Submission"), when it follows the recommended pattern; shown as the badge. */
  type: string | null;
  /** The name's trailing "(…)" for typed names: "annotated", "v2", "official". */
  variant: string | null;
  primary: Format;
  /** Other formats of the same document (e.g. the PDF of an HTML guide). */
  alternates: Format[];
  /** Download link for the primary file (original, not a converted preview). */
  download: string;
  upcoming: boolean;
  /** Newest file time among its formats (ms), for "new since last visit". */
  modifiedAt: number;
};

export type Group = {
  id: string;
  title: string;
  /** Unit number from the folder name ("3 - Loops" → 3). */
  number: number | null;
  /** Chapter reference from the folder name ("(Ch 3)" → "Ch 3"). */
  tag: string | null;
  readme: Material | null;
  items: Material[];
  children: Group[];
  /** Items in this group and all subgroups (readme included). */
  total: number;
  latest: string | null;
  /** Date from a "YYYY-MM-DD <Title>" folder name. */
  date?: string | null;
  /** Exam-prep folders: when the matching exam is (from the LMS/syllabus), and days from today (negative = past). */
  examAt?: string | null;
  examDays?: number | null;
};

/** An exam on the calendar, for ordering and dating exam-prep folders. */
export type ExamDate = { title: string; at: string };

export type CourseLibrary = {
  course: LibraryCourse;
  /** Class prefix stripped from file and folder titles ("CSCI3030"), or "". */
  folderPrefix: string;
  /** The class's top-level library folders. */
  roots: string[];
  exams: Group[];
  units: Group[];
  classwork: Group[];
  documents: Group[];
  stats: { items: number; studyGuides: number; units: number; files: number };
  latest: string | null;
  /** The unit to open by default: the one with the most recent dated material. */
  currentUnitId: string | null;
};

const EXT_RANK: Record<string, number> = {
  html: 0, htm: 0, md: 1, pdf: 2, docx: 3, doc: 3, pptx: 3, ppt: 3, xlsx: 3, xls: 3,
  mp4: 4, webm: 4, mov: 4, mp3: 4, m4a: 4, wav: 4, png: 4, jpg: 4, jpeg: 4, gif: 4, webp: 4, svg: 4,
};
const OFFICE = new Set(["docx", "doc", "pptx", "ppt", "xlsx", "xls", "odt", "odp", "ods", "rtf"]);
const RAW = new Set<string>();
const VIEWER = new Set([
  "html", "htm", "pdf", "md", "txt", "java", "xml", "json", "csv", "py", "c", "h", "cpp", "js", "ts", "css", "sql", "sh",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "mov", "mp3", "m4a", "wav", "ogg",
]);
const IGNORED_FILES = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i;

export function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function openMode(ext: string, hasPreview: boolean): OpenMode {
  if (RAW.has(ext)) return "raw";
  if (OFFICE.has(ext)) return hasPreview ? "preview" : "viewer";
  if (VIEWER.has(ext)) return "viewer";
  return "download";
}

export function hrefFor(path: string, mode: OpenMode): string {
  const p = encodePath(path);
  switch (mode) {
    case "raw":
      return `/library/f/${p}`;
    case "preview":
      return `/library/p/${p}`;
    case "viewer":
      return `/library/view/${p}`;
    case "download":
      return `/library/f/${p}?download=1`;
  }
}

/**
 * Document types of the recommended naming, and the kind each one is. Any
 * other "<Something> Notes" type (a course's own series, e.g. "OSE Notes") is notes.
 */
export const TYPE_KIND: Record<string, Kind> = {
  "Lecture Notes": "notes",
  "Lesson Notes": "notes",
  Slides: "slides",
  Reading: "reading",
  Textbook: "reading",
  "Pre-Class": "preclass",
  Activity: "activity",
  Worksheet: "activity",
  Recording: "video",
  "Study Guide": "guide",
  "Master Study Guide": "guide",
  "Practice Problems": "practice",
  "Practice Test": "practice",
  "Practice Quiz": "practice",
  "Exam Paper": "practice",
  Review: "review",
  Instructions: "assignment",
  Draft: "work",
  Submission: "work",
  Graded: "work",
  Rubric: "guidelines",
  Template: "guidelines",
  Guidelines: "guidelines",
  Syllabus: "info",
  Schedule: "info",
  Info: "info",
  Setup: "info",
};

/** The kind for a document type, or null when it isn't one. */
export function typeKind(type: string): Kind | null {
  return TYPE_KIND[type] ?? (/^[A-Z][\w-]*( [A-Z][\w-]*)? Notes$/.test(type) ? "notes" : null);
}

/** "3.7 Improper Integrals (annotated)" → ["3.7 Improper Integrals", "annotated"] */
function splitVariant(s: string): [string, string | null] {
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(s);
  return m ? [m[1], m[2]] : [s, null];
}

/**
 * "2026-09-29 Study Guide - 3.7 Improper Integrals (KaTeX).html" →
 * { date, title: "3.7 Improper Integrals", type: "Study Guide", variant: "KaTeX" }.
 * Names without a known Type keep their whole title (type and variant null).
 */
export function parseName(
  name: string,
  folderPrefix?: string,
): { stem: string; ext: string; date: string | null; title: string; type: string | null; variant: string | null } {
  const ext = extOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  let title = stem.replace(/^_+/, "");
  let date: string | null = null;
  const m = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(title);
  if (m) {
    date = m[1];
    title = m[2];
  }
  // "Amendment_ Everything" (browser-saved page) → "Amendment: Everything"; "T1_Guide" → "T1 Guide"
  title = title.replace(/_ /g, ": ").replace(/_/g, " ");
  if (folderPrefix && title.startsWith(folderPrefix + " ")) title = title.slice(folderPrefix.length + 1);
  title = title.replace(/\s+accessible\b/i, "").replace(/\s{2,}/g, " ").trim();
  let type: string | null = null;
  let variant: string | null = null;
  const typed = /^(.+?) - (.+)$/.exec(title);
  if (typed && typeKind(typed[1])) {
    type = typed[1];
    [title, variant] = splitVariant(typed[2]);
  } else {
    // A bare type ("Syllabus.pdf", "Syllabus (old).pdf") is its own title.
    const [base, v] = splitVariant(title);
    if (typeKind(base)) [type, title, variant] = [base, base, v];
  }
  return { stem, ext, date, title: title || stem, type, variant };
}

const VIDEO_EXT = ["mp4", "webm", "mov"];
const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg"];

export function kindOf(title: string, ext: string, type?: string | null): Kind {
  const fromType = type ? typeKind(type) : null;
  if (fromType === "video") return AUDIO_EXT.includes(ext) ? "audio" : VIDEO_EXT.includes(ext) ? "video" : "text";
  if (fromType) return fromType;
  const t = title.toLowerCase();
  if (ext === "zip") return "archive";
  if (/\bscan\b|\bmy work\b/.test(t)) return "work";
  if (/\bpractice\b|self.check|\bsample\b|\bmock\b|\bdrills?\b/.test(t)) return "practice";
  if (/study guide|\bguide\b|exam material|\bprep\b|formulas|exam expectations|review notes/.test(t) && !/rubric|style guide/.test(t)) return "guide";
  if (/\breview\b/.test(t)) return "review";
  if (/pre-class/.test(t)) return "preclass";
  if (/\bslides\b/.test(t) || ext === "pptx" || ext === "ppt") return "slides";
  if (/notes\b|lecture/.test(t)) return "notes";
  if (/\breading\b|textbook|calculus volume|kitabu/.test(t)) return "reading";
  if (/activity|breakout|worksheet|exit ticket|zoezi/.test(t)) return "activity";
  if (/syllabus|schedule|deadlines|office hours|table of contents|submission and grading|introduction information|configuring/.test(t)) return "info";
  if (/rubric|template|style guide|academic honesty|formatter|book to order/.test(t)) return "guidelines";
  if (/announcements|\blog\b|word list|readme/.test(t)) return "log";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  if (["mp3", "m4a", "wav", "ogg"].includes(ext) || /podcast/.test(t)) return "audio";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (/assignment|\blab\s?\d|\bproject\s?\d|script|beat sheet|defense summary|recitation|presentation|draft|prompts|conversation|oral test|peer|\bquiz\b|\btest\b/.test(t)) return "assignment";
  if (["java", "py", "c", "cpp", "js", "ts", "xml", "json", "sql", "sh"].includes(ext)) return "code";
  if (ext === "txt" || ext === "csv") return "text";
  return "document";
}

function format(f: FileEntry, previews: ReadonlySet<string>): Format {
  const ext = extOf(f.name);
  const mode = openMode(ext, previews.has(f.path));
  return { ext, path: f.path, size: f.size, href: hrefFor(f.path, mode), mode };
}

/** Group a folder's files by stem; one Material per document. Sorted by date, then title. */
export function materialsOf(files: FileEntry[], ctx: Ctx): Material[] {
  const byStem = new Map<string, FileEntry[]>();
  for (const f of files) {
    if (IGNORED_FILES.test(f.name)) continue;
    const { stem } = parseName(f.name);
    const key = stem.toLowerCase();
    byStem.set(key, [...(byStem.get(key) ?? []), f]);
  }
  const out: Material[] = [];
  for (const group of byStem.values()) {
    group.sort((a, b) => (EXT_RANK[extOf(a.name)] ?? 9) - (EXT_RANK[extOf(b.name)] ?? 9) || a.name.localeCompare(b.name));
    const [first, ...rest] = group;
    const { date, title, type, variant } = parseName(first.name, ctx.folderPrefix);
    const primary = format(first, ctx.previews);
    out.push({
      id: first.path,
      title,
      date,
      kind: kindOf(title, primary.ext, type),
      type,
      variant,
      primary,
      alternates: rest.map((f) => format(f, ctx.previews)),
      download: hrefFor(first.path, "download"),
      upcoming: date != null && date > ctx.today,
      modifiedAt: Math.max(...group.map((f) => f.mtimeMs)),
    });
  }
  return out.sort(byDateThenTitle);
}

export function byDateThenTitle(a: Material, b: Material): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.title.localeCompare(b.title, undefined, { numeric: true });
}

type Ctx = { previews: ReadonlySet<string>; today: string; folderPrefix: string };

const README = /^_?readme\.(md|txt|html?)$/i;

function cleanFolderTitle(name: string, folderPrefix: string): { title: string; number: number | null; tag: string | null; date: string | null } {
  let title = name.replace(/^_+/, "");
  if (title.startsWith(folderPrefix + " ")) title = title.slice(folderPrefix.length + 1);
  let date: string | null = null;
  const dated = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(title);
  if (dated) {
    date = dated[1];
    title = dated[2];
  }
  let number: number | null = null;
  const num = /^(\d+)\s*-\s*(.+)$/.exec(title);
  if (num) {
    number = Number(num[1]);
    title = num[2];
  }
  let tag: string | null = null;
  const ch = /\s*\(((?:Vol\.? \d+ )?Ch\.? [^)]*)\)$/i.exec(title);
  if (ch) {
    tag = ch[1];
    title = title.slice(0, ch.index);
  }
  return { title: title.trim(), number, tag, date };
}

export function buildGroup(dir: DirNode, ctx: Ctx): Group {
  // Collapse folders that only wrap one other folder (Project Source/MasterProject/src).
  let node = dir;
  while (node.files.filter((f) => !IGNORED_FILES.test(f.name)).length === 0 && node.dirs.length === 1) node = node.dirs[0];

  const readmeFile = node.files.find((f) => README.test(f.name));
  const readme = readmeFile ? { ...materialsOf([readmeFile], ctx)[0], title: "About this folder", kind: "log" as const, type: null, variant: null } : null;
  const items = materialsOf(node.files.filter((f) => f !== readmeFile), ctx);
  const children = node.dirs.map((d) => buildGroup(d, ctx)).sort(byGroupOrder);
  const { title, number, tag, date } = cleanFolderTitle(dir.name, ctx.folderPrefix);
  const dates = [date, ...items.map((i) => i.date), ...children.map((c) => c.latest)].filter((d): d is string => !!d && d <= ctx.today);
  return {
    id: dir.path,
    title,
    number,
    tag,
    readme,
    items,
    children,
    total: items.length + (readme ? 1 : 0) + children.reduce((n, c) => n + c.total, 0),
    latest: dates.length ? dates.sort().at(-1)! : null,
    date,
  };
}

function byGroupOrder(a: Group, b: Group): number {
  if (a.number != null && b.number != null && a.number !== b.number) return a.number - b.number;
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.title.localeCompare(b.title, undefined, { numeric: true });
}

/**
 * Dates each exam-prep folder by the exam with the same name and number
 * ("_Test 3 Material" ↔ "Test 3 (5.1–5.6)") and orders them: upcoming exams
 * soonest first, then folders with no exam on the calendar (newest material
 * first), then past exams (most recent first).
 */
export function orderExams(groups: Group[], exams: ExamDate[], today: string): Group[] {
  const dated = groups.map((g) => {
    const token = examToken(g.title);
    const matches = token ? exams.filter((e) => examToken(e.title) === token).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) : [];
    const next = matches.find((e) => dayKey(e.at) >= today) ?? matches.at(-1);
    return next ? { ...g, examAt: next.at, examDays: daysBetween(today, dayKey(next.at)) } : { ...g, examAt: null, examDays: null };
  });
  const rank = (g: Group) => (g.examDays == null ? 1 : g.examDays >= 0 ? 0 : 2);
  return dated.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? a.examDays! - b.examDays! : rank(a) === 2 ? b.examDays! - a.examDays! : (b.latest ?? "").localeCompare(a.latest ?? "")) ||
      a.title.localeCompare(b.title),
  );
}

/** Where each item lives ("MATH 2260 · Unit 3: Techniques of Integration"), by material id. */
export function itemContexts(lib: CourseLibrary): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (groups: Group[], prefix: string) => {
    for (const g of groups) {
      const label = `${prefix} · ${g.number != null ? `Unit ${g.number}: ` : ""}${g.title}`;
      for (const m of [...(g.readme ? [g.readme] : []), ...g.items]) out.set(m.id, label);
      visit(g.children, prefix);
    }
  };
  visit([...lib.exams, ...lib.units, ...lib.classwork, ...lib.documents], lib.course.code);
  return out;
}

/** Every item in a group tree, readmes included. */
export function flatten(groups: Group[]): Material[] {
  return groups.flatMap((g) => [...(g.readme ? [g.readme] : []), ...g.items, ...flatten(g.children)]);
}

function countFiles(m: Material[]): number {
  return m.reduce((n, x) => n + 1 + x.alternates.length, 0);
}

/** Folder-name prefixes for a class code: "CSCI 3030" → ["CSCI 3030", "CSCI3030"]. */
export function codePrefixes(code: string): string[] {
  const compact = code.replace(/\s+/g, "");
  return compact === code ? [code] : [code, compact];
}

type Role = "notes" | "classwork" | "docs";
const ROLES: [Role, RegExp][] = [
  ["notes", /(^|\s)notes$/i],
  ["classwork", /(^|\s)classwork$/i],
  ["docs", /(^|\s)important documents$/i],
];
const roleOf = (name: string): Role | null => ROLES.find(([, re]) => re.test(name))?.[0] ?? null;

/** The class's top-level folders: the configured ones, or those named after its code. */
export function foldersOf(course: LibraryCourse, roots: DirNode[]): { dirs: DirNode[]; prefix: string } {
  if (course.folders) {
    const wanted = new Set(course.folders.map((f) => f.toLowerCase()));
    return { dirs: roots.filter((r) => wanted.has(r.name.toLowerCase())), prefix: "" };
  }
  for (const p of codePrefixes(course.code)) {
    const lp = p.toLowerCase();
    const dirs = roots.filter((r) => r.name.toLowerCase() === lp || r.name.toLowerCase().startsWith(lp + " "));
    if (dirs.length) return { dirs, prefix: p };
  }
  return { dirs: [], prefix: "" };
}

/**
 * Build one class's library from its top-level folders. `previews` holds
 * library paths that have a converted PDF.
 */
export function buildCourseLibrary(course: LibraryCourse, roots: DirNode[], previews: ReadonlySet<string>, today: string, examDates: ExamDate[] = []): CourseLibrary {
  const { dirs: mine, prefix } = foldersOf(course, roots);
  const ctx: Ctx = { previews, today, folderPrefix: prefix };

  // Sort folders into roles; a folder without one is either a wrapper around
  // role folders ("CSCI 3030/Notes") or plain material.
  const byRole: Record<Role, DirNode[]> = { notes: [], classwork: [], docs: [] };
  const plain: DirNode[] = [];
  const looseFiles: FileEntry[] = [];
  for (const top of mine) {
    const role = roleOf(top.name);
    if (role) {
      byRole[role].push(top);
      continue;
    }
    const inner = top.dirs.filter((d) => roleOf(d.name));
    if (!inner.length) {
      plain.push(top);
      continue;
    }
    for (const d of top.dirs) {
      const r = roleOf(d.name);
      if (r) byRole[r].push(d);
      else plain.push(d);
    }
    looseFiles.push(...top.files);
  }

  const exams: Group[] = [];
  const units: Group[] = [];
  const documents: Group[] = [];
  const otherNotes: DirNode[] = [];
  for (const notes of byRole.notes) {
    for (const d of notes.dirs) {
      if (d.name.startsWith("_")) exams.push(buildGroup(d, ctx));
      else if (/^\d+\s*-/.test(d.name)) units.push(buildGroup(d, ctx));
      else otherNotes.push(d);
    }
  }
  units.sort(byGroupOrder);
  const examGroups = orderExams(exams, examDates, today);

  const classwork: Group[] = [];
  for (const cw of byRole.classwork) {
    classwork.push(...cw.dirs.map((d) => buildGroup(d, ctx)));
    const loose = materialsOf(cw.files, ctx);
    if (loose.length) classwork.push(syntheticGroup(`${cw.path}#files`, "Other classwork", loose));
  }
  classwork.sort(byGroupOrder);

  for (const d of byRole.docs) documents.push({ ...buildGroup(d, ctx), title: "Important documents" });
  for (const notes of byRole.notes) {
    const notesFiles = materialsOf(notes.files, ctx);
    if (notesFiles.length) documents.push(syntheticGroup(`${notes.path}#files`, "Notes & logs", notesFiles));
  }
  for (const d of [...otherNotes, ...plain]) documents.push(buildGroup(d, ctx));
  const loose = materialsOf(looseFiles, ctx);
  if (loose.length) documents.push(syntheticGroup(`${mine[0].path}#files`, "Files", loose));

  const all = flatten([...examGroups, ...units, ...classwork, ...documents]);
  const dated = all.map((m) => m.date).filter((d): d is string => !!d && d <= today).sort();
  const latest = dated.at(-1) ?? null;
  const current = latest ? units.filter((u) => u.latest === latest).at(-1) : undefined;
  return {
    course,
    folderPrefix: prefix,
    roots: mine.map((d) => d.name),
    exams: examGroups,
    units,
    classwork,
    documents,
    stats: {
      items: all.length,
      studyGuides: all.filter((m) => KIND_FILTER[m.kind] === "study").length,
      units: units.length,
      files: countFiles(all),
    },
    latest,
    currentUnitId: current?.id ?? units.filter((u) => u.total > 0).at(-1)?.id ?? null,
  };
}

function syntheticGroup(id: string, title: string, items: Material[]): Group {
  const dates = items.map((i) => i.date).filter((d): d is string => !!d).sort();
  return { id, title, number: null, tag: null, readme: null, items, children: [], total: items.length, latest: dates.at(-1) ?? null };
}
