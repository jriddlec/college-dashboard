/**
 * Reading-quiz scores kept by hand in a Markdown log in the library (e.g.
 * `MATH2260 Notes/_Reading Quiz Log.md`; set up in grading.json `quizLog`). Brightspace stays the source of
 * truth; the log only fills in quizzes whose grade hasn't been posted yet.
 *
 * Log format: one `## Quiz N — YYYY-MM-DD (Section 3.7 Part 2, ...)` heading
 * per quiz, with its score written as "Score: **8/10**" or "score 8/10"
 * (a bare "Score: **10**" means out of 10). Entries without a score
 * (predictions) and "Mock score" lines are ignored.
 */
import type { Gradebook, GradebookItem } from "./standing";

export interface LogQuiz {
  number: number;
  date: string;
  /** Section numbers named in the heading, e.g. ["4.1", "4.3", "2.8"]. */
  sections: string[];
  earned: number;
  possible: number;
}

const HEADING = /^## Quiz (\d+)\s*[—–-]\s*(\d{4}-\d{2}-\d{2})(.*)$/gm;
const SCORE = /(?<!mock )\bscore:?\s*\**\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/i;
const SECTION = /(?<![\d.])\d+\.\d+(?![\d.])/g;

export function parseQuizLog(md: string): LogQuiz[] {
  const heads = [...md.matchAll(HEADING)];
  const out: LogQuiz[] = [];
  heads.forEach((h, n) => {
    const end = n + 1 < heads.length ? heads[n + 1].index : md.length;
    // A trailing non-quiz section ("## Notes") ends the entry.
    const body = md.slice(h.index, end).split(/^## (?!Quiz )/m)[0];
    const m = body.match(SCORE);
    if (!m) return;
    const paren = h[3].match(/\(([^)]*)\)/)?.[1] ?? h[3];
    out.push({
      number: Number(h[1]),
      date: h[2],
      sections: [...new Set(paren.match(SECTION) ?? [])],
      earned: Number(m[1]),
      possible: m[2] ? Number(m[2]) : 10,
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
}

/**
 * Adds logged quizzes that Brightspace doesn't carry yet. Each Brightspace
 * item in `category` (named by section, e.g. "2.8", "3.7a", "1.1-1.2")
 * claims the earliest unclaimed logged quiz naming one of its sections; the
 * rest are added as items in that category.
 */
export function withQuizLog(book: Gradebook, md: string | undefined, category: string): Gradebook {
  if (!md) return book;
  const pending = parseQuizLog(md);
  const posted = book.items.filter((i) => i.categoryName === category).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  for (const i of posted) {
    const secs: string[] = i.name.match(SECTION) ?? [];
    const k = pending.findIndex((q) => q.sections.some((s) => secs.includes(s)));
    if (k >= 0) pending.splice(k, 1);
  }
  if (!pending.length) return book;
  const items: GradebookItem[] = pending.map((q) => ({
    id: `log-quiz-${q.number}`,
    name: `${q.sections.join(", ") || `Quiz ${q.number}`} (log)`,
    categoryId: null,
    categoryName: category,
    weight: null,
    earned: q.earned,
    possible: q.possible,
    at: new Date(`${q.date}T12:00:00-04:00`).toISOString(),
    excluded: false,
  }));
  return { ...book, items: [...book.items, ...items] };
}
