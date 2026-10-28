/**
 * Reads the raw Canvas API responses written by scripts/canvas_sync.py and
 * normalizes them.
 *
 * Layout under $DATA_DIR/canvas/current/:
 *   manifest.json                 { fetchedAt, failures: string[] }
 *   courses.json announcements.json calendar.json
 *   courses/<courseId>/assignments.json assignment-groups.json
 *
 * The sync swaps `current` atomically, so a half-written snapshot is never read.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeCanvas, type CanvasRaw } from "../canvas/normalize";
import type { Syllabi } from "../d2l/normalize";
import type { WebAssignCourse } from "../webassign";
import { SCHOOL_TZ } from "../time";
import type { SnapshotResult } from "../types";
import { readJson, readQuizLogs } from "./d2l";

type Attempt = { at?: string; ok?: boolean; error?: string } | undefined;

let cache: { key: string; result: SnapshotResult; grading: Syllabi; webassign: Record<string, WebAssignCourse> } | null = null;

const when = (at: string) => new Date(at).toLocaleString("en-US", { timeZone: SCHOOL_TZ });

export async function loadCanvasSnapshot(dataDir: string, grading: Syllabi = {}, webassign: Record<string, WebAssignCourse> = {}): Promise<SnapshotResult> {
  const root = path.join(dataDir, "canvas");
  const dir = path.join(root, "current");
  const manifestPath = path.join(dir, "manifest.json");
  const attemptPath = path.join(root, "last-attempt.json");
  const stat = await fs.stat(manifestPath).catch(() => null);
  if (!stat) {
    const attempt = (await readJson(attemptPath).catch(() => undefined)) as Attempt;
    return {
      status: "empty",
      source: "canvas",
      reason:
        attempt?.ok === false && attempt.error
          ? `The sync couldn't reach Canvas yet (${attempt.at ? when(attempt.at) : "last attempt"}): ${attempt.error}`
          : "Nothing synced yet. Set LMS_URL and CANVAS_TOKEN in .env and start the canvas-sync container; the first sync runs right away.",
    };
  }
  const attemptStat = await fs.stat(attemptPath).catch(() => null);
  const logs = await readQuizLogs(grading);
  const key = `${stat.mtimeMs}:${attemptStat?.mtimeMs ?? 0}:${logs.key}`;
  // Config objects are cached by file mtime in lib/config.ts, so identity tracks edits.
  if (cache && (cache.grading !== grading || cache.webassign !== webassign)) cache = null;
  if (cache && cache.key === key) return cache.result;

  try {
    const manifest = (await readJson(manifestPath)) as { fetchedAt?: string; failures?: string[] } | undefined;
    const perCourse: CanvasRaw["perCourse"] = {};
    const coursesDir = path.join(dir, "courses");
    const ids = await fs.readdir(coursesDir).catch(() => [] as string[]);
    await Promise.all(
      ids.map(async (id) => {
        const [assignments, assignmentGroups] = await Promise.all([
          readJson(path.join(coursesDir, id, "assignments.json")),
          readJson(path.join(coursesDir, id, "assignment-groups.json")),
        ]);
        perCourse[id] = { assignments, assignmentGroups };
      }),
    );
    const [courses, announcements, calendar] = await Promise.all(
      ["courses", "announcements", "calendar"].map((n) => readJson(path.join(dir, `${n}.json`))),
    );
    const raw: CanvasRaw = {
      fetchedAt: manifest?.fetchedAt ?? stat.mtime.toISOString(),
      failures: manifest?.failures ?? [],
      courses,
      announcements,
      calendar,
      perCourse,
      quizLogs: logs.text,
    };
    const snapshot = normalizeCanvas(raw, grading, webassign);
    const attempt = (await readJson(attemptPath).catch(() => undefined)) as Attempt;
    if (attempt && attempt.ok === false && attempt.at && Date.parse(attempt.at) > Date.parse(snapshot.generatedAt)) {
      snapshot.warnings.unshift(`Latest sync failed (${when(attempt.at)}): ${attempt.error ?? "unknown error"} Showing the previous data.`);
    }
    const result: SnapshotResult = snapshot.courses.length
      ? { status: "ok", snapshot }
      : { status: "empty", source: "canvas", reason: "The last sync returned no active courses." };
    cache = { key, result, grading, webassign };
    return result;
  } catch (err) {
    return { status: "error", source: "canvas", message: (err as Error).message };
  }
}
