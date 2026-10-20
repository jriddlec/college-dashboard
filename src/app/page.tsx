import Link from "next/link";
import { cookies } from "next/headers";
import { CalendarCheck, CircleAlert, Coffee, MapPin } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { getLinks } from "@/lib/links";
import { getTranscript } from "@/lib/transcript";
import { getLibrary } from "@/lib/library";
import { agenda, byDue, courseMap, groupAssignments, isDone, limitGroups, urgencyOf } from "@/lib/school/derive";
import { dayKey, formatLongDate, formatTime, hourOfDay } from "@/lib/school/time";
import { AssignmentList, AssignmentRow } from "@/components/assignment-row";
import { CourseCard } from "@/components/course-card";
import { DataUnavailable, SyncedAt } from "@/components/data-state";
import { EmptyState, Section, SectionLink, Stat, Badge, CourseTag, hueStyle } from "@/components/ui";
import { OverviewWidgets } from "@/components/widgets";
import { LinkIcon } from "@/components/link-icon";
import { HideOverdueButton, ShowHiddenOverdue } from "@/components/hide-overdue";
import { HIDDEN_OVERDUE_COOKIE, parseIdCookie } from "@/lib/hidden-overdue";
import { LMS_LABEL } from "@/lib/settings";

const UPCOMING_LIMIT = 8;

export default async function Home() {
  const result = await getSchoolData();
  if (result.status !== "ok") return <DataUnavailable result={result} title="Today" />;
  const { snapshot } = result;
  const now = new Date();
  const today = dayKey(now);
  const courses = courseMap(snapshot.courses);
  const [links, transcript, library] = await Promise.all([getLinks(), getTranscript(), getLibrary().catch(() => null)]);

  const open = snapshot.assignments.filter((a) => !isDone(a));
  const overdue = open.filter((a) => urgencyOf(a, now) === "overdue").sort(byDue);
  // Overdue items the user chose to hide from this page (still listed under /assignments?filter=overdue).
  const hiddenIds = await readHiddenOverdue();
  const visibleOverdue = overdue.filter((a) => !hiddenIds.includes(a.id));
  const hiddenOverdue = overdue.length - visibleOverdue.length;
  // Drop ids that are no longer overdue so the cookie doesn't grow forever.
  const liveHidden = hiddenIds.filter((id) => overdue.some((a) => a.id === id));
  const dueToday = snapshot.assignments.filter((a) => a.dueAt && dayKey(a.dueAt) === today).sort(byDue);
  const next7 = open.filter((a) => a.dueAt && Date.parse(a.dueAt) >= now.getTime() && Date.parse(a.dueAt) - now.getTime() <= 7 * 864e5);

  // Today's timeline: non-assignment events today (classes, exams, other) + today's assignments.
  const todayItems = agenda(snapshot).filter((i) => dayKey(i.at) === today);

  const { groups: trimmedGroups, hidden: hiddenUpcoming } = limitGroups(
    groupAssignments(
      open.filter((a) => a.dueAt && dayKey(a.dueAt) > today),
      now,
    ),
    UPCOMING_LIMIT,
  );

  const hour = hourOfDay(now);
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const activeCourses = snapshot.courses.filter((c) => c.isActive && c.isClass);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
        <div>
          <p className="text-[13px] text-muted">{formatLongDate(now)}</p>
          <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight mt-0.5">{greeting}</h1>
        </div>
        <SyncedAt iso={snapshot.generatedAt} now={now} warnings={snapshot.warnings.length} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Due today" value={dueToday.filter((a) => !isDone(a)).length} href="/assignments" />
        <Stat label="Next 7 days" value={next7.length} href="/assignments" />
        <Stat label="Overdue" value={overdue.length} tone="danger" href="/assignments?filter=overdue" />
        <Stat label="Classes" value={activeCourses.length} href="/courses" />
      </div>

      <div className="grid lg:grid-cols-3 gap-x-8 gap-y-8">
        <div className="lg:col-span-2 space-y-8">
          {visibleOverdue.length > 0 && (
            <Section
              title="Overdue"
              count={visibleOverdue.length}
              action={<SectionLink href="/assignments?filter=overdue">View all</SectionLink>}
            >
              <AssignmentList>
                {visibleOverdue.slice(0, 4).map((a) => (
                  <AssignmentRow
                    key={a.id}
                    a={a}
                    course={courses.get(a.courseId)}
                    now={now}
                    dateStyle="full"
                    action={<HideOverdueButton id={a.id} hidden={liveHidden} />}
                  />
                ))}
              </AssignmentList>
              {hiddenOverdue > 0 && <ShowHiddenOverdue count={hiddenOverdue} />}
            </Section>
          )}
          {visibleOverdue.length === 0 && hiddenOverdue > 0 && <ShowHiddenOverdue count={hiddenOverdue} />}

          <Section title="Today" action={<SectionLink href="/calendar">Calendar</SectionLink>}>
            {todayItems.length === 0 ? (
              <div className="card">
                <EmptyState icon={Coffee} title="Nothing scheduled today">
                  No classes, events, or deadlines on the calendar.
                </EmptyState>
              </div>
            ) : (
              <ul className="card divide-y divide-border overflow-hidden">
                {todayItems.map((item) =>
                  item.type === "assignment" ? (
                    <AssignmentRow key={item.assignment.id} a={item.assignment} course={courses.get(item.assignment.courseId)} now={now} />
                  ) : (
                    <li key={item.event.id} className="flex items-start gap-3 px-4 py-3 course-bar" style={hueStyle(item.event.courseId)}>
                      <span className="mt-0.5 w-4 shrink-0 text-center text-subtle">
                        <span className="inline-block size-1.5 rounded-full course-dot" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <span className={`text-[14px] leading-snug ${item.event.kind === "class" ? "text-muted" : "font-medium"}`}>{item.event.title}</span>
                          <span className="text-[12.5px] text-muted tabular-nums whitespace-nowrap">
                            {item.event.allDay ? "All day" : formatTime(item.event.startsAt)}
                            {!item.event.allDay && item.event.endsAt && `–${formatTime(item.event.endsAt)}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                          {item.event.courseId && <CourseTag course={courses.get(item.event.courseId)} />}
                          {item.event.kind === "exam" && <Badge tone="accent">Exam</Badge>}
                          {item.event.location && (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle">
                              <MapPin className="size-3" />
                              {item.event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Section>

          <Section title="Upcoming" action={<SectionLink href="/assignments">All assignments</SectionLink>}>
            {trimmedGroups.length === 0 ? (
              <div className="card">
                <EmptyState icon={CalendarCheck} title="You’re all caught up">
                  No upcoming deadlines after today.
                </EmptyState>
              </div>
            ) : (
              <div className="space-y-4">
                {trimmedGroups.map((g) => (
                  <div key={g.key}>
                    <div className="text-[12.5px] font-medium text-muted mb-1.5 px-0.5">{g.label}</div>
                    <AssignmentList>
                      {g.items.map((a) => (
                        <AssignmentRow key={a.id} a={a} course={courses.get(a.courseId)} now={now} dateStyle={g.key === "tomorrow" ? "time" : "full"} />
                      ))}
                    </AssignmentList>
                  </div>
                ))}
                {hiddenUpcoming > 0 && (
                  <Link href="/assignments" className="block text-center text-[12.5px] text-muted hover:text-fg py-1">
                    {hiddenUpcoming} more upcoming →
                  </Link>
                )}
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-8">
          <Section title="Quick links" action={<SectionLink href="/links">All</SectionLink>}>
            <div className="card grid grid-cols-2 gap-px bg-border overflow-hidden">
              {links.groups
                .flatMap((g) => g.links)
                .slice(0, 8)
                .map((l) => (
                  <a
                    key={l.url + l.label}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-surface px-3 py-2.5 text-[13px] hover:bg-surface-2 transition-colors"
                  >
                    <LinkIcon name={l.icon} className="size-3.5 text-muted shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </a>
                ))}
            </div>
            {links.error && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-warn mt-2">
                <CircleAlert className="size-3" /> {links.error}
              </p>
            )}
          </Section>

          <OverviewWidgets snapshot={snapshot} now={now} transcript={transcript} library={library} />
        </aside>
      </div>

      <Section title="Classes" className="mt-10" action={<SectionLink href="/courses">All classes</SectionLink>}>
        {activeCourses.length === 0 ? (
          <div className="card">
            <EmptyState icon={CalendarCheck} title="No active classes">
              Active courses from {LMS_LABEL} will appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeCourses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                assignments={snapshot.assignments.filter((a) => a.courseId === c.id)}
                total={snapshot.grades.find((g) => g.courseId === c.id && g.isCourseTotal)}
                now={now}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

async function readHiddenOverdue(): Promise<string[]> {
  return parseIdCookie((await cookies()).get(HIDDEN_OVERDUE_COOKIE)?.value);
}
