/**
 * Reads the raw d2l-cli dump written by scripts/d2l_sync.py and normalizes it.
 *
 * Layout under $DATA_DIR/d2l/current/:
 *   manifest.json                 { fetchedAt, failures: string[] }
 *   courses.json due.json overdue.json calendar.json news.json final-grades.json
 *   courses/<courseId>/assignments.json grades.json quizzes.json news.json submissions.json
 *                       grade-objects.json grade-categories.json grade-setup.json
 *
 * The sync script swaps `current` atomically, so a half-written dump is never read.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeD2l, type D2lRaw, type Syllabi } from "../d2l/normalize";
import type { WebAssignCourse } from "../webassign";
import { SCHOOL_TZ } from "../time";
import type { SnapshotResult } from "../types";

let cache: { key: string; result: SnapshotResult; grading: Syllabi; webassign: Record<string, WebAssignCourse> } | null = null;

export async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Could not parse ${path.basename(file)}: ${(err as Error).message}`);
  }
}

/** Quiz logs from the library ($LIBRARY_DIR), keyed by course code. Missing files are skipped. */
export async function readQuizLogs(grading: Syllabi): Promise<{ key: string; text: Record<string, string> }> {
  const dir = process.env.LIBRARY_DIR || "./library";
  const text: Record<string, string> = {};
  let key = "";
  for (const [code, syl] of Object.entries(grading)) {
    if (!syl.quizLog) continue;
    const file = path.join(/*turbopackIgnore: true*/ dir, syl.quizLog.file);
    const st = await fs.stat(file).catch(() => null);
    if (!st) continue;
    text[code] = await fs.readFile(file, "utf8");
    key += `${code}=${st.mtimeMs};`;
  }
  return { key, text };
}

export async function loadD2lSnapshot(dataDir: string, grading: Syllabi = {}, webassign: Record<string, WebAssignCourse> = {}): Promise<SnapshotResult> {
  const dir = path.join(dataDir, "d2l", "current");
  const manifestPath = path.join(dir, "manifest.json");
  let stat;
  try {
    stat = await fs.stat(manifestPath);
  } catch {
    return {
      status: "empty",
      source: "d2l",
      reason: "Nothing synced yet. Sign in to your LMS through noVNC (http://localhost:6080/vnc.html, the d2l-session container); the first sync follows within a minute.",
    };
  }
  const attemptStat = await fs.stat(path.join(dataDir, "d2l", "last-attempt.json")).catch(() => null);
  const logs = await readQuizLogs(grading);
  // Config objects are cached by file mtime in lib/config.ts, so identity tracks edits.
  const key = `${stat.mtimeMs}:${attemptStat?.mtimeMs ?? 0}:${logs.key}`;
  if (cache && (cache.grading !== grading || cache.webassign !== webassign)) cache = null;
  if (cache && cache.key === key) return cache.result;

  try {
    const manifest = (await readJson(manifestPath)) as { fetchedAt?: string; failures?: string[] } | undefined;
    const perCourse: D2lRaw["perCourse"] = {};
    const coursesDir = path.join(dir, "courses");
    const ids = await fs.readdir(coursesDir).catch(() => [] as string[]);
    const course = (id: string, name: string) => readJson(path.join(coursesDir, id, name));
    await Promise.all(
      ids.map(async (id) => {
        const [assignments, grades, quizzes, news, submissions, gradeObjects, gradeCategories, gradeSetup] = await Promise.all(
          ["assignments", "grades", "quizzes", "news", "submissions", "grade-objects", "grade-categories", "grade-setup"].map((n) => course(id, `${n}.json`)),
        );
        perCourse[id] = { assignments, grades, quizzes, news, submissions, gradeObjects, gradeCategories, gradeSetup };
      }),
    );
    const [courses, due, overdue, calendar, news, finalGrades] = await Promise.all(
      ["courses", "due", "overdue", "calendar", "news", "final-grades"].map((n) => readJson(path.join(dir, `${n}.json`))),
    );
    const raw: D2lRaw = {
      fetchedAt: manifest?.fetchedAt ?? stat.mtime.toISOString(),
      failures: manifest?.failures ?? [],
      courses,
      due,
      overdue,
      calendar,
      news,
      finalGrades,
      perCourse,
      quizLogs: logs.text,
    };
    const snapshot = normalizeD2l(raw, grading, webassign);
    const attempt = (await readJson(path.join(dataDir, "d2l", "last-attempt.json")).catch(() => undefined)) as
      | { at?: string; ok?: boolean; error?: string }
      | undefined;
    if (attempt && attempt.ok === false && attempt.at && Date.parse(attempt.at) > Date.parse(snapshot.generatedAt)) {
      snapshot.warnings.unshift(`Latest sync failed (${new Date(attempt.at).toLocaleString("en-US", { timeZone: SCHOOL_TZ })}): ${attempt.error ?? "unknown error"} Showing the previous data.`);
    }
    const result: SnapshotResult = snapshot.courses.length
      ? { status: "ok", snapshot }
      : { status: "empty", source: "d2l", reason: "The last sync returned no active courses." };
    cache = { key, result, grading, webassign };
    return result;
  } catch (err) {
    return { status: "error", source: "d2l", message: (err as Error).message };
  }
}
