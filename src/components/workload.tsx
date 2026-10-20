import type { Course } from "@/lib/school/types";
import { courseLabel, type WeekLoad } from "@/lib/school/derive";
import { hueStyle } from "./ui";

/** One bar per week, split by class; the busiest week sets the scale. */
export function Workload({ weeks, courses }: { weeks: WeekLoad[]; courses: Map<string, Course> }) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const avg = weeks.reduce((s, w) => s + w.total, 0) / weeks.length;
  return (
    <ul className="px-4 py-3 space-y-2">
      {weeks.map((w) => {
        const heavy = w.total >= 3 && w.total >= avg * 1.5;
        return (
          <li key={w.week} className="flex items-center gap-3 text-[12px]">
            <span className="w-[4.5rem] shrink-0 text-muted">{w.label}</span>
            <div className="flex-1 flex h-3 rounded-sm overflow-hidden bg-surface-2" role="img" aria-label={`${w.total} due ${w.label}`}>
              {w.byCourse.map((c) => (
                <span
                  key={c.courseId}
                  className="h-full course-dot border-r border-surface last:border-r-0"
                  style={{ ...hueStyle(c.courseId), width: `${(c.count / max) * 100}%` }}
                  title={`${courseLabel(courses.get(c.courseId))}: ${c.count}`}
                />
              ))}
            </div>
            <span className={`w-6 text-right tabular-nums ${heavy ? "text-warn font-semibold" : "text-muted"}`} title={w.points ? `${w.points} points` : undefined}>
              {w.total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
