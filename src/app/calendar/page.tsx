import type { Metadata } from "next";
import { getSchoolData } from "@/lib/school";
import { agenda, courseLabel, courseMap, filterAssignments, isDone, urgencyOf, weeklyLoad, type AgendaItem } from "@/lib/school/derive";
import { Section } from "@/components/ui";
import { Workload } from "@/components/workload";
import { SubscribeCalendar } from "@/components/subscribe-calendar";
import { addDays, dayKey, formatKey, formatTime, weekday } from "@/lib/school/time";
import { DataUnavailable } from "@/components/data-state";
import { LMS_LABEL } from "@/lib/settings";
import { PlannerTabs } from "@/components/planner-tabs";
import { CalendarView, type CalBonus, type CalCourse, type CalItem } from "./calendar-view";

export const metadata: Metadata = { title: "Planner · Calendar" };

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const KIND_LABEL: Record<string, string> = { assignment: "Due", quiz: "Quiz", discussion: "Discussion", exam: "Exam", other: "Other" };

/** "Wed, Oct 21 · 11:59 PM", in the school timezone. */
function stamp(iso: string): string {
  return `${formatKey(dayKey(iso), { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(iso)}`;
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
  const hidden = typeof sp.hide === "string" ? sp.hide.split(",").filter(Boolean) : [];
  const courses = courseMap(snapshot.courses);

  const toItem = (i: AgendaItem): CalItem => {
    const courseId = i.type === "event" ? i.event.courseId : i.assignment.courseId;
    const c = courseId ? courses.get(courseId) : undefined;
    const base = {
      day: dayKey(i.at),
      at: i.at,
      courseId: courseId ?? "",
      courseLabel: courseLabel(c),
      courseHref: c ? `/courses/${encodeURIComponent(c.id)}` : null,
    };
    if (i.type === "event") {
      const e = i.event;
      return {
        ...base,
        key: "e" + e.id,
        title: e.title,
        kind: e.kind,
        kindLabel: e.kind === "exam" ? "Exam" : e.kind === "class" ? "Class" : e.kind === "deadline" ? "Deadline" : "Event",
        isEvent: true,
        timeLabel: e.allDay ? "All day" : formatTime(e.startsAt),
        whenLabel: e.allDay ? formatKey(base.day, { weekday: "short", month: "short", day: "numeric" }) + " · All day" : stamp(e.startsAt) + (e.endsAt ? `–${formatTime(e.endsAt)}` : ""),
        url: e.url,
        location: e.location,
        done: false,
        overdue: false,
        status: null,
        points: null,
        bonus: null,
      };
    }
    const a = i.assignment;
    const u = urgencyOf(a, now);
    return {
      ...base,
      key: "a" + a.id,
      title: a.title,
      kind: a.kind,
      kindLabel: KIND_LABEL[a.kind] ?? "Due",
      isEvent: false,
      timeLabel: formatTime(a.dueAt!),
      whenLabel: stamp(a.dueAt!),
      url: a.url,
      location: null,
      done: isDone(a),
      overdue: u === "overdue",
      status: a.status === "graded" ? "Graded" : a.status === "submitted" ? "Submitted" : a.status === "not_submitted" ? "Not submitted" : null,
      points: a.pointsPossible != null ? `${a.pointsEarned ?? "–"} / ${a.pointsPossible}` : null,
      bonus: a.earlyBonusAt ? { at: a.earlyBonusAt, percent: a.earlyBonusPercent ?? 0, label: stamp(a.earlyBonusAt) } : null,
    };
  };

  const items = agenda(snapshot)
    .filter((i) => showClasses || i.type !== "event" || i.event.kind !== "class")
    .map(toItem);

  // Early-bonus cutoffs (WebAssign: finish 72h before the due time for +10%).
  // Each open, not-yet-due assignment shades the days from its cutoff to its due date.
  const bonuses: CalBonus[] = snapshot.assignments
    .filter((a) => a.earlyBonusAt && a.dueAt && !isDone(a) && Date.parse(a.dueAt) > now.getTime())
    .map((a) => {
      const c = courses.get(a.courseId);
      const days: string[] = [];
      for (let d = dayKey(a.earlyBonusAt!); d <= dayKey(a.dueAt!); d = addDays(d, 1)) days.push(d);
      return {
        id: a.id,
        itemKey: "a" + a.id,
        title: a.title,
        shortTitle: a.title.replace(/ \(WebAssign\)$/, ""),
        courseId: a.courseId,
        courseLabel: courseLabel(c),
        courseHref: c ? `/courses/${encodeURIComponent(c.id)}` : null,
        at: a.earlyBonusAt!,
        percent: a.earlyBonusPercent ?? 0,
        cutoffLabel: stamp(a.earlyBonusAt!),
        cutoffTime: formatTime(a.earlyBonusAt!),
        dueAt: a.dueAt!,
        dueLabel: stamp(a.dueAt!),
        url: a.url,
        days,
      };
    });

  const filterCourses: CalCourse[] = [];
  const seen = new Set<string>();
  for (const x of [...items, ...bonuses]) {
    if (seen.has(x.courseId)) continue;
    seen.add(x.courseId);
    filterCourses.push({ id: x.courseId, label: x.courseLabel });
  }
  filterCourses.sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : a.label.localeCompare(b.label)));

  const first = `${month}-01`;
  const gridStart = addDays(first, -weekday(first));
  const nextMonthFirst = `${shiftMonth(month, 1)}-01`;
  const weeks = Math.ceil((weekday(first) + (Date.parse(nextMonthFirst) - Date.parse(first)) / 864e5) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  return (
    <>
      <CalendarView
        lmsLabel={LMS_LABEL}
        tabs={
          <PlannerTabs
            active="calendar"
            overdue={filterAssignments(snapshot.assignments, "overdue", now, null).length}
            upcoming={filterAssignments(snapshot.assignments, "upcoming", now, null).length}
          />
        }
        month={month}
        monthLabel={formatKey(first, { month: "long", year: "numeric" })}
        prevMonth={shiftMonth(month, -1)}
        nextMonth={shiftMonth(month, 1)}
        today={today}
        nowMs={now.getTime()}
        showClasses={showClasses}
        initialHidden={hidden}
        courses={filterCourses}
        cells={cells}
        dayLabels={Object.fromEntries(cells.map((k) => [k, formatKey(k, { weekday: "long", month: "short", day: "numeric" })]))}
        items={items}
        bonuses={bonuses}
      />
      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-8 mt-10">
        <Section title="Workload" action={<span className="text-[11.5px] text-subtle">open deadlines per week</span>}>
          <div className="card overflow-hidden">
            <Workload weeks={weeklyLoad(snapshot.assignments, now, 8)} courses={courses} />
          </div>
        </Section>
        <Section title="Subscribe">
          <SubscribeCalendar />
        </Section>
      </div>
    </>
  );
}
