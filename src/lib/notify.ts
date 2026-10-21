/**
 * Push alerts (same targets as scripts/notify.py): NOTIFY_URL is an ntfy
 * topic URL, a Discord webhook, or any URL that takes a JSON POST
 * {title, message, url}. Best-effort: failures are logged, never thrown.
 */
import "server-only";
import { APP_URL, NOTIFY_URL } from "@/lib/settings";

export interface Alert {
  title: string;
  message: string;
  /** App path the alert opens ("/assignments"). */
  path?: string;
  /** ntfy tags (emoji shortcodes), e.g. "alarm_clock". */
  tags?: string;
  priority?: "min" | "low" | "default" | "high" | "max";
}

export async function notify(a: Alert, url = NOTIFY_URL): Promise<boolean> {
  if (!url) return false;
  const click = APP_URL ? `${APP_URL}${a.path ?? "/"}` : "";
  let init: RequestInit;
  if (/discord(app)?\.com\/api\/webhooks/.test(url)) {
    const text = `**${a.title}**\n${a.message}${click ? `\n${click}` : ""}`;
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900) }) };
  } else if (/ntfy/.test(url)) {
    const headers: Record<string, string> = { Title: encodeHeader(a.title), Priority: a.priority ?? "default" };
    if (a.tags) headers.Tags = a.tags;
    if (click) headers.Click = click;
    init = { method: "POST", headers, body: a.message };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: a.title, message: a.message, url: click || null }) };
  }
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.error(`notify failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** HTTP headers are Latin-1: ntfy decodes RFC 2047 encoded words, so non-ASCII titles survive. */
function encodeHeader(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}
