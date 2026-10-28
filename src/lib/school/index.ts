/**
 * Entry point for school data. Pages call `getSchoolData()` and receive a
 * normalized snapshot regardless of where the data came from.
 *
 * LMS (see lib/settings.ts):
 *   fixture  demo data (default when unset)
 *   d2l      Brightspace data synced by d2l-cli
 *   canvas   Canvas data synced through the Canvas REST API
 */
import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import path from "node:path";
import { buildFixtureSnapshot } from "./providers/fixture";
import { loadD2lSnapshot } from "./providers/d2l";
import { loadCanvasSnapshot } from "./providers/canvas";
import { withWebAssign } from "./webassign";
import { withAttendance, withSyllabusItems } from "./syllabus";
import { withSchedule } from "./schedule";
import { readState } from "@/lib/state";
import { getCourseOverrides, getGrading, getScheduleConfig, getSyllabusConfig, getWebAssignConfig, type CourseOverride } from "@/lib/config";
import { LMS, type Lms } from "@/lib/settings";
import { MARKED_DONE_COOKIE, parseIdCookie } from "@/lib/hidden-overdue";
import type { Course, SnapshotResult } from "./types";
import { withArchivedAnnouncements } from "./announcement-archive";

export type DataSource = Lms;

export function dataSource(): DataSource {
  return LMS;
}

/** Sync output: $DATA_DIR/<lms>/current/... (read-only to the app). */
export function dataDir(): string {
  // Runtime data, not source: keep the bundler from tracing it into the build.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "./data");
}

export async function getSchoolData(): Promise<SnapshotResult> {
  await connection(); // always request-time: data and "now" change continuously
  return loadSchoolData(await readMarkedDone());
}

/**
 * The merged snapshot (LMS + WebAssign + syllabus rows + course overrides +
 * marks). `browserMarks` are a browser's cookie marks; marks in the shared
 * state always apply. Also used outside requests (reminders), where there are
 * no cookies.
 */
export async function loadSchoolData(browserMarks: string[] = [], now = new Date()): Promise<SnapshotResult> {
  const [grading, syllabus, webassign, overrides, schedule, state] = await Promise.all([
    getGrading(),
    getSyllabusConfig(),
    getWebAssignConfig(),
    getCourseOverrides(),
    getScheduleConfig(),
    readState(),
  ]);
  const source = dataSource();
  let result: SnapshotResult;
  if (source === "fixture") result = { status: "ok", snapshot: buildFixtureSnapshot() };
  else if (source === "d2l") result = await loadD2lSnapshot(dataDir(), grading.value, webassign.value);
  else result = await loadCanvasSnapshot(dataDir(), grading.value, webassign.value);
  if (result.status !== "ok") return result;
  const merged = withSchedule(withAttendance(withSyllabusItems(withWebAssign(result.snapshot, webassign.value), syllabus.value), now), schedule.value);
  // Items ticked off by hand: in the shared state, or in this browser's cookie.
  const marked = new Set([...state.markedDone, ...browserMarks]);
  const snapshot = {
    ...merged,
    courses: merged.courses.map((c) => withOverride(c, overrides.value)),
    assignments: marked.size ? merged.assignments.map((a) => (marked.has(a.id) ? { ...a, markedDone: true } : a)) : merged.assignments,
    announcements: source === "fixture" ? merged.announcements : await withArchivedAnnouncements(merged.announcements),
  };
  const configErrors = [grading.error, syllabus.error, webassign.error, overrides.error, schedule.error].filter((e): e is string => !!e);
  return { status: "ok", snapshot: configErrors.length ? { ...snapshot, warnings: [...configErrors, ...snapshot.warnings] } : snapshot };
}

/** courses.json `name` and `instructor` (by course id, then code). */
function withOverride(c: Course, o: Record<string, CourseOverride>): Course {
  const ov = o[c.id] ?? (c.code ? o[c.code] : undefined);
  return ov ? { ...c, name: ov.name ?? c.name, instructor: ov.instructor ?? c.instructor } : c;
}

export * from "./types";

/** Assignment ids marked done in this browser; empty outside a request (no cookies). */
export async function readMarkedDone(): Promise<string[]> {
  try {
    return parseIdCookie((await cookies()).get(MARKED_DONE_COOKIE)?.value);
  } catch {
    return [];
  }
}
