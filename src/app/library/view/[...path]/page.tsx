import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { promises as fs } from "node:fs";
import { Download, ExternalLink, FileClock, FileQuestion } from "lucide-react";
import { encodePath, extOf, parseName, type CourseLibrary, type Group, type Material } from "@/lib/library/catalog";
import { getLibrary, libraryDir, safeResolve } from "@/lib/library";
import { highlight, isCode, markdown } from "@/lib/library/render";
import { KIND_META, formatSize, shortDate } from "@/components/library/material";
import { Badge, EmptyState, buttonClass, hueVars } from "@/components/ui";
import { PdfFrame } from "@/components/library/pdf-frame";

const MAX_TEXT = 2_000_000;
const HTML = ["html", "htm"];
const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const VIDEO = ["mp4", "webm", "mov"];
const AUDIO = ["mp3", "m4a", "wav", "ogg"];
const OFFICE = ["docx", "doc", "pptx", "ppt", "xlsx", "xls"];

/** Find the material (and its class and folder) that owns a library path. */
function locate(courses: CourseLibrary[], rel: string): { lib: CourseLibrary; m: Material; group: Group } | null {
  for (const lib of courses) {
    const visit = (groups: Group[]): { m: Material; group: Group } | null => {
      for (const g of groups) {
        for (const m of [...(g.readme ? [g.readme] : []), ...g.items]) {
          if (m.primary.path === rel || m.alternates.some((a) => a.path === rel)) return { m, group: g };
        }
        const hit = visit(g.children);
        if (hit) return hit;
      }
      return null;
    };
    const hit = visit([...lib.exams, ...lib.units, ...lib.classwork, ...lib.documents]);
    if (hit) return { lib, ...hit };
  }
  return null;
}

export async function generateMetadata({ params }: PageProps<"/library/view/[...path]">): Promise<Metadata> {
  const { path } = await params;
  return { title: parseName(decodeSegment(path.at(-1) ?? "")).title };
}

export default async function ViewPage({ params }: PageProps<"/library/view/[...path]">) {
  const { path: segments } = await params;
  // Page params arrive URL-encoded (route handlers get them decoded).
  const target = safeResolve(libraryDir(), segments.map(decodeSegment));
  if (!target) notFound();
  let st;
  try {
    st = await fs.stat(target.abs);
  } catch {
    notFound();
  }
  if (!st.isFile()) notFound();

  const lib = await getLibrary();
  const found = lib.ok ? locate(lib.courses, target.rel) : null;
  const name = target.rel.split("/").at(-1)!;
  const ext = extOf(name);
  const parsed = parseName(name, found?.lib.folderPrefix);
  const title = found && found.m.primary.path === target.rel ? found.m.title : parsed.title;
  const kind = found?.m.kind;
  const raw = `/library/f/${encodePath(target.rel)}`;
  const isText = ext === "md" || ext === "txt" || ext === "csv" || isCode(ext);

  let body: React.ReactNode;
  if (HTML.includes(ext)) {
    body = <iframe src={raw} title={title} className="card w-full h-[calc(100dvh-12rem)] min-h-[480px] bg-white" />;
  } else if (ext === "pdf") {
    body = <PdfFrame src={raw} title={title} />;
  } else if (isText && st.size <= MAX_TEXT) {
    const src = await fs.readFile(target.abs, "utf8");
    if (ext === "md") {
      body = <article className="card px-5 md:px-8 py-6 prose-study" dangerouslySetInnerHTML={{ __html: markdown(src) }} />;
    } else {
      const html = isCode(ext) ? highlight(src, ext) : src.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
      body = (
        <pre className="card px-4 md:px-5 py-4 overflow-x-auto text-[12.5px] leading-relaxed font-mono">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      );
    }
  } else if (IMAGE.includes(ext)) {
    body = (
      <div className="card p-3 grid place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- library file, not a build asset */}
        <img src={raw} alt={title} className="max-w-full h-auto rounded" />
      </div>
    );
  } else if (VIDEO.includes(ext)) {
    body = <video src={raw} controls playsInline preload="metadata" className="w-full rounded-lg bg-black aspect-video" />;
  } else if (AUDIO.includes(ext)) {
    body = (
      <div className="card p-4">
        <audio src={raw} controls preload="metadata" className="w-full" />
      </div>
    );
  } else {
    const pending = OFFICE.includes(ext);
    body = (
      <div className="card">
        <EmptyState icon={pending ? FileClock : FileQuestion} title={pending ? "Preview not generated yet" : "This file can’t be shown in the browser"}>
          {pending ? "Office files are shown as PDFs made by the converter. Run it (see the README), or download the original." : "Download it to open it in another app."}
          <div className="mt-3">
            <a href={`${raw}?download=1`} className={buttonClass}>
              <Download className="size-3.5" /> Download {ext.toUpperCase()} · {formatSize(st.size)}
            </a>
          </div>
        </EmptyState>
      </div>
    );
  }

  const others = found ? [found.m.primary, ...found.m.alternates].filter((f) => f.path !== target.rel) : [];
  return (
    <div style={found ? hueVars(found.lib.course.hue) : undefined}>
      {found && (
        <nav className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted mb-3">
          <Link href={`/library/${found.lib.course.slug}`} className="inline-flex items-center gap-1.5 hover:text-fg">
            <span className="size-1.5 rounded-full course-dot" />
            {found.lib.course.code}
          </Link>
          <span className="text-subtle">/</span>
          <Link href={`/library/${found.lib.course.slug}?open=${encodeURIComponent(found.group.id)}`} className="hover:text-fg">
            {found.group.number != null ? `Unit ${found.group.number}: ` : ""}
            {found.group.title}
          </Link>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-[20px] md:text-[24px] font-semibold tracking-tight">{title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[12.5px] text-muted">
            {kind && <Badge tone={KIND_META[kind].tone}>{KIND_META[kind].label}</Badge>}
            {parsed.date && <span>{shortDate(parsed.date)}</span>}
            <span className="font-mono uppercase text-[11px] text-subtle">
              {ext} · {formatSize(st.size)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(HTML.includes(ext) || ext === "pdf") && (
            <a href={raw} target="_blank" rel="noreferrer" className={buttonClass}>
              <ExternalLink className="size-3.5" /> Open in new tab
            </a>
          )}
          {others.map((f) => (
            <a key={f.path} href={f.href} target="_blank" rel="noreferrer" className={buttonClass}>
              <ExternalLink className="size-3.5" /> {f.ext.toUpperCase()}
            </a>
          ))}
          <a href={`${raw}?download=1`} className={buttonClass}>
            <Download className="size-3.5" /> Download
          </a>
        </div>
      </div>
      {body}
    </div>
  );
}

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
