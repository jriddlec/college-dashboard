"use client";

import { useSyncExternalStore } from "react";
import clsx from "clsx";
import { relative } from "@/lib/school/time";

/** What the nav needs from lib/sync-status (serializable). */
export type NavSync = { fetchedAt: string | null; level: "ok" | "warn" | "bad"; needsLogin: boolean; lastFailed: boolean };

const everyMinute = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);

const DOT = { ok: "bg-ok", warn: "bg-warn", bad: "bg-danger" } as const;

export function SyncDot({ sync, className }: { sync: NavSync; className?: string }) {
  return <span className={clsx("inline-block size-1.5 rounded-full", DOT[sync.level], sync.level === "bad" && "animate-pulse", className)} aria-hidden />;
}

/** "Synced 12m ago" / "Sign-in needed"; re-renders every minute so it doesn't freeze between navigations. */
export function SyncLabel({ sync }: { sync: NavSync }) {
  const minute = useSyncExternalStore(everyMinute, currentMinute, () => null);
  const now = minute == null ? null : new Date(minute * 60_000);
  if (sync.needsLogin) return <>Sign-in needed</>;
  if (!sync.fetchedAt) return <>Not synced yet</>;
  const ago = now ? relative(sync.fetchedAt, now) : "";
  return <>{sync.lastFailed ? `Sync failing · ${ago}` : `Synced ${ago}`}</>;
}
