/**
 * Browser side of the shared marks: try the app's state store first, and keep
 * the mark in this browser (cookie or localStorage) when it has none.
 */
import { encodeIdCookie, parseIdCookie } from "./hidden-overdue";

export type ClientKey = "markedDone" | "hiddenOverdue" | "readAnnouncements";

/** Saves to the shared store; false when there is none (or it can't be written). */
export async function saveShared(key: ClientKey, change: { ids: string[]; on: boolean } | { clear: true }): Promise<boolean> {
  try {
    const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...change }) });
    return res.ok;
  } catch {
    return false;
  }
}

export function readCookieIds(name: string): string[] {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return parseIdCookie(raw?.slice(name.length + 1));
}

export function writeCookieIds(name: string, ids: string[]) {
  document.cookie = `${name}=${encodeIdCookie(ids)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
