"use client";

import { useMemo, useState } from "react";
import type { Grade } from "@/lib/school/types";
import { formatShortDate } from "@/lib/school/time";

/** Fallback types for items without a gradebook category, in display order. */
const TYPES: [string, RegExp][] = [
  ["Exams", /\b(exam|test|midterm|final)s?\b/i],
  ["Quizzes", /\bquiz(z?es)?\b/i],
  ["Homework", /\b(homework|hw|webassign|problem set|pset|assignment)s?\b/i],
  ["Labs", /\blabs?\b/i],
  ["Projects", /\b(project|paper|essay|report)s?\b/i],
  ["Discussions", /\b(discussion|post|reflection)s?\b/i],
  ["Participation", /\b(participation|attendance|clicker|iclicker|tophat)\b/i],
];

function typeOf(g: Grade): string {
  if (g.category) return g.category;
  return TYPES.find(([, re]) => re.test(g.name))?.[0] ?? "Other";
}

/** Known types sort in TYPES order (matched on the label), anything else alphabetically, "Other" last. */
function typeRank(t: string): number {
  if (t === "Other") return 1000;
  const i = TYPES.findIndex(([label, re]) => label === t || re.test(t));
  return i === -1 ? 500 : i;
}

type SortKey = "type" | "recent" | "score";
const time = (g: Grade) => Date.parse(g.postedAt ?? "0") || 0;

export function GradeTable({ items, weights }: { items: Grade[]; weights?: Record<string, number> }) {
  const [sort, setSort] = useState<SortKey>("type");
  const [filter, setFilter] = useState<string | null>(null);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of items) counts.set(typeOf(g), (counts.get(typeOf(g)) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => typeRank(a) - typeRank(b) || a.localeCompare(b));
  }, [items]);

  const rows = useMemo(() => {
    const shown = filter ? items.filter((g) => typeOf(g) === filter) : items;
    const byRecent = (a: Grade, b: Grade) => time(b) - time(a);
    return [...shown].sort(
      sort === "recent"
        ? byRecent
        : sort === "score"
          ? (a, b) => (b.percent ?? -1) - (a.percent ?? -1) || byRecent(a, b)
          : (a, b) => typeRank(typeOf(a)) - typeRank(typeOf(b)) || typeOf(a).localeCompare(typeOf(b)) || byRecent(a, b),
    );
  }, [items, filter, sort]);

  /** Per-type average: points earned / possible when every graded item has points, else the mean of percents. */
  const averages = useMemo(() => {
    const out = new Map<string, number>();
    for (const [t] of types) {
      const graded = items.filter((g) => typeOf(g) === t && g.percent != null);
      if (!graded.length) continue;
      const pts = graded.every((g) => g.pointsEarned != null && g.pointsPossible);
      const avg = pts
        ? (100 * graded.reduce((s, g) => s + g.pointsEarned!, 0)) / graded.reduce((s, g) => s + g.pointsPossible!, 0)
        : graded.reduce((s, g) => s + g.percent!, 0) / graded.length;
      out.set(t, Math.round(avg * 10) / 10);
    }
    return out;
  }, [items, types]);

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${active ? "border-border-strong bg-surface-2 text-fg" : "border-border text-muted hover:text-fg"}`;
  const grouped = sort === "type";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(filter === null)} onClick={() => setFilter(null)}>
            All <span className="text-subtle">{items.length}</span>
          </button>
          {types.length > 1 &&
            types.map(([t, n]) => (
              <button key={t} type="button" className={chip(filter === t)} onClick={() => setFilter(filter === t ? null : t)}>
                {t} <span className="text-subtle">{n}</span>
              </button>
            ))}
        </div>
        <label className="text-[12px] text-muted inline-flex items-center gap-1.5">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12px] text-fg">
            <option value="type">Type</option>
            <option value="recent">Most recent</option>
            <option value="score">Score</option>
          </select>
        </label>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-subtle border-b border-border">
              <th className="font-medium px-4 py-2">Item</th>
              <th className="font-medium px-4 py-2 text-right">Score</th>
              <th className="font-medium px-4 py-2 text-right hidden sm:table-cell">Posted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((g, i) => {
              const t = typeOf(g);
              const header = grouped && (i === 0 || typeOf(rows[i - 1]) !== t);
              return [
                header && (
                  <tr key={`h-${t}`} className="bg-surface-2">
                    <td className="px-4 py-1.5 text-[11.5px] font-semibold text-muted uppercase tracking-[0.04em]">
                      {t}
                      {weights?.[t] != null && <span className="ml-2 font-normal normal-case tracking-normal text-subtle">{weights[t]}% of grade</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right text-[11.5px] text-muted tabular-nums whitespace-nowrap">
                      {averages.has(t) && <span className="font-semibold">{averages.get(t)}%</span>}
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                ),
                <tr key={g.id}>
                  <td className="px-4 py-2.5">
                    {g.name}
                    {!grouped && !filter && <span className="text-subtle text-[11.5px] ml-2">{t}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {g.pointsEarned != null && g.pointsPossible ? (
                      <>
                        {g.pointsEarned}
                        <span className="text-subtle">/{g.pointsPossible}</span>
                      </>
                    ) : (
                      (g.display ?? "—")
                    )}
                    {g.percent != null && <span className="text-muted ml-2">{g.percent}%</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted hidden sm:table-cell whitespace-nowrap">{g.postedAt ? formatShortDate(g.postedAt) : "—"}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
