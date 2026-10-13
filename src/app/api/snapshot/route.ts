import { getSchoolData } from "@/lib/school";

/**
 * The normalized snapshot the UI renders, for scripts and other services. Same data the pages already show; no
 * credentials or raw source dumps. 503 when there's nothing to serve, so
 * consumers keep what they have instead of treating "no data" as "no classes".
 */
export async function GET() {
  const r = await getSchoolData();
  if (r.status !== "ok") return Response.json(r, { status: 503 });
  return Response.json(r.snapshot);
}
