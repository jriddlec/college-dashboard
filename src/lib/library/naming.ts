/**
 * Optional check of a class's files against the recommended naming
 * (docs/library.md), listed on /status when LIBRARY_NAMING_CHECK=1:
 *   units and exam prep:  YYYY-MM-DD <Type> - <Topic>[ (<variant>)].ext
 *   classwork:            <Category>/<Item>/ with files named the same way
 *   documents/Reference:  <Type>[ - <Title>].ext
 *   loose Notes files:    _<Title>.md (running logs)
 * Code and data files (and browser-saved .htm pages) keep their own names.
 */
import { extOf, flatten, type CourseLibrary, type Group, type Material } from "./catalog";

export type NamingIssue = { path: string; problem: string };

const PROGRAM_EXT = new Set(["java", "py", "c", "cpp", "h", "js", "ts", "xml", "json", "csv", "sql", "sh", "class", "jar", "ipynb"]);

function isProgram(name: string): boolean {
  const ext = extOf(name);
  return PROGRAM_EXT.has(ext) || (ext === "txt" && !name.includes(" ")) || ext === "htm";
}

const base = (path: string) => path.split("/").at(-1)!;

function files(m: Material): string[] {
  return [m.primary.path, ...m.alternates.map((a) => a.path)];
}

function generic(path: string): string | null {
  const name = base(path);
  if (isProgram(name)) return null;
  if (/\(\d+\)\.\w+$/.test(name) || /\bcopy\b(?! [A-Z]\))/i.test(name)) return "download or copy suffix: rename it or remove the duplicate";
  if (name.replace(/^_+/, "").includes("_")) return "underscores in the name";
  return null;
}

function dated(groups: Group[], out: NamingIssue[]) {
  for (const m of flatten(groups)) {
    if (m.title === "About this folder") continue;
    for (const p of files(m)) {
      if (isProgram(base(p))) continue;
      const g = generic(p);
      if (g) out.push({ path: p, problem: g });
      else if (!m.date || !m.type) out.push({ path: p, problem: "name it 'YYYY-MM-DD <Type> - <Topic>.ext'" });
    }
  }
}

function typed(groups: Group[], out: NamingIssue[]) {
  for (const m of flatten(groups)) {
    for (const p of files(m)) {
      if (isProgram(base(p))) continue;
      const g = generic(p);
      if (g) out.push({ path: p, problem: g });
      else if (!m.type) out.push({ path: p, problem: "name it '<Type> - <Title>.ext' (Syllabus, Rubric, Info, Textbook, …)" });
    }
  }
}

export function namingIssues(lib: CourseLibrary): NamingIssue[] {
  const out: NamingIssue[] = [];
  dated(lib.units, out);
  dated(lib.exams, out);
  for (const cat of lib.classwork) {
    // Files sitting right in Classwork or a category folder belong in an item folder. (A category
    // with one item is shown collapsed, its items coming from that item folder: those are fine.)
    const dir = cat.id.replace(/#files$/, "");
    const loose = cat.items.filter((m) => m.primary.path.slice(0, m.primary.path.lastIndexOf("/")) === dir);
    for (const m of loose) if (!isProgram(base(m.primary.path))) out.push({ path: m.primary.path, problem: "put it in an item folder (Labs/Lab 3, Projects/Project 1, …)" });
    dated([{ ...cat, items: cat.items.filter((m) => !loose.includes(m)), readme: null, children: [] }], out);
    dated(cat.children, out);
  }
  const notesRoots = lib.roots.filter((r) => /(^|\s)notes$/i.test(r));
  for (const g of lib.documents) {
    if (g.id.endsWith("#files") && g.title === "Notes & logs") {
      for (const m of g.items) if (!/^_[^_]/.test(base(m.primary.path)) || extOf(m.primary.path) !== "md") out.push({ path: m.primary.path, problem: "loose Notes files are logs named '_<Title>.md'; file material in a unit or exam folder" });
    } else if (g.id.endsWith("#files")) {
      for (const m of g.items) out.push({ path: m.primary.path, problem: "loose file at the class root: file it under Notes, Classwork or Important Documents" });
    } else if (notesRoots.some((r) => g.id.startsWith(r + "/")) && base(g.id) !== "Reference") {
      out.push({ path: g.id, problem: "Notes folders are '<n> - <Unit> (Ch x)', '_<Exam> Material' or 'Reference'" });
    } else {
      typed([g], out);
    }
  }
  return out;
}
