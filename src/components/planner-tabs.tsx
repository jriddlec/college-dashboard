import Link from "next/link";

export type PlannerTab = "list" | "calendar";

const TABS: { tab: PlannerTab; label: string; href: string }[] = [
  { tab: "list", label: "Assignments", href: "/assignments" },
  { tab: "calendar", label: "Calendar", href: "/calendar" },
];

/** Tab bar shared by the Planner's Assignments and Calendar views; sticks below the mobile top bar. */
export function PlannerTabs({ active, overdue = 0, upcoming = 0 }: { active: PlannerTab; overdue?: number; upcoming?: number }) {
  return (
    <nav className="sticky top-12 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 mb-5 border-b border-border bg-bg/95 backdrop-blur">
      <ul className="flex">
        {TABS.map(({ tab, label, href }) => {
          const on = tab === active;
          const n = tab === "list" ? overdue || upcoming : 0;
          return (
            <li key={tab} className="shrink-0">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  on ? "text-fg border-accent" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {label}
                {n ? (
                  <span
                    title={overdue ? `${overdue} overdue` : `${upcoming} upcoming`}
                    className={`rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums ${overdue ? "bg-danger text-white" : "bg-surface-2 text-muted"}`}
                  >
                    {n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
