"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MARKED_DONE_COOKIE } from "@/lib/hidden-overdue";
import { readCookieIds, saveShared, writeCookieIds } from "@/lib/state-client";

/**
 * The row's status circle, as a toggle for items the LMS can't confirm.
 * Marks are kept by the app (shared by your devices) when it has a state
 * folder, else in this browser (a cookie). Never sent to the LMS.
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
      onClick={() =>
        start(async () => {
          const shared = await saveShared("markedDone", { ids: [id], on: !marked });
          // An unmark also clears an old per-browser mark; without a shared store the cookie is the mark.
          const ids = readCookieIds(MARKED_DONE_COOKIE).filter((x) => x !== id);
          writeCookieIds(MARKED_DONE_COOKIE, marked || shared ? ids : [...ids, id]);
          router.refresh();
        })
      }
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
