"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CalendarX2, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, X, Zap } from "lucide-react";
import { Badge, EmptyState, PageHeader, hueStyle } from "@/components/ui";

/** Everything here is pre-formatted on the server in the school timezone; the client only adds countdowns. */
export type CalItem = {
  key: string;
  day: string;
  at: string;
  title: string;
  kind: string;
  kindLabel: string;
  isEvent: boolean;
  timeLabel: string;
  whenLabel: string;
  courseId: string;
  courseLabel: string;
  courseHref: string | null;
  url: string | null;
  location: string | null;
  done: boolean;
  overdue: boolean;
  status: string | null;
  points: string | null;
  bonus: { at: string; percent: number; label: string } | null;
};

export type CalBonus = {
  id: string;
  itemKey: string;
  title: string;
  shortTitle: string;
  courseId: string;
  courseLabel: string;
  courseHref: string | null;
  at: string;
  percent: number;
  cutoffLabel: string;
  cutoffTime: string;
  dueAt: string;
  dueLabel: string;
  url: string | null;
  days: string[];
};

export type CalCourse = { id: string; label: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOON_MS = 48 * 3600_000;

/** "2d 4h", "5h 12m", "12m" */
function countdown(ms: number): string {
  const m = Math.max(1, Math.floor(Math.abs(ms) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function useNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  return now;
}

type Open = { kind: "item" | "day"; id: string; anchor: HTMLElement } | null;
type Hover = { bonusIds: string[]; anchor: HTMLElement } | null;

export function CalendarView(props: {
  lmsLabel: string;
  /** Planner tab bar, rendered under the header. */
  tabs?: ReactNode;
  month: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  today: string;
  nowMs: number;
  showClasses: boolean;
  initialHidden: string[];
  courses: CalCourse[];
  cells: string[];
  dayLabels: Record<string, string>;
  items: CalItem[];
  bonuses: CalBonus[];
}) {
  const { month, today, cells, showClasses } = props;
  const router = useRouter();
  const now = useNow(props.nowMs);
  const [hidden, setHidden] = useState(() => new Set(props.initialHidden));
  const [open, setOpen] = useState<Open>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [focusBonus, setFocusBonus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const href = useCallback(
    (m: string, classes = showClasses, hide = hidden) => {
      const p = new URLSearchParams();
      if (m !== today.slice(0, 7)) p.set("month", m);
      if (classes) p.set("classes", "1");
      if (hide.size) p.set("hide", [...hide].join(","));
      const s = p.toString().replace(/%2C/g, ",");
      return s ? `/calendar?${s}` : "/calendar";
    },
    [showClasses, hidden, today],
  );

  const toggleCourse = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    window.history.replaceState(null, "", href(month, showClasses, next));
  };
  const soloCourse = (id: string) => {
    const next = new Set(props.courses.map((c) => c.id).filter((c) => c !== id));
    if (hidden.size === next.size && [...next].every((c) => hidden.has(c))) next.clear();
    setHidden(next);
    window.history.replaceState(null, "", href(month, showClasses, next));
  };

  const items = props.items.filter((i) => !hidden.has(i.courseId));
  const bonuses = props.bonuses.filter((b) => !hidden.has(b.courseId));
  const itemsByKey = new Map(props.items.map((i) => [i.key, i]));
  const bonusById = new Map(props.bonuses.map((b) => [b.id, b]));

  const byDay = new Map<string, CalItem[]>();
  for (const i of items) {
    if (!byDay.has(i.day)) byDay.set(i.day, []);
    byDay.get(i.day)!.push(i);
  }
  const cutoffsByDay = new Map<string, CalBonus[]>();
  const windowsByDay = new Map<string, CalBonus[]>();
  for (const b of bonuses) {
    const k = b.days[0];
    if (!cutoffsByDay.has(k)) cutoffsByDay.set(k, []);
    cutoffsByDay.get(k)!.push(b);
    for (const d of b.days) {
      if (!windowsByDay.has(d)) windowsByDay.set(d, []);
      windowsByDay.get(d)!.push(b);
    }
  }
  const agendaDays = [...new Set([...byDay.keys(), ...cutoffsByDay.keys()])].filter((k) => k.startsWith(month)).sort();

  // Keyboard: ←/→ month, t today, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || (t instanceof Element && t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "Escape") {
        setOpen(null);
        setHover(null);
      } else if (e.key === "ArrowLeft") router.push(href(props.prevMonth));
      else if (e.key === "ArrowRight") router.push(href(props.nextMonth));
      else if (e.key === "t" || e.key === "T") router.push(href(today.slice(0, 7)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, href, props.prevMonth, props.nextMonth, today]);

  const jumpToDay = (k: string) => {
    const el = document.getElementById(`day-${k}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash(k);
    setTimeout(() => setFlash((f) => (f === k ? null : f)), 1600);
  };

  const toggleOpen = (kind: "item" | "day", id: string, anchor: HTMLElement) => setOpen((o) => (o && o.kind === kind && o.id === id ? null : { kind, id, anchor }));

  const highlighted = new Set<string>();
  const activeBonus = focusBonus ? [focusBonus] : (hover?.bonusIds ?? []);
  for (const id of activeBonus) for (const d of bonusById.get(id)?.days ?? []) highlighted.add(d);

  return (
    <div>
      <PageHeader
        title="Planner"
        subtitle={`Deadlines, exams, and events from ${props.lmsLabel}`}
        actions={
          <Link
            href={href(month, !showClasses)}
            className={clsx("text-[12.5px] rounded-md border px-2.5 py-1 transition-colors", showClasses ? "border-border-strong text-fg bg-surface-2" : "border-border text-muted hover:text-fg")}
          >
            {showClasses ? "Hide class meetings" : "Show class meetings"}
          </Link>
        }
      />
      {props.tabs}

      {props.courses.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="group" aria-label="Filter by course">
          {props.courses.map((c) => {
            const on = !hidden.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCourse(c.id)}
                onDoubleClick={() => soloCourse(c.id)}
                aria-pressed={on}
                title="Click to toggle · double-click to show only this course"
                style={hueStyle(c.id || null)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] transition-colors select-none",
                  on ? "border-border-strong bg-surface text-fg" : "border-border text-subtle line-through opacity-70",
                )}
              >
                <span className={clsx("size-1.5 rounded-full", on ? "course-dot" : "bg-border-strong")} />
                {c.label}
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setHidden(new Set());
                window.history.replaceState(null, "", href(month, showClasses, new Set()));
              }}
              className="text-[12px] text-muted hover:text-fg px-1.5"
            >
              Show all
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-semibold">{props.monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Link href={href(props.prevMonth)} aria-label="Previous month" title="Previous month (←)" className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={href(today.slice(0, 7))} title="Today (T)" className="px-2.5 py-1 rounded-md text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg">
            Today
          </Link>
          <Link href={href(props.nextMonth)} aria-label="Next month" title="Next month (→)" className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Month grid (tablet/desktop) */}
      <div className="hidden md:block card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2.5 py-2 text-[11.5px] font-medium text-subtle">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((k, idx) => {
            const dayItems = byDay.get(k) ?? [];
            const cutoffs = cutoffsByDay.get(k) ?? [];
            const windows = windowsByDay.get(k) ?? [];
            const inMonth = k.startsWith(month);
            const isToday = k === today;
            const room = Math.max(1, 4 - cutoffs.length);
            const hasAgenda = inMonth && (dayItems.length > 0 || cutoffs.length > 0);
            return (
              <div
                key={k}
                className={clsx(
                  "relative min-h-28 p-1.5 pb-3 border-border transition-colors",
                  idx % 7 !== 6 && "border-r",
                  idx < cells.length - 7 && "border-b",
                  !inMonth && "bg-surface-2/50",
                  cutoffs.length > 0 && "bg-warn-soft",
                  highlighted.has(k) && "bg-warn-soft! ring-1 ring-inset ring-warn/50",
                )}
              >
                <button
                  type="button"
                  disabled={!hasAgenda}
                  onClick={() => jumpToDay(k)}
                  title={hasAgenda ? "Jump to this day in the agenda" : undefined}
                  className={clsx(
                    "text-[12px] mb-1 px-1 tabular-nums rounded enabled:hover:bg-surface-2 enabled:cursor-pointer",
                    isToday ? "inline-grid place-items-center size-5.5 rounded-full bg-accent text-white font-semibold px-0 enabled:hover:bg-accent" : inMonth ? "text-muted" : "text-subtle",
                  )}
                >
                  {Number(k.slice(8))}
                </button>
                <ul className="space-y-0.5">
                  {cutoffs.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        style={hueStyle(b.courseId)}
                        onClick={(e) => toggleOpen("item", b.itemKey, e.currentTarget)}
                        onMouseEnter={() => setFocusBonus(b.id)}
                        onMouseLeave={() => setFocusBonus(null)}
                        className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] leading-tight text-warn font-medium hover:bg-warn/10 text-left"
                      >
                        <Zap className="size-3 shrink-0" />
                        <span className="truncate">
                          +{b.percent}% · {b.shortTitle}
                        </span>
                      </button>
                    </li>
                  ))}
                  {dayItems.slice(0, room).map((i) => (
                    <li key={i.key}>
                      <Chip item={i} now={now} onClick={(el) => toggleOpen("item", i.key, el)} onHover={(on) => i.bonus && setFocusBonus(on ? i.key.slice(1) : null)} />
                    </li>
                  ))}
                  {dayItems.length > room && (
                    <li>
                      <button type="button" onClick={(e) => toggleOpen("day", k, e.currentTarget)} className="text-[11px] text-subtle hover:text-fg hover:underline px-1">
                        +{dayItems.length - room} more
                      </button>
                    </li>
                  )}
                </ul>
                {windows.length > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 h-2.5 flex flex-col justify-end gap-px cursor-help"
                    onMouseEnter={(e) => setHover({ bonusIds: windows.map((w) => w.id), anchor: e.currentTarget })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {windows.map((w) => (
                      <div key={w.id} className={clsx("h-0.75 bg-warn transition-opacity", activeBonus.length && !activeBonus.includes(w.id) && "opacity-30")} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {bonuses.length > 0 && (
        <p className="hidden md:flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11.5px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-4 h-2.5 rounded-sm bg-warn-soft border border-warn/40" /> Early-bonus cutoff
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-4 h-0.75 bg-warn" /> Final 72h — finished now, no bonus (hover for details)
          </span>
          <span className="ml-auto">Click an item for details · ← → months · T today</span>
        </p>
      )}

      {/* Agenda (all sizes; primary view on phones) */}
      <section className="mt-8 md:mt-10">
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em] mb-2.5 px-0.5">Agenda</h2>
        {agendaDays.length === 0 ? (
          <div className="card">
            <EmptyState icon={CalendarX2} title="Nothing this month">
              {hidden.size ? "Nothing this month for the selected courses." : "No deadlines or events are on the calendar for this month."}
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-4">
            {agendaDays.map((k) => (
              <div
                key={k}
                id={`day-${k}`}
                className={clsx(
                  "scroll-mt-4 rounded-lg transition-[box-shadow,opacity] duration-500",
                  k < today && flash !== k && "opacity-60",
                  flash === k && "ring-2 ring-accent ring-offset-4 ring-offset-bg",
                )}
              >
                <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
                  <span className={clsx("text-[13px] font-medium", k === today && "text-accent")}>{props.dayLabels[k]}</span>
                  {k === today && <span className="text-[11.5px] text-accent">Today</span>}
                </div>
                <ul className="card divide-y divide-border overflow-hidden">
                  {(cutoffsByDay.get(k) ?? []).map((b) => (
                    <BonusRow key={b.id} bonus={b} now={now} />
                  ))}
                  {(byDay.get(k) ?? []).map((i) => (
                    <AgendaRow
                      key={i.key}
                      item={i}
                      now={now}
                      expanded={expanded.has(i.key)}
                      onToggle={() =>
                        setExpanded((s) => {
                          const n = new Set(s);
                          if (n.has(i.key)) n.delete(i.key);
                          else n.add(i.key);
                          return n;
                        })
                      }
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {open && (
        <Floating anchor={open.anchor} onClose={() => setOpen(null)} interactive>
          {open.kind === "item" && itemsByKey.get(open.id) ? (
            <ItemDetails item={itemsByKey.get(open.id)!} now={now} onClose={() => setOpen(null)} />
          ) : open.kind === "item" && bonusById.get(open.id.slice(1)) ? (
            <BonusDetails bonuses={[bonusById.get(open.id.slice(1))!]} now={now} />
          ) : open.kind === "day" ? (
            <div className="w-72">
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                <span className="text-[12.5px] font-medium">{props.dayLabels[open.id]}</span>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="text-muted hover:text-fg">
                  <X className="size-3.5" />
                </button>
              </div>
              <ul className="px-1.5 pb-2 space-y-0.5 max-h-80 overflow-y-auto">
                {(byDay.get(open.id) ?? []).map((i) => (
                  <li key={i.key} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] text-subtle tabular-nums pl-1">{i.timeLabel}</span>
                    <div className="min-w-0 flex-1">
                      <Chip item={i} now={now} onClick={(el) => setOpen({ kind: "item", id: i.key, anchor: el })} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Floating>
      )}

      {hover && !open && (
        <Floating anchor={hover.anchor} onClose={() => setHover(null)}>
          <BonusDetails bonuses={hover.bonusIds.map((id) => bonusById.get(id)!).filter(Boolean)} now={now} windowNote />
        </Floating>
      )}
    </div>
  );
}

function Chip({ item: i, now, onClick, onHover }: { item: CalItem; now: number; onClick: (el: HTMLElement) => void; onHover?: (on: boolean) => void }) {
  const exam = i.kind === "exam";
  const ms = Date.parse(i.at) - now;
  const soon = !i.done && !i.isEvent && ms > 0 && ms < SOON_MS;
  return (
    <button
      type="button"
      style={hueStyle(i.courseId || null)}
      onClick={(e) => onClick(e.currentTarget)}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={clsx(
        "w-full flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] leading-tight text-left",
        exam ? "bg-accent-soft text-accent font-medium" : "hover:bg-surface-2",
        i.done && "text-subtle line-through",
        i.overdue && "text-danger",
        i.kind === "class" && "text-muted",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full course-dot" />
      <span className="truncate flex-1">{i.title}</span>
      {soon && <span className="shrink-0 text-[10.5px] tabular-nums text-warn font-medium">{countdown(ms)}</span>}
    </button>
  );
}

function Countdown({ at, now, past = "ago", className }: { at: string; now: number; past?: string; className?: string }) {
  const ms = Date.parse(at) - now;
  return <span className={clsx("tabular-nums", className)}>{ms >= 0 ? `in ${countdown(ms)}` : `${countdown(ms)} ${past}`}</span>;
}

function CourseLink({ label, href, courseId }: { label: string; href: string | null; courseId: string }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted whitespace-nowrap" style={hueStyle(courseId || null)}>
      <span className="size-1.5 rounded-full course-dot" />
      {label}
    </span>
  );
  return href ? (
    <Link href={href} className="hover:text-fg">
      {content}
    </Link>
  ) : (
    content
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function DetailFields({ item: i, now }: { item: CalItem; now: number }) {
  const bonusMs = i.bonus ? Date.parse(i.bonus.at) - now : 0;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <Field label={i.isEvent ? "When" : "Due"}>
        {i.whenLabel}
        {!i.done && (
          <span className={clsx("ml-1.5", i.overdue ? "text-danger" : Date.parse(i.at) - now < SOON_MS ? "text-warn" : "text-subtle")}>
            (<Countdown at={i.at} now={now} />)
          </span>
        )}
      </Field>
      {i.location && <Field label="Where">{i.location}</Field>}
      {i.status && <Field label="Status">{i.status}</Field>}
      {i.points && <Field label="Points">{i.points}</Field>}
      {i.bonus && !i.done && (
        <Field label="Bonus">
          <span className={bonusMs > 0 ? "text-warn" : "text-subtle"}>
            +{i.bonus.percent}% if finished by {i.bonus.label}{" "}
            {bonusMs > 0 ? (
              <>
                (<Countdown at={i.bonus.at} now={now} />)
              </>
            ) : (
              "— missed"
            )}
          </span>
        </Field>
      )}
    </dl>
  );
}

function ItemDetails({ item: i, now, onClose }: { item: CalItem; now: number; onClose: () => void }) {
  return (
    <div className="w-80 p-3" style={hueStyle(i.courseId || null)}>
      <div className="flex items-start gap-2 mb-2">
        <span className="mt-1.5 size-2 shrink-0 rounded-full course-dot" />
        <div className={clsx("min-w-0 flex-1 text-[13.5px] font-medium leading-snug", i.done && "line-through text-muted")}>{i.title}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2.5">
        <CourseLink label={i.courseLabel} href={i.courseHref} courseId={i.courseId} />
        <Badge tone={i.kind === "exam" ? "accent" : "neutral"}>{i.kindLabel}</Badge>
        {i.overdue && <Badge tone="danger">Overdue</Badge>}
        {i.done && <Badge tone="ok">Done</Badge>}
      </div>
      <DetailFields item={i} now={now} />
      {i.url && (
        <a href={i.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline underline-offset-2">
          Open in {i.url.includes("webassign") ? "WebAssign" : "eLC"} <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

function BonusDetails({ bonuses, now, windowNote }: { bonuses: CalBonus[]; now: number; windowNote?: boolean }) {
  return (
    <div className="w-80 p-3 space-y-2.5">
      {windowNote && <div className="text-[11.5px] text-subtle">Final 72h — finishing now earns no early bonus</div>}
      {bonuses.map((b) => {
        const ms = Date.parse(b.at) - now;
        return (
          <div key={b.id} className="text-[12px]" style={hueStyle(b.courseId)}>
            <div className="flex items-center gap-1.5 text-[13px] font-medium leading-snug">
              <Zap className="size-3.5 shrink-0 text-warn" />
              {b.url ? (
                <a href={b.url} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
                  {b.shortTitle}
                </a>
              ) : (
                b.shortTitle
              )}
            </div>
            <div className="mt-1 mb-1">
              <CourseLink label={b.courseLabel} href={b.courseHref} courseId={b.courseId} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <Field label="Cutoff">
                {b.cutoffLabel} <span className={ms > 0 ? "text-warn" : "text-subtle"}>({ms > 0 ? <Countdown at={b.at} now={now} /> : "passed"})</span>
              </Field>
              <Field label="Due">
                {b.dueLabel}{" "}
                <span className="text-subtle">
                  (<Countdown at={b.dueAt} now={now} />)
                </span>
              </Field>
              <Field label="Bonus">+{b.percent}%</Field>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function BonusRow({ bonus: b, now }: { bonus: CalBonus; now: number }) {
  const ms = Date.parse(b.at) - now;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 course-bar bg-warn-soft" style={hueStyle(b.courseId)}>
      <span className="w-16 shrink-0 text-[12.5px] text-muted tabular-nums pt-px">{b.cutoffTime}</span>
      <div className="min-w-0 flex-1">
        <a href={b.url ?? undefined} target="_blank" rel="noreferrer" className="text-[13.5px] leading-snug hover:underline underline-offset-2">
          Early-bonus cutoff: {b.title}
        </a>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5">
          <CourseLink label={b.courseLabel} href={b.courseHref} courseId={b.courseId} />
          <Badge tone="warn">+{b.percent}% if finished by now</Badge>
          {ms > 0 && <Countdown at={b.at} now={now} className="text-[11.5px] text-warn font-medium" />}
          <span className="text-[11.5px] text-subtle">Due {b.dueLabel}</span>
        </div>
      </div>
    </li>
  );
}

function AgendaRow({ item: i, now, expanded, onToggle }: { item: CalItem; now: number; expanded: boolean; onToggle: () => void }) {
  const ms = Date.parse(i.at) - now;
  const soon = !i.done && !i.isEvent && ms > 0 && ms < SOON_MS;
  return (
    <li className="course-bar" style={hueStyle(i.courseId || null)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("a")) onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2/60"
      >
        <span className="w-16 shrink-0 text-[12.5px] text-muted tabular-nums pt-px">{i.timeLabel}</span>
        <div className="min-w-0 flex-1">
          <span className={clsx("text-[13.5px] leading-snug", i.done && "line-through text-muted", i.kind === "class" && "text-muted")}>{i.title}</span>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5">
            {i.courseId && <CourseLink label={i.courseLabel} href={i.courseHref} courseId={i.courseId} />}
            {!i.isEvent && <Badge>{i.kindLabel}</Badge>}
            {i.kind === "exam" && i.isEvent && <Badge tone="accent">Exam</Badge>}
            {i.overdue && <Badge tone="danger">Overdue</Badge>}
            {i.done && <Badge tone="ok">Done</Badge>}
            {soon && <span className="text-[11.5px] text-warn font-medium tabular-nums">in {countdown(ms)}</span>}
            {i.location && <span className="text-[11.5px] text-subtle">{i.location}</span>}
          </div>
        </div>
        <ChevronDown className={clsx("size-4 shrink-0 text-subtle mt-0.5 transition-transform", expanded && "rotate-180")} />
      </div>
      {expanded && (
        <div className="px-4 pb-3 pl-23">
          <DetailFields item={i} now={now} />
          {i.url && (
            <a href={i.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline underline-offset-2">
              Open in {i.url.includes("webassign") ? "WebAssign" : "eLC"} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** Fixed-position panel anchored under (or above) an element; closes on outside click and scroll. */
function Floating({ anchor, onClose, interactive, children }: { anchor: HTMLElement; onClose: () => void; interactive?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || !anchor.isConnected) return close.current();
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      const below = r.bottom + 6 + h <= window.innerHeight - 8;
      setStyle({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    if (!interactive) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) close.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, interactive]);

  return (
    <div
      ref={ref}
      role={interactive ? "dialog" : "tooltip"}
      style={style}
      className={clsx("fixed z-50 rounded-lg border border-border bg-surface text-fg shadow-lg", !interactive && "pointer-events-none")}
    >
      {children}
    </div>
  );
}
