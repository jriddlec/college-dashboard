"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { Announcement, Course } from "@/lib/school/types";
import { formatShortDate, relative } from "@/lib/school/time";
import { saveShared } from "@/lib/state-client";
import { NewBadge } from "./new-badge";
import { CourseTag } from "./ui";

const LOCAL_KEY = "read-announcements";

function readLocal(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids.slice(-1000)));
  } catch {}
}

/**
 * Announcements with "Read more" and read marks. Read marks are shared by
 * your devices when the app keeps state, else kept in this browser.
 */
export function AnnouncementList({
  items,
  courses,
  read: initialRead,
  now,
  showCourse = true,
  lines = 2,
}: {
  items: Announcement[];
  courses: Record<string, Course>;
  read: string[];
  /** Server time (ISO), so relative times match the server render. */
  now: string;
  showCourse?: boolean;
  lines?: 2 | 3;
}) {
  const [read, setRead] = useState(() => new Set(initialRead));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const local = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local.length) setRead((r) => new Set([...r, ...local]));
  }, []);

  async function markRead(ids: string[]) {
    setRead((r) => new Set([...r, ...ids]));
    if (!(await saveShared("readAnnouncements", { ids, on: true }))) writeLocal([...new Set([...readLocal(), ...ids])]);
  }

  const at = new Date(now);
  const unread = items.filter((n) => !read.has(n.id));
  return (
    <div>
      <ul className="divide-y divide-border">
        {items.map((n) => {
          const isRead = read.has(n.id);
          const expanded = !!open[n.id];
          const long = (n.body?.length ?? 0) > (lines === 2 ? 140 : 220);
          return (
            <li key={n.id} className={clsx("px-4 py-2.5", isRead && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-start gap-2 min-w-0">
                  {!isRead && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer" className="text-[13px] font-medium leading-snug hover:underline underline-offset-2">
                      {n.title}
                    </a>
                  ) : (
                    <span className="text-[13px] font-medium leading-snug">{n.title}</span>
                  )}
                </span>
                <span className="text-[11.5px] text-subtle whitespace-nowrap" title={formatShortDate(n.postedAt)}>
                  {relative(n.postedAt, at)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {showCourse && <CourseTag course={courses[n.courseId]} />}
                {!isRead && <NewBadge at={n.postedAt} />}
                {!isRead && (
                  <button type="button" onClick={() => markRead([n.id])} className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-subtle hover:text-fg">
                    <Check className="size-3" /> Mark read
                  </button>
                )}
              </div>
              {n.body && (
                <>
                  <p className={clsx("text-[12.5px] text-muted mt-1 whitespace-pre-line", !expanded && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>{n.body}</p>
                  {long && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen({ ...open, [n.id]: !expanded });
                        if (!expanded && !isRead) void markRead([n.id]);
                      }}
                      aria-expanded={expanded}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-accent mt-0.5 hover:underline underline-offset-2"
                    >
                      {expanded ? "Show less" : "Read more"}
                      <ChevronDown className={clsx("size-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {unread.length > 1 && (
        <button
          type="button"
          onClick={() => markRead(unread.map((n) => n.id))}
          className="w-full border-t border-border px-4 py-2 text-[12px] text-muted hover:text-fg text-left"
        >
          Mark all {unread.length} as read
        </button>
      )}
    </div>
  );
}
