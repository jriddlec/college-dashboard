/**
 * Timezone-aware date helpers. All "day" logic (today, tomorrow, calendar
 * cells) uses the configured school timezone, not the server's locale, so the
 * container's TZ can't silently shift deadlines across midnight.
 */

export const SCHOOL_TZ = process.env.SCHOOL_TZ || "America/New_York";

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of the instant in the school timezone. */
export function dayKey(d: Date | string): string {
  return keyFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Whole calendar days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  const d = new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Day of week for a YYYY-MM-DD key, 0 = Sunday. */
export function weekday(key: string): number {
  return new Date(key + "T00:00:00Z").getUTCDay();
}

function fmt(opts: Intl.DateTimeFormatOptions) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: SCHOOL_TZ, ...opts });
  return (d: Date | string) => f.format(typeof d === "string" ? new Date(d) : d);
}

export const formatTime = fmt({ hour: "numeric", minute: "2-digit" });
export const formatShortDate = fmt({ month: "short", day: "numeric" });
export const formatWeekdayDate = fmt({ weekday: "short", month: "short", day: "numeric" });
export const formatLongDate = fmt({ weekday: "long", month: "long", day: "numeric" });
export const formatDateTime = fmt({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const hourOfDay = (d: Date) => Number(fmt({ hour: "numeric", hourCycle: "h23" })(d));

/** Formats a YYYY-MM-DD key without timezone drift. */
export function formatKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(key + "T12:00:00Z"));
}

/** "in 3h", "2d ago", "in 45m" */
export function relative(target: Date | string, now: Date): string {
  const ms = new Date(target).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  let s: string;
  if (mins < 60) s = `${Math.max(mins, 1)}m`;
  else if (mins < 60 * 24) s = `${Math.round(mins / 60)}h`;
  else s = `${Math.round(mins / 1440)}d`;
  return ms >= 0 ? `in ${s}` : `${s} ago`;
}
