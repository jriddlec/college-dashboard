/**
 * DEMO DATA ONLY. Used when SCHOOL_DATA_SOURCE=fixture (the dev default).
 *
 * Dates are generated relative to "now" so the UI always has something in
 * every bucket. Nothing here is real; the UI shows a "Demo data" banner
 * whenever this provider is active.
 */
import type { Assignment, CalendarEvent, Course, Grade, Announcement, SchoolSnapshot } from "../types";
import { addDays, dayKey, zonedIso } from "../time";
import { courseStanding } from "../standing";

/** Instant for wall-clock `hh:mm` on day `key` in the school timezone. */
const at = zonedIso;

const ELC = "https://lms.example.edu/d2l";

const courses: Course[] = [
  ["10001", "CSCI 2720", "Data Structures", "Dr. Avery Lin"],
  ["10002", "MATH 2260", "Calculus II for Science and Engineering", "Dr. Priya Raman"],
  ["10003", "CSCI 2610", "Discrete Mathematics for Computer Science", "Dr. Marcus Hale"],
  ["10004", "STAT 2000", "Introductory Statistics", "Dr. Elena Ortiz"],
  ["10005", "ENGL 1102", "English Composition II", "Prof. Sam Whitaker"],
].map(([id, code, name, instructor]) => ({
  id,
  code,
  name,
  term: "Fall 2026",
  instructor,
  url: `${ELC}/home/${id}`,
  startsAt: "2026-08-12T04:00:00.000Z",
  endsAt: "2026-12-16T05:00:00.000Z",
  isActive: true,
  isClass: true,
}));

type Seed = [courseId: string, title: string, kind: Assignment["kind"], dayOffset: number, time: string, status: Assignment["status"], possible: number | null, earned?: number];

const seeds: Seed[] = [
  ["10001", "Project 1: Linked List Implementation", "assignment", -9, "23:59", "graded", 100, 94],
  ["10002", "WebAssign 6.3 — Volumes by Slicing", "assignment", -6, "23:59", "graded", 20, 18],
  ["10005", "Rhetorical Analysis Draft", "assignment", -5, "23:59", "submitted", 50],
  ["10004", "Quiz 4: Sampling Distributions", "quiz", -3, "23:59", "graded", 10, 9],
  ["10003", "Problem Set 4", "assignment", -1, "23:59", "not_submitted", 40],
  ["10001", "Lab 5: Stacks and Queues", "assignment", 0, "23:59", "not_submitted", 25],
  ["10004", "Discussion: Real-world Sampling Bias", "discussion", 0, "17:00", "submitted", 5],
  ["10002", "WebAssign 7.1 — Integration by Parts", "assignment", 1, "23:59", "not_submitted", 20],
  ["10003", "Quiz 5: Induction", "quiz", 2, "12:00", "not_submitted", 15],
  ["10005", "Peer Review Responses", "discussion", 3, "23:59", "not_submitted", 10],
  ["10001", "Project 2: Binary Search Trees", "assignment", 6, "23:59", "not_submitted", 100],
  ["10002", "Midterm Exam 2", "exam", 9, "09:00", "not_submitted", 100],
  ["10004", "Homework 6", "assignment", 11, "23:59", "not_submitted", 30],
  ["10005", "Rhetorical Analysis Final", "assignment", 14, "23:59", "not_submitted", 100],
  ["10003", "Problem Set 5", "assignment", 16, "23:59", "not_submitted", 40],
  ["10001", "Reading Reflection (optional)", "other", 0, "", "not_submitted", null],
];

export function buildFixtureSnapshot(now = new Date()): SchoolSnapshot {
  const today = dayKey(now);
  const assignments: Assignment[] = seeds.map(([courseId, title, kind, off, time, status, possible, earned], i) => ({
    id: `fx-a${i + 1}`,
    courseId,
    title,
    kind,
    dueAt: time ? at(addDays(today, off), time) : null,
    status,
    pointsPossible: possible,
    pointsEarned: earned ?? null,
    url: `${ELC}/lms/dropbox/user/folder_submit_files.d2l?ou=${courseId}&db=${i + 1}`,
  }));

  const events: CalendarEvent[] = [];
  // Class meetings for the next 4 weeks (MWF / TR pattern).
  const meetings: [string, number[], string, string, string][] = [
    ["10001", [1, 3, 5], "10:20", "11:10", "Boyd 208"],
    ["10002", [1, 3, 5], "13:50", "14:40", "Boyd 323"],
    ["10003", [2, 4], "11:10", "12:25", "Boyd 306"],
    ["10004", [2, 4], "14:20", "15:35", "Brooks 101"],
    ["10005", [2, 4], "09:35", "10:50", "Park Hall 147"],
  ];
  for (let d = -14; d < 35; d++) {
    const key = addDays(today, d);
    const dow = new Date(key + "T00:00:00Z").getUTCDay();
    for (const [courseId, days, start, end, loc] of meetings) {
      if (!days.includes(dow)) continue;
      const c = courses.find((x) => x.id === courseId)!;
      events.push({
        id: `fx-class-${courseId}-${key}`,
        courseId,
        title: `${c.code} lecture`,
        kind: "class",
        startsAt: at(key, start),
        endsAt: at(key, end),
        allDay: false,
        location: loc,
        url: null,
      });
    }
  }
  events.push(
    { id: "fx-e1", courseId: "10002", title: "Midterm Exam 2", kind: "exam", startsAt: at(addDays(today, 9), "09:00"), endsAt: at(addDays(today, 9), "10:15"), allDay: false, location: "Boyd 323", url: null },
    { id: "fx-e2", courseId: null, title: "Fall Break — no classes", kind: "event", startsAt: at(addDays(today, 18), "00:00"), endsAt: null, allDay: true, location: null, url: null },
    { id: "fx-e3", courseId: "10001", title: "Office hours (extended)", kind: "event", startsAt: at(addDays(today, 1), "15:00"), endsAt: at(addDays(today, 1), "17:00"), allDay: false, location: "Boyd 612", url: null },
    { id: "fx-e4", courseId: null, title: "Course withdrawal deadline", kind: "deadline", startsAt: at(addDays(today, 22), "23:59"), endsAt: null, allDay: false, location: null, url: null },
  );

  const grades: Grade[] = [];
  for (const a of assignments) {
    if (a.status === "graded" && a.pointsEarned != null && a.pointsPossible) {
      grades.push({
        id: `fx-g-${a.id}`,
        courseId: a.courseId,
        name: a.title,
        pointsEarned: a.pointsEarned,
        pointsPossible: a.pointsPossible,
        percent: Math.round((a.pointsEarned / a.pointsPossible) * 1000) / 10,
        display: null,
        isCourseTotal: false,
        postedAt: new Date(Date.parse(a.dueAt!) + 2 * 86_400_000).toISOString(),
      });
    }
  }
  for (const [courseId, pct, letter] of [["10001", 93.4, "A"], ["10002", 86.1, "B"], ["10003", 89.7, "B+"], ["10004", 91.2, "A-"]] as const) {
    grades.push({ id: `fx-total-${courseId}`, courseId, name: "Final Calculated Grade", pointsEarned: null, pointsPossible: null, percent: pct, display: letter, isCourseTotal: true, postedAt: null });
  }

  const announcements: Announcement[] = [
    { id: "fx-n1", courseId: "10002", title: "Midterm 2 review session", body: "Review session Thursday 6–8 PM in Boyd 323. Practice exam is posted under Content → Exams.", postedAt: at(addDays(today, -1), "16:12"), url: null },
    { id: "fx-n2", courseId: "10001", title: "Project 2 starter code released", body: "Starter code and the autograder spec are now on GitHub Classroom. Read the README before starting.", postedAt: at(addDays(today, -2), "09:30"), url: null },
    { id: "fx-n3", courseId: "10005", title: "Conference sign-ups", body: "Sign up for a 15-minute conference slot about your rhetorical analysis draft.", postedAt: at(addDays(today, -4), "11:00"), url: null },
  ];

  const standings = courses
    .map((c) => {
      const items = grades
        .filter((g) => g.courseId === c.id && !g.isCourseTotal)
        .map((g) => ({ id: g.id, name: g.name, categoryId: null, categoryName: null, weight: null, excluded: false, earned: g.pointsEarned, possible: g.pointsPossible, at: g.postedAt }));
      return courseStanding(c.id, { system: "points", items, categories: [] });
    })
    .filter((s) => s !== null);

  return {
    version: 1,
    source: "fixture",
    generatedAt: new Date(now.getTime() - 12 * 60_000).toISOString(),
    courses,
    assignments,
    events,
    grades,
    announcements,
    standings,
    warnings: [],
  };
}
