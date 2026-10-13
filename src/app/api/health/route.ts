import { dataSource, getSchoolData } from "@/lib/school";

/**
 * Liveness + data freshness for Docker healthchecks and monitoring.
 * Always 200 while the server runs; data problems are reported in the body
 * so a stale sync doesn't get the container restarted.
 */
export async function GET() {
  const r = await getSchoolData();
  return Response.json({
    ok: true,
    source: dataSource(),
    data: r.status,
    generatedAt: r.status === "ok" ? r.snapshot.generatedAt : null,
    warnings: r.status === "ok" ? r.snapshot.warnings.length : null,
  });
}
