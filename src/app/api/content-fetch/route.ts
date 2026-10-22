import { contentCourses, contentFetchEnabled, contentJobs, queueContentFetch } from "@/lib/content-fetch";
import { sameOrigin } from "@/lib/same-origin";
import { getSchoolData } from "@/lib/school";

/**
 * Content fetches from /status. GET → recent jobs; POST {courseId, moduleId?}
 * → queue one (no moduleId: the whole course). d2l-sync does the download.
 */
export async function GET() {
  if (!contentFetchEnabled()) return Response.json({ enabled: false }, { status: 404 });
  return Response.json({ enabled: true, jobs: await contentJobs() });
}

export async function POST(req: Request) {
  if (!contentFetchEnabled()) return Response.json({ enabled: false }, { status: 404 });
  if (!sameOrigin(req) || !req.headers.get("content-type")?.startsWith("application/json")) return new Response("Forbidden", { status: 403 });
  let body: { courseId?: unknown; moduleId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const data = await getSchoolData();
  const courses = data.status === "ok" ? await contentCourses(data.snapshot.courses) : [];
  const course = courses.find((c) => c.id === body.courseId);
  if (!course) return new Response("Unknown course", { status: 400 });
  const unit = body.moduleId ? course.units.find((u) => u.id === body.moduleId) : null;
  if (body.moduleId && !unit) return new Response("Unknown unit", { status: 400 });
  if ((await contentJobs()).some((j) => (j.state === "queued" || j.state === "running") && j.courseId === course.id && j.moduleId === (unit?.id ?? null)))
    return new Response("Already queued", { status: 409 });
  try {
    const job = await queueContentFetch(course.id, unit?.id ?? null, `${course.code} · ${unit ? unit.title : "Whole course"}`);
    return Response.json({ enabled: true, job });
  } catch (e) {
    return Response.json({ enabled: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
