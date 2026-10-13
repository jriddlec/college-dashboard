import { describe, expect, it } from "vitest";
import { buildCourseLibrary, kindOf, materialsOf, parseName, type DirNode, type LibraryCourse } from "./catalog";

const course: LibraryCourse = { slug: "math-2260", id: "611005", code: "MATH 2260", name: "Calc II", instructor: "Smith", term: "Fall 2026", hue: 212, icon: null, folders: null };

function dir(path: string, files: string[], dirs: DirNode[] = []): DirNode {
  return { name: path.split("/").at(-1)!, path, files: files.map((n) => ({ name: n, path: `${path}/${n}`, size: 1000, mtimeMs: 0 })), dirs };
}

describe("parseName", () => {
  it("splits date, title and extension", () => {
    expect(parseName("2026-09-29 Master Study Guide - Test 2 (3.1-3.4).html")).toEqual({
      stem: "2026-09-29 Master Study Guide - Test 2 (3.1-3.4)",
      ext: "html",
      date: "2026-09-29",
      title: "Master Study Guide - Test 2 (3.1-3.4)",
    });
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

describe("materialsOf", () => {
  const ctx = { previews: new Set(["N/Rubric.docx"]), today: "2026-10-05", folderPrefix: "MATH2260" };
  it("merges formats of one document, HTML first", () => {
    const [m] = materialsOf(dir("N", ["2026-09-24 Guide 3.7.pdf", "2026-09-24 Guide 3.7.html"]).files, ctx);
    expect(m.primary.ext).toBe("html");
    expect(m.primary.href).toBe("/library/f/N/2026-09-24%20Guide%203.7.html");
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
