"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { Material } from "@/lib/library/catalog";
import { MaterialRow } from "./material";
import { EmptyState, Section } from "../ui";

export type SearchEntry = { m: Material; context: string; hue: number };

const LIMIT = 60;

/** Search every class; while a query is typed it replaces the Home content. */
export function HomeSearch({ entries, children }: { entries: SearchEntry[]; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? entries.filter((e) => {
        const hay = `${e.context} ${e.m.title} ${e.m.primary.path}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : [];

  return (
    <>
      <label className="relative block mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all classes: “shell method”, “enums”, “syllabus”…"
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-9 py-2.5 text-[14px] shadow-[var(--shadow)] placeholder:text-subtle focus:outline-none focus:border-border-strong"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </label>
      {words.length ? (
        <Section title="Results" count={hits.length}>
          {hits.length ? (
            <ul className="card divide-y divide-border overflow-hidden">
              {hits.slice(0, LIMIT).map((e) => (
                <MaterialRow key={e.m.id} m={e.m} context={e.context} hue={e.hue} />
              ))}
            </ul>
          ) : (
            <div className="card">
              <EmptyState icon={Search} title="Nothing matches">
                Try a different word.
              </EmptyState>
            </div>
          )}
          {hits.length > LIMIT && <p className="text-[12.5px] text-muted mt-2 px-0.5">Showing the first {LIMIT}. Add a word to narrow it down.</p>}
        </Section>
      ) : (
        children
      )}
    </>
  );
}
