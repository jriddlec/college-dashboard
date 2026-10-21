import { describe, expect, it } from "vitest";
import { buildCourseLibrary, kindOf, materialsOf, orderExams, parseName, type DirNode, type Group, type LibraryCourse } from "./catalog";
import { extractText, snippet } from "./fulltext";
import { folderLinks, itemToken } from "./links";
import { namingIssues } from "./naming";

const course: LibraryCourse = { slug: "math-2260", id: "611005", code: "MATH 2260", name: "Calc II", instructor: "Smith", term: "Fall 2026", hue: 212, icon: null, folders: null };

function dir(path: string, files: string[], dirs: DirNode[] = []): DirNode {
  return { name: path.split("/").at(-1)!, path, files: files.map((n) => ({ name: n, path: `${path}/${n}`, size: 1000, mtimeMs: 0 })), dirs };
}

describe("parseName", () => {
  it("splits date, type, topic, variant and extension", () => {
    expect(parseName("2026-09-29 Master Study Guide - Test 2 (3.1-3.4).html")).toEqual({
      stem: "2026-09-29 Master Study Guide - Test 2 (3.1-3.4)",
      ext: "html",
      date: "2026-09-29",
      title: "Test 2",
      type: "Master Study Guide",
      variant: "3.1-3.4",
    });
  });
  it("keeps names without a known type whole", () => {
    expect(parseName("2026-09-06 Defense Summary 1 - Module 1.md")).toMatchObject({ title: "Defense Summary 1 - Module 1", type: null, variant: null });
    expect(parseName("Practice Guide - Test 2 (key).pdf")).toMatchObject({ title: "Practice Guide - Test 2 (key)", type: null });
  });
  it("reads course series types and bare types", () => {
    expect(parseName("2026-08-20 OSE Notes - 1.1-1.3 Areas (annotated).pdf")).toMatchObject({ type: "OSE Notes", title: "1.1-1.3 Areas", variant: "annotated" });
    expect(parseName("Syllabus.pdf")).toMatchObject({ type: "Syllabus", title: "Syllabus", variant: null });
    expect(parseName("Rubric - Defense Summary (old).docx")).toMatchObject({ type: "Rubric", title: "Defense Summary", variant: "old" });
  });
  it("cleans underscore names and the class prefix", () => {
    expect(parseName("MATH2260_T1_Guide_F26_accessible.pdf", "MATH2260").title).toBe("T1 Guide F26");
    expect(parseName("_Course Announcements.md").title).toBe("Course Announcements");
  });
});

describe("kindOf", () => {
  it.each([
    ["Study Guide 3.7 (Improper Integrals)", "html", "guide"],
    ["Practice Problems - Nested Loops", "html", "practice"],
    ["OSE Notes 2.1", "pdf", "notes"],
    ["Slides - Ch 3 - Networked Communications", "pdf", "slides"],
    ["L1-2 Salamu - Kati ya Watu Wengi", "pptx", "slides"],
    ["Reading Assignment - Ch 2 Introduction to Ethics", "html", "reading"],
    ["T Scan - Test 1", "pdf", "work"],
    ["Syllabus (Garcia)", "pdf", "info"],
    ["Video Recitation Rubric", "html", "guidelines"],
    ["Recitation 1", "mp4", "video"],
    ["Defense Summary 1 - Module 1", "md", "assignment"],
    ["Comprehensive Final Test Review", "docx", "review"],
  ])("%s.%s → %s", (title, ext, kind) => {
    expect(kindOf(title, ext)).toBe(kind);
  });
});

describe("kindOf with a type", () => {
  it.each([
    ["Submission", "pdf", "work"],
    ["Graded", "pdf", "work"],
    ["Instructions", "pdf", "assignment"],
    ["Exam Paper", "pdf", "practice"],
    ["Recording", "mp3", "audio"],
    ["Recording", "mp4", "video"],
    ["Model Notes", "html", "notes"],
    ["Template", "pdf", "guidelines"],
  ])("%s .%s → %s", (type, ext, kind) => {
    expect(kindOf("anything", ext, type)).toBe(kind);
  });
});

describe("materialsOf", () => {
  const ctx = { previews: new Set(["N/Rubric.docx"]), today: "2026-10-05", folderPrefix: "MATH2260" };
  it("merges formats of one document, HTML first", () => {
    const [m] = materialsOf(dir("N", ["2026-09-24 Guide 3.7.pdf", "2026-09-24 Guide 3.7.html"]).files, ctx);
    expect(m.primary.ext).toBe("html");
    expect(m.primary.href).toBe("/library/view/N/2026-09-24%20Guide%203.7.html");
    expect(m.alternates.map((a) => a.ext)).toEqual(["pdf"]);
  });
  it("opens Office files as their converted PDF when one exists", () => {
    const [a, b] = materialsOf(dir("N", ["Rubric.docx", "Other.pptx"]).files, ctx);
    expect(b.primary.href).toBe("/library/p/N/Rubric.docx");
    expect(a.primary.href).toBe("/library/view/N/Other.pptx");
  });
  it("marks future-dated material as upcoming", () => {
    const [m] = materialsOf(dir("N", ["2026-11-02 L6-2 Making Chai.html"]).files, ctx);
    expect(m.upcoming).toBe(true);
  });
});

describe("buildCourseLibrary", () => {
  const roots = [
    dir("MATH2260 Notes", ["_Course Announcements.md"], [
      dir("MATH2260 Notes/3 - Techniques of Integration", ["2026-09-08 OSE Notes 3.1.pdf", "2026-09-24 Study Guide 3.7.html"]),
      dir("MATH2260 Notes/10 - Later", []),
      dir("MATH2260 Notes/2 - Applications (Ch 2)", ["2026-08-25 OSE Notes 2.1.pdf"]),
      dir("MATH2260 Notes/_Test 1 Material", ["_README.md", "2026-09-09 Master Study Guide - Test 1.html"]),
      dir("MATH2260 Notes/_Test 2 Material", ["2026-09-29 Master Study Guide - Test 2.html"]),
      dir("MATH2260 Notes/Reference", ["Calculus Volume 2 (OpenStax).pdf"]),
    ]),
    dir("MATH2260 Classwork", [], [dir("MATH2260 Classwork/Projects", [], [dir("MATH2260 Classwork/Projects/Project 01", ["Project 01.pdf"])])]),
    dir("MATH2260 Important Documents", ["Syllabus (Smith).pdf"]),
    dir("BIOL1107 Notes", ["x.md"]),
  ];
  const lib = buildCourseLibrary(course, roots, new Set(), "2026-10-05");

  it("orders units numerically and parses chapter tags", () => {
    expect(lib.units.map((u) => [u.number, u.title, u.tag])).toEqual([
      [2, "Applications", "Ch 2"],
      [3, "Techniques of Integration", null],
      [10, "Later", null],
    ]);
  });
  it("puts the newest exam prep first and keeps folder readmes separate", () => {
    expect(lib.exams.map((e) => e.title)).toEqual(["Test 2 Material", "Test 1 Material"]);
    expect(lib.exams[1].readme?.title).toBe("About this folder");
    expect(lib.exams[1].items).toHaveLength(1);
  });
  it("opens the unit with the latest material by default", () => {
    expect(lib.currentUnitId).toBe("MATH2260 Notes/3 - Techniques of Integration");
  });
  it("collects documents, logs and references", () => {
    expect(lib.documents.map((d) => d.title)).toEqual(["Important documents", "Notes & logs", "Reference"]);
  });
  it("collapses folders that only wrap one folder", () => {
    expect(lib.classwork[0].title).toBe("Projects");
    expect(lib.classwork[0].items[0].title).toBe("Project 01");
  });
  it("counts study guides and ignores other classes", () => {
    expect(lib.stats.studyGuides).toBe(3);
    expect(lib.stats.items).toBe(10);
  });
});

describe("dated folders", () => {
  it("takes the date out of the title and orders by it", () => {
    const roots = [
      dir("CSCI1301 Classwork", [], [
        dir("CSCI1301 Classwork/In-Class Activities", [], [
          dir("CSCI1301 Classwork/In-Class Activities/2026-09-15 Boolean Activity", ["BooleanFun.java"]),
          dir("CSCI1301 Classwork/In-Class Activities/2026-08-25 Bill Activity", ["Bill.java"]),
        ]),
      ]),
    ];
    const lib = buildCourseLibrary({ ...course, code: "CSCI 1301" }, roots, new Set(), "2026-10-05");
    const kids = lib.classwork[0].children;
    expect(kids.map((k) => [k.title, k.date])).toEqual([
      ["Bill Activity", "2026-08-25"],
      ["Boolean Activity", "2026-09-15"],
    ]);
    expect(lib.classwork[0].latest).toBe("2026-09-15");
  });
});

describe("orderExams", () => {
  const g = (title: string, latest: string): Group => ({ id: title, title, number: null, tag: null, readme: null, items: [], children: [], total: 1, latest });
  const groups = [g("Test 1 Material", "2026-09-09"), g("Test 3 Material", "2026-10-21"), g("Final Exam Material", "2026-10-01"), g("Quiz 9 Material", "2026-09-01")];
  const exams = [
    { title: "Test 1", at: "2026-09-10T15:35:00Z" },
    { title: "Test 3 (5.1–5.6) (syllabus)", at: "2026-10-22T15:35:00Z" },
    { title: "Final Exam (CRN 1)", at: "2026-12-08T17:00:00Z" },
  ];
  it("puts upcoming exams first, soonest first, then undated, then past", () => {
    const out = orderExams(groups, exams, "2026-10-21");
    expect(out.map((x) => [x.title, x.examDays])).toEqual([
      ["Test 3 Material", 1],
      ["Final Exam Material", 48],
      ["Quiz 9 Material", null],
      ["Test 1 Material", -41],
    ]);
  });
});

describe("fulltext", () => {
  it("reads visible text and strings inside template scripts", () => {
    const html = `<html><style>.a{color:red}</style><h1>Ratio &amp; Root</h1><script>const GUIDE = { title: "The ratio test compares terms", url: "https://x.y/z" };</script></html>`;
    const t = extractText(html, "html");
    expect(t).toContain("Ratio & Root");
    expect(t).toContain("The ratio test compares terms");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("https://x.y/z");
  });
  it("cuts a snippet around the first hit", () => {
    expect(snippet("a ".repeat(200) + "needle here", ["needle"], 40)).toMatch(/^….*needle here$/);
  });
});

describe("buildCourseLibrary folder layouts", () => {
  it("finds role folders one level down (BIOL 1107/Notes)", () => {
    const roots = [
      dir("BIOL 1107", ["Syllabus.pdf"], [
        dir("BIOL 1107/Notes", [], [dir("BIOL 1107/Notes/1 - Basics", ["Notes 1.md"])]),
        dir("BIOL 1107/Classwork", [], [dir("BIOL 1107/Classwork/Lab 1", ["Lab 1.pdf"])]),
        dir("BIOL 1107/Misc", ["a.txt"]),
      ]),
    ];
    const lib = buildCourseLibrary({ ...course, code: "BIOL 1107" }, roots, new Set(), "2026-10-05");
    expect(lib.units.map((u) => u.title)).toEqual(["Basics"]);
    expect(lib.classwork.map((g) => g.title)).toEqual(["Lab 1"]);
    expect(lib.documents.map((d) => d.title)).toEqual(["Misc", "Files"]);
  });
  it("shows folders without the conventions as a plain tree", () => {
    const roots = [dir("Biology", ["Lecture 1.pdf"], [dir("Biology/Week 2", ["Lecture 2.pdf"])])];
    const lib = buildCourseLibrary({ ...course, code: "BIOL 1107", folders: ["biology"] }, roots, new Set(), "2026-10-05");
    expect(lib.units).toEqual([]);
    expect(lib.documents.map((d) => d.title)).toEqual(["Biology"]);
    expect(lib.stats.items).toBe(2);
  });
});

describe("folder links", () => {
  it.each([
    ["Lab04 Part 2", "lab 4"],
    ["Assignm 4: weekend plans", "assignment 4"],
    ["Assign 5: read aloud and record", "assignment 5"],
    ["Conversation 2 (in person)", "conversation 2"],
    ["Defense Summary 3", "defense summary 3"],
    ["Pre-class 6.1 Power Series (WebAssign)", null],
  ])("%s → %s", (title, token) => {
    expect(itemToken(title)).toBe(token);
  });
  it("links assignments to classwork items and exam-prep folders", () => {
    const roots = [
      dir("MATH2260 Notes", [], [dir("MATH2260 Notes/_Test 3 Material", ["2026-10-13 Study Guide - Test 3.html"])]),
      dir("MATH2260 Classwork", [], [dir("MATH2260 Classwork/Labs", [], [dir("MATH2260 Classwork/Labs/Lab 4", ["a.java"]), dir("MATH2260 Classwork/Labs/Lab 5", ["b.java"])])]),
    ];
    const lib = buildCourseLibrary(course, roots, new Set(), "2026-10-05");
    const a = (id: string, title: string, kind: "assignment" | "exam" = "assignment") => ({ id, courseId: "611005", title, kind, dueAt: null, status: "unknown" as const, pointsPossible: null, pointsEarned: null, url: null });
    const links = folderLinks([a("1", "Lab04"), a("2", "Test 3 (5.1–5.6)", "exam"), a("3", "Lab09"), { ...a("4", "Lab05"), courseId: "other" }], [lib]);
    expect(links.get("1")).toEqual({ href: "/library/math-2260?open=MATH2260%20Classwork%2FLabs%2FLab%204", label: "Lab 4" });
    expect(links.get("2")?.label).toBe("Test 3 Material");
    expect(links.has("3")).toBe(false);
    expect(links.has("4")).toBe(false);
  });
});

describe("naming check", () => {
  it("flags names off the convention and loose classwork files, not collapsed single items", () => {
    const roots = [
      dir("MATH2260 Notes", ["_Course Log.md", "stray.pdf"], [
        dir("MATH2260 Notes/1 - Limits (Ch 1)", ["2026-08-20 Lecture Notes - 1.1 Limits.pdf", "notes_1.pdf", "Circle.java"]),
        dir("MATH2260 Notes/_Test 1 Material", ["_README.md", "2026-09-01 Study Guide - Test 1.html"]),
        dir("MATH2260 Notes/Misc", ["a.pdf"]),
      ]),
      dir("MATH2260 Classwork", [], [
        dir("MATH2260 Classwork/Tests", [], [dir("MATH2260 Classwork/Tests/Oral Test", ["2026-11-11 Rubric - Oral Test.docx"])]),
        dir("MATH2260 Classwork/Labs", ["Lab sheet.pdf"], [dir("MATH2260 Classwork/Labs/Lab 1", ["Lab01.pdf"]), dir("MATH2260 Classwork/Labs/Lab 2", ["2026-09-01 Instructions - Lab 2.pdf"])]),
      ]),
      dir("MATH2260 Important Documents", ["Syllabus.pdf", "Course Schedule.html"]),
    ];
    const issues = namingIssues(buildCourseLibrary(course, roots, new Set(), "2026-10-05"));
    expect(issues.map((i) => i.path).sort()).toEqual([
      "MATH2260 Classwork/Labs/Lab 1/Lab01.pdf",
      "MATH2260 Classwork/Labs/Lab sheet.pdf",
      "MATH2260 Important Documents/Course Schedule.html",
      "MATH2260 Notes/1 - Limits (Ch 1)/notes_1.pdf",
      "MATH2260 Notes/Misc",
      "MATH2260 Notes/stray.pdf",
    ]);
  });
});
