/**
 * Fetching a course's Brightspace Content files into the library, from /status.
 *
 * The web app can't reach Brightspace or write the library, so it only queues
 * a request in $STATE_DIR/content-requests/; d2l-sync picks it up within
 * seconds, downloads the files into "<CODE> Course Content/" and reports
 * progress in $STATE_DIR/content-jobs.json. The unit list comes from the
 * course's content tree, saved by every sync (courses/<id>/content-toc.json).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, dataSource } from "@/lib/school";
import { stateDir } from "@/lib/state";

export interface ContentUnit {
  id: string;
  /** "Week 9 - L08, P3 › Appendix" */
  title: string;
  depth: number;
  files: number;
}

export interface ContentCourse {
  id: string;
  code: string;
  files: number;
  units: ContentUnit[];
}

export interface ContentJob {
  id: string;
  courseId: string;
  moduleId: string | null;
  label: string;
  requestedAt: string;
  state: "queued" | "running" | "done" | "failed";
  total?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  folder?: string;
  error?: string;
  finishedAt?: string;
}

type TocModule = { ModuleId?: number; Title?: string; IsHidden?: boolean; Modules?: TocModule[]; Topics?: { TypeIdentifier?: string; IsHidden?: boolean; IsBroken?: boolean }[] };

const isFile = (t: NonNullable<TocModule["Topics"]>[number]) => t.TypeIdentifier === "File" && !t.IsHidden && !t.IsBroken;

function countFiles(m: TocModule): number {
  return (m.Topics ?? []).filter(isFile).length + (m.Modules ?? []).filter((s) => !s.IsHidden).reduce((n, s) => n + countFiles(s), 0);
}

function unitsOf(modules: TocModule[], parent: string, depth: number): ContentUnit[] {
  return modules
    .filter((m) => !m.IsHidden && m.ModuleId != null)
    .flatMap((m) => {
      const title = `${parent}${(m.Title ?? "Module").trim()}`;
      const files = countFiles(m);
      if (!files) return [];
      return [{ id: String(m.ModuleId), title, depth, files }, ...unitsOf(m.Modules ?? [], `${title} › `, depth + 1)];
    });
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Fetching works with Brightspace and a writable state folder. */
export function contentFetchEnabled(): boolean {
  return dataSource() === "d2l" && !!stateDir();
}

/** Classes with downloadable content, from the last sync. */
export async function contentCourses(courses: { id: string; code: string | null; isClass: boolean }[]): Promise<ContentCourse[]> {
  const out: ContentCourse[] = [];
  for (const c of courses) {
    if (!c.isClass || !/^\d+$/.test(c.id)) continue;
    const toc = (await readJson(path.join(dataDir(), "d2l", "current", "courses", c.id, "content-toc.json"))) as { Modules?: TocModule[] } | undefined;
    const modules = toc?.Modules ?? [];
    const files = modules.filter((m) => !m.IsHidden).reduce((n, m) => n + countFiles(m), 0);
    if (files) out.push({ id: c.id, code: c.code ?? c.id, files, units: unitsOf(modules, "", 0) });
  }
  return out;
}

/** Queued requests first, then the sync's recent jobs (newest first). */
export async function contentJobs(): Promise<ContentJob[]> {
  const dir = stateDir();
  if (!dir) return [];
  const jobs = ((await readJson(path.join(dir, "content-jobs.json"))) as ContentJob[] | undefined) ?? [];
  const reqDir = path.join(dir, "content-requests");
  const names = await fs.readdir(reqDir).catch(() => [] as string[]);
  const queued: ContentJob[] = [];
  for (const n of names.filter((n) => n.endsWith(".json")).sort().reverse()) {
    const r = (await readJson(path.join(reqDir, n))) as ContentJob | undefined;
    if (r?.id) queued.push({ ...r, state: "queued" });
  }
  return [...queued, ...(Array.isArray(jobs) ? jobs.filter((j) => j && typeof j.id === "string") : [])];
}

export async function queueContentFetch(courseId: string, moduleId: string | null, label: string): Promise<ContentJob> {
  const dir = stateDir();
  if (!dir) throw new Error("STATE_DIR is not set");
  const reqDir = path.join(dir, "content-requests");
  await fs.mkdir(reqDir, { recursive: true });
  const requestedAt = new Date().toISOString();
  const id = `${requestedAt.replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const job: ContentJob = { id, courseId, moduleId, label: label.slice(0, 200), requestedAt, state: "queued" };
  const tmp = path.join(reqDir, `.${id}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(job));
  await fs.rename(tmp, path.join(reqDir, `${id}.json`));
  return job;
}
