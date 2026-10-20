/**
 * Pure view logic over the normalized model: urgency, grouping, filtering.
 * Kept free of React and I/O so it is easy to unit test.
 */
import type { Assignment, CalendarEvent, Course, SchoolSnapshot } from "./types";
import { addDays, dayKey, daysBetween, formatKey, weekday } from "./time";

/** "past" = due date passed but the source can't say whether it was submitted. */
export type Urgency = "done" | "overdue" | "past" | "today" | "soon" | "week" | "later" | "undated";

export function isDone(a: Assignment): boolean {
  return a.status === "submitted" || a.status === "graded";
}

export function urgencyOf(a: Assignment, now: Date): Urgency {
  if (isDone(a)) return "done";
  if (!a.dueAt) return "undated";
  const due = new Date(a.dueAt);
  if (due < now) return a.status === "not_submitted" ? "overdue" : "past";
  const days = daysBetween(dayKey(now), dayKey(due));
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  if (days <= 7) return "week";
  return "later";
}

/** Fixed buckets; dated weeks beyond next week use `week:YYYY-MM-DD` (that week's Monday). */
export type GroupKey = "overdue" | "past" | "today" | "tomorrow" | "week" | "next" | `week:${string}` | "undated";
export const GROUP_LABELS: Record<Exclude<GroupKey, `week:${string}`>, string> = {
  overdue: "Overdue",
  past: "Past due · status unknown",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  next: "Next week",
  undated: "No due date",
};

export function groupLabel(key: GroupKey): string {
  return key.startsWith("week:") ? `Week of ${formatKey(key.slice(5), { month: "short", day: "numeric" })}` : GROUP_LABELS[key as keyof typeof GROUP_LABELS];
}

/** Monday of the calendar week containing `key` (YYYY-MM-DD). */
function mondayOf(key: string): string {
  return addDays(key, -((weekday(key) + 6) % 7));
}

/** Buckets a date relative to now. Weeks run Monday through Sunday. */
export function groupForDate(iso: string | null, now: Date): GroupKey {
  if (!iso) return "undated";
  const today = dayKey(now);
  const day = dayKey(iso);
  const diff = daysBetween(today, day);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  const weeks = daysBetween(mondayOf(today), mondayOf(day)) / 7;
  if (weeks === 0) return "week";
  if (weeks === 1) return "next";
  return `week:${mondayOf(day)}`;
}

export function byDue(a: Assignment, b: Assignment): number {
  if (!a.dueAt) return b.dueAt ? 1 : a.title.localeCompare(b.title);
  if (!b.dueAt) return -1;
  return Date.parse(a.dueAt) - Date.parse(b.dueAt);
}

export function groupAssignments(items: Assignment[], now: Date) {
  const head: GroupKey[] = ["overdue", "past", "today", "tomorrow", "week", "next"];
  const map = new Map<GroupKey, Assignment[]>();
  for (const a of [...items].sort(byDue)) {
    const g = a.dueAt && new Date(a.dueAt) < now ? (urgencyOf(a, now) === "overdue" ? "overdue" : "past") : groupForDate(a.dueAt, now);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(a);
  }
  const weeks = [...map.keys()].filter((k) => k.startsWith("week:")).sort();
  const order = [...head, ...weeks, "undated" as const];
  return order.filter((k) => map.has(k)).map((k) => ({ key: k, label: groupLabel(k), items: map.get(k)! }));
}

/** Keeps the first `limit` items across groups, in order; returns how many were cut. */
export function limitGroups<T extends { items: unknown[] }>(groups: T[], limit: number): { groups: T[]; hidden: number } {
  const out: T[] = [];
  let left = limit;
  let total = 0;
  for (const g of groups) {
    total += g.items.length;
    if (left > 0) out.push({ ...g, items: g.items.slice(0, left) });
    left -= g.items.length;
  }
  return { groups: out, hidden: Math.max(total - limit, 0) };
}

export const ASSIGNMENT_FILTERS = ["upcoming", "overdue", "completed", "all"] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

export function filterAssignments(
  items: Assignment[],
  filter: AssignmentFilter,
  now: Date,
  courseId?: string | null,
): Assignment[] {
  return items
    .filter((a) => !courseId || a.courseId === courseId)
    .filter((a) => {
      const u = urgencyOf(a, now);
      switch (filter) {
        case "upcoming":
          return u !== "done" && u !== "overdue" && u !== "past";
        case "overdue":
          return u === "overdue";
        case "completed":
          return u === "done";
        case "all":
          return true;
      }
    })
    .sort(filter === "completed" ? (a, b) => -byDue(a, b) : byDue);
}

export function eventsOnDay(events: CalendarEvent[], key: string): CalendarEvent[] {
  return events
    .filter((e) => dayKey(e.startsAt) === key)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Anything with a date on the calendar: events plus assignment deadlines. */
export type AgendaItem =
  | { type: "event"; at: string; event: CalendarEvent }
  | { type: "assignment"; at: string; assignment: Assignment };

/**
 * Merges calendar events and assignment deadlines. Brightspace often emits a
 * calendar event for each due date, so events that duplicate an assignment
 * (same course, same minute, similar title) are dropped in favor of the
 * richer assignment entry.
 */
export function agenda(snapshot: Pick<SchoolSnapshot, "events" | "assignments">): AgendaItem[] {
  const assignmentKeys = new Set(
    snapshot.assignments.filter((a) => a.dueAt).map((a) => dupKey(a.courseId, a.dueAt!, a.title)),
  );
  const items: AgendaItem[] = [];
  for (const e of snapshot.events) {
    if (e.kind !== "class" && assignmentKeys.has(dupKey(e.courseId, e.startsAt, e.title))) continue;
    items.push({ type: "event", at: e.startsAt, event: e });
  }
  for (const a of snapshot.assignments) if (a.dueAt) items.push({ type: "assignment", at: a.dueAt, assignment: a });
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function dupKey(courseId: string | null, iso: string, title: string): string {
  const t = title.toLowerCase().replace(/\s*[-–:]?\s*(due|availability ends|ends)$/i, "").replace(/[^a-z0-9]/g, "");
  return `${courseId}|${Math.round(Date.parse(iso) / 60_000)}|${t}`;
}

export function courseMap(courses: Course[]): Map<string, Course> {
  return new Map(courses.map((c) => [c.id, c]));
}

/** Stable, muted accent per course, chosen by id hash (not by name/order). */
const COURSE_HUES = [212, 152, 28, 268, 340, 190, 95, 0, 240, 48];
export function courseHue(courseId: string | null | undefined): number {
  if (!courseId) return 220;
  let h = 0;
  for (const ch of courseId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_HUES[h % COURSE_HUES.length];
}

export function courseLabel(c: Course | undefined): string {
  if (!c) return "General";
  return c.code ?? c.name;
}
