/**
 * iCalendar (RFC 5545) feed of deadlines, exams and events, for subscribing
 * from a phone or desktop calendar. Pure: the route supplies data and "now".
 */
import type { SchoolSnapshot } from "./types";
import { agenda, courseLabel, courseMap, isDone } from "./derive";
import { addDays, dayKey } from "./time";

/** Escapes TEXT values (backslash, semicolon, comma, newline). */
function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC timestamp, e.g. 20261020T143000Z. */
function stamp(iso: string | Date): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Folds lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsOptions {
  name: string;
  now: Date;
  /** Reminder offsets before assignment deadlines, in minutes (empty = no alarms). */
  alarms: number[];
  /** Include class meetings (often many per week). */
  classes: boolean;
}

export function buildIcs(s: Pick<SchoolSnapshot, "assignments" | "events" | "courses">, o: IcsOptions): string {
  const courses = courseMap(s.courses);
  const dtstamp = stamp(o.now);
  // Recent past stays so a sync gap doesn't make yesterday's deadline vanish from the calendar.
  const since = o.now.getTime() - 14 * 864e5;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//College Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(o.name)}`,
    "X-PUBLISHED-TTL:PT30M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
  ];
  const event = (uid: string, at: string, props: string[], alarms: number[] = []) => {
    lines.push("BEGIN:VEVENT", `UID:${encodeURIComponent(uid)}@college-dashboard`, `DTSTAMP:${dtstamp}`, ...props);
    if (Date.parse(at) < o.now.getTime()) alarms = [];
    for (const m of alarms) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", `TRIGGER:-PT${m}M`, "END:VALARM");
    lines.push("END:VEVENT");
  };
  const prefix = (courseId: string | null) => (courseId ? `[${courseLabel(courses.get(courseId))}] ` : "");

  for (const item of agenda(s)) {
    if (Date.parse(item.at) < since) continue;
    if (item.type === "assignment") {
      const a = item.assignment;
      if (isDone(a)) continue;
      const kind = a.kind === "quiz" ? "Quiz" : a.kind === "exam" ? "Exam" : "Due";
      const props = [
        `SUMMARY:${text(`${prefix(a.courseId)}${kind}: ${a.title}`)}`,
        // Zero-length at the deadline, like a reminder; most calendars show it at the due time.
        `DTSTART:${stamp(a.dueAt!)}`,
        `DTEND:${stamp(a.dueAt!)}`,
        "TRANSP:TRANSPARENT",
        `CATEGORIES:${a.kind.toUpperCase()}`,
      ];
      if (a.url) props.push(`URL:${a.url}`, `DESCRIPTION:${text(a.url)}`);
      event(`a-${a.id}`, a.dueAt!, props, o.alarms);
      if (a.earlyBonusAt && Date.parse(a.earlyBonusAt) > o.now.getTime()) {
        event(
          `bonus-${a.id}`,
          a.earlyBonusAt,
          [
            `SUMMARY:${text(`${prefix(a.courseId)}Early bonus ends (+${a.earlyBonusPercent ?? 0}%): ${a.title}`)}`,
            `DTSTART:${stamp(a.earlyBonusAt)}`,
            `DTEND:${stamp(a.earlyBonusAt)}`,
            "TRANSP:TRANSPARENT",
          ],
          o.alarms.slice(0, 1),
        );
      }
    } else {
      const e = item.event;
      if (e.kind === "class" && !o.classes) continue;
      const props = [`SUMMARY:${text(`${prefix(e.courseId)}${e.title}`)}`];
      if (e.allDay) {
        const start = dayKey(e.startsAt);
        const end = e.endsAt ? addDays(dayKey(e.endsAt), dayKey(e.endsAt) > start ? 0 : 1) : addDays(start, 1);
        props.push(`DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`);
      } else {
        props.push(`DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt ?? e.startsAt)}`);
      }
      if (e.location) props.push(`LOCATION:${text(e.location)}`);
      if (e.url) props.push(`URL:${e.url}`);
      event(`e-${e.id}`, e.startsAt, props, e.kind === "exam" ? o.alarms : []);
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
