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
import path from "node:path";
import { buildFixtureSnapshot } from "./providers/fixture";
import { loadD2lSnapshot } from "./providers/d2l";
import { loadCanvasSnapshot } from "./providers/canvas";
import { withWebAssign } from "./webassign";
import { withSyllabusItems } from "./syllabus";
import { getCourseOverrides, getGrading, getSyllabusConfig, getWebAssignConfig, type CourseOverride } from "@/lib/config";
import { LMS, type Lms } from "@/lib/settings";
import type { Course, SnapshotResult } from "./types";

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
  const [grading, syllabus, webassign, overrides] = await Promise.all([getGrading(), getSyllabusConfig(), getWebAssignConfig(), getCourseOverrides()]);
  const source = dataSource();
  let result: SnapshotResult;
  if (source === "fixture") result = { status: "ok", snapshot: buildFixtureSnapshot() };
  else if (source === "d2l") result = await loadD2lSnapshot(dataDir(), grading.value, webassign.value);
  else result = await loadCanvasSnapshot(dataDir(), grading.value, webassign.value);
  if (result.status !== "ok") return result;
  const merged = withSyllabusItems(withWebAssign(result.snapshot, webassign.value), syllabus.value);
  const snapshot = { ...merged, courses: merged.courses.map((c) => withOverride(c, overrides.value)) };
  const configErrors = [grading.error, syllabus.error, webassign.error, overrides.error].filter((e): e is string => !!e);
  return { status: "ok", snapshot: configErrors.length ? { ...snapshot, warnings: [...configErrors, ...snapshot.warnings] } : snapshot };
}

/** courses.json `name` and `instructor` (by course id, then code). */
function withOverride(c: Course, o: Record<string, CourseOverride>): Course {
  const ov = o[c.id] ?? (c.code ? o[c.code] : undefined);
  return ov ? { ...c, name: ov.name ?? c.name, instructor: ov.instructor ?? c.instructor } : c;
}

export * from "./types";
