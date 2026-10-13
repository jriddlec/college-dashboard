import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SnapshotSchema } from "../types";
import { normalizeCanvas, type CanvasRaw } from "./normalize";

// Hand-written Canvas API responses (see fixtures/), in the layout canvas_sync.py writes.
const dir = path.join(__dirname, "fixtures");
const read = (...p: string[]) => JSON.parse(readFileSync(path.join(dir, ...p), "utf8"));

function raw(): CanvasRaw {
  const perCourse: CanvasRaw["perCourse"] = {};
  for (const id of readdirSync(path.join(dir, "courses"))) {
    perCourse[id] = { assignments: read("courses", id, "assignments.json"), assignmentGroups: read("courses", id, "assignment-groups.json") };
  }
  return { ...read("manifest.json"), courses: read("courses.json"), announcements: read("announcements.json"), calendar: read("calendar.json"), perCourse };
}

describe("canvas normalizer", () => {
  const snap = normalizeCanvas(raw());

  it("produces a valid snapshot", () => {
    expect(SnapshotSchema.parse(snap).source).toBe("canvas");
    expect(snap.generatedAt).toBe("2026-10-13T12:00:00.000Z");
    expect(snap.warnings).toEqual([]);
  });

  it("reads courses: code, clean name, term, teacher, non-class enrollments", () => {
    expect(snap.courses.map((c) => [c.id, c.code, c.name, c.term, c.instructor, c.isClass])).toEqual([
      ["101", "CHEM 1211", "General Chemistry I", "Fall 2026", "Dana Brooks", true],
      ["202", "HIST 2111", "US History to 1865", "Fall 2026", "Prof. Lee Morgan", true],
      ["303", null, "Canvas Student Orientation", null, null, false],
    ]);
    expect(snap.courses[0].url).toMatch(/\/courses\/101$/);
  });

  it("maps assignment kinds and submission states", () => {
    const by = Object.fromEntries(snap.assignments.map((a) => [a.title, [a.kind, a.status, a.pointsEarned]]));
    expect(by["Lab 1: Measurement"]).toEqual(["assignment", "graded", 18]);
    expect(by["Quiz 1: Units and Sig Figs"]).toEqual(["quiz", "graded", 8]);
    expect(by["Lab 2: Density"]).toEqual(["assignment", "not_submitted", null]);
    expect(by["Discussion: Lab safety"]).toEqual(["discussion", "submitted", null]);
    expect(by["Midterm Exam"]).toEqual(["exam", "unknown", null]); // on paper: Canvas can't know
    expect(by["Lab 0: Safety contract"]).toEqual(["assignment", "graded", null]); // excused
    expect(by["Final Exam"]).toEqual(["exam", "unknown", null]); // no submission object
    expect(by["Reading responses"]).toBeUndefined(); // not graded
    expect(snap.assignments).toHaveLength(14);
  });

  it("keeps scored items; Canvas's running total isn't a released final grade", () => {
    expect(snap.grades).toHaveLength(7);
    expect(snap.grades.some((g) => g.isCourseTotal)).toBe(false);
    const lab = snap.grades.find((g) => g.name === "Lab 1: Measurement")!;
    expect(lab).toMatchObject({ percent: 90, category: "Labs", postedAt: "2026-09-06T15:00:00.000Z" });
  });

  it("estimates weighted groups with drop-lowest, and points courses", () => {
    const chem = snap.standings.find((s) => s.courseId === "101")!;
    // Labs 18/20; Quizzes 8,4,10 drop lowest = 18/20; Exams none yet; extra credit and excused left out.
    expect(chem).toMatchObject({ percent: 90, letter: "A-", gradedWeight: 32, basis: "gradebook" });
    // The extra-credit score gets a pin (Oct 1) but no weight, as in D2L.
    expect(chem.history.map((h) => h.at.slice(0, 10))).toEqual(["2026-09-06", "2026-09-07", "2026-09-21", "2026-10-01", "2026-10-05"]);
    const hist = snap.standings.find((s) => s.courseId === "202")!;
    expect(hist).toMatchObject({ percent: 91.8, letter: "A-" });
  });

  it("applies syllabus weights by course code", () => {
    const s = normalizeCanvas(raw(), {
      "HIST 2111": { source: "Syllabus", categories: [{ name: "Essays", weight: 60, match: "essay" }, { name: "Quizzes", weight: 40, match: "quiz" }] },
    }).standings.find((x) => x.courseId === "202")!;
    expect(s).toMatchObject({ percent: 91.2, basis: "syllabus" }); // 0.6*92 + 0.4*90
  });

  it("reads events and announcements", () => {
    expect(snap.events.map((e) => [e.title, e.courseId, e.allDay, e.kind])).toEqual([
      ["Midterm review session", "101", false, "event"],
      ["No class: fall break", "202", true, "event"],
    ]);
    expect(snap.announcements.map((n) => [n.courseId, n.title, n.body])).toEqual([
      ["101", "Lab 2 moved to Thursday", "Lab 2 will meet Thursday this week."],
      ["202", "Essay 1 grades posted", "Feedback is in the comments. See me in office hours."],
    ]);
  });

  it("reports failed sync steps and skips broken records", () => {
    const r = raw();
    r.failures = ["calendar"];
    r.courses = [...(r.courses as unknown[]), { id: 404 }];
    const s = normalizeCanvas(r);
    expect(s.warnings).toEqual(["Sync step failed: calendar", "Skipped a Canvas course without an id or name."]);
    expect(s.courses).toHaveLength(3);
  });
});
