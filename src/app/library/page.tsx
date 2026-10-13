import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLibrary } from "@/lib/library";
import { KIND_FILTER, flatten, type CourseLibrary, type Group, type Material } from "@/lib/library/catalog";
import { LibraryError } from "@/components/library/library-error";
import { HomeSearch, type SearchEntry } from "@/components/library/home-search";
import { MaterialRow, shortDate } from "@/components/library/material";
import { PageHeader, Section, hueVars } from "@/components/ui";

/** Group title for every item, so search results and lists can say where a file lives. */
function contexts(lib: CourseLibrary): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (groups: Group[], prefix: string) => {
    for (const g of groups) {
      const label = `${prefix} · ${g.number != null ? `Unit ${g.number}: ` : ""}${g.title}`;
      for (const m of [...(g.readme ? [g.readme] : []), ...g.items]) out.set(m.id, label);
      visit(g.children, prefix);
    }
  };
  visit([...lib.exams, ...lib.units, ...lib.classwork, ...lib.documents], lib.course.code);
  return out;
}

const STUDY_FIRST = (m: Material) => (KIND_FILTER[m.kind] === "study" ? 0 : KIND_FILTER[m.kind] === "practice" ? 1 : 2);

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const lib = await getLibrary();
  if (!lib.ok) return <LibraryError error={lib.error} />;

  const entries: SearchEntry[] = lib.courses.flatMap((c) => {
    const ctx = contexts(c);
    return flatten([...c.exams, ...c.units, ...c.classwork, ...c.documents]).map((m) => ({ m, context: ctx.get(m.id) ?? c.course.code, hue: c.course.hue }));
  });
  const latest = entries
    .filter((e) => e.m.date && !e.m.upcoming)
    .sort((a, b) => b.m.date!.localeCompare(a.m.date!) || a.m.title.localeCompare(b.m.title))
    .slice(0, 10);
  const exams = lib.courses.flatMap((c) => (c.exams[0] ? [{ c, g: c.exams[0] }] : []));

  return (
    <div>
      <PageHeader title="Library" subtitle="Study guides, class notes, and course material." />
      <HomeSearch entries={entries}>
        <div className="space-y-10">
          <Section title="Classes">
            <div className="grid sm:grid-cols-2 gap-3">
              {lib.courses.map((c) => (
                <Link
                  key={c.course.slug}
                  href={`/library/${c.course.slug}`}
                  style={hueVars(c.course.hue)}
                  className="card course-bar group px-4 py-3.5 hover:border-border-strong transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full course-dot" />
                      <span className="text-[15px] font-semibold">{c.course.code}</span>
                    </span>
                    <ChevronRight className="size-4 text-subtle group-hover:text-fg transition-colors" />
                  </div>
                  <div className="text-[13px] text-muted mt-0.5 truncate">
                    {[c.course.name, c.course.instructor].filter(Boolean).join(" · ")}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[12px] text-muted tabular-nums">
                    <span>
                      <b className="font-semibold text-fg">{c.stats.units}</b> units
                    </span>
                    <span>
                      <b className="font-semibold text-fg">{c.stats.studyGuides}</b> study guides
                    </span>
                    <span>
                      <b className="font-semibold text-fg">{c.stats.items}</b> items
                    </span>
                    {c.latest && <span className="text-subtle">latest {shortDate(c.latest)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </Section>

          {exams.length > 0 && (
            <Section title="Exam prep">
              <div className="grid lg:grid-cols-2 gap-3">
                {exams.map(({ c, g }) => {
                  const items = flatten([g]).sort((a, b) => STUDY_FIRST(a) - STUDY_FIRST(b) || (b.date ?? "").localeCompare(a.date ?? ""));
                  return (
                    <div key={g.id} className="card overflow-hidden" style={hueVars(c.course.hue)}>
                      <Link href={`/library/${c.course.slug}?open=${encodeURIComponent(g.id)}`} className="flex items-center gap-2 px-4 py-3 hover:bg-surface-2/60 transition-colors">
                        <span className="size-2 rounded-full course-dot" />
                        <span className="text-[12.5px] font-medium course-text">{c.course.code}</span>
                        <span className="text-[14px] font-semibold flex-1 truncate">{g.title}</span>
                        <span className="text-[12px] text-muted tabular-nums whitespace-nowrap">{g.total} items</span>
                      </Link>
                      <ul className="divide-y divide-border border-t border-border">
                        {items.slice(0, 4).map((m) => (
                          <MaterialRow key={m.id} m={m} />
                        ))}
                      </ul>
                      {items.length > 4 && (
                        <Link href={`/library/${c.course.slug}?open=${encodeURIComponent(g.id)}`} className="block border-t border-border px-4 py-2 text-[12.5px] text-muted hover:text-fg">
                          {items.length - 4} more →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {latest.length > 0 && (
            <Section title="Latest material">
              <ul className="card divide-y divide-border overflow-hidden">
                {latest.map((e) => (
                  <MaterialRow key={e.m.id} m={e.m} context={e.context} hue={e.hue} />
                ))}
              </ul>
            </Section>
          )}
        </div>
      </HomeSearch>
    </div>
  );
}
