/**
 * Small shared state kept by the app in $STATE_DIR/state.json, so choices
 * made on one device show on the others: assignments marked done, overdue
 * items hidden from Home, announcements read, and which reminders were sent.
 *
 * Optional: without STATE_DIR (or when it isn't writable) the app keeps marks
 * per browser in cookies, as before. Everything else stays read-only.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export const STATE_KEYS = ["markedDone", "hiddenOverdue", "readAnnouncements", "reminded"] as const;
export type StateKey = (typeof STATE_KEYS)[number];
/** Keys the browser may change through /api/state. */
export const CLIENT_KEYS: readonly StateKey[] = ["markedDone", "hiddenOverdue", "readAnnouncements"];
export type AppState = Record<StateKey, string[]>;

const MAX_IDS = 2000;
const MAX_ID_LENGTH = 300;

export function stateDir(): string | null {
  const dir = process.env.STATE_DIR;
  // Runtime data, not source: keep the bundler from tracing it into the build.
  return dir ? path.resolve(/*turbopackIgnore: true*/ dir) : null;
}

const empty = (): AppState => ({ markedDone: [], hiddenOverdue: [], readAnnouncements: [], reminded: [] });

function clean(raw: unknown): AppState {
  const out = empty();
  if (!raw || typeof raw !== "object") return out;
  for (const k of STATE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string" && x.length <= MAX_ID_LENGTH).slice(-MAX_IDS);
  }
  return out;
}

let cache: { mtimeMs: number; state: AppState } | null = null;

/** The shared state; empty when STATE_DIR isn't set or nothing was saved yet. */
export async function readState(): Promise<AppState> {
  const dir = stateDir();
  if (!dir) return empty();
  const file = path.join(dir, "state.json");
  const st = await fs.stat(file).catch(() => null);
  if (!st) return empty();
  if (cache && cache.mtimeMs === st.mtimeMs) return cache.state;
  try {
    const state = clean(JSON.parse(await fs.readFile(file, "utf8")));
    cache = { mtimeMs: st.mtimeMs, state };
    return state;
  } catch {
    return empty();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Change the state (one write at a time, atomically replaced). Throws when
 * STATE_DIR isn't set or can't be written, so callers can fall back.
 */
export function updateState(change: (s: AppState) => AppState): Promise<AppState> {
  const run = async () => {
    const dir = stateDir();
    if (!dir) throw new Error("STATE_DIR is not set");
    const next = clean(change(await readState()));
    const file = path.join(dir, "state.json");
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next), "utf8");
    await fs.rename(tmp, file);
    cache = null;
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

/** Add or remove ids under a key (newest last, so the oldest drop first past the cap). */
export function setIds(s: AppState, key: StateKey, ids: string[], on: boolean): AppState {
  const rest = s[key].filter((x) => !ids.includes(x));
  return { ...s, [key]: on ? [...rest, ...ids] : rest };
}
