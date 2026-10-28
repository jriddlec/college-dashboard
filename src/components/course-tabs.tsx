import Link from "next/link";

export const COURSE_TABS = ["overview", "assignments", "grades", "news", "material"] as const;
export type CourseTab = (typeof COURSE_TABS)[number];

const LABELS: Record<CourseTab, string> = {
  overview: "Overview",
  assignments: "Assignments",
  grades: "Grades",
  material: "Material",
  news: "News",
};

export function parseCourseTab(v: string | string[] | undefined): CourseTab {
  return COURSE_TABS.find((t) => t === v) ?? "overview";
}

export function courseTabHref(courseId: string, tab: CourseTab, open?: string) {
  const base = `/courses/${encodeURIComponent(courseId)}`;
  if (tab === "overview") return base;
  return `${base}?tab=${tab}${open ? `&open=${encodeURIComponent(open)}` : ""}`;
}

/** Tab bar under the class header; sticks below the mobile top bar. Counts show as small badges (accent when `alert`). */
export function CourseTabs({
  courseId,
  active,
  counts = {},
  alert = {},
}: {
  courseId: string;
  active: CourseTab;
  counts?: Partial<Record<CourseTab, number>>;
  alert?: Partial<Record<CourseTab, boolean>>;
}) {
  return (
    <nav className="sticky top-12 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 mb-6 border-b border-border bg-bg/95 backdrop-blur">
      <ul className="flex overflow-x-auto no-scrollbar">
        {COURSE_TABS.map((t) => {
          const on = t === active;
          const n = counts[t];
          return (
            <li key={t} className="shrink-0">
              <Link
                href={courseTabHref(courseId, t)}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  on ? "text-fg course-border" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {LABELS[t]}
                {n ? <span className={`rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums ${alert[t] ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}>{n}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
