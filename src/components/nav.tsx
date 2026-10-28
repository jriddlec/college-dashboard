"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  BookMarked,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Code2,
  Database,
  Dna,
  FlaskConical,
  Globe,
  House,
  Landmark,
  Languages,
  Library,
  Link2,
  ListTodo,
  Music,
  Palette,
  PenLine,
  Scale,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { CSSProperties } from "react";
import { ThemeToggle } from "./theme-toggle";
import { SyncDot, SyncLabel, type NavSync } from "./sync-dot";
import { SearchButton } from "./command-palette";

/** Icon names accepted in courses.json `icon`. */
const COURSE_ICONS: Record<string, LucideIcon> = {
  atom: Atom,
  brain: Brain,
  briefcase: Briefcase,
  calculator: Calculator,
  code: Code2,
  dna: Dna,
  flask: FlaskConical,
  globe: Globe,
  landmark: Landmark,
  languages: Languages,
  music: Music,
  palette: Palette,
  pen: PenLine,
  scale: Scale,
  sigma: Sigma,
};

export type NavCourse = { slug: string; code: string; hue: number; icon: string | null };
type Brand = { appName: string; schoolName: string; sync: NavSync | null };

const NAV = [
  { href: "/", label: "Home", icon: House },
  // Planner: Assignments list and Calendar, switched by tabs on the page.
  { href: "/assignments", label: "Planner", icon: ListTodo, also: ["/calendar"] },
  { href: "/courses", label: "Classes", icon: BookOpen },
  { href: "/library", label: "Library", icon: Library },
  { href: "/links", label: "Links", icon: Link2 },
];
const MOBILE_NAV = NAV.filter((n) => n.href !== "/links");

function isActive(pathname: string, href: string, exact = false, also: string[] = []) {
  if (also.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return href === "/" || exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function Logo({ appName }: { appName: string }) {
  return <div className="size-6 rounded-md bg-accent text-white grid place-items-center text-[11px] font-bold tracking-tight">{appName.slice(0, 1).toUpperCase()}</div>;
}

const itemClass = (active: boolean) =>
  clsx("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors", active ? "bg-surface-2 text-fg font-medium" : "text-muted hover:bg-surface-2/70 hover:text-fg");

export function Sidebar({ courses, appName, schoolName, sync }: { courses: NavCourse[] } & Brand) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-sidebar h-dvh sticky top-0">
      <Link href="/" className="flex items-center gap-2.5 px-4 h-14">
        <Logo appName={appName} />
        <div className="leading-tight min-w-0">
          <div className="text-[13px] font-semibold truncate">{appName}</div>
          {schoolName && <div className="text-[11px] text-muted truncate">{schoolName}</div>}
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <SearchButton className={clsx(itemClass(false), "w-full mb-1")} />
        {NAV.map(({ href, label, icon: Icon, also }) => {
          // Library is exact here: its class pages are highlighted below.
          const active = isActive(pathname, href, href === "/library", also);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
              <Icon className="size-4" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
        {courses.length > 0 && <div className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle">Library</div>}
        {courses.map(({ slug, code, hue, icon }) => {
          const href = `/library/${slug}`;
          const active = isActive(pathname, href);
          const Icon = (icon && COURSE_ICONS[icon]) || BookMarked;
          return (
            <Link key={slug} href={href} aria-current={active ? "page" : undefined} style={{ "--hue": hue } as CSSProperties} className={itemClass(active)}>
              <Icon className={clsx("size-4", active && "course-text")} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{code}</span>
              <span className="size-1.5 rounded-full course-dot" />
            </Link>
          );
        })}
      </nav>
      <div className="px-2 py-3 border-t border-border space-y-1">
        <Link href="/status" className={clsx(itemClass(isActive(pathname, "/status")), "text-[13px] font-normal", sync?.level === "bad" && "text-danger", sync?.level === "warn" && "text-warn")}>
          <span className="relative">
            <Database className="size-4" strokeWidth={1.8} />
            {sync && <SyncDot sync={sync} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-sidebar" />}
          </span>
          <span className="min-w-0 leading-tight">
            Data status
            {sync && (
              <span className="block text-[11px] text-subtle truncate">
                <SyncLabel sync={sync} />
              </span>
            )}
          </span>
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur pb-safe">
      <div className="grid grid-cols-4">
        {MOBILE_NAV.map(({ href, label, icon: Icon, also }) => {
          const active = isActive(pathname, href, false, also);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx("flex flex-col items-center gap-0.5 py-2 text-[10.5px]", active ? "text-fg font-medium" : "text-subtle")}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileHeader({ appName, sync }: Brand) {
  return (
    <header className="md:hidden sticky top-0 z-20 flex items-center justify-between h-12 px-4 border-b border-border bg-bg/95 backdrop-blur">
      <Link href="/" className="flex items-center gap-2">
        <Logo appName={appName} />
        <span className="text-[14px] font-semibold">{appName}</span>
      </Link>
      <div className="flex items-center gap-1">
        <SearchButton compact className="p-2 text-muted" />
        <Link href="/links" aria-label="Links" className="p-2 text-muted">
          <Link2 className="size-4" />
        </Link>
        <Link href="/status" aria-label="Data status" className={clsx("relative p-2", sync?.level === "bad" ? "text-danger" : "text-muted")}>
          <Database className="size-4" />
          {sync && sync.level !== "ok" && <SyncDot sync={sync} className="absolute right-1.5 bottom-1.5 ring-2 ring-bg" />}
        </Link>
        <ThemeToggle compact />
      </div>
    </header>
  );
}
