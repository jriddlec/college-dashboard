/**
 * Academic-overview widgets. A widget with nothing to show right now says so
 * in its card; one that needs a file or setting that's missing is listed
 * under "Not set up yet" instead of inventing numbers. Current grades, trends
 * and GPA are estimated from each course's own gradebook weights and are
 * labeled as estimates.
 */
import { CalendarRange, ChartLine, NotebookPen, GraduationCap, Megaphone, Sigma, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { Course, CourseStanding, SchoolSnapshot } from "@/lib/school/types";
import { courseMap, weeklyLoad } from "@/lib/school/derive";
import { gpaSummary, type Transcript } from "@/lib/school/gpa";
import { dayKey, daysBetween, formatShortDate, formatTime, formatWeekdayDate, relative } from "@/lib/school/time";
import { upcomingExams, type PrepFolder, type UpcomingExam } from "@/lib/school/exams";
import { SCORE_TEXT, scoreOf } from "@/lib/school/score";
import { targetLine } from "@/lib/school/targets";
import type { Library } from "@/lib/library";
import { readState } from "@/lib/state";
import { Workload } from "./workload";
import { NewBadge } from "./new-badge";
import { AnnouncementList } from "./announcements";
import { CourseTag, hueStyle } from "./ui";

interface Context {
  transcript: Transcript | null;
  library: Library | null;
  /** Upcoming exams with their prep folders (computed once per render). */
  exams: UpcomingExam[];
  /** Announcement ids marked read. */
  read: string[];
}

export function examsOf(s: SchoolSnapshot, now: Date, lib: Library | null): UpcomingExam[] {
  const courses = lib?.ok ? lib.courses : [];
  const prep: PrepFolder[] = courses.flatMap((c) => c.exams.map((g) => ({ courseId: c.course.id, slug: c.course.slug, groupId: g.id, title: g.title })));
  const slugOf = (id: string) => courses.find((c) => c.course.id === id)?.course.slug ?? null;
  return upcomingExams(s, prep, slugOf, now);
}

interface Widget {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Shown in the card when there's nothing to show right now. */
  empty: string;
  /** False when a file or setting the widget needs is missing; it's then listed under "Not set up yet" with `setup`. */
  configured?: (ctx: Context) => boolean;
  setup?: string;
  available: (s: SchoolSnapshot, now: Date, ctx: Context) => boolean;
  render: (s: SchoolSnapshot, now: Date, courses: Map<string, Course>, ctx: Context) => React.ReactNode;
}

const RECENT_DAYS = 14;
const TREND_DAYS = 14;

/** Standings for active classes, in course order. */
function classStandings(s: SchoolSnapshot): CourseStanding[] {
  return s.courses
    .filter((c) => c.isClass && c.isActive)
    .map((c) => s.standings.find((x) => x.courseId === c.id))
    .filter((x) => x !== undefined);
}

const COURSE_COLOR = "hsl(var(--hue) var(--course-s) var(--course-l))";

function Sparkline({ points, courseId }: { points: number[]; courseId: string }) {
  const w = 96, h = 24, pad = 2.5;
  const lo = Math.min(...points) - 1, hi = Math.max(...points) + 1;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={hueStyle(courseId)} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke={COURSE_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={2} fill={COURSE_COLOR} />
    </svg>
  );
}

/** Countdown number for an exam: days left, colored by how close it is. */
export function ExamCountdown({ days }: { days: number }) {
  return (
    <div className={clsx("w-10 shrink-0 text-center leading-none", days <= 3 ? "text-danger" : days <= 7 ? "text-warn" : "text-muted")}>
      <div className="text-[18px] font-semibold tabular-nums">{days === 0 ? "!" : days}</div>
      <div className="text-[10px] uppercase tracking-wide mt-0.5">{days === 0 ? "today" : days === 1 ? "day" : "days"}</div>
    </div>
  );
}

const WIDGETS: Widget[] = [
  {
    id: "exams",
    title: "Upcoming exams",
    icon: NotebookPen,
    empty: "No exams on the calendar in the next 60 days.",
    available: (_s, _now, ctx) => ctx.exams.length > 0,
    render: (s, now, courses, ctx) => (
      <ul className="divide-y divide-border">
        {ctx.exams.slice(0, 5).map((x) => {
          const st = x.courseId ? s.standings.find((v) => v.courseId === x.courseId) : undefined;
          const target = st ? targetLine(st) : null;
          return (
            <li key={x.key} className="flex items-start gap-3 px-4 py-2.5 course-bar" style={hueStyle(x.courseId)}>
              <ExamCountdown days={daysBetween(dayKey(now), dayKey(x.at))} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-snug">{x.title}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <CourseTag course={x.courseId ? courses.get(x.courseId) : undefined} />
                  <span className="text-[11.5px] text-subtle" title={relative(x.at, now)}>
                    {formatWeekdayDate(x.at)}, {formatTime(x.at)}
                  </span>
                  {x.prep && (
                    <Link href={x.prep.href} className="text-[11.5px] font-medium text-accent hover:underline underline-offset-2">
                      {x.prep.matched ? `Study: ${x.prep.label}` : "Study material"} →
                    </Link>
                  )}
                </div>
                {target && (
                  <div className="text-[11px] text-subtle mt-0.5" title="Average needed on the rest of the class's work (estimate)">
                    Need on the rest: {target}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    ),
  },
  {
    id: "workload",
    title: "Workload",
    icon: CalendarRange,
    empty: "No open deadlines in the next six weeks.",
    available: (s, now) => weeklyLoad(s.assignments, now).some((w) => w.total > 0),
    render: (s, now, courses) => <Workload weeks={weeklyLoad(s.assignments, now)} courses={courses} />,
  },
  {
    id: "current-grades",
    title: "Current grades",
    icon: GraduationCap,
    empty: "No graded work yet.",
    available: (s) => classStandings(s).length > 0 || s.grades.some((g) => g.isCourseTotal),
    render: (s, _now, courses) => {
      const finals = new Map(s.grades.filter((g) => g.isCourseTotal).map((g) => [g.courseId, g]));
      const ids = [...new Set([...classStandings(s).map((x) => x.courseId), ...finals.keys()])];
      return (
        <ul className="divide-y divide-border">
          {ids.map((id) => {
            const fin = finals.get(id);
            const st = s.standings.find((x) => x.courseId === id);
            const pct = fin?.percent ?? st?.percent ?? null;
            const letter = fin?.display && !fin.display.includes("%") ? fin.display : (st?.letter ?? null);
            return (
              <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0" title={st ? `Estimated from ${st.basis === "syllabus" ? "syllabus" : "gradebook"} weights over graded work; letter on ${st.scaleSource ?? "a default"} scale.` : undefined}>
                  <CourseTag course={courses.get(id)} />
                  <div className="text-[11px] text-subtle mt-0.5">{fin ? "Released" : `Est. · ${st!.gradedWeight}% graded`}</div>
                </div>
                <span className="text-[13px] tabular-nums whitespace-nowrap">
                  {letter && <span className="font-medium">{fin ? letter : `~${letter}`}</span>}
                  {pct != null && <span className="text-muted ml-2">{pct.toFixed(1)}%</span>}
                </span>
              </li>
            );
          })}
        </ul>
      );
    },
  },
  {
    id: "recent-grades",
    title: "Recently graded",
    icon: TrendingUp,
    empty: `Nothing graded in the last ${RECENT_DAYS} days.`,
    available: (s, now) => s.grades.some((g) => !g.isCourseTotal && g.postedAt && now.getTime() - Date.parse(g.postedAt) < RECENT_DAYS * 864e5),
    render: (s, now, courses) => (
      <ul className="divide-y divide-border">
        {s.grades
          .filter((g) => !g.isCourseTotal && g.postedAt && now.getTime() - Date.parse(g.postedAt) < RECENT_DAYS * 864e5)
          .sort((a, b) => Date.parse(b.postedAt!) - Date.parse(a.postedAt!))
          .slice(0, 5)
          .map((g) => {
            const sc = scoreOf(g.pointsEarned, g.pointsPossible);
            return (
              <li key={g.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[13px] leading-snug">{g.name}</span>
                  <span className={clsx("text-[13px] tabular-nums font-medium whitespace-nowrap", sc && SCORE_TEXT[sc.tone])}>
                    {sc ? `${sc.points} · ${sc.pct}` : (g.display ?? `${g.percent}%`)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <CourseTag course={courses.get(g.courseId)} />
                  <span className="text-[11.5px] text-subtle">{relative(g.postedAt!, now)}</span>
                  <NewBadge at={g.postedAt} />
                </div>
              </li>
            );
          })}
      </ul>
    ),
  },
  {
    id: "announcements",
    title: "Announcements",
    icon: Megaphone,
    empty: "No announcements yet.",
    available: (s) => s.announcements.length > 0,
    render: (s, now, courses, ctx) => (
      <AnnouncementList items={s.announcements.slice(0, 4)} courses={Object.fromEntries(courses)} read={ctx.read} now={now.toISOString()} />
    ),
  },
  {
    id: "grade-trends",
    title: "Grade trends",
    icon: ChartLine,
    empty: "Needs graded work on at least two different days in a class.",
    available: (s) => classStandings(s).some((x) => x.history.length >= 2),
    render: (s, now, courses) => (
      <ul className="divide-y divide-border">
        {classStandings(s)
          .filter((x) => x.history.length >= 2)
          .map((x) => {
            const pts = x.history.map((h) => h.percent);
            // Change over the last two weeks: early points rest on one or two scores and swing wildly.
            const cutoff = now.getTime() - TREND_DAYS * 864e5;
            const base = x.history.findLast((h) => Date.parse(h.at) <= cutoff) ?? x.history[0];
            const delta = pts[pts.length - 1] - base.percent;
            const flat = Math.abs(delta) < 0.5;
            return (
              <li key={x.courseId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <CourseTag course={courses.get(x.courseId)} />
                  <div className="text-[11px] text-subtle mt-0.5">Change since {formatShortDate(base.at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkline points={pts} courseId={x.courseId} />
                  <span className={`text-[12.5px] tabular-nums w-11 text-right ${flat ? "text-muted" : "font-medium"}`}>
                    {flat ? "±" : delta > 0 ? "+" : "−"}
                    {Math.abs(delta).toFixed(1)}
                  </span>
                </div>
              </li>
            );
          })}
      </ul>
    ),
  },
  {
    id: "gpa",
    title: "GPA",
    icon: Sigma,
    empty: "",
    configured: (ctx) => ctx.transcript !== null,
    setup: "Add transcript.json (GPA hours, quality points, in-progress credits) to the config folder.",
    available: (_s, _now, ctx) => ctx.transcript !== null,
    render: (s, _now, _courses, ctx) => {
      const codes = new Map(s.courses.map((c) => [c.id, c.code]));
      const g = gpaSummary(ctx.transcript!, s.standings, (id) => codes.get(id) ?? null);
      const rows: [string, string, string][] = [
        ["Overall to date", g.cumulative.toFixed(2), "Completed terms, from your transcript"],
        [
          "Overall with this term",
          g.projected != null ? `~${g.projected.toFixed(2)}` : "—",
          g.projected != null ? "If current estimates hold" : "No current estimates yet",
        ],
        ["This term", g.term != null ? `~${g.term.toFixed(2)}` : "—", `${g.termHours} credit hours estimated`],
      ];
      return (
        <div>
          <ul className="divide-y divide-border">
            {rows.map(([label, value, note]) => (
              <li key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="text-[13px]">{label}</div>
                  <div className="text-[11px] text-subtle">{note}</div>
                </div>
                <span className="text-[15px] font-medium tabular-nums">{value}</span>
              </li>
            ))}
          </ul>
          {g.missing.length > 0 && <p className="px-4 pb-2.5 text-[11px] text-subtle">Not estimated yet: {g.missing.join(", ")}</p>}
        </div>
      );
    },
  },
];

/** Short, glanceable widgets for the side column; the rest go in a full-width grid below. */
export const SIDE_WIDGETS = ["exams", "workload", "current-grades"];

export async function OverviewWidgets({
  snapshot,
  now,
  transcript,
  library,
  only,
  className = "space-y-6",
}: {
  snapshot: SchoolSnapshot;
  now: Date;
  transcript: Transcript | null;
  library: Library | null;
  /** Widget ids to show, in this order; all when omitted. */
  only?: string[];
  className?: string;
}) {
  const courses = courseMap(snapshot.courses);
  const ctx: Context = { transcript, library, exams: examsOf(snapshot, now, library), read: (await readState()).readAnnouncements };
  const widgets = only ? only.flatMap((id) => WIDGETS.filter((w) => w.id === id)) : WIDGETS;
  const setup = widgets.filter((w) => w.configured && !w.configured(ctx));
  const shown = widgets.filter((w) => !setup.includes(w));
  if (!shown.length && !setup.length) return null;
  return (
    <div className={className}>
      {shown.map((w) => (
        <section key={w.id}>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">{w.title}</h2>
          {w.available(snapshot, now, ctx) ? (
            <div className="card overflow-hidden">{w.render(snapshot, now, courses, ctx)}</div>
          ) : (
            <div className="card flex items-start gap-2.5 px-4 py-3">
              <w.icon className="size-3.5 text-subtle mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-muted">{w.empty}</p>
            </div>
          )}
        </section>
      ))}
      {setup.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">Not set up yet</h2>
          <ul className="rounded-[10px] border border-dashed border-border divide-y divide-dashed divide-border">
            {setup.map((w) => (
              <li key={w.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <w.icon className="size-3.5 text-subtle mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12.5px] font-medium text-muted">{w.title}</div>
                  <div className="text-[11.5px] text-subtle">{w.setup}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
