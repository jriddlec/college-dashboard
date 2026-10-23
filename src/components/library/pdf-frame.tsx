"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ChevronRight,
  ListTree,
  Loader2,
  Minus,
  Moon,
  Plus,
  Sun,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

const KEY = "pdf-dark";
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

type OutlineItem = { title: string; page: number | null; items: OutlineItem[] };
type PageSize = { w: number; h: number };

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

async function resolveOutline(
  doc: PDFDocumentProxy,
  raw: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
): Promise<OutlineItem[]> {
  if (!raw) return [];
  return Promise.all(
    raw.map(async (o) => {
      let page: number | null = null;
      try {
        const dest =
          typeof o.dest === "string"
            ? await doc.getDestination(o.dest)
            : o.dest;
        const ref = dest?.[0];
        if (ref != null)
          page = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
      } catch {}
      return {
        title: o.title,
        page,
        items: await resolveOutline(doc, o.items),
      };
    }),
  );
}

/**
 * A PDF drawn with pdf.js in the dashboard's own chrome: outline, page count,
 * zoom. In the dark theme only the pages are inverted (hue-rotated back so
 * colors stay close), unless turned off; the choice is remembered.
 */
export function PdfFrame({ src, title }: { src: string; title: string }) {
  const invert = useSyncExternalStore(subscribe, readPref, () => true);
  const toggleInvert = () => {
    try {
      localStorage.setItem(KEY, invert ? "0" : "1");
    } catch {}
    listeners.forEach((l) => l());
  };

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" },
        );
        loaded = await pdfjs.getDocument({ url: src }).promise;
        if (cancelled) return void loaded.destroy();
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded!.getPage(i + 1),
          ),
        );
        const s = pages.map((p) => {
          const v = p.getViewport({ scale: 1 });
          return { w: v.width, h: v.height };
        });
        const o = await resolveOutline(loaded, await loaded.getOutline());
        if (cancelled) return;
        setDoc(loaded);
        setSizes(s);
        setOutline(o);
        if (!o.length) setShowOutline(false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [src]);

  // Pages fit the column width (capped), times the zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);
  const base = sizes[0] ? Math.min(width - 32, 900) / sizes[0].w : 1;
  const scale = Math.max(0.1, base * zoom);

  // Current page: the one nearest the top of the view.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop + el.clientHeight / 3;
    const pages = el.querySelectorAll<HTMLElement>("[data-page]");
    let i = 0;
    for (const p of pages) if (p.offsetTop <= top) i = Number(p.dataset.page);
    setCurrent(i);
  }, []);

  const goTo = (i: number) => {
    const p = scroller.current?.querySelector<HTMLElement>(
      `[data-page="${i}"]`,
    );
    if (p && scroller.current)
      scroller.current.scrollTo({ top: p.offsetTop - 12, behavior: "smooth" });
  };
  const step = (d: number) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 1e-6);
    setZoom(
      ZOOMS[
        Math.min(
          ZOOMS.length - 1,
          Math.max(0, (i < 0 ? ZOOMS.length - 1 : i) + d),
        )
      ],
    );
  };

  const btn =
    "inline-flex items-center justify-center size-7 rounded-md text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40";
  return (
    <div className="card overflow-hidden flex flex-col h-[calc(100dvh-10rem)] min-h-[480px]">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border text-[12.5px] text-muted">
        {outline.length > 0 && (
          <button
            type="button"
            className={btn}
            onClick={() => setShowOutline((v) => !v)}
            title="Outline"
            aria-label="Outline"
            aria-pressed={showOutline}
          >
            <ListTree className="size-4" />
          </button>
        )}
        <span className="px-1.5 tabular-nums">
          {sizes.length ? `${current + 1} / ${sizes.length}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={btn}
            onClick={() => step(-1)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className="px-1.5 h-7 rounded-md tabular-nums hover:text-fg hover:bg-surface-2"
            onClick={() => setZoom(1)}
            title="Fit width"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => step(1)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleInvert}
            title={invert ? "Show original colors" : "Dark pages"}
            aria-label={invert ? "Show original colors" : "Dark pages"}
            className={`${btn} hidden dark:inline-flex`}
          >
            {invert ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {showOutline && outline.length > 0 && (
          <nav
            className="hidden md:block w-60 shrink-0 overflow-y-auto border-r border-border py-2 text-[13px]"
            aria-label="Outline"
          >
            <Outline items={outline} current={current} goTo={goTo} depth={0} />
          </nav>
        )}
        <div
          ref={scroller}
          data-pdf-scroller
          onScroll={onScroll}
          className="relative flex-1 overflow-auto bg-surface-2 py-4"
        >
          {error ? (
            <p className="p-6 text-muted">
              Couldn’t show this PDF ({error}). Use Open in new tab or Download.
            </p>
          ) : !doc || !width ? (
            <div className="grid place-items-center h-full text-muted">
              <Loader2
                className="size-5 animate-spin"
                aria-label={`Loading ${title}`}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 w-max min-w-full px-4">
              {sizes.map((s, i) => (
                <Page
                  key={i}
                  doc={doc}
                  index={i}
                  size={s}
                  scale={scale}
                  invert={invert}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Outline({
  items,
  current,
  goTo,
  depth,
}: {
  items: OutlineItem[];
  current: number;
  goTo: (i: number) => void;
  depth: number;
}) {
  return (
    <ul>
      {items.map((o, i) => (
        <OutlineRow
          key={i}
          item={o}
          current={current}
          goTo={goTo}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function OutlineRow({
  item,
  current,
  goTo,
  depth,
}: {
  item: OutlineItem;
  current: number;
  goTo: (i: number) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const active = item.page === current;
  return (
    <li>
      <div className="flex items-start" style={{ paddingLeft: 6 + depth * 12 }}>
        {item.items.length ? (
          <button
            type="button"
            className="mt-1 p-0.5 text-subtle hover:text-fg"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <button
          type="button"
          disabled={item.page == null}
          onClick={() => item.page != null && goTo(item.page)}
          className={`flex-1 text-left px-1.5 py-1 mr-2 rounded leading-snug hover:bg-surface-2 ${active ? "text-fg font-medium" : "text-muted hover:text-fg"}`}
        >
          {item.title}
        </button>
      </div>
      {open && item.items.length > 0 && (
        <Outline
          items={item.items}
          current={current}
          goTo={goTo}
          depth={depth + 1}
        />
      )}
    </li>
  );
}

/** One page: drawn (canvas + selectable text) once it comes near the view, redrawn on zoom. */
function Page({
  doc,
  index,
  size,
  scale,
  invert,
}: {
  doc: PDFDocumentProxy;
  index: number;
  size: PageSize;
  scale: number;
  invert: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { root: el.closest("[data-pdf-scroller]"), rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const page = await doc.getPage(index + 1);
      if (cancelled || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      task = page.render({
        canvas: c,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      const layer = text.current;
      layer.replaceChildren();
      layer.style.setProperty("--scale-factor", String(scale));
      await new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport,
      }).render();
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, doc, index, scale]);

  const w = Math.floor(size.w * scale);
  const h = Math.floor(size.h * scale);
  return (
    <div
      ref={box}
      data-page={index}
      className={`relative shrink-0 rounded-sm shadow-sm bg-white ${invert ? "dark:bg-[#1c1c1c]" : ""}`}
      style={{ width: w, height: h }}
    >
      <canvas
        ref={canvas}
        className={`block size-full rounded-sm ${invert ? "dark:[filter:invert(0.9)_hue-rotate(180deg)]" : ""}`}
      />
      <div ref={text} className="textLayer" />
    </div>
  );
}
