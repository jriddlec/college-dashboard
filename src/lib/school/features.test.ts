import { describe, expect, it } from "vitest";
import { isDone, urgencyOf, weeklyLoad } from "./derive";
import { buildIcs } from "./ics";
import { examToken, upcomingExams } from "./exams";
import type { Assignment, CalendarEvent, Course } from "./types";

const base: Assignment = {
  id: "a",
  courseId: "c",
  title: "T",
  kind: "assignment",
  dueAt: null,
  status: "not_submitted",
  pointsPossible: null,
  pointsEarned: null,
  url: null,
};
const course: Course = { id: "c", code: "MATH 2260", name: "Calc II", term: null, instructor: null, url: null, startsAt: null, endsAt: null, isActive: true, isClass: true };

// Tuesday 2026-10-20 16:00 Eastern
const now = new Date("2026-10-20T20:00:00Z");

describe("marked done", () => {
  it("counts as done, so it leaves overdue", () => {
    const a = { ...base, dueAt: "2026-10-19T15:00:00Z" };
    expect(urgencyOf(a, now)).toBe("overdue");
    expect(isDone({ ...a, markedDone: true })).toBe(true);
    expect(urgencyOf({ ...a, markedDone: true }, now)).toBe("done");
  });
});

describe("weeklyLoad", () => {
  it("counts open deadlines per Monday week", () => {
    const items = [
      { ...base, id: "1", dueAt: "2026-10-21T15:00:00Z", pointsPossible: 10 },
      { ...base, id: "2", dueAt: "2026-10-25T15:00:00Z" },
      { ...base, id: "3", dueAt: "2026-10-27T15:00:00Z", courseId: "d" },
      { ...base, id: "4", dueAt: "2026-10-28T15:00:00Z", status: "submitted" as const },
      { ...base, id: "5", dueAt: "2026-10-19T15:00:00Z" },
    ];
    const w = weeklyLoad(items, now, 3);
    expect(w.map((x) => [x.week, x.total])).toEqual([
      ["2026-10-19", 2],
      ["2026-10-26", 1],
      ["2026-11-02", 0],
    ]);
    expect(w[0].points).toBe(10);
    expect(w[1].byCourse).toEqual([{ courseId: "d", count: 1 }]);
  });
});

describe("ics", () => {
  const ics = buildIcs(
    {
      courses: [course],
      assignments: [
        { ...base, id: "1", title: "HW 5.4, part 2; long", dueAt: "2026-10-22T03:00:00Z", earlyBonusAt: "2026-10-19T03:00:00Z", earlyBonusPercent: 10 },
        { ...base, id: "2", dueAt: "2026-10-23T03:00:00Z", status: "graded" },
        { ...base, id: "3", dueAt: "2026-10-24T03:00:00Z", markedDone: true },
      ],
      events: [
        { id: "e1", courseId: "c", title: "Lecture", kind: "class", startsAt: "2026-10-21T14:00:00Z", endsAt: null, allDay: false, location: null, url: null },
        { id: "e2", courseId: "c", title: "Test 3", kind: "exam", startsAt: "2026-10-22T04:00:00Z", endsAt: null, allDay: true, location: null, url: null },
      ] satisfies CalendarEvent[],
    },
    { name: "School", now, alarms: [1440, 120], classes: false },
  );
  it("has open deadlines with escaped text and alarms, not done items or classes", () => {
    expect(ics).toContain("SUMMARY:[MATH 2260] Due: HW 5.4\\, part 2\\; long");
    expect(ics).toContain("DTSTART:20261022T030000Z");
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics).not.toContain("UID:a-2@");
    expect(ics).not.toContain("UID:a-3@");
    expect(ics).not.toContain("Lecture");
    // Bonus cutoff already passed: not listed.
    expect(ics).not.toContain("Early bonus");
  });
  it("writes all-day events as dates", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261022");
    expect(ics).toContain("DTEND;VALUE=DATE:20261023");
  });
  it("uses CRLF and folds long lines", () => {
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});

describe("exams", () => {
  it("normalizes exam names", () => {
    expect(examToken("Test 3 (5.1–5.6) (syllabus)")).toBe("test 3");
    expect(examToken("Test 3 Material")).toBe("test 3");
    expect(examToken("Midterm Exam (Exam 1)")).toBe("midterm");
    expect(examToken("Midterm")).toBe("midterm");
    expect(examToken("Final Test")).toBe("final");
    expect(examToken("Lab 4")).toBeNull();
  });
  it("links an upcoming exam to its prep folder", () => {
    const a = { ...base, id: "x", kind: "exam" as const, title: "Test 3 (5.1–5.6)", dueAt: "2026-10-22T15:35:00Z" };
    const prep = [
      { courseId: "c", slug: "math2260", groupId: "MATH2260 Notes/_Test 2 Material", title: "Test 2 Material" },
      { courseId: "c", slug: "math2260", groupId: "MATH2260 Notes/_Test 3 Material", title: "Test 3 Material" },
    ];
    const [x] = upcomingExams({ assignments: [a], events: [] }, prep, () => "math2260", now);
    expect(x.prep).toEqual({ href: "/library/math2260?open=MATH2260%20Notes%2F_Test%203%20Material", label: "Test 3 Material", matched: true });
    const [y] = upcomingExams({ assignments: [{ ...a, title: "Oral Test" }], events: [] }, prep, () => "math2260", now);
    expect(y.prep).toEqual({ href: "/library/math2260", label: "Library", matched: false });
  });
});

import { neededWithDrops, projectWithDrops, type WhatIf } from "./whatif";

describe("what-if with drops", () => {
  // Tests: 4 given, best 3 count (74 and 55 so far); a final worth 50, not taken yet.
  const m: WhatIf = {
    bonus: 0,
    categories: [
      { name: "Tests", weight: 50, dropLowest: 1, count: 3, scores: [0.74, 0.55], gradedShare: 1 },
      { name: "Final", weight: 50, dropLowest: 0, count: 1, scores: [], gradedShare: 0 },
    ],
  };
  it("drops the lowest test once the remaining ones beat it", () => {
    // 90 on the rest: tests keep 90, 90, 74 → 84.67; final 90.
    expect(projectWithDrops(m, 90)).toBeCloseTo((50 * ((0.9 + 0.9 + 0.74) / 3) + 50 * 0.9) / 100 * 100, 6);
    // 40 on the rest: tests keep 74, 55, 40.
    expect(projectWithDrops(m, 40)).toBeCloseTo((50 * ((0.74 + 0.55 + 0.4) / 3) + 50 * 0.4), 6);
  });
  it("solves for the needed average", () => {
    const n = neededWithDrops(m, 80);
    expect(projectWithDrops(m, n)).toBeCloseTo(80, 3);
    expect(neededWithDrops(m, 0)).toBe(-Infinity);
    expect(neededWithDrops({ ...m, categories: [{ ...m.categories[0], count: 2, dropLowest: 0 }] }, 90)).toBe(Infinity);
  });
  it("blends uncounted categories by graded share", () => {
    const u: WhatIf = { bonus: 1, categories: [{ name: "HW", weight: 10, dropLowest: 1, count: null, scores: [0.2, 1, 0.8], gradedShare: 0.5 }] };
    // Drop 0.2 → 0.9 kept average; half graded.
    expect(projectWithDrops(u, 70)).toBeCloseTo((0.9 * 0.5 + 0.7 * 0.5) * 100 + 1, 6);
  });
});

import { webAssignFor } from "./webassign";

describe("webassign links", () => {
  it("links rows with a dep straight to the assignment, others to the course url", () => {
    const [a, b] = webAssignFor("c", {
      url: "https://lms.example.edu/webassign",
      assignments: [
        ["5.4 Comparison Tests", "Homework", "2026-10-20T23:00:00-04:00", null, 10, null, 40500090],
        ["5.6 Ratio Test", "Homework", "2026-10-21T23:00:00-04:00", null, 10],
      ],
    });
    expect(a.url).toBe("https://www.webassign.net/web/Student/Assignment-Responses/last?dep=40500090");
    expect(b.url).toBe("https://lms.example.edu/webassign");
  });
});

describe("grade targets", () => {
  it("needs for keeping the letter and the next one up (linear)", async () => {
    const { gradeTargets, targetLine } = await import("./targets");
    const st = { courseId: "c", percent: 85, letter: "B", gradedWeight: 50, basis: "gradebook" as const, scaleSource: null, scale: { A: 90, B: 80, C: 70 }, sectionWeights: {}, history: [] };
    // keep B: (80·100 − 85·50)/50 = 75; A: (90·100 − 85·50)/50 = 95
    expect(gradeTargets(st)).toEqual({ keep: { letter: "B", need: 75 }, next: { letter: "A", need: 95 } });
    expect(targetLine(st)).toBe("Keep B: 75% · A: 95%");
    expect(targetLine({ ...st, percent: 100, letter: "A", gradedWeight: 95 })).toBe("A locked in");
  });
});

describe("class schedule", () => {
  it("turns weekly meetings into class events, skipping breaks", async () => {
    const { scheduleEvents } = await import("./schedule");
    const courses = [{ id: "m", code: "MATH 2260", name: "Calc", term: null, instructor: null, url: null, startsAt: null, endsAt: null, isActive: true, isClass: true }];
    const events = scheduleEvents({ courses }, {
      term: { start: "2026-10-19", end: "2026-10-25", breaks: [["2026-10-22", "2026-10-22"]] },
      courses: { "MATH 2260": [{ days: "TR", start: "11:35", end: "12:55", location: "Boyd 203", label: "Lecture" }], "NOPE 1": [{ days: "M", start: "9:00", end: "10:00" }] },
    });
    expect(events.map((e) => [e.title, e.startsAt, e.endsAt, e.location])).toEqual([["MATH 2260 Lecture", "2026-10-20T15:35:00.000Z", "2026-10-20T16:55:00.000Z", "Boyd 203"]]);
    expect(events[0].kind).toBe("class");
  });
});

describe("reminders", () => {
  it("picks open work due within a day and exams within two, once each, outside quiet hours", async () => {
    const { dueReminders, isQuiet } = await import("@/lib/reminders");
    const course = { id: "c", code: "MATH 2260", name: "Calc", term: null, instructor: null, url: null, startsAt: null, endsAt: null, isActive: true, isClass: true };
    const a = (id: string, dueAt: string, extra: Partial<Assignment> = {}): Assignment => ({ id, courseId: "c", title: `Item ${id}`, kind: "assignment", dueAt, status: "not_submitted", pointsPossible: null, pointsEarned: null, url: null, ...extra });
    const s = {
      version: 1 as const, source: "fixture" as const, generatedAt: "2026-10-21T12:00:00Z", courses: [course], grades: [], announcements: [], standings: [], warnings: [],
      assignments: [a("soon", "2026-10-22T03:59:00Z"), a("done", "2026-10-22T03:59:00Z", { status: "submitted" }), a("later", "2026-10-25T03:59:00Z"), a("t3", "2026-10-22T15:35:00Z", { kind: "exam", title: "Test 3" })],
      events: [],
    };
    const o = { dueHours: 24, examHours: 48, quiet: [22, 7] as [number, number] };
    const { alerts, keys } = dueReminders(s, new Date("2026-10-21T16:00:00Z"), new Set(), o);
    expect(alerts.map((x) => x.title)).toEqual(["Due soon: Item soon", "Exam Thu, Oct 22: Test 3"]);
    expect(dueReminders(s, new Date("2026-10-21T16:00:00Z"), new Set(keys), o).alerts).toEqual([]);
    expect([isQuiet(23, o.quiet), isQuiet(3, o.quiet), isQuiet(7, o.quiet), isQuiet(12, [9, 17])]).toEqual([true, true, false, true]);
  });
});
