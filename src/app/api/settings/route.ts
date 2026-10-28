import { promises as fs } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { sameOrigin } from "@/lib/same-origin";
import { stateDir } from "@/lib/state";
import { notify } from "@/lib/notify";
import { SettingsSchema, writeSettings } from "@/lib/user-settings";

/**
 * /settings changes. POST JSON:
 *   {set: {key: value | null}}  save (null resets to the .env default)
 *   {action: "test"}            send a test alert to the current target
 *   {action: "sync"}            ask d2l-sync to sync now ($STATE_DIR/sync-now)
 */
export async function POST(req: Request) {
  if (!sameOrigin(req) || !req.headers.get("content-type")?.startsWith("application/json")) return new Response("Forbidden", { status: 403 });
  const dir = stateDir();
  let body: { set?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (body.action === "test") {
    const ok = await notify({ title: "Test alert", message: "Alerts from the College Dashboard reach this device.", path: "/settings", tags: "bell" });
    return Response.json({ ok, error: ok ? undefined : "Couldn't send it. Check the address, and that the server can reach it." });
  }
  if (!dir) return Response.json({ ok: false, error: "Settings need STATE_DIR on the server." }, { status: 503 });

  if (body.action === "sync") {
    try {
      await fs.writeFile(path.join(dir, "sync-now"), new Date().toISOString(), "utf8");
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
    }
  }

  if (!body.set || typeof body.set !== "object") return new Response("Bad request", { status: 400 });
  const set = body.set as Record<string, unknown>;
  const known = Object.keys(SettingsSchema.shape);
  if (Object.keys(set).some((k) => !known.includes(k))) return Response.json({ ok: false, error: "Unknown setting" }, { status: 400 });
  try {
    await writeSettings(set);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: e instanceof ZodError ? 400 : 503 });
  }
}
