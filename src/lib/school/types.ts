/**
 * Normalized school data model.
 *
 * Everything the UI renders comes from these types. Source-specific shapes
 * (d2l-cli JSON, fixtures, future sources) are converted into them by a
 * provider — UI components never see raw source output.
 *
 * Dates are ISO-8601 strings with an offset (or `Z`).
 */
import { z } from "zod";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");

export const CourseSchema = z.object({
  id: z.string(),
  /** Short code, e.g. "CSCI 2720". */
  code: z.string().nullable(),
  name: z.string(),
  term: z.string().nullable(),
  instructor: z.string().nullable(),
  /** Link to the course home in the LMS. */
  url: z.string().nullable(),
  startsAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  isActive: z.boolean(),
  /** False for non-academic enrollments (orientation, training modules). */
  isClass: z.boolean(),
});
export type Course = z.infer<typeof CourseSchema>;

export const AssignmentKind = z.enum(["assignment", "quiz", "discussion", "exam", "other"]);
export type AssignmentKind = z.infer<typeof AssignmentKind>;

/** What the source says about the student's work, independent of time. */
export const AssignmentStatus = z.enum(["not_submitted", "submitted", "graded", "unknown"]);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const AssignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  kind: AssignmentKind,
  dueAt: isoDate.nullable(),
  status: AssignmentStatus,
  pointsPossible: z.number().nullable(),
  pointsEarned: z.number().nullable(),
  url: z.string().nullable(),
  /** Finishing before this time earns an early bonus (WebAssign); null/absent when there's none. */
  earlyBonusAt: isoDate.nullable().optional(),
  /** Size of that bonus, in percent of the item. */
  earlyBonusPercent: z.number().nullable().optional(),
  /** The student marked it done on the dashboard (no LMS signal). */
  markedDone: z.boolean().optional(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const EventKind = z.enum(["class", "deadline", "exam", "event"]);
export type EventKind = z.infer<typeof EventKind>;

export const CalendarEventSchema = z.object({
  id: z.string(),
  courseId: z.string().nullable(),
  title: z.string(),
  kind: EventKind,
  startsAt: isoDate,
  endsAt: isoDate.nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  url: z.string().nullable(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const GradeSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  name: z.string(),
  pointsEarned: z.number().nullable(),
  pointsPossible: z.number().nullable(),
  /** 0–100 when the source provides or allows computing one. */
  percent: z.number().nullable(),
  /** Grade text exactly as displayed by the source (e.g. "A-", "92 %"). */
  display: z.string().nullable(),
  /** True for the course's overall/final calculated grade. */
  isCourseTotal: z.boolean(),
  postedAt: isoDate.nullable(),
  /** Gradebook category the item sits in (e.g. "Quizzes"), when the source has one. */
  category: z.string().nullable().optional(),
});
export type Grade = z.infer<typeof GradeSchema>;

/** Estimated current course grade, computed from the gradebook when no final grade is released. */
export const CourseStandingSchema = z.object({
  courseId: z.string(),
  /** 0–100 over graded work only (ungraded work isn't counted as zero). */
  percent: z.number(),
  /** Letter on the course's syllabus scale (or the default scale). */
  letter: z.string(),
  /** Roughly how much of the final grade (0–100) the estimate rests on. */
  gradedWeight: z.number(),
  /** Whether category weights came from the syllabus or the gradebook's own setup. */
  basis: z.enum(["syllabus", "gradebook"]),
  /** Syllabus the letter scale came from, or null for the default scale. */
  scaleSource: z.string().nullable(),
  /**
   * Per-category data for the calculator's "apply drops" mode (syllabus
   * categories only, when any drops lowest). Scores are 0–1 fractions.
   */
  whatIf: z
    .object({
      bonus: z.number(),
      categories: z.array(
        z.object({
          name: z.string(),
          weight: z.number(),
          dropLowest: z.number(),
          /** Items that count at term end (after drops); null when the syllabus doesn't say. */
          count: z.number().nullable(),
          scores: z.array(z.number()),
          /** Share of the category already graded, used when `count` is unknown. */
          gradedShare: z.number(),
        }),
      ),
    })
    .nullable()
    .optional(),
  /** Letter scale the estimate uses (letter → minimum percent). */
  scale: z.record(z.string(), z.number()).optional(),
  /** Percent of the final grade per gradebook category name (only when the whole category maps to one weight). */
  sectionWeights: z.record(z.string(), z.number()).default({}),
  /** Per-day estimate, oldest first; `items` are the scores entered that day (the chart's pins). */
  history: z.array(
    z.object({
      at: isoDate,
      percent: z.number(),
      items: z
        .array(
          z.union([
            z.object({ name: z.string(), earned: z.number().nullable(), possible: z.number().nullable() }),
            z.string().transform((name) => ({ name, earned: null, possible: null })),
          ]),
        )
        .default([]),
    }),
  ),
});
export type CourseStanding = z.infer<typeof CourseStandingSchema>;

export const AnnouncementSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  /** Plain text body (HTML stripped). */
  body: z.string().nullable(),
  postedAt: isoDate,
  url: z.string().nullable(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const SnapshotSchema = z.object({
  version: z.literal(1),
  source: z.enum(["fixture", "d2l", "canvas"]),
  /** When the underlying data was fetched from its source. */
  generatedAt: isoDate,
  courses: z.array(CourseSchema),
  assignments: z.array(AssignmentSchema),
  events: z.array(CalendarEventSchema),
  grades: z.array(GradeSchema),
  announcements: z.array(AnnouncementSchema),
  standings: z.array(CourseStandingSchema).default([]),
  /** Non-fatal problems hit while collecting/normalizing (e.g. one command failed). */
  warnings: z.array(z.string()),
});
export type SchoolSnapshot = z.infer<typeof SnapshotSchema>;

export type SnapshotResult =
  | { status: "ok"; snapshot: SchoolSnapshot }
  | { status: "empty"; source: SchoolSnapshot["source"]; reason: string }
  | { status: "error"; source: SchoolSnapshot["source"]; message: string };
