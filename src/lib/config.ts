/**
 * Runtime configuration, read from $CONFIG_DIR (default ./config). Every file
 * is optional and editable without a rebuild; see config/*.example.json.
 *
 *   courses.json     per-class overrides: name, instructor, icon, library folders
 *   links.json       quick links (bundled defaults otherwise)
 *   grading.json     per-syllabus grade weights and letter scales
 *   syllabus.json    deliverables the LMS doesn't list yet
 *   schedule.json    class meeting times (shown on Today and the calendar)
 *   webassign.json   WebAssign assignments kept by hand
 *   transcript.json  completed-term GPA totals
 *
 * An invalid file is ignored (the app falls back as if it were absent) and its
 * error is surfaced as a warning on the status page.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Syllabus } from "@/lib/school/standing";
import type { WebAssignCourse } from "@/lib/school/webassign";
import type { SyllabusCourse } from "@/lib/school/syllabus";
import type { ScheduleConfig } from "@/lib/school/schedule";

export function configDir(): string {
  // Runtime data, not source: keep the bundler from tracing it into the build.
  return path.resolve(/*turbopackIgnore: true*/ process.env.CONFIG_DIR || "./config");
}

export interface ConfigResult<T> {
  value: T;
  /** Why the file was ignored, or null. */
  error: string | null;
  /** The file in use, or null when absent/ignored. */
  path: string | null;
}

const cache = new Map<string, { mtimeMs: number; result: ConfigResult<unknown> }>();

export async function readConfig<T>(name: string, schema: z.ZodType<T>, fallback: T): Promise<ConfigResult<T>> {
  const file = path.join(configDir(), name);
  const st = await fs.stat(file).catch(() => null);
  if (!st) return { value: fallback, error: null, path: null };
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.result as ConfigResult<T>;
  let result: ConfigResult<T>;
  try {
    const parsed = schema.safeParse(JSON.parse(await fs.readFile(file, "utf8")));
    if (parsed.success) result = { value: parsed.data, error: null, path: file };
    else {
      const issue = parsed.error.issues[0];
      result = { value: fallback, error: `${name} is invalid (${issue?.path.join(".") || "root"}: ${issue?.message}); ignoring it.`, path: null };
    }
  } catch (err) {
    result = { value: fallback, error: `Could not read ${name} (${(err as Error).message}); ignoring it.`, path: null };
  }
  cache.set(file, { mtimeMs: st.mtimeMs, result });
  return result;
}

/** Keyed by course code ("CSCI 1301"); contents are validated where they're used. */
const byCode = <T,>() => z.object({ courses: z.record(z.string(), z.unknown()) }).transform((v) => v.courses as Record<string, T>);

export const getGrading = () => readConfig("grading.json", byCode<Syllabus>(), {});
export const getSyllabusConfig = () => readConfig("syllabus.json", byCode<SyllabusCourse>(), {});
export const getWebAssignConfig = () => readConfig("webassign.json", byCode<WebAssignCourse>(), {});
export const getScheduleConfig = () =>
  readConfig<ScheduleConfig | null>(
    "schedule.json",
    z.object({ term: z.object({ start: z.string(), end: z.string(), breaks: z.array(z.tuple([z.string(), z.string()])).optional() }), courses: z.record(z.string(), z.array(z.unknown())) }).transform((v) => v as ScheduleConfig),
    null,
  );

const CourseOverrideSchema = z.object({
  /** URL slug for the library tab; defaults to the code ("csci-1301"). */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  code: z.string().optional(),
  name: z.string().optional(),
  instructor: z.string().optional(),
  /** Icon name for the library tab (see components/course-icon.tsx). */
  icon: z.string().optional(),
  /** Top-level library folders for this class; defaults to folders named after the code. */
  folders: z.array(z.string()).optional(),
  /** Leave the class out of the library. */
  hidden: z.boolean().optional(),
});
export type CourseOverride = z.infer<typeof CourseOverrideSchema>;

/**
 * Keyed by LMS course id or code. A key that matches no LMS course adds a
 * library-only class (its `code` defaults to the key).
 */
export const getCourseOverrides = () =>
  readConfig("courses.json", z.object({ courses: z.record(z.string(), CourseOverrideSchema) }).transform((v) => v.courses), {});
