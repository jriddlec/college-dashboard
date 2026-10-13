import clsx from "clsx";
import type { CSSProperties } from "react";
import {
  BookOpen,
  BookOpenCheck,
  Clapperboard,
  ClipboardList,
  Download,
  FileArchive,
  FileCheck2,
  FileCode2,
  FilePen,
  FileText,
  Headphones,
  Image as ImageIcon,
  Info,
  ListChecks,
  NotebookText,
  PencilLine,
  Presentation,
  ScrollText,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Kind, Material } from "@/lib/library/catalog";
import { Badge, type Tone } from "../ui";

export const KIND_META: Record<Kind, { label: string; icon: LucideIcon; tone?: Tone }> = {
  guide: { label: "Study guide", icon: BookOpenCheck, tone: "accent" },
  review: { label: "Review", icon: Sparkles, tone: "accent" },
  practice: { label: "Practice", icon: PencilLine, tone: "info" },
  notes: { label: "Notes", icon: NotebookText },
  preclass: { label: "Pre-class", icon: ClipboardList },
  slides: { label: "Slides", icon: Presentation },
  reading: { label: "Reading", icon: BookOpen },
  activity: { label: "Activity", icon: Users },
  assignment: { label: "Assignment", icon: FilePen },
  work: { label: "My work", icon: FileCheck2, tone: "ok" },
  info: { label: "Course info", icon: Info },
  guidelines: { label: "Guidelines", icon: ListChecks },
  log: { label: "Notes", icon: ScrollText },
  video: { label: "Video", icon: Clapperboard },
  audio: { label: "Audio", icon: Headphones },
  image: { label: "Image", icon: ImageIcon },
  code: { label: "Code", icon: FileCode2 },
  text: { label: "Text", icon: FileText },
  archive: { label: "Archive", icon: FileArchive },
  document: { label: "Document", icon: FileText },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-29" → "Sep 29" */
export function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(day)}`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const SHOW_SIZE_OVER = 10e6; // only worth mentioning when it's slow on a phone

export function MaterialRow({ m, context, hue }: { m: Material; context?: string; hue?: number }) {
  const meta = KIND_META[m.kind];
  const Icon = meta.icon;
  const stale = m.primary.mode === "viewer" && ["docx", "doc", "pptx", "ppt", "xlsx"].includes(m.primary.ext);
  return (
    <li
      className={clsx("group relative flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2/60 transition-colors", hue != null && "course-bar")}
      style={hue != null ? ({ "--hue": hue } as CSSProperties) : undefined}
    >
      <span className={clsx("mt-0.5 size-7 shrink-0 rounded-md grid place-items-center", meta.tone === "accent" ? "bg-accent-soft text-accent" : meta.tone === "info" ? "bg-info-soft text-info" : meta.tone === "ok" ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted")}>
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <a
            href={m.primary.href}
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] leading-snug font-medium hover:underline underline-offset-2 after:absolute after:inset-0"
          >
            {m.title}
          </a>
          {m.date && <span className={clsx("text-[12px] tabular-nums whitespace-nowrap mt-px", m.upcoming ? "text-subtle" : "text-muted")}>{shortDate(m.date)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          {context && <span className="text-[12px] text-muted">{context}</span>}
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {m.upcoming && <Badge tone="warn">Upcoming</Badge>}
          <span className="text-[11px] font-mono uppercase text-subtle">{m.primary.ext}</span>
          {m.alternates.map((a) => (
            <a
              key={a.path}
              href={a.href}
              target="_blank"
              rel="noreferrer"
              title={`Open the ${a.ext.toUpperCase()} version`}
              className="relative z-10 text-[11px] font-mono uppercase rounded border border-border px-1 text-muted hover:text-fg hover:border-border-strong"
            >
              {a.ext}
            </a>
          ))}
          {m.primary.size > SHOW_SIZE_OVER && <span className="text-[11.5px] text-subtle tabular-nums">{formatSize(m.primary.size)}</span>}
          {stale && <span className="text-[11.5px] text-warn">Preview pending</span>}
        </div>
      </div>
      <a
        href={m.download}
        title="Download original"
        aria-label={`Download ${m.title}`}
        className="relative z-10 mt-0.5 p-1.5 -mr-1.5 rounded text-subtle md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:text-fg hover:bg-surface-2 transition"
      >
        <Download className="size-3.5" />
      </a>
    </li>
  );
}
