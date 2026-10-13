import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCourseLibrary, getLibraryCourses } from "@/lib/library";
import { LMS_LABEL, lmsCourseUrl } from "@/lib/settings";
import { LibraryView, NoMaterial } from "@/components/library/library-view";
import { LibraryError } from "@/components/library/library-error";
import { PageHeader, Stat, buttonClass, hueVars } from "@/components/ui";
import { shortDate } from "@/components/library/material";

export async function generateMetadata({ params }: PageProps<"/library/[course]">): Promise<Metadata> {
  const { course } = await params;
  return { title: (await getLibraryCourses()).find((c) => c.slug === course)?.code ?? "Class" };
}

export default async function CoursePage({ params, searchParams }: PageProps<"/library/[course]">) {
  const { course: slug } = await params;
  const { open } = await searchParams;
  const lib = await getCourseLibrary(slug);
  if (lib && "error" in lib) return <LibraryError error={lib.error} />;
  if (!lib) notFound();
  const { course, stats } = lib;

  return (
    <div style={hueVars(course.hue)}>
      <PageHeader
        leading={<span className="size-2.5 rounded-full course-dot" />}
        title={course.code}
        subtitle={[course.name, course.instructor, course.term].filter(Boolean).join(" · ")}
        actions={
          course.id && (
            <div className="flex gap-2">
              <Link href={`/courses/${encodeURIComponent(course.id)}`} className={buttonClass}>
                Class overview
              </Link>
              <a href={lmsCourseUrl(course.id, "content")} target="_blank" rel="noreferrer" className={buttonClass}>
                {LMS_LABEL} content <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          )
        }
      />

      {stats.items === 0 ? (
        <NoMaterial code={course.code} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Stat label="Units" value={stats.units} />
            <Stat label="Study guides" value={stats.studyGuides} />
            <Stat label="Items" value={stats.items} />
            <Stat label="Latest" value={lib.latest ? shortDate(lib.latest) : "—"} />
          </div>
          <LibraryView lib={lib} focus={typeof open === "string" ? open : undefined} />
        </>
      )}
    </div>
  );
}
