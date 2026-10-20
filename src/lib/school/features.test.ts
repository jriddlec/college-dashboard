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
