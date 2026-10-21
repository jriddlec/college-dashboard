"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FolderOpen, Search, X } from "lucide-react";
import { FILTER_LABEL, FILTER_ORDER, KIND_FILTER, flatten, type CourseLibrary, type Filter, type Group, type Material } from "@/lib/library/catalog";
import { MaterialRow, shortDate } from "./material";
import { EmptyState, Section, buttonClass } from "../ui";

type OpenState = Record<string, boolean>;

function allGroups(groups: Group[]): Group[] {
  return groups.flatMap((g) => [g, ...allGroups(g.children)]);
}

/** Open a group and every folder above it, so a link to a nested folder (Labs/Lab 4) shows it. */
function openPath(groups: Group[], id: string): OpenState {
  return Object.fromEntries(groups.filter((g) => g.id === id || id.startsWith(g.id + "/")).map((g) => [g.id, true]));
}

function matches(m: Material, q: string, filter: Filter | null): boolean {
  if (filter && KIND_FILTER[m.kind] !== filter) return false;
  if (!q) return true;
  return `${m.title} ${m.primary.path}`.toLowerCase().includes(q);
}

/** Filtered copy of a group tree; groups with nothing left are dropped. */
function prune(g: Group, keep: (m: Material) => boolean): Group | null {
  const items = g.items.filter(keep);
  const readme = g.readme && keep(g.readme) ? g.readme : null;
  const children = g.children.map((c) => prune(c, keep)).filter((c): c is Group => c != null);
  const total = items.length + (readme ? 1 : 0) + children.reduce((n, c) => n + c.total, 0);
  return total ? { ...g, items, readme, children, total } : null;
}

export function LibraryView({ lib, focus }: { lib: CourseLibrary; focus?: string }) {
  const storageKey = `study:open:${lib.course.slug}`;
  const sections = useMemo(
    () => [
      // Exams already taken drop out of prep; undated folders stay.
      { key: "exams", title: "Exam prep", groups: lib.exams.filter((g) => !(g.examDays != null && g.examDays < 0)) },
      { key: "units", title: "Units", groups: lib.units },
      { key: "classwork", title: "Classwork", groups: lib.classwork },
      { key: "documents", title: "Course documents", groups: lib.documents },
    ],
    [lib],
  );
  const everyGroup = useMemo(() => sections.flatMap((s) => allGroups(s.groups)), [sections]);

  // Default: the next exam's prep and the current unit open, everything else closed.
  const defaults = useMemo<OpenState>(() => {
    const o: OpenState = {};
    if (lib.exams[0] && !(lib.exams[0].examDays != null && lib.exams[0].examDays < 0)) o[lib.exams[0].id] = true;
    if (lib.currentUnitId) o[lib.currentUnitId] = true;
    return o;
  }, [lib]);
  const [open, setOpen] = useState<OpenState>(defaults);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      const restored = saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults;
      // Restore the user's last expand/collapse choices after hydration;
      // ?open=<group id> (links from Home) also opens that group and scrolls to it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(focus ? { ...restored, ...openPath(everyGroup, focus) } : restored);
    } catch {}
    if (focus) requestAnimationFrame(() => document.getElementById(domId(focus))?.scrollIntoView({ block: "start" }));
  }, [storageKey, defaults, focus, everyGroup]);

  function persist(next: OpenState) {
    setOpen(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }
  const q = query.trim().toLowerCase();
  const filtering = q !== "" || filter != null;

  // While searching/filtering everything starts expanded; collapses made then are
  // kept separately (and reset when the search changes) so the saved layout is untouched.
  const [filterClosed, setFilterClosed] = useState<OpenState>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilterClosed({});
  }, [q, filter]);

  const isOpen = (id: string) => (filtering ? !filterClosed[id] : !!open[id]);
  const toggle = (id: string) =>
    filtering ? setFilterClosed({ ...filterClosed, [id]: !filterClosed[id] }) : persist({ ...open, [id]: !open[id] });
  const setAll = (value: boolean) =>
    filtering
      ? setFilterClosed(Object.fromEntries(everyGroup.map((g) => [g.id, !value])))
      : persist(Object.fromEntries(everyGroup.map((g) => [g.id, value])));
  const keep = (m: Material) => matches(m, q, filter);

  const counts = useMemo(() => {
    const c = new Map<Filter, number>();
    for (const m of flatten(sections.flatMap((s) => s.groups))) c.set(KIND_FILTER[m.kind], (c.get(KIND_FILTER[m.kind]) ?? 0) + 1);
    return c;
  }, [sections]);

  const shown = sections.map((s) => ({
    ...s,
    groups: filtering ? s.groups.map((g) => prune(g, keep)).filter((g): g is Group => g != null) : s.groups,
  }));
  const nothing = filtering && shown.every((s) => s.groups.length === 0);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${lib.course.code}`}
              className="w-full rounded-md border border-border bg-surface pl-8 pr-8 py-1.5 text-[13px] placeholder:text-subtle focus:outline-none focus:border-border-strong"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-subtle hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button onClick={() => setAll(true)} className={buttonClass}>
            <ChevronsUpDown className="size-3.5" /> Expand all
          </button>
          <button onClick={() => setAll(false)} className={buttonClass}>
            <ChevronsDownUp className="size-3.5" /> Collapse all
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter == null} onClick={() => setFilter(null)}>
            All <span className="text-subtle tabular-nums">{lib.stats.items}</span>
          </Chip>
          {FILTER_ORDER.filter((f) => counts.get(f)).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
              {FILTER_LABEL[f]} <span className="text-subtle tabular-nums">{counts.get(f)}</span>
            </Chip>
          ))}
        </div>
      </div>

      {nothing && (
        <div className="card">
          <EmptyState icon={Search} title="Nothing matches">
            Try another word, or clear the filter.
          </EmptyState>
        </div>
      )}

      {shown.map(
        (s) =>
          s.groups.length > 0 && (
            <Section key={s.key} title={s.title} count={s.groups.length}>
              <div className="space-y-2">
                {s.groups.map((g) => (
                  <GroupCard key={g.id} g={g} isOpen={isOpen} onToggle={toggle} kind={s.key} />
                ))}
              </div>
            </Section>
          ),
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
        active ? "border-fg bg-fg text-bg [&>span]:text-bg/70" : "border-border bg-surface text-muted hover:text-fg hover:border-border-strong",
      )}
    >
      {children}
    </button>
  );
}

function GroupHeader({ g, isOpen, onClick, kind, nested }: { g: Group; isOpen: boolean; onClick: () => void; kind: string; nested?: boolean }) {
  const empty = g.total === 0;
  return (
    <button
      onClick={onClick}
      aria-expanded={isOpen}
      disabled={empty}
      className={clsx(
        "w-full flex items-center gap-2.5 text-left transition-colors",
        nested ? "px-4 py-2 hover:bg-surface-2/60" : "px-4 py-3 hover:bg-surface-2/60",
        empty && "cursor-default hover:bg-transparent",
      )}
    >
      <ChevronRight className={clsx("size-3.5 shrink-0 text-subtle transition-transform", isOpen && "rotate-90", empty && "opacity-0")} />
      {kind === "units" && g.number != null && (
        <span className={clsx("shrink-0 grid place-items-center size-6 rounded-md text-[11.5px] font-semibold tabular-nums", empty ? "bg-surface-2 text-subtle" : "course-soft")}>
          {g.number}
        </span>
      )}
      <span className={clsx("min-w-0 flex-1 truncate", nested ? "text-[13px] font-medium" : "text-[14px] font-semibold", empty && "text-subtle font-normal")}>{g.title}</span>
      {g.tag && <span className="hidden sm:inline text-[11.5px] text-muted bg-surface-2 rounded px-1.5 py-px whitespace-nowrap">{g.tag}</span>}
      {g.examDays != null && <ExamChip days={g.examDays} />}
      {empty ? (
        <span className="text-[12px] text-subtle whitespace-nowrap">Nothing yet</span>
      ) : (
        <span className="text-[12px] text-muted tabular-nums whitespace-nowrap">
          {g.total} {g.total === 1 ? "item" : "items"}
          {(g.date ?? (nested ? null : g.latest)) && <span className="hidden sm:inline text-subtle"> · {shortDate((g.date ?? g.latest)!)}</span>}
        </span>
      )}
    </button>
  );
}

function GroupBody({ g, isOpen: openFn, onToggle, kind }: { g: Group; isOpen: (id: string) => boolean; onToggle: (id: string) => void; kind: string }) {
  const rows = [...(g.readme ? [g.readme] : []), ...g.items];
  return (
    <div className="border-t border-border">
      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((m) => (
            <MaterialRow key={m.id} m={m} />
          ))}
        </ul>
      )}
      {g.children.map((c) => {
        const isOpen = openFn(c.id);
        return (
          <div key={c.id} className={clsx("bg-surface-2/30", rows.length > 0 || g.children[0] !== c ? "border-t border-border" : "")}>
            <GroupHeader g={c} isOpen={isOpen} onClick={() => onToggle(c.id)} kind={kind} nested />
            {isOpen && c.total > 0 && (
              <div className="pl-4 bg-surface">
                <GroupBody g={c} isOpen={openFn} onToggle={onToggle} kind={kind} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Countdown on an exam-prep folder: "in 3 days", "Today", or "Done" once the exam is past. */
function ExamChip({ days }: { days: number }) {
  const label = days < 0 ? "Done" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
  return (
    <span
      className={clsx(
        "text-[11.5px] rounded px-1.5 py-px whitespace-nowrap tabular-nums",
        days < 0 ? "bg-surface-2 text-subtle" : days <= 3 ? "bg-danger-soft text-danger" : days <= 7 ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
      )}
    >
      {label}
    </span>
  );
}

export function domId(groupId: string): string {
  return "g-" + groupId.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function GroupCard({ g, isOpen: openFn, onToggle, kind }: { g: Group; isOpen: (id: string) => boolean; onToggle: (id: string) => void; kind: string }) {
  const isOpen = openFn(g.id);
  return (
    <div id={domId(g.id)} className={clsx("card overflow-hidden scroll-mt-16", g.total === 0 && "bg-transparent shadow-none border-dashed")}>
      <GroupHeader g={g} isOpen={isOpen} onClick={() => onToggle(g.id)} kind={kind} />
      {isOpen && g.total > 0 && <GroupBody g={g} isOpen={openFn} onToggle={onToggle} kind={kind} />}
    </div>
  );
}

export function NoMaterial({ code }: { code: string }) {
  return (
    <div className="card">
      <EmptyState icon={FolderOpen} title={`No ${code} material yet`}>
        Add folders named “{code.replace(" ", "")} Notes”, “… Classwork” or “… Important Documents” to the library.
      </EmptyState>
    </div>
  );
}
