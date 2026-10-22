import { sameOrigin } from "@/lib/same-origin";
import { CLIENT_KEYS, readState, setIds, stateDir, updateState, type StateKey } from "@/lib/state";

/**
 * Shared marks (done, hidden overdue, read announcements) for the browser.
 * GET → the lists; POST {key, ids, on} or {key, clear: true} → change one.
 * 404 when the app has no STATE_DIR (the browser then keeps marks in cookies).
 */
export async function GET() {
  if (!stateDir()) return Response.json({ enabled: false }, { status: 404 });
  const s = await readState();
  return Response.json({ enabled: true, markedDone: s.markedDone, hiddenOverdue: s.hiddenOverdue, readAnnouncements: s.readAnnouncements });
}

export async function POST(req: Request) {
  if (!stateDir()) return Response.json({ enabled: false }, { status: 404 });
  if (!sameOrigin(req) || !req.headers.get("content-type")?.startsWith("application/json")) return new Response("Forbidden", { status: 403 });
  let body: { key?: unknown; ids?: unknown; on?: unknown; clear?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const key = body.key as StateKey;
  if (!CLIENT_KEYS.includes(key)) return new Response("Unknown key", { status: 400 });
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 300).slice(0, 500) : [];
  try {
    const next = await updateState((s) => (body.clear === true ? { ...s, [key]: [] } : setIds(s, key, ids, body.on !== false)));
    return Response.json({ enabled: true, [key]: next[key] });
  } catch (e) {
    return Response.json({ enabled: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
