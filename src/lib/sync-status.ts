/**
 * Small, cheap read of the sync's health for the nav dot and /status: when
 * data was last fetched, whether the latest attempt worked, and (Brightspace)
 * the sign-in session's state. Never throws.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, dataSource } from "@/lib/school";

export type SessionState = "ok" | "needs_login" | "refresh_failed" | "unknown";

export interface SyncStatus {
  /** When the data shown was fetched (null: nothing synced yet). */
  fetchedAt: string | null;
  /** The latest sync attempt failed (old data is still shown). */
  lastFailed: boolean;
  lastAttemptAt: string | null;
  /** Brightspace sign-in session, from d2l-sync's copy of the keeper's status (null for other sources). */
  session: { state: SessionState; at: string | null } | null;
  /** green: fresh; amber: stale or a failed attempt; red: sign-in needed or nothing synced. */
  level: "ok" | "warn" | "bad";
}

const STALE_HOURS = 3;

async function json(file: string): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function getSyncStatus(now = new Date()): Promise<SyncStatus | null> {
  const source = dataSource();
  if (source === "fixture") return null;
  const root = path.join(dataDir(), source);
  const [manifest, attempt, session] = await Promise.all([
    json(path.join(root, "current", "manifest.json")),
    json(path.join(root, "last-attempt.json")),
    source === "d2l" ? json(path.join(root, "session.json")) : Promise.resolve(null),
  ]);
  const fetchedAt = str(manifest?.fetchedAt);
  const lastFailed = attempt?.ok === false;
  const state = str(session?.state);
  const sessionInfo =
    source === "d2l"
      ? { state: (state === "ok" || state === "needs_login" || state === "refresh_failed" ? state : "unknown") as SessionState, at: str(session?.at) }
      : null;
  const ageH = fetchedAt ? (now.getTime() - Date.parse(fetchedAt)) / 3_600_000 : Infinity;
  const level = !fetchedAt || sessionInfo?.state === "needs_login" ? "bad" : lastFailed || ageH > STALE_HOURS || sessionInfo?.state === "refresh_failed" ? "warn" : "ok";
  return { fetchedAt, lastFailed, lastAttemptAt: str(attempt?.at), session: sessionInfo, level };
}
