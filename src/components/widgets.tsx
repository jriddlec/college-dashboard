/**
 * Academic-overview widgets. Each declares when it has real data to show;
 * widgets without a source render as "not connected" rather than inventing
 * numbers. Current grades, trends and GPA are estimated from each course's
 * own gradebook weights and are labeled as estimates.
 */
import { ChartLine, GraduationCap, Megaphone, Sigma, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Course, CourseStanding, SchoolSnapshot } from "@/lib/school/types";
import { courseMap } from "@/lib/school/derive";
import { gpaSummary, type Transcript } from "@/lib/school/gpa";
import { formatShortDate, relative } from "@/lib/school/time";
import { CourseTag, hueStyle } from "./ui";

interface Context {
  transcript: Transcript | null;
}

interface Widget {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Why it's not shown yet, when it can't be. */
  pending: string;
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

const WIDGETS: Widget[] = [
  {
    id: "current-grades",
    title: "Current grades",
    icon: GraduationCap,
    pending: "Appears once a class has graded work in its LMS gradebook.",
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
                  <div className="text-[11px] text-subtle mt-0.5">
                    {fin ? "Released" : `Est. · ${st!.gradedWeight}% graded`}
                  </div>
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
    pending: "Appears when graded items include a release date.",
    available: (s, now) => s.grades.some((g) => !g.isCourseTotal && g.postedAt && now.getTime() - Date.parse(g.postedAt) < RECENT_DAYS * 864e5),
    render: (s, now, courses) => (
      <ul className="divide-y divide-border">
        {s.grades
          .filter((g) => !g.isCourseTotal && g.postedAt && now.getTime() - Date.parse(g.postedAt) < RECENT_DAYS * 864e5)
          .sort((a, b) => Date.parse(b.postedAt!) - Date.parse(a.postedAt!))
          .slice(0, 5)
          .map((g) => (
            <li key={g.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] leading-snug">{g.name}</span>
                <span className="text-[13px] tabular-nums font-medium whitespace-nowrap">
                  {g.pointsEarned != null && g.pointsPossible ? `${g.pointsEarned}/${g.pointsPossible}` : (g.display ?? `${g.percent}%`)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <CourseTag course={courses.get(g.courseId)} />
                <span className="text-[11.5px] text-subtle">{relative(g.postedAt!, now)}</span>
              </div>
            </li>
          ))}
      </ul>
    ),
  },
  {
    id: "announcements",
    title: "Announcements",
    icon: Megaphone,
    pending: "Appears when courses post announcements.",
    available: (s) => s.announcements.length > 0,
    render: (s, now, courses) => (
      <ul className="divide-y divide-border">
        {s.announcements.slice(0, 4).map((n) => (
          <li key={n.id} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              {n.url ? (
                <a href={n.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium leading-snug hover:underline underline-offset-2">
                  {n.title}
                </a>
              ) : (
                <span className="text-[13px] font-medium leading-snug">{n.title}</span>
              )}
              <span className="text-[11.5px] text-subtle whitespace-nowrap" title={formatShortDate(n.postedAt)}>
                {relative(n.postedAt, now)}
              </span>
            </div>
            <CourseTag course={courses.get(n.courseId)} />
            {n.body && <p className="text-[12.5px] text-muted mt-1 line-clamp-2">{n.body}</p>}
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "grade-trends",
    title: "Grade trends",
    icon: ChartLine,
    pending: "Needs graded work on at least two different days in a class.",
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
    pending: "Add transcript.json (GPA hours, quality points, in-progress credits) to the dashboard data dir.",
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

export function OverviewWidgets({ snapshot, now, transcript }: { snapshot: SchoolSnapshot; now: Date; transcript: Transcript | null }) {
  const courses = courseMap(snapshot.courses);
  const ctx: Context = { transcript };
  const ready = WIDGETS.filter((w) => w.available(snapshot, now, ctx));
  const pending = WIDGETS.filter((w) => !w.available(snapshot, now, ctx));
  return (
    <div className="space-y-6">
      {ready.map((w) => (
        <section key={w.id}>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">{w.title}</h2>
          <div className="card overflow-hidden">{w.render(snapshot, now, courses, ctx)}</div>
        </section>
      ))}
      {pending.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">Not connected yet</h2>
          <ul className="rounded-[10px] border border-dashed border-border divide-y divide-dashed divide-border">
            {pending.map((w) => (
              <li key={w.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <w.icon className="size-3.5 text-subtle mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12.5px] font-medium text-muted">{w.title}</div>
                  <div className="text-[11.5px] text-subtle">{w.pending}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
