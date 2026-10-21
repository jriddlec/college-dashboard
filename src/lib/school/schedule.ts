/**
 * Class meetings from $CONFIG_DIR/schedule.json, as calendar events, so Home's
 * "Today" and the calendar show when and where each class meets (most LMSs
 * don't publish meeting times).
 *
 *   { "term": { "start": "2026-08-17", "end": "2026-12-01", "breaks": [["2026-11-25", "2026-11-27"]] },
 *     "courses": { "MATH 2260": [{ "days": "TR", "start": "11:35", "end": "12:55", "location": "Boyd 203", "label": "Lecture" }] } }
 *
 * Days are M T W R F S U (R = Thursday, U = Sunday). Breaks are inclusive.
 */
import type { CalendarEvent, SchoolSnapshot } from "./types";
import { addDays, weekday, zonedIso } from "./time";

export interface Meeting {
  days: string;
  start: string;
  end: string;
  location?: string;
  /** "Lecture", "Lab", "Breakout"; the event title is "<code> <label>". */
  label?: string;
}

export interface ScheduleConfig {
  term: { start: string; end: string; breaks?: [string, string][] };
  courses: Record<string, Meeting[]>;
}

const DAY_LETTERS = "UMTWRFS"; // index = getUTCDay()

const HHMM = /^\d{1,2}:\d{2}$/;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Class events for every meeting in the term (minus breaks), for active courses with a matching code. */
export function scheduleEvents(snapshot: Pick<SchoolSnapshot, "courses">, cfg: ScheduleConfig | null): CalendarEvent[] {
  if (!cfg?.term || !KEY.test(cfg.term.start) || !KEY.test(cfg.term.end)) return [];
  const breaks = (cfg.term.breaks ?? []).filter(([a, b]) => KEY.test(a) && KEY.test(b));
  const out: CalendarEvent[] = [];
  for (const [code, meetings] of Object.entries(cfg.courses ?? {})) {
    const course = snapshot.courses.find((c) => c.code === code && c.isActive);
    if (!course || !Array.isArray(meetings)) continue;
    for (const m of meetings) {
      if (!m || !HHMM.test(m.start) || !HHMM.test(m.end) || typeof m.days !== "string") continue;
      const days = new Set([...m.days.toUpperCase()].map((d) => DAY_LETTERS.indexOf(d)).filter((i) => i >= 0));
      for (let key = cfg.term.start; key <= cfg.term.end; key = addDays(key, 1)) {
        if (!days.has(weekday(key)) || breaks.some(([a, b]) => key >= a && key <= b)) continue;
        out.push({
          id: `class-${course.id}-${key}-${m.start}`,
          courseId: course.id,
          title: [code, m.label].filter(Boolean).join(" "),
          kind: "class",
          startsAt: zonedIso(key, m.start),
          endsAt: zonedIso(key, m.end),
          allDay: false,
          location: m.location ?? null,
          url: null,
        });
      }
    }
  }
  return out;
}

/** Adds the schedule's class meetings, skipping any the LMS calendar already has at the same time. */
export function withSchedule(snapshot: SchoolSnapshot, cfg: ScheduleConfig | null): SchoolSnapshot {
  const extra = scheduleEvents(snapshot, cfg);
  if (!extra.length) return snapshot;
  const taken = new Set(snapshot.events.filter((e) => e.kind === "class").map((e) => `${e.courseId}|${Date.parse(e.startsAt)}`));
  const fresh = extra.filter((e) => !taken.has(`${e.courseId}|${Date.parse(e.startsAt)}`));
  return { ...snapshot, events: [...snapshot.events, ...fresh] };
}
