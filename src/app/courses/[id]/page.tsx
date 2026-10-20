import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CircleCheck, GraduationCap, Megaphone, NotebookPen } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { getLinks } from "@/lib/links";
import { LMS_LABEL, lmsCourseLinks, lmsCourseUrl } from "@/lib/settings";
import { getLibraryCourses } from "@/lib/library";
import { byDue, groupAssignments, isDone, urgencyOf } from "@/lib/school/derive";
import { formatShortDate, relative } from "@/lib/school/time";
import { AssignmentList, AssignmentRow } from "@/components/assignment-row";
import { GradeTable } from "@/components/grade-table";
import { GradeTrend } from "@/components/grade-trend";
import { GradeCalculator } from "@/components/grade-calculator";
import { NewBadge } from "@/components/new-badge";
import { DEFAULT_SCALE } from "@/lib/school/gpa";
import { DataUnavailable } from "@/components/data-state";
import { EmptyState, Section, Stat, hueStyle } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/courses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await getSchoolData();
  const c = r.status === "ok" ? r.snapshot.courses.find((x) => x.id === decodeURIComponent(id)) : undefined;
  return { title: c ? (c.code ?? c.name) : "Class" };
}

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const result = await getSchoolData();
  if (result.status !== "ok") return <DataUnavailable result={result} title="Class" />;
  const { snapshot } = result;
  const course = snapshot.courses.find((c) => c.id === id);
  if (!course) notFound();
  const now = new Date();
  const links = await getLinks();

  const assignments = snapshot.assignments.filter((a) => a.courseId === id);
  // "past" = due date passed and the LMS doesn't expose submission state.
  const open = assignments.filter((a) => !isDone(a) && urgencyOf(a, now) !== "past");
  const completed = assignments.filter((a) => isDone(a) || urgencyOf(a, now) === "past").sort((a, b) => -byDue(a, b));
  const overdue = open.filter((a) => urgencyOf(a, now) === "overdue");
  const grades = snapshot.grades.filter((g) => g.courseId === id);
  const total = grades.find((g) => g.isCourseTotal);
  const items = grades.filter((g) => !g.isCourseTotal).sort((a, b) => Date.parse(b.postedAt ?? "0") - Date.parse(a.postedAt ?? "0"));
  const standing = snapshot.standings.find((x) => x.courseId === id);
  const news = snapshot.announcements.filter((n) => n.courseId === id);

  const resources = lmsCourseLinks(id).map((r, i) => (i === 0 && course.url ? { ...r, url: course.url } : r));
  const custom = links.courseLinks[id] ?? (course.code ? links.courseLinks[course.code] : undefined) ?? [];
  const libraryCourse = (await getLibraryCourses()).find((c) => c.id === id);
  const studyUrl = libraryCourse ? `/library/${libraryCourse.slug}` : null;

  return (
    <div style={hueStyle(course.id)}>
      <div className="mb-6">
        <Link href="/courses" className="text-[12.5px] text-muted hover:text-fg">
          ← Classes
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[12.5px] font-medium course-text">
              <span className="size-2 rounded-sm course-dot" />
              {course.code}
              {course.term && <span className="text-subtle font-normal">· {course.term}</span>}
            </div>
            <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight mt-1">{course.name}</h1>
            {course.instructor && <p className="text-[13.5px] text-muted mt-0.5">{course.instructor}</p>}
          </div>
          <a
            href={course.url ?? lmsCourseUrl(id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-border-strong transition-colors"
          >
            Open in {LMS_LABEL} <ArrowUpRight className="size-3.5 text-muted" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Open" value={open.length - overdue.length} />
        <Stat label="Overdue" value={overdue.length} tone="danger" />
        <Stat label="Completed" value={assignments.filter(isDone).length} />
        <Stat
          label="Current grade"
          value={
            standing
              ? `~${standing.letter} ${standing.percent.toFixed(1)}%`
              : total
                ? (total.display ?? (total.percent != null ? `${total.percent.toFixed(1)}%` : "—"))
                : "—"
          }
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-x-8 gap-y-8">
        <div className="lg:col-span-2 space-y-8">
          <Section title="Assignments" count={open.length}>
            {open.length === 0 ? (
              <div className="card">
                <EmptyState icon={CalendarCheck} title="Nothing open">No upcoming or overdue work for this class.</EmptyState>
              </div>
            ) : (
              <div className="space-y-4">
                {groupAssignments(open, now).map((g) => (
                  <div key={g.key}>
                    <div className="text-[12.5px] font-medium text-muted mb-1.5 px-0.5">{g.label}</div>
                    <AssignmentList>
                      {g.items.map((a) => (
                        <AssignmentRow key={a.id} a={a} course={course} now={now} showCourse={false} dateStyle="full" />
                      ))}
                    </AssignmentList>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {completed.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] font-semibold text-muted uppercase tracking-[0.04em] px-0.5 mb-2.5 select-none">
                <span className="inline-block transition-transform group-open:rotate-90 mr-1">›</span> Past &amp; completed{" "}
                <span className="text-subtle font-medium normal-case tracking-normal">{completed.length}</span>
              </summary>
              <AssignmentList>
                {completed.map((a) => (
                  <AssignmentRow key={a.id} a={a} course={course} now={now} showCourse={false} dateStyle="full" />
                ))}
              </AssignmentList>
            </details>
          )}

          {standing && standing.history.length > 0 && (
            <Section title="Grade trend">
              <div className="card p-4">
                <GradeTrend points={standing.history.map((h) => ({ ...h, label: formatShortDate(h.at) }))} />
                <p className="text-[11.5px] text-subtle mt-2">Estimated grade after each day grades were entered. Hover or tap a pin to see what was graded.</p>
              </div>
            </Section>
          )}

          {standing && !total && standing.gradedWeight < 100 && (
            <Section title="What do I need?">
              <GradeCalculator percent={standing.percent} gradedWeight={standing.gradedWeight} scale={standing.scale ?? DEFAULT_SCALE} />
            </Section>
          )}

          <Section title="Grades" count={items.length || undefined}>
            {items.length === 0 ? (
              <div className="card">
                <EmptyState icon={GraduationCap} title="No released grades">Grades appear here once instructors release them in {LMS_LABEL}.</EmptyState>
              </div>
            ) : (
              <GradeTable items={items} weights={standing?.sectionWeights} />
            )}
          </Section>
        </div>

        <aside className="space-y-8">
          <Section title="Resources">
            <ul className="card divide-y divide-border overflow-hidden">
              {[...custom, ...resources].map((r) => (
                <li key={r.url + r.label}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-surface-2 transition-colors">
                    {r.label}
                    <ArrowUpRight className="size-3.5 text-subtle" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Study material">
            <div className="card p-4">
              <div className="flex items-start gap-2.5">
                <NotebookPen className="size-4 text-muted mt-0.5 shrink-0" />
                <div>
                  {studyUrl ? (
                    <>
                      <p className="text-[13px]">Study guides, notes and class material for this class are in the library.</p>
                      <Link href={studyUrl} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent mt-1.5 hover:underline underline-offset-2">
                        Open in Library →
                      </Link>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted">This class has no folder in the library.</p>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Announcements" count={news.length || undefined}>
            {news.length === 0 ? (
              <div className="card">
                <EmptyState icon={Megaphone} title="No announcements" className="py-8" />
              </div>
            ) : (
              <ul className="card divide-y divide-border overflow-hidden">
                {news.slice(0, 6).map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[13px] font-medium leading-snug">
                        {n.title} <NewBadge at={n.postedAt} className="ml-1 align-middle" />
                      </span>
                      <span className="text-[11.5px] text-subtle whitespace-nowrap">{relative(n.postedAt, now)}</span>
                    </div>
                    {n.body && <p className="text-[12.5px] text-muted mt-1 line-clamp-3 whitespace-pre-line">{n.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {(standing || total) && (
            <p className="flex items-center gap-1.5 text-[11.5px] text-subtle px-0.5">
              <CircleCheck className="size-3" /> {standing ? "Current grade is estimated from the syllabus/gradebook weights." : `Grade shown is ${LMS_LABEL}’s calculated grade and may not reflect drops or curves.`}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
