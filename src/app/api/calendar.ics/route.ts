import { getSchoolData } from "@/lib/school";
import { buildIcs } from "@/lib/school/ics";
import { APP_NAME } from "@/lib/settings";

/**
 * Subscribable calendar of deadlines, exams and events.
 *   ?alarms=1440,120   reminder minutes before each deadline (default 1 day + 2 h; `none` for no alarms)
 *   ?classes=1         also include class meetings
 * Calendar apps don't send the browser's cookies, so items marked done on the
 * dashboard still appear here.
 */
export async function GET(req: Request) {
  const r = await getSchoolData();
  if (r.status !== "ok") return new Response(r.status === "error" ? r.message : r.reason, { status: 503 });
  const q = new URL(req.url).searchParams;
  const alarmParam = q.get("alarms");
  const alarms =
    alarmParam === "none" || alarmParam === "0"
      ? []
      : (alarmParam ?? "1440,120")
          .split(",")
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0 && n <= 40320)
          .slice(0, 4);
  const body = buildIcs(r.snapshot, { name: APP_NAME, now: new Date(), alarms, classes: q.get("classes") === "1" });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="school.ics"',
      "Cache-Control": "no-store",
    },
  });
}
