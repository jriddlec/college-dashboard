import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { CalendarX2, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { agenda, courseMap, isDone, urgencyOf, type AgendaItem } from "@/lib/school/derive";
import { addDays, dayKey, formatKey, formatTime, weekday } from "@/lib/school/time";
import { DataUnavailable } from "@/components/data-state";
import { Badge, CourseTag, EmptyState, PageHeader, hueStyle } from "@/components/ui";
import type { Assignment, Course } from "@/lib/school/types";
import { LMS_LABEL } from "@/lib/settings";

export const metadata: Metadata = { title: "Calendar" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function itemTitle(i: AgendaItem) {
  return i.type === "event" ? i.event.title : i.assignment.title;
}
function itemCourse(i: AgendaItem) {
  return i.type === "event" ? i.event.courseId : i.assignment.courseId;
}
function itemTime(i: AgendaItem) {
  return i.type === "event" && i.event.allDay ? "All day" : formatTime(i.at);
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const result = await getSchoolData();
  if (result.status !== "ok") return <DataUnavailable result={result} title="Calendar" />;
  const { snapshot } = result;
  const now = new Date();
  const today = dayKey(now);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const showClasses = sp.classes === "1";
  const courses = courseMap(snapshot.courses);

  const all = agenda(snapshot).filter((i) => showClasses || i.type !== "event" || i.event.kind !== "class");
  const byDay = new Map<string, AgendaItem[]>();
  for (const i of all) {
    const k = dayKey(i.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(i);
  }

  // Early-bonus cutoffs (WebAssign: finish 72h before the due time for +10%).
  // Each open assignment shades the days from its cutoff to its due date.
  const bonusByDay = new Map<string, Assignment[]>();
  const bonusWindowDays = new Set<string>();
  for (const a of snapshot.assignments) {
    if (!a.earlyBonusAt || !a.dueAt || isDone(a)) continue;
    const k = dayKey(a.earlyBonusAt);
    if (!bonusByDay.has(k)) bonusByDay.set(k, []);
    bonusByDay.get(k)!.push(a);
    for (let d = k; d <= dayKey(a.dueAt); d = addDays(d, 1)) bonusWindowDays.add(d);
  }

  const first = `${month}-01`;
  const gridStart = addDays(first, -weekday(first));
  const nextMonthFirst = `${shiftMonth(month, 1)}-01`;
  const weeks = Math.ceil((weekday(first) + (Date.parse(nextMonthFirst) - Date.parse(first)) / 864e5) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const q = (m: string, classes = showClasses) => {
    const p = new URLSearchParams();
    if (m !== today.slice(0, 7)) p.set("month", m);
    if (classes) p.set("classes", "1");
    const s = p.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };

  const monthDays = [...new Set([...byDay.keys(), ...bonusByDay.keys()])]
    .filter((k) => k.startsWith(month))
    .sort()
    .map((k) => [k, byDay.get(k) ?? []] as const);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={`Deadlines, exams, and events from ${LMS_LABEL}`}
        actions={
          <Link
            href={q(month, !showClasses)}
            className={clsx("text-[12.5px] rounded-md border px-2.5 py-1 transition-colors", showClasses ? "border-border-strong text-fg bg-surface-2" : "border-border text-muted hover:text-fg")}
          >
            {showClasses ? "Hide class meetings" : "Show class meetings"}
          </Link>
        }
      />

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-semibold">{formatKey(first, { month: "long", year: "numeric" })}</h2>
        <div className="flex items-center gap-1">
          <Link href={q(shiftMonth(month, -1))} aria-label="Previous month" className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={q(today.slice(0, 7))} className="px-2.5 py-1 rounded-md text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg">
            Today
          </Link>
          <Link href={q(shiftMonth(month, 1))} aria-label="Next month" className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Month grid (tablet/desktop) */}
      <div className="hidden md:block card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2.5 py-2 text-[11.5px] font-medium text-subtle">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((k, idx) => {
            const items = byDay.get(k) ?? [];
            const cutoffs = bonusByDay.get(k) ?? [];
            const inWindow = bonusWindowDays.has(k);
            const inMonth = k.startsWith(month);
            const isToday = k === today;
            return (
              <div
                key={k}
                className={clsx(
                  "min-h-28 p-1.5 border-border",
                  idx % 7 !== 6 && "border-r",
                  idx < cells.length - 7 && "border-b",
                  !inMonth && "bg-surface-2/50",
                  inWindow && "shadow-[inset_0_-3px_0_var(--warn)]",
                  cutoffs.length > 0 && "bg-warn-soft",
                )}
              >
                <div className={clsx("text-[12px] mb-1 px-1 tabular-nums", isToday ? "inline-grid place-items-center size-5.5 rounded-full bg-accent text-white font-semibold px-0" : inMonth ? "text-muted" : "text-subtle")}>
                  {Number(k.slice(8))}
                </div>
                <ul className="space-y-0.5">
                  {cutoffs.map((a) => (
                    <BonusChip key={a.id} assignment={a} />
                  ))}
                  {items.slice(0, Math.max(1, 4 - cutoffs.length)).map((i) => (
                    <CalendarChip key={i.type + (i.type === "event" ? i.event.id : i.assignment.id)} item={i} now={now} />
                  ))}
                  {items.length > Math.max(1, 4 - cutoffs.length) && <li className="text-[11px] text-subtle px-1">+{items.length - Math.max(1, 4 - cutoffs.length)} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {bonusByDay.size > 0 && (
        <p className="hidden md:flex items-center gap-3 mt-2 text-[11.5px] text-subtle">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-2.5 rounded-sm bg-warn-soft border border-warn/40" /> Early-bonus cutoff</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.75 bg-warn" /> Final 72h — finished now, no bonus</span>
        </p>
      )}

      {/* Agenda (all sizes; primary view on phones) */}
      <section className="mt-8 md:mt-10">
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">Agenda</h2>
        {monthDays.length === 0 ? (
          <div className="card">
            <EmptyState icon={CalendarX2} title="Nothing this month">No deadlines or events are on the calendar for this month.</EmptyState>
          </div>
        ) : (
          <div className="space-y-4">
            {monthDays.map(([k, items]) => (
              <div key={k} className={clsx(k < today && "opacity-60")}>
                <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
                  <span className={clsx("text-[13px] font-medium", k === today && "text-accent")}>{formatKey(k, { weekday: "long", month: "short", day: "numeric" })}</span>
                  {k === today && <span className="text-[11.5px] text-accent">Today</span>}
                </div>
                <ul className="card divide-y divide-border overflow-hidden">
                  {(bonusByDay.get(k) ?? []).map((a) => (
                    <BonusRow key={a.id} assignment={a} course={courses.get(a.courseId)} />
                  ))}
                  {items.map((i) => (
                    <AgendaRow key={i.type + (i.type === "event" ? i.event.id : i.assignment.id)} item={i} course={courses.get(itemCourse(i) ?? "")} now={now} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CalendarChip({ item, now }: { item: AgendaItem; now: Date }) {
  const done = item.type === "assignment" && isDone(item.assignment);
  const overdue = item.type === "assignment" && urgencyOf(item.assignment, now) === "overdue";
  const exam = item.type === "event" && item.event.kind === "exam";
  const cls = item.type === "event" && item.event.kind === "class";
  return (
    <li
      style={hueStyle(itemCourse(item))}
      title={`${itemTime(item)} · ${itemTitle(item)}`}
      className={clsx(
        "flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] leading-tight",
        exam ? "bg-accent-soft text-accent font-medium" : "hover:bg-surface-2",
        done && "text-subtle line-through",
        overdue && "text-danger",
        cls && "text-muted",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full course-dot" />
      <span className="truncate">{itemTitle(item)}</span>
    </li>
  );
}

function BonusChip({ assignment: a }: { assignment: Assignment }) {
  return (
    <li
      style={hueStyle(a.courseId)}
      title={`${formatTime(a.earlyBonusAt!)} · Finish ${a.title} for +${a.earlyBonusPercent}% (due ${formatKey(dayKey(a.dueAt!), { weekday: "short", month: "short", day: "numeric" })})`}
      className="flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] leading-tight text-warn font-medium"
    >
      <Zap className="size-3 shrink-0" />
      <span className="truncate">+{a.earlyBonusPercent}% · {a.title.replace(/ \(WebAssign\)$/, "")}</span>
    </li>
  );
}

function BonusRow({ assignment: a, course }: { assignment: Assignment; course: Course | undefined }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 course-bar bg-warn-soft" style={hueStyle(a.courseId)}>
      <span className="w-16 shrink-0 text-[12.5px] text-muted tabular-nums pt-px">{formatTime(a.earlyBonusAt!)}</span>
      <div className="min-w-0 flex-1">
        <a href={a.url ?? undefined} target="_blank" rel="noreferrer" className="text-[13.5px] leading-snug hover:underline underline-offset-2">
          Early-bonus cutoff: {a.title}
        </a>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5">
          <CourseTag course={course} />
          <Badge tone="warn">+{a.earlyBonusPercent}% if finished by now</Badge>
          <span className="text-[11.5px] text-subtle">Due {formatKey(dayKey(a.dueAt!), { weekday: "short", month: "short", day: "numeric" })}, {formatTime(a.dueAt!)}</span>
        </div>
      </div>
    </li>
  );
}

function AgendaRow({ item, course, now }: { item: AgendaItem; course: Course | undefined; now: Date }) {
  const a = item.type === "assignment" ? item.assignment : null;
  const e = item.type === "event" ? item.event : null;
  const u = a ? urgencyOf(a, now) : null;
  const url = a?.url ?? e?.url;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 course-bar" style={hueStyle(itemCourse(item))}>
      <span className="w-16 shrink-0 text-[12.5px] text-muted tabular-nums pt-px">{itemTime(item)}</span>
      <div className="min-w-0 flex-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={clsx("text-[13.5px] leading-snug hover:underline underline-offset-2", u === "done" && "line-through text-muted")}>
            {itemTitle(item)}
          </a>
        ) : (
          <span className={clsx("text-[13.5px] leading-snug", u === "done" && "line-through text-muted", e?.kind === "class" && "text-muted")}>{itemTitle(item)}</span>
        )}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5">
          {itemCourse(item) && <CourseTag course={course} />}
          {a && <Badge>{a.kind === "assignment" ? "Due" : a.kind[0].toUpperCase() + a.kind.slice(1)}</Badge>}
          {e?.kind === "exam" && <Badge tone="accent">Exam</Badge>}
          {u === "overdue" && <Badge tone="danger">Overdue</Badge>}
          {u === "done" && <Badge tone="ok">Done</Badge>}
          {e?.location && <span className="text-[11.5px] text-subtle">{e.location}</span>}
        </div>
      </div>
    </li>
  );
}
