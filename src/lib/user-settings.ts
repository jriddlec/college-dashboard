/**
 * Settings changed on /settings, kept in $STATE_DIR/settings.json. Each one
 * overrides its .env default; a missing key means "use the default". The sync
 * containers read the same file (scripts/notify.py, d2l-runner/entrypoint.sh).
 *
 * Optional: without STATE_DIR the page shows the .env values read-only.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { APP_URL, NOTIFY_URL } from "@/lib/settings";
import { stateDir } from "@/lib/state";

export const ALERT_KINDS = ["deadlines", "exams", "grades", "announcements", "signin", "sync"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const hours = z
  .number()
  .int()
  .min(1)
  .max(24 * 14);
export const SettingsSchema = z.object({
  /** ntfy topic URL, Discord webhook, or JSON POST URL; "" turns alerts off. */
  notifyUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Must be an http(s) URL")
    .optional(),
  appUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Must be an http(s) URL")
    .optional(),
  remindDueHours: hours.optional(),
  remindExamHours: hours.optional(),
  /** "22-7" (local hours start-end) or "" for no quiet hours. */
  remindQuiet: z
    .string()
    .regex(/^(\d{1,2}-\d{1,2})?$/)
    .optional(),
  /** Alert kinds turned off. */
  alertsOff: z.array(z.enum(ALERT_KINDS)).optional(),
  /** Seconds between syncs (5 min to 1 day). */
  syncInterval: z.number().int().min(300).max(86400).optional(),
  /** The first-run guide at /setup was finished or skipped. */
  setupDone: z.boolean().optional(),
});
export type UserSettings = z.infer<typeof SettingsSchema>;

function file(): string | null {
  const dir = stateDir();
  return dir ? path.join(dir, "settings.json") : null;
}

let cache: { mtimeMs: number; s: UserSettings } | null = null;

export async function readSettings(): Promise<UserSettings> {
  const f = file();
  const st = f ? await fs.stat(f).catch(() => null) : null;
  if (!f || !st) return {};
  if (cache && cache.mtimeMs === st.mtimeMs) return cache.s;
  try {
    const r = SettingsSchema.safeParse(JSON.parse(await fs.readFile(f, "utf8")));
    const s = r.success ? r.data : {};
    cache = { mtimeMs: st.mtimeMs, s };
    return s;
  } catch {
    return {};
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Merge a change; `null` for a key resets it to the .env default. Throws without STATE_DIR. */
export function writeSettings(change: Partial<Record<keyof UserSettings, unknown>>): Promise<UserSettings> {
  const run = async () => {
    const f = file();
    if (!f) throw new Error("STATE_DIR is not set");
    const merged: Record<string, unknown> = { ...(await readSettings()) };
    for (const [k, v] of Object.entries(change)) {
      if (v === null) delete merged[k];
      else merged[k] = v;
    }
    const next = SettingsSchema.parse(merged);
    const tmp = `${f}.${process.pid}.tmp`;
    // Readable by the sync containers (same PUID, but keep it simple).
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o644 });
    await fs.rename(tmp, f);
    cache = null;
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

/** The values in effect: settings.json over .env. */
export async function effective() {
  const s = await readSettings();
  return {
    notifyUrl: s.notifyUrl ?? NOTIFY_URL,
    appUrl: (s.appUrl ?? APP_URL).replace(/\/$/, ""),
    remindDueHours: s.remindDueHours ?? num(process.env.REMIND_DUE_HOURS, 24),
    remindExamHours: s.remindExamHours ?? num(process.env.REMIND_EXAM_HOURS, 48),
    remindQuiet: s.remindQuiet ?? process.env.REMIND_QUIET ?? "22-7",
    alertsOff: new Set<AlertKind>(s.alertsOff ?? []),
    syncInterval: s.syncInterval ?? num(process.env.SYNC_INTERVAL, 1800),
  };
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** "https://ntfy.sh/••••" — enough to recognise the target without showing the secret topic or webhook token. */
export function maskUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}/••••`;
  } catch {
    return u ? "••••" : "";
  }
}
