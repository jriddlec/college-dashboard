import { ArrowUpRight, Check } from "lucide-react";
import clsx from "clsx";
import type { Assignment, Course } from "@/lib/school/types";
import { urgencyOf, type Urgency } from "@/lib/school/derive";
import { formatTime, formatWeekdayDate, relative, dayKey } from "@/lib/school/time";
import { Badge, CourseTag, hueStyle, type Tone } from "./ui";
import { MarkDoneToggle } from "./mark-done";

const URGENCY: Record<Urgency, { label: string; tone: Tone } | null> = {
  overdue: { label: "Overdue", tone: "danger" },
  past: { label: "Past due", tone: "neutral" },
  today: { label: "Due today", tone: "warn" },
  soon: { label: "Soon", tone: "info" },
  week: null,
  later: null,
  undated: null,
  done: null,
};

const STATUS_LABEL: Record<Assignment["status"], string> = {
  submitted: "Submitted",
  graded: "Graded",
  // Only reachable as "done" when marked by hand.
  not_submitted: "",
  unknown: "",
};

const KIND_LABEL: Record<Assignment["kind"], string | null> = {
  assignment: null,
  quiz: "Quiz",
  discussion: "Discussion",
  exam: "Exam",
  other: null,
};

export function AssignmentRow({
  a,
  course,
  now,
  showCourse = true,
  dateStyle = "time",
  action,
}: {
  a: Assignment;
  course: Course | undefined;
  now: Date;
  showCourse?: boolean;
  /** "time" for grouped lists (group header already says the day), "full" otherwise. */
  dateStyle?: "time" | "full";
  /** Optional control shown at the end of the row (e.g. hide). */
  action?: React.ReactNode;
}) {
  const u = urgencyOf(a, now);
  const badge = URGENCY[u];
  const done = u === "done";
  const sameDay = a.dueAt && dayKey(a.dueAt) === dayKey(now);
  const when = a.dueAt
    ? dateStyle === "time" && (sameDay || u !== "overdue")
      ? formatTime(a.dueAt)
      : `${formatWeekdayDate(a.dueAt)}, ${formatTime(a.dueAt)}`
    : "No due date";

  const Title = a.url ? "a" : "span";
  return (
    <li className="group flex items-start gap-3 px-4 py-3 course-bar" style={hueStyle(a.courseId)}>
      {a.status === "submitted" || a.status === "graded" ? (
        <span className="mt-0.5 size-4 shrink-0 rounded-full border grid place-items-center bg-ok border-ok text-white" aria-label="Completed">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      ) : (
        <MarkDoneToggle id={a.id} marked={!!a.markedDone} overdue={u === "overdue"} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <Title
            {...(a.url ? { href: a.url, target: "_blank", rel: "noreferrer" } : {})}
            className={clsx("text-[14px] leading-snug font-medium", done && "text-muted line-through decoration-border-strong", a.url && "hover:underline underline-offset-2")}
          >
            {a.title}
            {a.url && <ArrowUpRight className="inline size-3 ml-0.5 text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />}
          </Title>
          <span className={clsx("text-[12.5px] tabular-nums whitespace-nowrap", u === "overdue" ? "text-danger" : "text-muted")}>{when}</span>
          {action}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
          {showCourse && <CourseTag course={course} />}
          {KIND_LABEL[a.kind] && <Badge>{KIND_LABEL[a.kind]}</Badge>}
          {badge && <Badge tone={badge.tone}>{badge.label}{a.dueAt && u !== "today" ? ` · ${relative(a.dueAt, now)}` : ""}</Badge>}
          {u === "today" && a.dueAt && <span className="text-[11.5px] text-warn">{relative(a.dueAt, now)}</span>}
          {done && <Badge tone="ok">{STATUS_LABEL[a.status] || "Marked done"}</Badge>}
          {done && a.pointsEarned != null && a.pointsPossible ? (
            <span className="text-[11.5px] text-muted tabular-nums">
              {a.pointsEarned}/{a.pointsPossible}
            </span>
          ) : null}
          {u === "past" && <span className="text-[11.5px] text-subtle">Submission status not available</span>}
        </div>
      </div>
    </li>
  );
}

export function AssignmentList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={clsx("card divide-y divide-border overflow-hidden", className)}>{children}</ul>;
}
