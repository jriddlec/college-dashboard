import Link from "next/link";
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Course } from "@/lib/school/types";
import { courseHue, courseLabel } from "@/lib/school/derive";

export function PageHeader({ title, subtitle, actions, leading }: { title: string; subtitle?: ReactNode; actions?: ReactNode; leading?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-[22px] md:text-[26px] font-semibold tracking-tight">
          {leading}
          {title}
        </h1>
        {subtitle && <p className="text-[13.5px] text-muted mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  count,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  count?: number;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[13px] font-semibold text-muted uppercase tracking-[0.04em]">
          {title}
          {count != null && <span className="ml-1.5 text-subtle font-medium normal-case tracking-normal">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12.5px] text-muted hover:text-fg transition-colors">
      {children} →
    </Link>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center py-10 px-6", className)}>
      <div className="size-9 rounded-full bg-surface-2 grid place-items-center mb-3">
        <Icon className="size-4.5 text-subtle" />
      </div>
      <p className="text-[13.5px] font-medium">{title}</p>
      {children && <div className="text-[12.5px] text-muted mt-1 max-w-sm">{children}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface-2 text-muted",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-px text-[11.5px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function hueStyle(courseId: string | null | undefined): CSSProperties {
  return hueVars(courseHue(courseId));
}

export function hueVars(hue: number): CSSProperties {
  return { "--hue": hue } as CSSProperties;
}

export function CourseTag({ course, link = true }: { course: Course | undefined; link?: boolean }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted whitespace-nowrap" style={hueStyle(course?.id)}>
      <span className="size-1.5 rounded-full course-dot" />
      {courseLabel(course)}
    </span>
  );
  if (!course || !link) return content;
  return (
    <Link href={`/courses/${encodeURIComponent(course.id)}`} className="hover:text-fg">
      {content}
    </Link>
  );
}

export function Stat({
  label,
  value,
  tone,
  href,
  hint,
  compact,
  shortLabel,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  href?: string;
  /** Small note under the value ("+2 older"). */
  hint?: string;
  /** Smaller on phones, so four fit in one row. */
  compact?: boolean;
  /** Shorter label for phones in compact mode ("7 days"). */
  shortLabel?: string;
}) {
  const inner = (
    <>
      <div className={clsx("text-muted", compact ? "text-[11px] md:text-[12px] truncate" : "text-[12px]")}>
        {shortLabel ? (
          <>
            <span className="md:hidden">{shortLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </div>
      <div
        className={clsx(
          "font-semibold tracking-tight mt-0.5 tabular-nums",
          compact ? "text-[18px] md:text-[22px]" : "text-[22px]",
          tone === "danger" && Number(value) > 0 && "text-danger",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10.5px] md:text-[11px] text-subtle truncate">{hint}</div>}
    </>
  );
  const cls = clsx("card block", compact ? "px-2.5 py-2 md:px-4 md:py-3" : "px-4 py-3");
  return href ? (
    <Link href={href} className={clsx(cls, "hover:border-border-strong transition-colors")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-fg hover:border-border-strong transition-colors";
