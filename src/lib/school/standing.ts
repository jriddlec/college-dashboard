/**
 * Estimates a course's current grade before Brightspace releases one.
 *
 * Weighted: each category's percent is the weight-averaged score of its
 * graded items (after drop-lowest); the course percent is the category-weight
 * average over categories with anything graded. Ungraded work is ignored, not
 * counted as zero — it's "how you're doing on what's been graded so far".
 *
 * Points: earned / possible over graded items.
 *
 * A course's syllabus (src/config/grading.json) wins over its gradebook setup:
 * many instructors use a Points gradebook as storage while the syllabus
 * weights categories. Source-agnostic: providers build the `Gradebook`.
 */
import type { CourseStanding } from "./types";
import { DEFAULT_SCALE, letterFor, type Scale } from "./gpa";

export interface GradebookItem {
  id: string;
  name: string;
  /** Null for items that sit directly in the final grade. */
  categoryId: string | null;
  categoryName: string | null;
  /** Weight within its category (or of the final grade when uncategorized). */
  weight: number | null;
  earned: number | null;
  possible: number | null;
  /** When the score was entered/changed; orders the trend history. */
  at: string | null;
  /** Excluded from the gradebook's own final calculation (bonus/practice). */
  excluded: boolean;
}

export interface GradebookCategory {
  id: string;
  /** Percent of the final grade. */
  weight: number;
  dropLowest: number;
  /** Items that will count once the term is over (after drops), when known. */
  expectedItems?: number;
  /** Item weight the category fills up to (Brightspace item weights sum to 100). */
  expectedWeight?: number;
}

export interface Gradebook {
  system: "weighted" | "points";
  items: GradebookItem[];
  categories: GradebookCategory[];
}

export interface SyllabusCategory {
  name: string;
  weight: number;
  /** Case-insensitive regex tried against the item name, then its gradebook category. */
  match: string;
  dropLowest?: number;
  /** Every item counts the same, regardless of its points. */
  equal?: boolean;
  /** How many items will count at the end of the term (after drops). */
  count?: number;
}

export interface Syllabus {
  source: string;
  scale?: Scale;
  categories?: SyllabusCategory[];
  /** Completed items matching `match` add `perItem` percentage points, up to `max`. */
  bonus?: { match: string; perItem: number; max: number };
  /** Hand-kept quiz log in the library, relative to LIBRARY_DIR (see quizlog.ts); `category` is its Brightspace category. */
  quizLog?: { file: string; category: string };
}

const isGraded = (i: GradebookItem) => i.earned != null && i.possible != null && i.possible > 0;
const frac = (i: GradebookItem) => i.earned! / i.possible!;

export function estimate(book: Gradebook, graded: (i: GradebookItem) => boolean = isGraded): { percent: number; gradedWeight: number } | null {
  const items = book.items.filter((i) => !i.excluded);
  if (book.system === "points") {
    let earned = 0, possible = 0, total = 0;
    for (const i of items) {
      total += i.possible ?? 0;
      if (graded(i)) {
        earned += i.earned!;
        possible += i.possible!;
      }
    }
    if (!possible) return null;
    return { percent: (earned / possible) * 100, gradedWeight: total ? Math.min(100, (possible / total) * 100) : 0 };
  }

  const cats = new Map(book.categories.map((c) => [c.id, c]));
  const groups = new Map<string, { cat: GradebookCategory | null; weight: number; items: GradebookItem[] }>();
  for (const c of book.categories) groups.set(c.id, { cat: c, weight: c.weight, items: [] });
  for (const i of items) {
    const cat = (i.categoryId && cats.get(i.categoryId)) || null;
    const key = cat ? cat.id : `item:${i.id}`;
    if (!groups.has(key)) groups.set(key, { cat: null, weight: i.weight ?? 0, items: [] });
    groups.get(key)!.items.push(i);
  }

  let sum = 0, weightSeen = 0, gradedWeight = 0, totalWeight = 0;
  for (const { cat, weight, items: all } of groups.values()) {
    totalWeight += weight;
    if (weight <= 0) continue;
    // Uncategorized items carry their weight on the group; inside a category, weights are relative.
    const w = (i: GradebookItem) => (cat ? (i.weight ?? i.possible ?? 1) : 1);
    const scored = all.filter(graded);
    let done = scored;
    const drop = cat?.dropLowest ?? 0;
    if (drop > 0 && done.length > drop) done = [...done].sort((a, b) => frac(a) - frac(b)).slice(drop);
    const wDone = done.reduce((s, i) => s + w(i), 0);
    if (!done.length || wDone <= 0) continue;
    sum += weight * (done.reduce((s, i) => s + w(i) * frac(i), 0) / wDone);
    weightSeen += weight;
    // Dropped scores still count as work that's in.
    const wAll = all.reduce((s, i) => s + w(i), 0);
    const wScored = scored.reduce((s, i) => s + w(i), 0);
    const share = !cat ? 1 : cat.expectedItems ? done.length / cat.expectedItems : wScored / Math.max(wAll, cat.expectedWeight ?? 0);
    gradedWeight += weight * Math.min(1, share);
  }
  if (!weightSeen) return null;
  // Gradebooks often hold only part of the final weight early on (exams not created yet).
  return { percent: (sum / weightSeen) * 100, gradedWeight: Math.min(100, (gradedWeight / Math.max(100, totalWeight)) * 100) };
}

/** Re-sorts a gradebook into the syllabus's categories; unmatched items are left out. */
export function applySyllabus(book: Gradebook, syl: Syllabus): Gradebook {
  if (!syl.categories?.length) return book;
  const rules = syl.categories.map((c, n) => ({ c, id: `syllabus:${n}`, re: new RegExp(c.match, "i") }));
  const items: GradebookItem[] = [];
  for (const i of book.items) {
    if (i.excluded) continue;
    const r = rules.find((x) => x.re.test(i.name)) ?? rules.find((x) => i.categoryName && x.re.test(i.categoryName));
    if (r) items.push({ ...i, categoryId: r.id, weight: r.c.equal ? 1 : (i.possible ?? 1) });
  }
  return {
    system: "weighted",
    items,
    categories: rules.map(({ c, id }) => ({ id, weight: c.weight, dropLowest: c.dropLowest ?? 0, expectedItems: c.count })),
  };
}

function bonusPoints(book: Gradebook, syl: Syllabus | undefined, graded: (i: GradebookItem) => boolean): number {
  if (!syl?.bonus) return 0;
  const re = new RegExp(syl.bonus.match, "i");
  const done = book.items.filter((i) => re.test(i.name) && graded(i) && i.earned! > 0).length;
  return Math.min(syl.bonus.max, done * syl.bonus.perItem);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Current estimate plus a per-day history replayed from score timestamps. */
export function courseStanding(courseId: string, raw: Gradebook, syllabus?: Syllabus): CourseStanding | null {
  const book = syllabus ? applySyllabus(raw, syllabus) : raw;
  const score = (graded: (i: GradebookItem) => boolean) => {
    const e = estimate(book, graded);
    return e && { ...e, percent: e.percent + bonusPoints(raw, syllabus, graded) };
  };
  const now = score(isGraded);
  if (!now) return null;
  const order = raw.items.filter(isGraded).sort((a, b) => (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0));
  const byDay = new Map<string, { at: string; percent: number; items: { name: string; earned: number | null; possible: number | null }[] }>();
  const seen = new Set<string>();
  for (const i of order) {
    seen.add(i.id);
    if (!i.at) continue;
    const e = score((x) => seen.has(x.id) && isGraded(x));
    const day = i.at.slice(0, 10);
    const items = [...(byDay.get(day)?.items ?? []), { name: i.name, earned: i.earned, possible: i.possible }];
    if (e) byDay.set(day, { at: i.at, percent: round1(e.percent), items });
  }
  // Section weight per gradebook category name, when all its items land in one weighted category.
  const catWeight = new Map(book.categories.map((c) => [c.id, c.weight]));
  const itemWeight = new Map(book.items.map((i) => [i.id, i.categoryId ? catWeight.get(i.categoryId) : undefined]));
  const seenW = new Map<string, number | null>();
  for (const i of raw.items) {
    if (!i.categoryName || i.excluded) continue;
    const w = itemWeight.get(i.id) ?? null;
    const prev = seenW.get(i.categoryName);
    seenW.set(i.categoryName, prev === undefined || prev === w ? w : null);
  }
  const sectionWeights: Record<string, number> = {};
  for (const [name, w] of seenW) if (w != null && w > 0) sectionWeights[name] = round1(w);
  return {
    courseId,
    percent: round1(now.percent),
    letter: letterFor(now.percent, syllabus?.scale).letter,
    gradedWeight: Math.round(now.gradedWeight),
    basis: syllabus?.categories?.length ? "syllabus" : "gradebook",
    scaleSource: syllabus?.scale ? syllabus.source : null,
    scale: syllabus?.scale ?? DEFAULT_SCALE,
    history: [...byDay.values()],
    sectionWeights,
  };
}
