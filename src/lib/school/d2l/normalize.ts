/**
 * Converts raw `d2l --json ...` output into the normalized model.
 *
 * d2l-cli largely passes through Brightspace Valence API objects
 * (PascalCase: OrgUnit, DueDate, PointsNumerator, ...). Its exact shape can
 * change between versions, so every field is read through `pick()` with
 * several candidate names, and records that lack the essentials are skipped
 * with a warning instead of failing the whole snapshot.
 *
 * This is the ONLY place that knows about d2l-cli output.
 */
import type { Announcement, Assignment, CalendarEvent, Course, CourseStanding, Grade, SchoolSnapshot } from "../types";
import { courseStanding, type Gradebook, type Syllabus } from "../standing";
import { withWebAssignGrades, type WebAssignCourse } from "../webassign";
import { withQuizLog } from "../quizlog";

import { LMS_URL } from "@/lib/settings";

/** Raw files written by scripts/d2l_sync.py, already JSON-parsed. */
export interface D2lRaw {
  fetchedAt: string;
  courses?: unknown;
  due?: unknown;
  overdue?: unknown;
  calendar?: unknown;
  news?: unknown;
  /** `d2l grades --final` across all courses. */
  finalGrades?: unknown;
  /** Keyed by course id. */
  perCourse: Record<
    string,
    {
      assignments?: unknown;
      grades?: unknown;
      news?: unknown;
      submissions?: unknown;
      /** Grade item definitions (`/grades/`): category membership, weights, max points. */
      gradeObjects?: unknown;
      /** `/grades/categories/`: category weights and drop rules. */
      gradeCategories?: unknown;
      /** `/grades/setup/`: GradingSystem "Weighted" | "Points" | "Formula". */
      gradeSetup?: unknown;
    }
  >;
  /** Quiz log markdown by course code, for syllabi with a `quizLog`. */
  quizLogs?: Record<string, string>;
  /** Commands that failed during sync, as reported by the manifest. */
  failures: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Case-insensitive lookup through dotted paths, e.g. pick(o, "OrgUnit.Id", "orgUnitId"). */
export function pick(o: unknown, ...paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = o;
    for (const seg of path.split(".")) {
      if (!isObj(cur)) {
        cur = undefined;
        break;
      }
      const k = Object.keys(cur).find((key) => key.toLowerCase() === seg.toLowerCase());
      cur = k === undefined ? undefined : cur[k];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

const str = (v: unknown): string | null =>
  typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Accepts ISO strings (with or without zone; zoneless is treated as UTC as Valence does). */
export function date(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z";
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Unwraps common list envelopes: [..], {Items: [..]}, {Objects: [..]}, {courses: [..]}. */
export function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (Array.isArray(v[k]) && /^(items|objects|results|data|courses|assignments|events|grades|news|items?)$/i.test(k)) {
        return v[k] as unknown[];
      }
    }
    const arrays = Object.values(v).filter(Array.isArray);
    if (arrays.length === 1) return arrays[0] as unknown[];
  }
  return [];
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function courseId(o: unknown): string | null {
  return str(pick(o, "OrgUnit.Id", "OrgUnitId", "CourseId", "course_id", "courseId", "ou", "Id", "id"));
}

export function normalizeCourses(raw: unknown, warnings: string[]): Course[] {
  const out: Course[] = [];
  for (const item of list(raw)) {
    const typeCode = str(pick(item, "OrgUnit.Type.Code", "Type.Code"));
    if (typeCode && !/course offering/i.test(typeCode)) continue; // skip org/semester/department units
    const id = courseId(item);
    const name = str(pick(item, "OrgUnit.Name", "Name", "name", "title"));
    if (!id || !name) {
      warnings.push("Skipped a course record without an id or name.");
      continue;
    }
    const rawCode = str(pick(item, "OrgUnit.Code", "Code", "code"));
    const subject = subjectCode(rawCode) ?? subjectCode(name);
    const isActive = bool(pick(item, "Access.IsActive", "IsActive", "isActive", "active")) ?? true;
    const canAccess = bool(pick(item, "Access.CanAccess", "CanAccess")) ?? true;
    if (!canAccess) continue;
    out.push({
      id,
      code: subject,
      name: cleanName(name),
      term: str(pick(item, "Semester.Name", "term", "Term")) ?? termFromName(name) ?? termFromCode(rawCode),
      instructor: str(pick(item, "instructor", "Instructor")),
      url: str(pick(item, "url", "Url", "HomeUrl")) ?? `${LMS_URL}/d2l/home/${id}`,
      startsAt: date(pick(item, "Access.StartDate", "StartDate", "start")),
      endsAt: date(pick(item, "Access.EndDate", "EndDate", "end")),
      isActive,
      // Orientation, academic-integrity modules etc. have no subject code.
      isClass: subject !== null,
    });
  }
  return dedupe(out, (c) => c.id);
}

/**
 * USG Brightspace codes look like "CSCI2720_12345_2026_08" or names like
 * "CSCI 2720 (Fall 2026)". Pull a readable "CSCI 2720" when possible.
 */
export function subjectCode(s: string | null): string | null {
  const m = s?.match(/(?<![A-Za-z])([A-Z]{2,5})[\s_-]?(\d{4}[A-Z]?)(?![\dA-Za-z])/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export function prettyCode(code: string | null, name: string): string | null {
  return subjectCode(code) ?? subjectCode(name) ?? code;
}

const TERM_RE = /\s*\(?\b(Spring|Summer|Fall|Winter)\s+(20\d\d)\)?(\s+\d+)?\s*$/i;

/**
 * Brightspace names often look like "XLS GP_BIOL1107_MC Principles of Biology I Fall 2026"
 * or "SPAN1001 Elementary Spanish I Fall 2026 12345". Drop the section/code
 * prefix and the trailing term (+ CRN) to get "Intro Computing and Program".
 */
export function cleanName(name: string): string {
  // "CSCI 1301 Intro..." and "CHEM 1211: General..." (Canvas) both drop the code.
  let n = name.replace(TERM_RE, "").replace(/^[A-Z]{2,5}\s\d{4}[A-Z]?\s*[:\-–]?\s+(?=\S)/, "");
  const tokens = n.split(/\s+/);
  const i = tokens.findIndex((t) => /[A-Z]{2,5}[_-]?\d{4}/.test(t));
  if (i >= 0 && i <= 2 && i < tokens.length - 1) n = tokens.slice(i + 1).join(" ");
  n = n.replace(/^[:\-–]\s*/, "").trim();
  return n || name;
}

function termFromName(name: string): string | null {
  const m = name.match(TERM_RE);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : null;
}

function termFromCode(code: string | null): string | null {
  const m = code?.match(/(20\d\d)[_-]?(0[1-9]|1[0-2])\b/);
  if (!m) return null;
  const month = Number(m[2]);
  return `${month <= 4 ? "Spring" : month <= 7 ? "Summer" : "Fall"} ${m[1]}`;
}

/** Numeric ActivityType values seen in `d2l due/overdue` (Brightspace work-to-do). */
const ACTIVITY_TYPES: Record<string, string> = { "3": "dropbox", "4": "quiz", "5": "discussion" };

function kindFrom(o: unknown, title: string): Assignment["kind"] {
  if (/\b(exam|midterm|final)\b/i.test(title)) return "exam";
  if (pick(o, "DropboxType") !== undefined) return "assignment";
  let t = String(pick(o, "type", "Type", "ActivityType", "AssociatedEntity.AssociatedEntityType", "kind") ?? "").toLowerCase();
  t = ACTIVITY_TYPES[t] ?? t;
  if (/quiz/.test(t)) return "quiz";
  if (/discussion|topic|forum/.test(t)) return "discussion";
  if (/dropbox|assignment/.test(t)) return "assignment";
  if (/quiz/i.test(title)) return "quiz";
  return t && !/^\d+$/.test(t) ? "other" : "assignment";
}

function statusFrom(o: unknown): Assignment["status"] {
  if (date(pick(o, "DateCompleted", "CompletedDate"))) return "submitted";
  const graded = pick(o, "graded", "IsGraded", "Feedback.Score", "Score", "PointsNumerator");
  if (graded === true || typeof graded === "number") return "graded";
  const s = String(pick(o, "status", "Status", "CompletionStatus", "SubmissionStatus") ?? "").toLowerCase();
  if (/graded|evaluated|feedback/.test(s)) return "graded";
  if (/submitted|complete|done/.test(s) && !/not/.test(s)) return "submitted";
  if (/not|missing|open|todo|pending|overdue/.test(s)) return "not_submitted";
  const submitted = bool(pick(o, "submitted", "IsSubmitted", "HasSubmission", "completed", "IsCompleted"));
  if (submitted === true) return "submitted";
  if (submitted === false) return "not_submitted";
  const count = num(pick(o, "Submissions.length", "SubmissionCount", "submissions"));
  if (count && count > 0) return "submitted";
  return "unknown";
}

/** `${courseId}:${gradeObjectId}` → released score. */
type GradeLink = Map<string, { earned: number; possible: number | null }>;

/** `${courseId}:${folderId}` → your own dropbox submission state (submissions.json). */
type SubmissionLink = Map<string, { status: "submitted" | "graded"; score: number | null }>;

/**
 * submissions.json is `{folderId: mysubmissions[]}`. Entity Status is
 * 0 unsubmitted, 1 submitted, 2 draft, 3 feedback published. Only positive
 * signals are kept: an empty record can't tell "missed" from "nothing to turn in".
 */
function submissionLinks(raw: D2lRaw): SubmissionLink {
  const out: SubmissionLink = new Map();
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    if (!isObj(c.submissions)) continue;
    for (const [fid, records] of Object.entries(c.submissions)) {
      for (const r of list(records)) {
        const score = num(pick(r, "Feedback.Score"));
        const published = pick(r, "Status") === 3 || pick(r, "Feedback.IsGraded") === true;
        const turnedIn = list(pick(r, "Submissions")).length > 0 || !!date(pick(r, "CompletionDate")) || pick(r, "Status") === 1;
        if (published && score != null) out.set(`${cid}:${fid}`, { status: "graded", score });
        else if (turnedIn) out.set(`${cid}:${fid}`, { status: "submitted", score: null });
      }
    }
  }
  return out;
}

function assignmentFrom(
  o: unknown,
  fallbackCourse: string | null,
  hint: Assignment["status"] | null,
  graded: GradeLink,
  submitted: SubmissionLink,
): Assignment | null {
  const title = str(pick(o, "Name", "Title", "name", "title", "ItemName"));
  const cid = str(pick(o, "OrgUnitId", "CourseId", "courseId", "course_id", "OrgUnit.Id", "ou")) ?? fallbackCourse;
  if (!title || !cid) return null;
  if (pick(o, "IsHidden") === true) return null;
  const rawId = str(pick(o, "Id", "id", "ItemId", "FolderId", "ObjectId", "QuizId", "TopicId"));
  const id = rawId ?? title;
  let status = statusFrom(o);
  if (status === "unknown" && hint) status = hint;
  const isDropbox = pick(o, "DropboxType") !== undefined;
  // Dropbox folders don't carry the student's submission state; it comes from
  // submissions.json, and a released score on the linked grade item means graded.
  const sub = isDropbox && rawId ? submitted.get(`${cid}:${rawId}`) : undefined;
  if (sub && STATUS_RANK[sub.status] > STATUS_RANK[status]) status = sub.status;
  const grade = graded.get(`${cid}:${str(pick(o, "GradeItemId")) ?? ""}`);
  if (grade) status = "graded";
  return {
    id: `${cid}:${id}`,
    courseId: cid,
    title,
    kind: kindFrom(o, title),
    dueAt: date(pick(o, "DueDate", "due", "dueDate", "due_date", "DueDateTime", "EndDate", "EndDateTime")),
    status,
    // A linked grade's denominator wins: the folder's ScoreDenominator can differ (e.g. 70/70 graded vs folder out of 100).
    pointsPossible:
      grade?.possible ??
      num(pick(o, "Assessment.ScoreDenominator", "PointsPossible", "OutOf", "MaxPoints", "points_possible", "PointsDenominator")),
    pointsEarned: grade?.earned ?? sub?.score ?? num(pick(o, "Feedback.Score", "Score", "PointsEarned", "PointsNumerator", "points")),
    url:
      str(pick(o, "ItemUrl", "url", "Url", "Link", "ViewUrl", "AssociatedEntity.Link")) ??
      (isDropbox && rawId ? `${LMS_URL}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${cid}&db=${rawId}` : null),
  };
}

export function normalizeAssignments(raw: D2lRaw, warnings: string[]): Assignment[] {
  const out: Assignment[] = [];
  let skipped = 0;
  const graded: GradeLink = new Map();
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    for (const g of list(c.grades)) {
      const earned = num(pick(g, "PointsNumerator"));
      const gid = str(pick(g, "GradeObjectIdentifier"));
      if (earned != null && gid) graded.set(`${cid}:${gid}`, { earned, possible: num(pick(g, "PointsDenominator")) });
    }
  }
  const submitted = submissionLinks(raw);
  const add = (items: unknown, course: string | null, hint: Assignment["status"] | null) => {
    for (const item of list(items)) {
      const a = assignmentFrom(item, course, hint, graded, submitted);
      if (a) out.push(a);
      else skipped++;
    }
  };
  // Per-course lists are the most complete; due/overdue fill gaps (e.g. quizzes).
  for (const [cid, c] of Object.entries(raw.perCourse)) add(c.assignments, cid, null);
  add(raw.due, null, "not_submitted");
  add(raw.overdue, null, "not_submitted");
  if (skipped) warnings.push(`Skipped ${skipped} assignment record(s) missing a title or course.`);
  // Keep the first (richest) record per id, but prefer any record that knows its status.
  const byId = new Map<string, Assignment>();
  for (const a of out) {
    const prev = byId.get(a.id) ?? byId.get(titleKey(a));
    if (!prev) {
      byId.set(a.id, a);
      byId.set(titleKey(a), a);
    } else {
      // Most specific signal wins: graded > submitted > not_submitted > unknown.
      if (STATUS_RANK[a.status] > STATUS_RANK[prev.status]) prev.status = a.status;
      prev.pointsEarned ??= a.pointsEarned;
      prev.dueAt ??= a.dueAt;
      prev.pointsPossible ??= a.pointsPossible;
      prev.url ??= a.url;
    }
  }
  return [...new Set(byId.values())];
}

const STATUS_RANK: Record<Assignment["status"], number> = { unknown: 0, not_submitted: 1, submitted: 2, graded: 3 };

const titleKey = (a: Assignment) => `title:${a.courseId}:${a.title.toLowerCase()}`;

export function normalizeEvents(raw: unknown, warnings: string[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  let skipped = 0;
  for (const o of list(raw)) {
    const title = str(pick(o, "Title", "Name", "title", "name"));
    const startsAt = date(pick(o, "StartDateTime", "StartDate", "start", "startsAt", "Date", "date"));
    if (!title || !startsAt) {
      skipped++;
      continue;
    }
    const entity = String(pick(o, "AssociatedEntity.AssociatedEntityType", "type", "Type") ?? "");
    const kind: CalendarEvent["kind"] = /\b(exam|midterm|final exam)\b/i.test(title)
      ? "exam"
      : /dropbox|quiz|discussion|due|grade/i.test(entity) || /\bdue\b/i.test(title)
        ? "deadline"
        : /\b(lecture|class|lab|recitation|section)\b/i.test(title)
          ? "class"
          : "event";
    out.push({
      id: str(pick(o, "CalendarEventId", "Id", "id")) ?? `${title}@${startsAt}`,
      courseId: courseId(o),
      title,
      kind,
      startsAt,
      endsAt: date(pick(o, "EndDateTime", "EndDate", "end", "endsAt")),
      allDay: bool(pick(o, "IsAllDayEvent", "allDay", "AllDay")) ?? false,
      location: str(pick(o, "LocationName", "Location", "location")),
      url: str(pick(o, "AssociatedEntity.Link", "url", "Url", "Link")),
    });
  }
  if (skipped) warnings.push(`Skipped ${skipped} calendar record(s) missing a title or start time.`);
  return dedupe(out, (e) => e.id);
}

function gradeFrom(o: unknown, cid: string, isCourseTotal: boolean): Grade | null {
  const name = str(pick(o, "GradeObjectName", "Name", "name", "title")) ?? (isCourseTotal ? "Final grade" : null);
  if (!name) return null;
  // Category subtotals and per-item "Calculated" rollups are derived rows, not
  // graded work; showing them alongside items double-counts.
  const typeName = String(pick(o, "GradeObjectTypeName") ?? "");
  if (!isCourseTotal && /^(category|calculated)$/i.test(typeName)) return null;
  const earned = num(pick(o, "PointsNumerator", "Score", "points", "pointsEarned"));
  const possible = num(pick(o, "PointsDenominator", "OutOf", "MaxPoints", "pointsPossible"));
  const display = str(pick(o, "DisplayedGrade", "display", "Grade", "grade"));
  let percent = num(pick(o, "percent", "Percent", "Percentage"));
  if (percent == null && earned != null && possible) percent = Math.round((earned / possible) * 1000) / 10;
  if (percent == null && display) {
    const m = display.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) percent = Number(m[1]);
  }
  if (earned == null && percent == null && !display) return null; // not graded yet
  return {
    id: `${cid}:${isCourseTotal ? "final" : (str(pick(o, "GradeObjectIdentifier", "Id", "id")) ?? name)}`,
    courseId: cid,
    name,
    pointsEarned: earned,
    pointsPossible: possible,
    percent: percent == null ? null : Math.round(percent * 10) / 10,
    display,
    isCourseTotal,
    postedAt: date(pick(o, "ReleasedDate", "LastModified", "postedAt", "Released")),
  };
}

export function normalizeGrades(raw: D2lRaw, warnings: string[]): Grade[] {
  const out: Grade[] = [];
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    const catNames = new Map(list(c.gradeCategories).map((k) => [str(pick(k, "Id")) ?? "", str(pick(k, "Name"))]));
    const itemCats = new Map(list(c.gradeObjects).map((k) => [str(pick(k, "Id")) ?? "", catNames.get(str(pick(k, "CategoryId")) ?? "") ?? null]));
    for (const o of list(c.grades)) {
      const g = gradeFrom(o, cid, /^final (calculated|adjusted) grade$/i.test(String(pick(o, "GradeObjectName") ?? "")));
      if (g) out.push({ ...g, category: itemCats.get(str(pick(o, "GradeObjectIdentifier")) ?? "") ?? null });
    }
  }
  // `d2l grades --final`: one released final grade per course (often empty mid-term).
  for (const o of list(raw.finalGrades)) {
    const cid = courseId(o);
    const g = cid ? gradeFrom(o, cid, true) : null;
    if (g) out.push(g);
  }
  if (Object.keys(raw.perCourse).length && !out.length) warnings.push("No released grades were found.");
  return dedupe(out, (g) => g.id);
}

/** Item types that hold no score of their own (rollups, text, formulas). */
const NON_SCORED = /^(category|calculated|formula|text|selectbox)$/i;

function gradebookFrom(c: D2lRaw["perCourse"][string]): Gradebook {
  const values = new Map<string, unknown>();
  for (const v of list(c.grades)) {
    const id = str(pick(v, "GradeObjectIdentifier"));
    if (id) values.set(id, v);
  }
  const scored = (v: unknown) => ({
    earned: num(pick(v, "PointsNumerator")),
    possible: num(pick(v, "PointsDenominator")),
    at: date(pick(v, "ReleasedDate", "LastModified")),
  });
  const objects = list(c.gradeObjects);
  if (!objects.length) {
    // No definitions synced: fall back to plain points over scored rows.
    const items = [...values.entries()]
      .filter(([, v]) => !NON_SCORED.test(String(pick(v, "GradeObjectTypeName") ?? "")))
      .map(([id, v]) => ({ id, name: str(pick(v, "GradeObjectName")) ?? id, categoryId: null, categoryName: null, weight: null, excluded: false, ...scored(v) }));
    return { system: "points", items, categories: [] };
  }
  const catNames = new Map(list(c.gradeCategories).map((k) => [str(pick(k, "Id")) ?? "", str(pick(k, "Name"))]));
  const system = /points/i.test(String(pick(c.gradeSetup, "GradingSystem") ?? "")) ? "points" : "weighted";
  const items = objects
    .filter((o) => !NON_SCORED.test(String(pick(o, "GradeType") ?? "")))
    .map((o) => {
      const id = str(pick(o, "Id")) ?? "";
      const v = values.get(id);
      const s = v ? scored(v) : { earned: null, possible: null, at: null };
      const cat = str(pick(o, "CategoryId"));
      const categoryId = cat && cat !== "0" ? cat : null;
      return {
        id,
        name: str(pick(o, "Name")) ?? id,
        categoryId,
        categoryName: categoryId ? (catNames.get(categoryId) ?? null) : null,
        weight: num(pick(o, "Weight")),
        excluded: pick(o, "ExcludeFromFinalGradeCalculation") === true || pick(o, "IsBonus") === true,
        ...s,
        possible: s.possible ?? num(pick(o, "MaxPoints")),
      };
    })
    .filter((i) => i.id);
  const categories = list(c.gradeCategories)
    .filter((k) => pick(k, "ExcludeFromFinalGrade") !== true)
    .map((k) => ({
      id: str(pick(k, "Id")) ?? "",
      weight: num(pick(k, "Weight")) ?? 0,
      dropLowest: num(pick(k, "NumberOfLowestToDrop")) ?? 0,
      expectedWeight: 100,
    }))
    .filter((k) => k.id);
  return { system, items, categories };
}

/** Syllabi keyed by course code ("CSCI 1301"). */
export type Syllabi = Record<string, Syllabus>;

export function normalizeStandings(raw: D2lRaw, courses: Course[], syllabi: Syllabi = {}, webassign: Record<string, WebAssignCourse> = {}): CourseStanding[] {
  const codes = new Map(courses.map((c) => [c.id, c.code]));
  const out: CourseStanding[] = [];
  for (const [cid, c] of Object.entries(raw.perCourse)) {
    const code = codes.get(cid);
    const syl = code ? syllabi[code] : undefined;
    let book = withWebAssignGrades(code, gradebookFrom(c), webassign);
    if (code && syl?.quizLog) book = withQuizLog(book, raw.quizLogs?.[code], syl.quizLog.category);
    const s = courseStanding(cid, book, syl);
    if (s) out.push(s);
  }
  return out;
}

export function normalizeNews(raw: D2lRaw, warnings: string[]): Announcement[] {
  const out: Announcement[] = [];
  const add = (items: unknown, fallbackCourse: string | null) => {
    for (const item of list(items)) {
      // d2l-cli wraps feed items as { Resource: {...news item}, Metadata: { WebViewUrl } }.
      const o = pick(item, "Resource") ?? item;
      const webPath = str(pick(item, "Metadata.WebViewUrl"));
      const title = str(pick(o, "Title", "title", "Name"));
      // Not courseId(): its generic "Id" fallback would pick the news item's own id.
      const cid = str(pick(o, "OrgUnitId", "CourseId", "OrgUnit.Id")) ?? webPath?.match(/\/news\/(\d+)\//)?.[1] ?? fallbackCourse;
      const postedAt = date(pick(o, "StartDate", "CreatedDate", "PublishedDate", "date", "postedAt", "LastModifiedDate"));
      if (!title || !cid || !postedAt || pick(o, "IsHidden") === true) continue;
      const body = str(pick(o, "Body.Text", "Body.Html", "body", "text", "Body"));
      out.push({
        id: `${cid}:${str(pick(o, "Id", "id")) ?? title}`,
        courseId: cid,
        title,
        body: body ? stripHtml(body).slice(0, 2000) : null,
        postedAt,
        url: webPath ? `${LMS_URL}${webPath}` : `${LMS_URL}/d2l/lms/news/main.d2l?ou=${cid}`,
      });
    }
  };
  add(raw.news, null);
  for (const [cid, c] of Object.entries(raw.perCourse)) add(c.news, cid);
  void warnings;
  return dedupe(out, (n) => n.id).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

function dedupe<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)));
}

export function normalizeD2l(raw: D2lRaw, syllabi: Syllabi = {}, webassign: Record<string, WebAssignCourse> = {}): SchoolSnapshot {
  const warnings = raw.failures.map((f) => `Sync step failed: ${f}`);
  const courses = normalizeCourses(raw.courses, warnings);
  const known = new Set(courses.map((c) => c.id));
  const assignments = normalizeAssignments(raw, warnings).filter((a) => known.has(a.courseId) || !known.size);
  const events = normalizeEvents(raw.calendar, warnings);
  return {
    version: 1,
    source: "d2l",
    generatedAt: date(raw.fetchedAt) ?? new Date().toISOString(),
    courses,
    assignments,
    events,
    grades: normalizeGrades(raw, warnings),
    announcements: normalizeNews(raw, warnings),
    standings: normalizeStandings(raw, courses, syllabi, webassign).filter((s) => known.has(s.courseId) || !known.size),
    warnings,
  };
}
