import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Assignment, Course, Grade } from "@/lib/school/types";
import { isDone, urgencyOf } from "@/lib/school/derive";
import { formatWeekdayDate, relative } from "@/lib/school/time";
import { hueStyle } from "./ui";

export function CourseCard({
  course,
  assignments,
  total,
  now,
}: {
  course: Course;
  assignments: Assignment[];
  total: Grade | undefined;
  now: Date;
}) {
  const open = assignments.filter((a) => !isDone(a) && a.dueAt && Date.parse(a.dueAt) >= now.getTime()).sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  const overdue = assignments.filter((a) => urgencyOf(a, now) === "overdue").length;
  const next = open[0];
  return (
    <ClassCard
      href={`/courses/${encodeURIComponent(course.id)}`}
      style={hueStyle(course.id)}
      code={course.code ?? (course.isClass ? "Course" : "Enrollment")}
      corner={total && (total.display || total.percent != null) ? (total.display ?? `${total.percent?.toFixed(1)}%`) : undefined}
      name={course.name}
      instructor={course.instructor}
    >
      {next ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            Next: <span className="text-fg">{next.title}</span>
          </span>
          <span className="whitespace-nowrap tabular-nums" title={formatWeekdayDate(next.dueAt!)}>
            {relative(next.dueAt!, now)}
          </span>
        </div>
      ) : (
        <span className="text-subtle">Nothing upcoming</span>
      )}
      <div className="flex gap-3 mt-1 text-subtle">
        <span>{open.length} open</span>
        {overdue > 0 && <span className="text-danger">{overdue} overdue</span>}
      </div>
    </ClassCard>
  );
}

/** Grid used for class cards on Classes and Library. */
export const classGridClass = "grid sm:grid-cols-2 gap-3";

/** Class card shell shared by Classes and Library; `children` is the footer. */
export function ClassCard({
  href,
  style,
  code,
  corner,
  name,
  instructor,
  children,
}: {
  href: string;
  style: CSSProperties;
  code: string;
  corner?: ReactNode;
  name: string;
  instructor?: string | null;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={style} className="card course-bar group flex flex-col px-4 py-3.5 hover:border-border-strong transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="size-2 rounded-full course-dot shrink-0" />
          <span className="text-[15px] font-semibold truncate">{code}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {corner && <span className="text-[12px] tabular-nums text-muted">{corner}</span>}
          <ChevronRight className="size-4 text-subtle group-hover:text-fg transition-colors" />
        </span>
      </div>
      <div className="text-[13px] text-muted mt-0.5 truncate">{[name, instructor].filter(Boolean).join(" · ")}</div>
      <div className="mt-auto pt-3 text-[12px] text-muted">{children}</div>
    </Link>
  );
}
