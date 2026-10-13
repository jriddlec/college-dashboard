import Link from "next/link";
import { CircleAlert, CloudOff, FlaskConical } from "lucide-react";
import type { SnapshotResult } from "@/lib/school/types";
import { formatDateTime, relative } from "@/lib/school/time";

/** Full-page state when there is no usable snapshot. */
export function DataUnavailable({ result, title }: { result: Exclude<SnapshotResult, { status: "ok" }>; title: string }) {
  const isError = result.status === "error";
  const Icon = isError ? CircleAlert : CloudOff;
  return (
    <div>
      <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight mb-6">{title}</h1>
      <div className="card flex flex-col items-center text-center px-6 py-14">
        <div className={`size-10 rounded-full grid place-items-center mb-4 ${isError ? "bg-danger-soft" : "bg-surface-2"}`}>
          <Icon className={`size-5 ${isError ? "text-danger" : "text-subtle"}`} />
        </div>
        <p className="text-[15px] font-medium">{isError ? "School data couldn’t be loaded" : "No school data yet"}</p>
        <p className="text-[13px] text-muted mt-1.5 max-w-md">{isError ? result.message : result.reason}</p>
        <Link href="/status" className="mt-5 text-[13px] font-medium text-accent hover:underline underline-offset-2">
          View data status
        </Link>
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-warn/40 bg-warn-soft/60 px-3 py-2 mb-6 text-[12.5px] text-warn">
      <FlaskConical className="size-3.5 shrink-0" />
      <span>
        <strong className="font-semibold">Demo data.</strong> Courses and assignments shown are made up. Set LMS in .env to connect your school.
      </span>
    </div>
  );
}

/** Small "Synced 12m ago" line; turns warning-colored when stale. */
export function SyncedAt({ iso, now, warnings }: { iso: string; now: Date; warnings: number }) {
  const ageH = (now.getTime() - Date.parse(iso)) / 3_600_000;
  const stale = ageH > 12;
  return (
    <Link href="/status" className={`inline-flex items-center gap-1.5 text-[12px] ${stale ? "text-warn" : "text-subtle"} hover:text-fg`} title={formatDateTime(iso)}>
      <span className={`size-1.5 rounded-full ${stale ? "bg-warn" : "bg-ok"}`} />
      Synced {relative(iso, now)}
      {warnings > 0 && <span className="text-warn">· {warnings} warning{warnings > 1 ? "s" : ""}</span>}
    </Link>
  );
}
