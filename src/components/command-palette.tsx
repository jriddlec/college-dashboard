"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowUpRight, BookOpen, FileText, ListTodo, Megaphone, Search } from "lucide-react";
import type { CSSProperties } from "react";
import type { SearchHit } from "@/lib/search";

const ICONS = { class: BookOpen, assignment: ListTodo, announcement: Megaphone, file: FileText } as const;
const OPEN_EVENT = "open-search";

/** Opens the palette from anywhere (nav buttons). */
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Ctrl+K (or /) search over classes, assignments, announcements and the
 * library, including the text inside study guides and notes.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setActive(0);
      } catch {
        // aborted or offline: keep the previous results
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  function go(h: SearchHit | undefined) {
    if (!h) return;
    close();
    if (h.external || h.type === "file") window.open(h.href, "_blank", "noopener");
    else router.push(h.href);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-[2px] px-4 pt-[10vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl card overflow-hidden shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <label className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 text-subtle shrink-0" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") go(hits[active]);
            }}
            placeholder="Search classes, assignments, announcements and notes"
            className="w-full bg-transparent py-3 text-[14px] placeholder:text-subtle focus:outline-none"
            aria-controls="search-results"
          />
          <kbd className="hidden sm:inline text-[11px] text-subtle border border-border rounded px-1.5 py-px">Esc</kbd>
        </label>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto divide-y divide-border">
          {hits.map((h, i) => {
            const Icon = ICONS[h.type];
            return (
              <li key={`${h.type}:${h.href}:${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  style={{ "--hue": h.hue } as CSSProperties}
                  className={clsx("w-full flex items-start gap-3 px-4 py-2.5 text-left course-bar", i === active && "bg-surface-2")}
                >
                  <Icon className="size-4 text-muted mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13.5px] font-medium leading-snug">
                      <span className="truncate">{h.title}</span>
                      {h.external && <ArrowUpRight className="size-3 text-subtle shrink-0" />}
                    </span>
                    <span className="block text-[11.5px] text-muted truncate">{h.context}</span>
                    {h.snippet && <span className="block text-[12px] text-subtle mt-0.5 line-clamp-2">{h.snippet}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {q.trim() && !loading && hits.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing found.</p>}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-[11px] text-subtle">
          <span>↑↓ to move · Enter to open</span>
          <span>{loading ? "Searching…" : "Ctrl K or / to search"}</span>
        </div>
      </div>
    </div>
  );
}

/** Search button for the nav. */
export function SearchButton({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <button type="button" onClick={openSearch} aria-label="Search" className={className}>
      <Search className={compact ? "size-4" : "size-4"} strokeWidth={1.8} />
      {!compact && (
        <>
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10.5px] text-subtle border border-border rounded px-1 py-px font-sans">Ctrl K</kbd>
        </>
      )}
    </button>
  );
}
