"use client";

import { CircleAlert, CircleCheck, Download, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ContentCourse, ContentJob } from "@/lib/content-fetch";

/**
 * Pick a class and a unit (or the whole course) and queue a download of its
 * Brightspace Content files into the library. Refreshes while a job runs.
 */
export function ContentFetch({ courses, jobs }: { courses: ContentCourse[]; jobs: ContentJob[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [moduleId, setModuleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const course = courses.find((c) => c.id === courseId);
  const active = jobs.some((j) => j.state === "queued" || j.state === "running");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/content-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, moduleId: moduleId || null }),
      }).catch(() => null);
      if (!res?.ok) setError(res ? (await res.text()) || `Failed (${res.status})` : "Couldn’t reach the app");
      router.refresh();
    });

  const select = "w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px]";
  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <select
            aria-label="Class"
            className={select}
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setModuleId("");
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
          <select aria-label="Unit" className={select} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            <option value="">Whole course ({course?.files ?? 0} files)</option>
            {course?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {"  ".repeat(u.depth)}
                {u.title.split(" › ").at(-1)} ({u.files})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !courseId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-3 py-1.5 text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Download className="size-3.5" /> Fetch files
          </button>
          <p className="text-[12px] text-muted">
            Saved to <code className="font-mono">{course?.code.replace(/\s+/g, "") ?? "CODE"} Course Content</code> in the library, by unit and date. Files already fetched are only downloaded again when they change.
          </p>
        </div>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
      </div>
      {jobs.length > 0 && (
        <ul className="card divide-y divide-border">
          {jobs.slice(0, 6).map((j) => (
            <li key={j.id} className="flex items-start gap-2 px-4 py-2.5 text-[12.5px]">
              {j.state === "done" ? (
                <CircleCheck className="size-3.5 mt-0.5 shrink-0 text-ok" />
              ) : j.state === "failed" ? (
                <CircleAlert className="size-3.5 mt-0.5 shrink-0 text-danger" />
              ) : (
                <LoaderCircle className="size-3.5 mt-0.5 shrink-0 text-muted animate-spin" />
              )}
              <span className="min-w-0">
                <span className="block break-words">{j.label}</span>
                <span className="text-muted">{describe(j)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(j: ContentJob): string {
  if (j.state === "queued") return "Waiting for the sync…";
  if (j.state === "failed") return j.error ?? "Failed";
  const n = (j.added ?? 0) + (j.updated ?? 0);
  const parts = [`${j.added ?? 0} new`, `${j.updated ?? 0} updated`, `${j.skipped ?? 0} unchanged`];
  if (j.failed) parts.push(`${j.failed} failed`);
  if (j.state === "running") return `Downloading… ${n + (j.skipped ?? 0) + (j.failed ?? 0)} of ${j.total ?? "?"}`;
  return parts.join(" · ");
}
