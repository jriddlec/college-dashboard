"use client";

import { useSyncExternalStore } from "react";

/**
 * "New" marker for things that appeared since your previous visit. The
 * baseline is the last time the dashboard was opened before this browsing
 * session (kept for the session, so badges don't vanish as you click around);
 * a tab left open for hours starts a new baseline. Stored only in this browser.
 */
const LAST = "last-visit";
const BASE = "visit-baseline";
const SESSION_MS = 3 * 3_600_000;

let baseline: number | null | undefined;

function readBaseline(): number | null {
  if (baseline !== undefined) return baseline;
  baseline = null;
  try {
    const now = Date.now();
    const saved = JSON.parse(sessionStorage.getItem(BASE) ?? "null") as { base: number | null; at: number } | null;
    if (saved && now - saved.at < SESSION_MS) baseline = saved.base;
    else {
      const last = Number(localStorage.getItem(LAST)) || null;
      baseline = last;
      sessionStorage.setItem(BASE, JSON.stringify({ base: last, at: now }));
    }
    localStorage.setItem(LAST, String(now));
  } catch {
    // Storage blocked: no badges.
  }
  return baseline;
}

const subscribe = () => () => {};

/** Renders a small "New" pill when `at` (ISO string or epoch ms) is after the previous visit. */
export function NewBadge({ at, className = "" }: { at: string | number | null | undefined; className?: string }) {
  const base = useSyncExternalStore(subscribe, readBaseline, () => null);
  if (at == null || base == null) return null;
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!(t > base)) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide bg-accent-soft text-accent ${className}`}>New</span>
  );
}
