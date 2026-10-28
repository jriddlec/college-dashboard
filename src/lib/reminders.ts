/**
 * Deadline and exam reminders, pushed to NOTIFY_URL by the web app (it has
 * the merged data: LMS + WebAssign + syllabus rows + done marks). Every 10
 * minutes: open work due within REMIND_DUE_HOURS (default 24) and exams within
 * REMIND_EXAM_HOURS (default 48), each sent once (remembered in the shared
 * state), never during quiet hours (REMIND_QUIET, default 22-7).
 * Values and on/off come from /settings (settings.json over .env).
 * Needs a notify target and STATE_DIR; off otherwise.
 */
import "server-only";
import { loadSchoolData } from "@/lib/school";
import { courseMap, isDone } from "@/lib/school/derive";
import { formatTime, formatWeekdayDate, hourOfDay } from "@/lib/school/time";
import type { SchoolSnapshot } from "@/lib/school/types";
import { effective } from "@/lib/user-settings";
import { readState, setIds, stateDir, updateState } from "@/lib/state";
import { notify, type Alert } from "@/lib/notify";

const HOUR = 3_600_000;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export interface ReminderOptions {
  dueHours: number;
  examHours: number;
  /** Local hours [start, end) when nothing is sent, e.g. [22, 7]. */
  quiet: [number, number] | null;
}

export function reminderOptions(env = process.env): ReminderOptions {
  return { dueHours: num(env.REMIND_DUE_HOURS, 24), examHours: num(env.REMIND_EXAM_HOURS, 48), quiet: parseQuiet(env.REMIND_QUIET ?? "22-7") };
}

export function parseQuiet(v: string): ReminderOptions["quiet"] {
  const q = /^(\d{1,2})-(\d{1,2})$/.exec(v);
  return q ? [Number(q[1]), Number(q[2])] : null;
}

export function isQuiet(hour: number, quiet: ReminderOptions["quiet"]): boolean {
  if (!quiet) return false;
  const [a, b] = quiet;
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}

/** The alerts due now and the keys that mark them sent. Pure, for tests. */
export function dueReminders(s: SchoolSnapshot, now: Date, sent: ReadonlySet<string>, o: ReminderOptions): { alerts: Alert[]; keys: string[] } {
  const t = now.getTime();
  const courses = courseMap(s.courses);
  const code = (id: string | null) => (id ? (courses.get(id)?.code ?? "") : "");
  const within = (iso: string | null, hours: number) => !!iso && Date.parse(iso) > t && Date.parse(iso) - t <= hours * HOUR;

  const due = s.assignments
    .filter((a) => a.kind !== "exam" && !isDone(a) && within(a.dueAt, o.dueHours) && !sent.has(`due:${a.id}:${a.dueAt}`))
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  const exams = [
    ...s.assignments.filter((a) => a.kind === "exam" && within(a.dueAt, o.examHours)).map((a) => ({ id: a.id, title: a.title, at: a.dueAt!, courseId: a.courseId })),
    ...s.events.filter((e) => e.kind === "exam" && within(e.startsAt, o.examHours)).map((e) => ({ id: e.id, title: e.title, at: e.startsAt, courseId: e.courseId })),
  ].filter((x) => !sent.has(`exam:${x.id}:${x.at}`));

  const alerts: Alert[] = [];
  const keys: string[] = [];
  if (due.length) {
    const lines = due.slice(0, 8).map((a) => `${code(a.courseId)} · ${a.title} · ${formatWeekdayDate(a.dueAt!)} ${formatTime(a.dueAt!)}`);
    alerts.push({
      title: due.length === 1 ? `Due soon: ${due[0].title}` : `${due.length} things due within a day`,
      message: lines.join("\n") + (due.length > 8 ? `\n…and ${due.length - 8} more` : ""),
      path: "/assignments",
      tags: "alarm_clock",
      kind: "deadlines",
    });
    keys.push(...due.map((a) => `due:${a.id}:${a.dueAt}`));
  }
  const seen = new Set<string>();
  for (const x of exams) {
    const dedupe = `${x.courseId}|${x.at.slice(0, 16)}`;
    keys.push(`exam:${x.id}:${x.at}`);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    alerts.push({
      title: `Exam ${formatWeekdayDate(x.at)}: ${x.title}`,
      message: `${code(x.courseId)} · ${formatWeekdayDate(x.at)}, ${formatTime(x.at)}`,
      path: "/",
      tags: "memo",
      priority: "high",
      kind: "exams",
    });
  }
  return { alerts, keys };
}

export async function checkReminders(now = new Date()): Promise<number> {
  const e = await effective();
  const o: ReminderOptions = { dueHours: e.remindDueHours, examHours: e.remindExamHours, quiet: parseQuiet(e.remindQuiet) };
  if (!e.notifyUrl || !stateDir() || isQuiet(hourOfDay(now), o.quiet)) return 0;
  const data = await loadSchoolData([], now);
  if (data.status !== "ok") return 0;
  const sent = new Set((await readState()).reminded);
  const { alerts, keys } = dueReminders(data.snapshot, now, sent, o);
  if (!keys.length) return 0;
  let ok = true;
  for (const a of alerts) ok = (await notify(a)) && ok;
  // Remember them even if one send failed, so a broken target doesn't repeat alerts every 10 minutes.
  await updateState((s) => setIds(s, "reminded", keys, true));
  return ok ? alerts.length : 0;
}

let started = false;

/** Starts the 10-minute reminder loop (once per server). */
export function startReminders() {
  // Runs whenever STATE_DIR is set: the target can be added later on /settings.
  if (started || !stateDir()) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await checkReminders();
      if (n) console.log(`reminders: sent ${n}`);
    } catch (e) {
      console.error(`reminders failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 10 * 60_000).unref();
}
