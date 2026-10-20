"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MARKED_DONE_COOKIE, encodeIdCookie, parseIdCookie } from "@/lib/hidden-overdue";

function readCookie(): string[] {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${MARKED_DONE_COOKIE}=`));
  return parseIdCookie(raw?.slice(MARKED_DONE_COOKIE.length + 1));
}

function writeCookie(ids: string[]) {
  document.cookie = `${MARKED_DONE_COOKIE}=${encodeIdCookie(ids)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * The row's status circle, as a toggle for items the LMS can't confirm.
 * Marks are kept in this browser (a cookie), not sent to the LMS.
 */
export function MarkDoneToggle({ id, marked, overdue }: { id: string; marked: boolean; overdue: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = marked ? "Marked done (click to undo)" : "Mark done";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={marked}
      disabled={pending}
      onClick={() => {
        const ids = readCookie().filter((x) => x !== id);
        writeCookie(marked ? ids : [...ids, id]);
        start(() => router.refresh());
      }}
      className={clsx(
        "group/done mt-0.5 size-4 shrink-0 rounded-full border grid place-items-center transition-colors cursor-pointer",
        marked ? "bg-ok/70 border-ok/70 text-white" : overdue ? "border-danger hover:bg-danger-soft" : "border-border-strong hover:bg-surface-2",
        pending && "opacity-50",
      )}
    >
      {marked ? <Check className="size-2.5" strokeWidth={3.5} /> : <Check className="size-2.5 text-subtle opacity-0 group-hover/done:opacity-100" strokeWidth={3.5} />}
    </button>
  );
}
