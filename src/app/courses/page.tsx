import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { getSchoolData } from "@/lib/school";
import { CourseCard, classGridClass } from "@/components/course-card";
import { DataUnavailable } from "@/components/data-state";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import { LMS_LABEL } from "@/lib/settings";

export const metadata: Metadata = { title: "Classes" };

export default async function CoursesPage() {
  const result = await getSchoolData();
  if (result.status !== "ok") return <DataUnavailable result={result} title="Classes" />;
  const { snapshot } = result;
  const now = new Date();
  const active = snapshot.courses.filter((c) => c.isActive && c.isClass);
  const other = snapshot.courses.filter((c) => c.isActive && !c.isClass);
  const inactive = snapshot.courses.filter((c) => !c.isActive);
  const terms = [...new Set(active.map((c) => c.term).filter(Boolean))];

  const grid = (list: typeof active) => (
    <div className={classGridClass}>
      {list.map((c) => (
        <CourseCard
          key={c.id}
          course={c}
          assignments={snapshot.assignments.filter((a) => a.courseId === c.id)}
          total={snapshot.grades.find((g) => g.courseId === c.id && g.isCourseTotal)}
          now={now}
        />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader title="Classes" subtitle={terms.length ? terms.join(" · ") : `${active.length} active`} />
      {active.length === 0 ? (
        <div className="card">
          <EmptyState icon={BookOpen} title="No active classes">Courses you’re enrolled in on {LMS_LABEL} will appear here.</EmptyState>
        </div>
      ) : (
        grid(active)
      )}
      {other.length > 0 && (
        <Section title="Other enrollments" count={other.length} className="mt-10">
          {grid(other)}
        </Section>
      )}
      {inactive.length > 0 && (
        <Section title="Past & inactive" count={inactive.length} className="mt-10">
          {grid(inactive)}
        </Section>
      )}
    </div>
  );
}
