import { describe, expect, it } from "vitest";
import { normalizeD2l, prettyCode, list, date } from "./d2l/normalize";
import { filterAssignments, groupForDate, urgencyOf, agenda } from "./derive";
import { SnapshotSchema, type Assignment } from "./types";
import { buildFixtureSnapshot } from "./providers/fixture";
import { gpaSummary, letterFor } from "./gpa";

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

// 2026-10-05 16:00 Eastern (EDT, UTC-4)
const now = new Date("2026-10-05T20:00:00Z");

describe("derive", () => {
  it("buckets by school-timezone day, not UTC day", () => {
    // 11:30 PM Eastern on Oct 5 is already Oct 6 in UTC.
    expect(groupForDate("2026-10-06T03:30:00Z", now)).toBe("today");
    expect(groupForDate("2026-10-06T15:00:00Z", now)).toBe("tomorrow");
    expect(groupForDate("2026-10-11T15:00:00Z", now)).toBe("week");
    expect(groupForDate("2026-10-12T15:00:00Z", now)).toBe("next");
    expect(groupForDate("2026-10-20T15:00:00Z", now)).toBe("week:2026-10-19");
    expect(groupForDate("2026-10-04T15:00:00Z", now)).toBe("overdue");
    expect(groupForDate(null, now)).toBe("undated");
  });

  it("computes urgency with completion taking priority", () => {
    expect(urgencyOf({ ...base, dueAt: "2026-10-04T00:00:00Z" }, now)).toBe("overdue");
    expect(urgencyOf({ ...base, dueAt: "2026-10-04T00:00:00Z", status: "submitted" }, now)).toBe("done");
    expect(urgencyOf({ ...base, dueAt: "2026-10-06T03:59:00Z" }, now)).toBe("today");
    expect(urgencyOf(base, now)).toBe("undated");
  });

  it("filters by status and course", () => {
    const items: Assignment[] = [
      { ...base, id: "1", dueAt: "2026-10-04T00:00:00Z" },
      { ...base, id: "2", dueAt: "2026-10-08T00:00:00Z" },
      { ...base, id: "3", dueAt: "2026-10-01T00:00:00Z", status: "graded" },
      { ...base, id: "4", courseId: "other", dueAt: "2026-10-08T00:00:00Z" },
    ];
    expect(filterAssignments(items, "overdue", now).map((a) => a.id)).toEqual(["1"]);
    expect(filterAssignments(items, "upcoming", now, "c").map((a) => a.id)).toEqual(["2"]);
    expect(filterAssignments(items, "completed", now).map((a) => a.id)).toEqual(["3"]);
    expect(filterAssignments(items, "all", now)).toHaveLength(4);
  });

  it("drops calendar events that duplicate an assignment deadline", () => {
    const items = agenda({
      assignments: [{ ...base, id: "x", title: "Lab 5", dueAt: "2026-10-06T03:59:00Z" }],
      events: [
        { id: "e", courseId: "c", title: "Lab 5 - Due", kind: "deadline", startsAt: "2026-10-06T03:59:00Z", endsAt: null, allDay: false, location: null, url: null },
        { id: "k", courseId: "c", title: "Lecture", kind: "class", startsAt: "2026-10-05T14:00:00Z", endsAt: null, allDay: false, location: null, url: null },
      ],
    });
    expect(items.map((i) => i.type)).toEqual(["event", "assignment"]);
  });
});

describe("fixtures", () => {
  it("produce a schema-valid snapshot", () => {
    expect(SnapshotSchema.safeParse(buildFixtureSnapshot(now)).success).toBe(true);
  });
});

describe("d2l normalizer", () => {
  it("handles helper edge cases", () => {
    expect(prettyCode("CSCI2720_41234_2026_08", "Data Structures")).toBe("CSCI 2720");
    expect(prettyCode(null, "MATH 2260 (Fall 2026)")).toBe("MATH 2260");
    expect(list({ Items: [1, 2] })).toEqual([1, 2]);
    expect(list({ Objects: [1] })).toEqual([1]);
    expect(date("2026-10-05T12:00:00.000")).toBe("2026-10-05T12:00:00.000Z");
    expect(date("garbage")).toBeNull();
  });

  it("normalizes Valence-style output and reports failures", () => {
    const snap = normalizeD2l({
      fetchedAt: "2026-10-05T19:00:00Z",
      failures: ["news"],
      courses: {
        Items: [
          { OrgUnit: { Id: 41234, Name: "CSCI 2720 Data Structures (Fall 2026)", Code: "CSCI2720_41234_2026_08", Type: { Code: "Course Offering" } }, Access: { IsActive: true, CanAccess: true, StartDate: "2026-08-12T04:00:00.000Z" } },
          { OrgUnit: { Id: 9, Name: "University of Georgia", Type: { Code: "Organization" } }, Access: { IsActive: true, CanAccess: true } },
        ],
      },
      due: [{ Name: "Quiz 5", OrgUnitId: 41234, DueDate: "2026-10-07T16:00:00.000Z", Type: "Quiz" }],
      overdue: [],
      calendar: [{ CalendarEventId: 77, Title: "Midterm Exam", StartDateTime: "2026-10-14T13:00:00.000Z", EndDateTime: "2026-10-14T14:15:00.000Z", OrgUnitId: 41234, IsAllDayEvent: false }],
      perCourse: {
        "41234": {
          assignments: [
            { Id: 5, Name: "Lab 5", DueDate: "2026-10-06T03:59:00.000Z", Assessment: { ScoreDenominator: 25 } },
            { Id: 4, Name: "Lab 4", DueDate: "2026-09-29T03:59:00.000Z", Submitted: true },
          ],
          grades: [
            { GradeObjectIdentifier: "1", GradeObjectName: "Project 1", PointsNumerator: 94, PointsDenominator: 100, DisplayedGrade: "94 %", LastModified: "2026-09-30T12:00:00Z" },
            { GradeObjectIdentifier: "2", GradeObjectName: "Lab 6", PointsNumerator: null, PointsDenominator: 25 },
          ],
          news: [{ Id: 3, Title: "Welcome", Body: { Html: "<p>Hello&nbsp;<b>class</b></p>" }, StartDate: "2026-08-12T12:00:00Z" }],
        },
      },
    });

    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.courses).toHaveLength(1);
    expect(snap.courses[0]).toMatchObject({ id: "41234", code: "CSCI 2720", name: "Data Structures", term: "Fall 2026" });
    expect(snap.assignments.map((a) => a.title).sort()).toEqual(["Lab 4", "Lab 5", "Quiz 5"]);
    expect(snap.assignments.find((a) => a.title === "Lab 4")?.status).toBe("submitted");
    expect(snap.assignments.find((a) => a.title === "Quiz 5")).toMatchObject({ kind: "quiz", status: "not_submitted" });
    expect(snap.assignments.find((a) => a.title === "Lab 5")?.pointsPossible).toBe(25);
    expect(snap.events[0]).toMatchObject({ kind: "exam", courseId: "41234" });
    expect(snap.grades).toHaveLength(1); // ungraded Lab 6 skipped
    expect(snap.grades[0]).toMatchObject({ percent: 94, display: "94 %" });
    expect(snap.announcements[0].body).toBe("Hello class");
    expect(snap.warnings).toContain("Sync step failed: news");
  });

  it("lists quizzes that only exist in the course's quiz list", () => {
    const snap = normalizeD2l({
      fetchedAt: "2026-10-20T00:00:00Z",
      failures: [],
      courses: [{ OrgUnit: { Id: 7, Name: "CSCI1301 Intro", Code: "CSCI1301", Type: { Code: "Course Offering" } } }],
      perCourse: {
        "7": {
          quizzes: [
            { QuizId: 1, Name: "Quiz04 (In-Class Only)", IsActive: true, GradeItemId: 50, StartDate: "2026-10-01T19:30:00.000Z", DueDate: null, EndDate: null },
            { QuizId: 2, Name: "Quiz05 (In-Class Only)", IsActive: true, GradeItemId: null, StartDate: "2026-10-22T19:30:00.000Z", DueDate: null, EndDate: null },
            { QuizId: 3, Name: "Practice Quiz04 (Multiple Attempts; Not for Grade)", IsActive: true, StartDate: "2026-10-02T09:00:00.000Z" },
            { QuizId: 4, Name: "Hidden quiz", IsActive: false, DueDate: "2026-10-30T00:00:00.000Z" },
          ],
          grades: [{ GradeObjectIdentifier: "50", GradeObjectName: "Quiz04", PointsNumerator: 9, PointsDenominator: 10 }],
        },
      },
    });
    const byTitle = Object.fromEntries(snap.assignments.map((a) => [a.title, a]));
    expect(Object.keys(byTitle).sort()).toEqual(["Quiz04 (In-Class Only)", "Quiz05 (In-Class Only)"]);
    expect(byTitle["Quiz05 (In-Class Only)"]).toMatchObject({ kind: "quiz", dueAt: "2026-10-22T19:30:00.000Z", status: "unknown" });
    expect(byTitle["Quiz04 (In-Class Only)"]).toMatchObject({ status: "graded", pointsEarned: 9 });
  });

  it("handles real Brightspace shapes (d2l-cli 0.3.0)", () => {
    const course = (id: number, name: string, code: string) => ({
      OrgUnit: { Id: id, Type: { Id: 3, Code: "Course Offering" }, Name: name, Code: code, HomeUrl: `https://lms.example.edu/d2l/home/${id}` },
      Access: { IsActive: true, CanAccess: true, StartDate: "2026-08-17T01:00:00.000Z", EndDate: "2026-12-29T05:00:00.000Z" },
    });
    const snap = normalizeD2l({
      fetchedAt: "2026-10-05T17:18:36+00:00",
      failures: [],
      courses: [
        course(611001, "XLS GP_BIOL1107_MC Principles of Biology I Fall 2026", "CO.180.BIOL1107.XLS.GP_BIOL1107_MC.20272"),
        course(611002, "SPAN1001 Elementary Spanish I Fall 2026 12345", "CO.180.SPAN1001.12345.20272"),
        course(611003, "Undergraduate Orientation AY 26-27", "ay2627.orientation.undergraduate.main"),
      ],
      due: [
        { OrgUnitId: "611002", ItemId: 1, ItemName: "HW 3", ActivityType: 4, DateCompleted: "2026-10-05T16:33:22.933Z", DueDate: "2026-10-06T03:00:00.000Z", ItemUrl: "https://lms.example.edu/d2l/le/content/611002/viewContent/1/View" },
        { OrgUnitId: "611001", ItemId: 2, ItemName: "Lab07", ActivityType: 3, DateCompleted: null, DueDate: "2026-10-11T21:00:00.000Z", ItemUrl: "https://x/lab07" },
      ],
      overdue: [],
      news: [
        { Resource: { Id: 9, Title: "Midterm tomorrow", Body: { Text: "Bring a pencil", Html: "" }, StartDate: "2026-10-05T13:57:00.000Z", IsHidden: false }, Type: "News", Metadata: { WebViewUrl: "/d2l/le/news/611001/9/view" } },
      ],
      finalGrades: [],
      perCourse: {
        "611001": {
          assignments: [
            { Id: 10, Name: "Lab06", DueDate: "2026-10-02T21:00:00.000Z", DropboxType: 1, IsHidden: false, TotalUsersWithSubmissions: -1, GradeItemId: 500, Assessment: { ScoreDenominator: 70 } },
            { Id: 11, Name: "Lab05", DueDate: "2026-09-25T21:00:00.000Z", DropboxType: 1, IsHidden: false, TotalUsersWithSubmissions: -1, GradeItemId: 501, Assessment: { ScoreDenominator: 67 } },
            { Id: 12, Name: "Lab07", DueDate: "2026-10-11T21:00:00.000Z", DropboxType: 1, IsHidden: false, GradeItemId: 502, Assessment: { ScoreDenominator: 70 } },
            { Id: 13, Name: "Midterm Exam (In-Class Only)", DueDate: "2026-10-06T20:15:00.000Z", DropboxType: 1, IsHidden: false, GradeItemId: 503 },
          ],
          grades: [
            { GradeObjectIdentifier: "501", GradeObjectName: "Lab05 Code", PointsNumerator: 53.6, PointsDenominator: 67, GradeObjectTypeName: "Numeric", DisplayedGrade: "53.6 / 67", LastModified: "2026-10-01T08:54:30.050Z", ReleasedDate: null },
            { GradeObjectIdentifier: "600", GradeObjectName: "Labs", PointsNumerator: 36.2, PointsDenominator: 100, GradeObjectTypeName: "Category", DisplayedGrade: null, LastModified: "2026-10-01T11:31:59Z" },
            { GradeObjectIdentifier: "601", GradeObjectName: "Lab05 Calculated", PointsNumerator: 86.6, PointsDenominator: 100, GradeObjectTypeName: "Calculated", DisplayedGrade: "86.6 %", LastModified: "2026-10-01T11:31:59Z" },
          ],
        },
      },
    });
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
    const byId = Object.fromEntries(snap.courses.map((c) => [c.id, c]));
    expect(byId["611001"]).toMatchObject({ code: "BIOL 1107", name: "Principles of Biology I", term: "Fall 2026", isClass: true });
    expect(byId["611002"]).toMatchObject({ code: "SPAN 1001", name: "Elementary Spanish I", isClass: true });
    expect(byId["611003"]).toMatchObject({ isClass: false, name: "Undergraduate Orientation AY 26-27" });

    const a = Object.fromEntries(snap.assignments.map((x) => [x.title, x]));
    expect(a["Lab05"]).toMatchObject({ status: "graded", pointsEarned: 53.6 }); // via GradeItemId
    expect(a["Lab06"].status).toBe("unknown"); // dropbox hides submission state
    expect(urgencyOf(a["Lab06"], now)).toBe("past"); // not falsely "overdue"
    expect(a["Lab07"]).toMatchObject({ status: "not_submitted", kind: "assignment" }); // merged with due item
    expect(a["HW 3"]).toMatchObject({ status: "submitted", kind: "quiz" });
    expect(a["Midterm Exam (In-Class Only)"].kind).toBe("exam");
    expect(snap.assignments.filter((x) => x.title === "Lab07")).toHaveLength(1);

    expect(snap.grades.map((g) => g.name)).toEqual(["Lab05 Code"]); // Category/Calculated rows dropped
    expect(snap.grades.some((g) => g.isCourseTotal)).toBe(false);
    expect(snap.announcements[0]).toMatchObject({ courseId: "611001", body: "Bring a pencil", url: "https://lms.example.edu/d2l/le/news/611001/9/view" });
  });

  it("reads dropbox submission state from submissions.json", () => {
    const folder = (Id: number, Name: string, extra: object = {}) => ({ Id, Name, DueDate: "2026-10-06T03:59:59.000Z", DropboxType: 2, IsHidden: false, Assessment: { ScoreDenominator: 1 }, ...extra });
    const entity = (Status: number, files: number, Feedback: object | null = null) => ({
      Entity: { EntityId: 1, EntityType: "User" },
      Status,
      Feedback,
      Submissions: Array.from({ length: files }, (_, i) => ({ Id: i, SubmissionDate: "2026-10-05T13:27:51.340Z", Files: [] })),
      CompletionDate: files ? "2026-10-05T13:27:51.340Z" : null,
    });
    const snap = normalizeD2l({
      fetchedAt: "2026-10-05T19:00:00Z",
      failures: [],
      courses: [{ OrgUnit: { Id: 611004, Name: "XLS AS_PHIL2030 Ethics and Society Fall 2026", Code: "CO.180.PHIL2030.XLS.AS_PHIL2030.20272", Type: { Code: "Course Offering" } }, Access: { IsActive: true, CanAccess: true } }],
      due: [{ OrgUnitId: "611004", ItemId: 9001, ItemName: "A&P 10/5", ActivityType: 3, DateCompleted: null, DueDate: "2026-10-06T03:59:59.000Z" }],
      perCourse: {
        "611004": {
          assignments: [
            folder(9001, "A&P 10/5", { GradeItemId: 17380314 }),
            folder(4458658, "A&P 8/24", { Assessment: { ScoreDenominator: 3 } }),
            folder(4501078, "Defense Summary 4"),
            folder(4427077, "Introduction Video & Response"),
          ],
          submissions: {
            "9001": [entity(1, 1)],
            "4458658": [entity(3, 0, { Score: 3, IsGraded: true })],
            "4501078": [], // nothing turned in yet; 4427077 was a 403 and is absent
          },
        },
      },
    });
    const a = Object.fromEntries(snap.assignments.map((x) => [x.title, x]));
    expect(a["A&P 10/5"].status).toBe("submitted"); // beats the due list's not_submitted hint
    expect(snap.assignments.filter((x) => x.title === "A&P 10/5")).toHaveLength(1);
    expect(a["A&P 8/24"]).toMatchObject({ status: "graded", pointsEarned: 3, pointsPossible: 3 });
    expect(a["Defense Summary 4"].status).toBe("unknown");
    expect(a["Introduction Video & Response"].status).toBe("unknown");
  });

  it("survives empty or garbage input", () => {
    const snap = normalizeD2l({ fetchedAt: "x", failures: [], courses: "nope", perCourse: {} });
    expect(snap.courses).toEqual([]);
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe("grade estimates", () => {
  const v = (id: string, n: number, d: number, at: string, type = "Numeric") => ({
    GradeObjectIdentifier: id, GradeObjectName: id, PointsNumerator: n, PointsDenominator: d, GradeObjectTypeName: type, LastModified: at,
  });
  const o = (Id: number, CategoryId: number, Weight: number, MaxPoints: number, GradeType = "Numeric") => ({ Id, Name: `i${Id}`, GradeType, CategoryId, Weight, MaxPoints });
  const course = {
    gradeSetup: { GradingSystem: "Weighted" },
    gradeCategories: [
      { Id: 1, Name: "Quizzes", Weight: 20, NumberOfLowestToDrop: 1 },
      { Id: 2, Name: "Projects", Weight: 30, NumberOfLowestToDrop: 0 },
      { Id: 3, Name: "Exams", Weight: 50, NumberOfLowestToDrop: 0 },
    ],
    gradeObjects: [o(11, 1, 25, 10), o(12, 1, 25, 10), o(13, 1, 25, 10), o(21, 2, 50, 100), o(22, 2, 50, 100), o(31, 3, 100, 100), o(99, 2, 10, 0, "Calculated")],
    grades: [
      v("11", 9, 10, "2026-09-01T12:00:00Z"),
      v("12", 4, 10, "2026-09-08T12:00:00Z"), // dropped as lowest
      v("13", 8, 10, "2026-09-15T12:00:00Z"),
      v("21", 100, 100, "2026-09-15T18:00:00Z"),
      v("2", 25, 100, "2026-09-15T18:00:00Z", "Category"), // D2L's ungraded-as-zero rollup: ignored
    ],
  };

  it("weights categories over graded work only, with drop-lowest", () => {
    const [s] = normalizeD2l({ fetchedAt: "2026-10-05T00:00:00Z", failures: [], perCourse: { "77": course } }).standings;
    // Quizzes: (9+8)/20 = 85% · Projects 100% → (20·85 + 30·100)/50 = 94
    expect(s).toMatchObject({ courseId: "77", percent: 94, letter: "A", basis: "gradebook" });
    // Item weights fill each category toward 100: Quizzes 75/100·20 (dropped still counts as in) + Projects 50/100·30
    expect(s.gradedWeight).toBe(30);
    expect(s.history.map((h) => h.percent)).toEqual([90, 90, 94]); // quiz 2 is dropped as soon as it exists
  });

  it("falls back to points without gradebook definitions", () => {
    const [s] = normalizeD2l({ fetchedAt: "x", failures: [], perCourse: { "77": { grades: course.grades } } }).standings;
    expect(s).toMatchObject({ basis: "gradebook", percent: 93.1 }); // 121/130, category row ignored
  });

  it("projects GPA from transcript totals and estimates", () => {
    const t = { gpaHours: 44, qualityPoints: 166, inProgress: [{ code: "BIOL 1107", credits: 4 }, { code: "MATH 2260", credits: 4 }] };
    const g = gpaSummary(t, [{ courseId: "77", percent: 94, letter: "A", gradedWeight: 28, basis: "gradebook", scaleSource: null, sectionWeights: {}, history: [] }], (id) => (id === "77" ? "BIOL 1107" : null));
    expect(g.cumulative).toBeCloseTo(3.773, 3);
    expect(g.term).toBe(4);
    expect(g.projected).toBeCloseTo(182 / 48, 5);
    expect(g.missing).toEqual(["MATH 2260"]);
    expect(letterFor(89.9).letter).toBe("B+");
    expect(letterFor(90).letter).toBe("A-");
    expect(letterFor(62, { A: 94, "D+": 61, "D-": 55 })).toEqual({ letter: "D+", points: 1 });
  });

  it("re-weights a Points gradebook by the syllabus, with drops and bonus", () => {
    const item = (Id: number, Name: string, CategoryId: number, MaxPoints: number, extra = {}) => ({ Id, Name, GradeType: "Numeric", CategoryId, MaxPoints, Weight: 10, ...extra });
    const raw = {
      gradeSetup: { GradingSystem: "Points" },
      gradeCategories: [{ Id: 5, Name: "Reading Quizzes" }, { Id: 6, Name: "Tests" }],
      gradeObjects: [
        item(1, "2.1", 5, 10), item(2, "2.2", 5, 10), item(3, "2.3", 5, 10),
        item(4, "QC1", 0, 100), item(5, "T1", 6, 100), item(6, "B1", 0, 1, { ExcludeFromFinalGradeCalculation: true }),
      ],
      grades: [
        v("1", 10, 10, "2026-09-01T12:00:00Z"), v("2", 2, 10, "2026-09-02T12:00:00Z"), v("3", 8, 10, "2026-09-03T12:00:00Z"),
        v("4", 66, 100, "2026-09-04T12:00:00Z"), v("5", 55, 100, "2026-10-01T12:00:00Z"), v("6", 1, 1, "2026-10-02T12:00:00Z"),
      ],
    };
    const syllabus = {
      source: "test",
      scale: { A: 92, D: 60 },
      categories: [
        { name: "Review", weight: 10, match: "^QC1$", count: 1 },
        { name: "RQ", weight: 10, match: "^Reading Quizzes$", dropLowest: 2, equal: true },
        { name: "Tests", weight: 50, match: "^T[1-4]$", dropLowest: 1, equal: true, count: 3 },
        { name: "Final", weight: 25, match: "^final", count: 1 },
      ],
      bonus: { match: "^B\\d+$", perItem: 0.1, max: 1 },
    };
    const snap = normalizeD2l(
      { fetchedAt: "x", failures: [], courses: [{ OrgUnit: { Id: 8, Type: { Code: "Course Offering" }, Name: "MATH2260 Calc II", Code: "MATH2260" } }], perCourse: { "8": raw } },
      { "MATH 2260": syllabus },
    );
    const [s] = snap.standings;
    // RQ: two lowest of three dropped → 100%
    // (10·66 + 10·100 + 50·55) / 70 = 63.0, + 0.1 bonus
    expect(s).toMatchObject({ basis: "syllabus", percent: 63.1, letter: "D", scaleSource: "test" });
    // Review 10 + RQ 10 (no count: all created items graded) + Tests 50·(1/3)
    expect(s.gradedWeight).toBe(37);
  });
});

describe("syllabus items", () => {
  it("adds rows for active courses and hides ones Brightspace already lists", async () => {
    const { withSyllabusItems } = await import("./syllabus");
    const base = buildFixtureSnapshot();
    const course = { ...base.courses[0], code: "TEST 1000", isActive: true };
    const listed: Assignment = { id: "a", courseId: course.id, title: "Lab08", kind: "assignment", dueAt: null, status: "not_submitted", pointsPossible: null, pointsEarned: null, url: null };
    const snap = { ...base, courses: [course], assignments: [listed] };
    const out = withSyllabusItems(snap, {
      "TEST 1000": { items: [["Lab08", "assignment", "2026-10-16T17:00:00-04:00", "^Lab0?8$"], ["Final Exam", "exam", "2026-12-08T15:30:00-05:00", "final", { inPerson: true }]] },
      "NOPE 1": { items: [["X", "other", "2026-10-16T17:00:00-04:00", "x"]] },
    });
    expect(out.assignments.map((a) => a.title)).toEqual(["Lab08", "Final Exam"]);
    expect(out.assignments[1]).toMatchObject({ status: "unknown", source: "syllabus", inPerson: true });
    expect(SnapshotSchema.safeParse(out).success).toBe(true);
  });
  it("counts in-person items as done once their time passes", async () => {
    const { withAttendance } = await import("./syllabus");
    const base = buildFixtureSnapshot();
    const item: Assignment = { id: "x", courseId: base.courses[0].id, title: "Oral Test", kind: "exam", dueAt: "2026-11-11T14:55:00Z", status: "unknown", pointsPossible: null, pointsEarned: null, url: null, inPerson: true };
    const before = withAttendance({ ...base, assignments: [item] }, new Date("2026-11-11T14:00:00Z"));
    const after = withAttendance({ ...base, assignments: [item] }, new Date("2026-11-11T15:00:00Z"));
    expect(before.assignments[0].attended).toBeUndefined();
    expect(after.assignments[0].attended).toBe(true);
  });
});
