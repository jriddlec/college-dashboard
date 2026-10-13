import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { CircleCheck, Inbox, PartyPopper } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { ASSIGNMENT_FILTERS, courseMap, filterAssignments, groupAssignments, type AssignmentFilter } from "@/lib/school/derive";
import { AssignmentList, AssignmentRow } from "@/components/assignment-row";
import { DataUnavailable } from "@/components/data-state";
import { EmptyState, PageHeader } from "@/components/ui";
import { CourseSelect } from "./course-select";

export const metadata: Metadata = { title: "Assignments" };

const LABELS: Record<AssignmentFilter, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
  all: "All",
};

export default async function AssignmentsPage({ searchParams }: PageProps<"/assignments">) {
  const sp = await searchParams;
  const filter: AssignmentFilter = ASSIGNMENT_FILTERS.includes(sp.filter as AssignmentFilter) ? (sp.filter as AssignmentFilter) : "upcoming";
  const courseId = typeof sp.course === "string" && sp.course ? sp.course : null;

  const result = await getSchoolData();
  if (result.status !== "ok") return <DataUnavailable result={result} title="Assignments" />;
  const { snapshot } = result;
  const now = new Date();
  const courses = courseMap(snapshot.courses);

  const counts = Object.fromEntries(ASSIGNMENT_FILTERS.map((f) => [f, filterAssignments(snapshot.assignments, f, now, courseId).length])) as Record<AssignmentFilter, number>;
  const items = filterAssignments(snapshot.assignments, filter, now, courseId);
  const grouped = filter === "upcoming";

  const href = (f: AssignmentFilter) => {
    const p = new URLSearchParams();
    if (f !== "upcoming") p.set("filter", f);
    if (courseId) p.set("course", courseId);
    const s = p.toString();
    return s ? `/assignments?${s}` : "/assignments";
  };

  return (
    <div>
      <PageHeader title="Assignments" subtitle={`${counts.upcoming} upcoming · ${counts.overdue} overdue`} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div role="tablist" className="inline-flex rounded-lg bg-surface-2 p-0.5 self-start overflow-x-auto max-w-full">
          {ASSIGNMENT_FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              role="tab"
              aria-selected={f === filter}
              className={clsx(
                "px-3 py-1 rounded-md text-[13px] whitespace-nowrap transition-colors",
                f === filter ? "bg-surface text-fg font-medium shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {LABELS[f]}
              <span className={clsx("ml-1.5 tabular-nums text-[11.5px]", f === "overdue" && counts.overdue > 0 ? "text-danger" : "text-subtle")}>{counts[f]}</span>
            </Link>
          ))}
        </div>
        <CourseSelect courses={snapshot.courses.map((c) => ({ id: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }))} value={courseId} />
      </div>

      {items.length === 0 ? (
        <div className="card">
          {filter === "overdue" ? (
            <EmptyState icon={PartyPopper} title="Nothing overdue">Every past deadline is submitted.</EmptyState>
          ) : filter === "completed" ? (
            <EmptyState icon={CircleCheck} title="No completed work yet">Submitted and graded items will show up here.</EmptyState>
          ) : (
            <EmptyState icon={Inbox} title="No assignments">
              {courseId ? "Nothing matches this course and filter." : "No assignments match this filter."}
            </EmptyState>
          )}
        </div>
      ) : grouped ? (
        <div className="space-y-5">
          {groupAssignments(items, now).map((g) => (
            <section key={g.key}>
              <h2 className="text-[12.5px] font-medium text-muted mb-1.5 px-0.5">
                {g.label} <span className="text-subtle">{g.items.length}</span>
              </h2>
              <AssignmentList>
                {g.items.map((a) => (
                  <AssignmentRow key={a.id} a={a} course={courses.get(a.courseId)} now={now} showCourse={!courseId} dateStyle={g.key === "today" || g.key === "tomorrow" ? "time" : "full"} />
                ))}
              </AssignmentList>
            </section>
          ))}
        </div>
      ) : (
        <AssignmentList>
          {items.map((a) => (
            <AssignmentRow key={a.id} a={a} course={courses.get(a.courseId)} now={now} showCourse={!courseId} dateStyle="full" />
          ))}
        </AssignmentList>
      )}
    </div>
  );
}
