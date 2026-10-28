import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CircleCheck, GraduationCap, Megaphone, NotebookPen } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { getLinks } from "@/lib/links";
import { LMS_LABEL, lmsCourseLinks, lmsCourseUrl } from "@/lib/settings";
import { getLibrary } from "@/lib/library";
import { folderLinks, type FolderLink } from "@/lib/library/links";
import { flatten } from "@/lib/library/catalog";
import { readState } from "@/lib/state";
import { MaterialRow, shortDate } from "@/components/library/material";
import { LibraryView, NoMaterial } from "@/components/library/library-view";
import { CourseTabs, courseTabHref, parseCourseTab } from "@/components/course-tabs";
import { AnnouncementList } from "@/components/announcements";
import { ExamCountdown } from "@/components/widgets";
import { byDue, groupAssignments, isDone, urgencyOf } from "@/lib/school/derive";
import { formatShortDate } from "@/lib/school/time";
import { AssignmentList, AssignmentRow } from "@/components/assignment-row";
import { GradeTable } from "@/components/grade-table";
import { GradeTrend } from "@/components/grade-trend";
import { GradeCalculator } from "@/components/grade-calculator";
import { DEFAULT_SCALE } from "@/lib/school/gpa";
import { DataUnavailable } from "@/components/data-state";
import { EmptyState, Section, SectionLink, Stat, hueStyle } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/courses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await getSchoolData();
  const c = r.status === "ok" ? r.snapshot.courses.find((x) => x.id === decodeURIComponent(id)) : undefined;
  return { title: c ? (c.code ?? c.name) : "Class" };
}

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[id]">) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const tab = parseCourseTab(sp.tab);
  const focus = typeof sp.open === "string" ? sp.open : undefined;
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
  const library = await getLibrary().catch(() => null);
  const lib = library?.ok ? library.courses.find((c) => c.course.id === id) : undefined;
  const folders: Map<string, FolderLink> = lib ? folderLinks(assignments, [lib]) : new Map();
  // Inline study material: the next exam's prep folder and the current unit's newest items.
  const nextExam = lib?.exams.find((g) => g.examDays != null && g.examDays >= 0);
  const unit = lib?.units.find((u) => u.id === lib.currentUnitId);
  const unitItems = unit
    ? flatten([unit])
        .filter((m) => !m.upcoming)
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 4)
    : [];
  const read = (await readState()).readAnnouncements;
  const unread = news.filter((n) => !read.includes(n.id));
  // Overview: unread posts first, then the newest read ones, 3 in all.
  const recentNews = [...unread, ...news.filter((n) => read.includes(n.id))].slice(0, 3);
  const nextDue = open.filter((a) => a.dueAt && urgencyOf(a, now) !== "overdue").sort(byDue)[0];
  const upNext = groupAssignments(open, now)
    .flatMap((g) => g.items)
    .slice(0, 4);
  const materialHref = (open?: string) => courseTabHref(id, "material", open);

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

      <CourseTabs
        courseId={id}
        active={tab}
        counts={{
          assignments: open.length,
          material: lib?.stats.items,
          news: unread.length || news.length,
        }}
        alert={{ assignments: overdue.length > 0, news: unread.length > 0 }}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <Stat
            label="To do"
            value={open.length - overdue.length}
            hint={nextDue?.dueAt ? `assignments · next ${formatShortDate(nextDue.dueAt)}` : "assignments not yet due"}
            href={courseTabHref(id, "assignments")}
          />
          <Stat label="Overdue" value={overdue.length} tone="danger" hint="assignments past due" href={courseTabHref(id, "assignments")} />
          <Stat label="Done" value={assignments.filter(isDone).length} hint="assignments submitted or graded" href={courseTabHref(id, "assignments")} />
          <Stat
            label="Current grade"
            value={standing ? `~${standing.letter} ${standing.percent.toFixed(1)}%` : total ? (total.display ?? (total.percent != null ? `${total.percent.toFixed(1)}%` : "—")) : "—"}
            hint={standing ? "estimated from syllabus weights" : total ? `from ${LMS_LABEL}` : "no grades yet"}
            href={courseTabHref(id, "grades")}
          />
        </div>
      )}

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-x-8 gap-y-8">
          <div className="lg:col-span-2 space-y-8">
            {recentNews.length > 0 && (
              <Section title="Announcements" count={unread.length || undefined} action={<SectionLink href={courseTabHref(id, "news")}>All {news.length}</SectionLink>}>
                <div className="card overflow-hidden">
                  <AnnouncementList items={recentNews} courses={{ [course.id]: course }} read={read} now={now.toISOString()} showCourse={false} lines={2} />
                </div>
              </Section>
            )}
            <Section title="Up next" count={open.length || undefined} action={<SectionLink href={courseTabHref(id, "assignments")}>All assignments</SectionLink>}>
              {upNext.length === 0 ? (
                <div className="card">
                  <EmptyState icon={CalendarCheck} title="Nothing open">
                    No upcoming or overdue work for this class.
                  </EmptyState>
                </div>
              ) : (
                <AssignmentList>
                  {upNext.map((a) => (
                    <AssignmentRow key={a.id} a={a} course={course} now={now} showCourse={false} dateStyle="full" folder={folders.get(a.id)} />
                  ))}
                </AssignmentList>
              )}
            </Section>
          </div>
          <aside className="space-y-8">
            <Section title="Study material" action={lib ? <SectionLink href={materialHref()}>All material</SectionLink> : undefined}>
              {lib && (nextExam || unitItems.length > 0) ? (
                <div className="card overflow-hidden divide-y divide-border">
                  {nextExam && (
                    <Link href={materialHref(nextExam.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 transition-colors">
                      <ExamCountdown days={nextExam.examDays!} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">{nextExam.title}</span>
                        <span className="block text-[11.5px] text-muted">{nextExam.total} items · exam prep</span>
                      </span>
                    </Link>
                  )}
                  {unit && unitItems.length > 0 && (
                    <div>
                      <Link href={materialHref(unit.id)} className="block px-4 pt-2.5 pb-1 text-[11.5px] font-medium text-muted hover:text-fg">
                        {unit.number != null ? `Unit ${unit.number}: ` : ""}
                        {unit.title} →
                      </Link>
                      <ul className="divide-y divide-border">
                        {unitItems.map((m) => (
                          <MaterialRow key={m.id} m={m} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card p-4">
                  <div className="flex items-start gap-2.5">
                    <NotebookPen className="size-4 text-muted mt-0.5 shrink-0" />
                    {lib ? (
                      <p className="text-[13px]">
                        Study guides, notes and class material are in the{" "}
                        <Link href={materialHref()} className="font-medium text-accent hover:underline underline-offset-2">
                          Material tab
                        </Link>
                        .
                      </p>
                    ) : (
                      <p className="text-[13px] text-muted">This class has no folder in the library.</p>
                    )}
                  </div>
                </div>
              )}
            </Section>

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
          </aside>
        </div>
      )}

      {tab === "assignments" && (
        <div className="space-y-8 max-w-3xl">
          <Section title="Assignments" count={open.length}>
            {open.length === 0 ? (
              <div className="card">
                <EmptyState icon={CalendarCheck} title="Nothing open">
                  No upcoming or overdue work for this class.
                </EmptyState>
              </div>
            ) : (
              <div className="space-y-4">
                {groupAssignments(open, now).map((g) => (
                  <div key={g.key}>
                    <div className="text-[12.5px] font-medium text-muted mb-1.5 px-0.5">{g.label}</div>
                    <AssignmentList>
                      {g.items.map((a) => (
                        <AssignmentRow key={a.id} a={a} course={course} now={now} showCourse={false} dateStyle="full" folder={folders.get(a.id)} />
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
                  <AssignmentRow key={a.id} a={a} course={course} now={now} showCourse={false} dateStyle="full" folder={folders.get(a.id)} />
                ))}
              </AssignmentList>
            </details>
          )}
        </div>
      )}

      {tab === "grades" && (
        <div className="space-y-8 max-w-3xl">
          {standing && standing.history.length > 0 && (
            <Section title="Grade trend">
              <div className="card p-4">
                <GradeTrend
                  points={standing.history.map((h) => ({
                    ...h,
                    label: formatShortDate(h.at),
                  }))}
                />
                <p className="text-[11.5px] text-subtle mt-2">Estimated grade after each day grades were entered. Hover or tap a pin to see what was graded.</p>
              </div>
            </Section>
          )}

          {standing && !total && standing.gradedWeight < 100 && (
            <Section title="What do I need?">
              <GradeCalculator percent={standing.percent} gradedWeight={standing.gradedWeight} scale={standing.scale ?? DEFAULT_SCALE} whatIf={standing.whatIf} />
            </Section>
          )}

          <Section title="Grades" count={items.length || undefined}>
            {items.length === 0 ? (
              <div className="card">
                <EmptyState icon={GraduationCap} title="No released grades">
                  Grades appear here once instructors release them in {LMS_LABEL}.
                </EmptyState>
              </div>
            ) : (
              <GradeTable items={items} weights={standing?.sectionWeights} sections={standing?.itemSections} />
            )}
          </Section>
          {(standing || total) && (
            <p className="flex items-center gap-1.5 text-[11.5px] text-subtle px-0.5">
              <CircleCheck className="size-3" />{" "}
              {standing ? "Current grade is estimated from the syllabus/gradebook weights." : `Grade shown is ${LMS_LABEL}’s calculated grade and may not reflect drops or curves.`}
            </p>
          )}
        </div>
      )}

      {tab === "material" &&
        (lib ? (
          lib.stats.items === 0 ? (
            <NoMaterial code={lib.course.code} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Stat label="Units" value={lib.stats.units} />
                <Stat label="Study guides" value={lib.stats.studyGuides} />
                <Stat label="Items" value={lib.stats.items} />
                <Stat label="Latest" value={lib.latest ? shortDate(lib.latest) : "—"} />
              </div>
              <LibraryView lib={lib} focus={focus} />
            </>
          )
        ) : (
          <div className="card">
            <EmptyState icon={NotebookPen} title="No library folder">
              This class has no folder in the library.
            </EmptyState>
          </div>
        ))}

      {tab === "news" && (
        <div className="max-w-3xl">
          <Section title="Announcements" count={news.length || undefined}>
            <div id="announcements" className="scroll-mt-16">
              {news.length === 0 ? (
                <div className="card">
                  <EmptyState icon={Megaphone} title="No announcements" className="py-8" />
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <AnnouncementList items={news} courses={{ [course.id]: course }} read={read} now={now.toISOString()} showCourse={false} lines={3} />
                </div>
              )}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
