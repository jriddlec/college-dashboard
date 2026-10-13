import { describe, expect, it } from "vitest";
import { parseQuizLog, withQuizLog } from "./quizlog";
import type { Gradebook, GradebookItem } from "./standing";

const LOG = `# Log

## Quiz 1 — 2026-09-03 (Sections 4.1, 4.3, 2.8, "Exponential Change")

**Graded paper.** Score:
**8/10**, Roll #16.

## Quiz 2 — 2026-09-08 (Section 3.1, "Parts") — PREDICTION

Mock score 7/10.

## Quiz 3 — 2026-09-22 (Sections 4.1 and 4.3, her "4.3b")

### Graded paper — score 10/10

## Quiz 4 — 2026-10-02 (Section 5.1 Part 1, "Sequences") — graded paper, score 9/10

## Quiz 5 — 2026-10-06 (Section 5.1 Part 2) — PREDICTION

## Notes

Score: 1/10 is not a quiz.
`;

const item = (name: string, at: string): GradebookItem => ({
  id: name, name, categoryId: "c", categoryName: "Reading Quizzes", weight: 10, earned: 8, possible: 10, at, excluded: false,
});

describe("quiz log", () => {
  it("reads scored quizzes and skips predictions and mock scores", () => {
    expect(parseQuizLog(LOG).map((q) => [q.number, q.sections, q.earned, q.possible])).toEqual([
      [1, ["4.1", "4.3", "2.8"], 8, 10],
      [3, ["4.1", "4.3"], 10, 10],
      [4, ["5.1"], 9, 10],
    ]);
  });

  it("adds only quizzes Brightspace hasn't posted", () => {
    const book: Gradebook = { system: "points", categories: [], items: [item("2.8", "2026-09-04"), item("4.3b", "2026-09-28")] };
    const out = withQuizLog(book, LOG, "Reading Quizzes");
    expect(out.items.slice(2).map((i) => [i.name, i.earned, i.categoryName])).toEqual([["5.1 (log)", 9, "Reading Quizzes"]]);
  });
});
