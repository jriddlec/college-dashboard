"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function CourseSelect({ courses, value }: { courses: { id: string; label: string }[]; value: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Filter by course</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          if (e.target.value) p.set("course", e.target.value);
          else p.delete("course");
          const s = p.toString();
          router.push(s ? `/assignments?${s}` : "/assignments");
        }}
        className="appearance-none w-full sm:w-64 rounded-lg border border-border bg-surface pl-3 pr-8 py-1.5 text-[13px] text-fg truncate"
      >
        <option value="">All courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted" />
    </label>
  );
}
