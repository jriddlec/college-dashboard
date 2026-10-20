"use client";

import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { HIDDEN_OVERDUE_COOKIE, encodeIdCookie } from "@/lib/hidden-overdue";

function write(ids: string[]) {
  document.cookie = `${HIDDEN_OVERDUE_COOKIE}=${encodeIdCookie(ids)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Hides one overdue assignment from the Today page. It stays on /assignments?filter=overdue. */
export function HideOverdueButton({ id, hidden }: { id: string; hidden: string[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        write([...new Set([...hidden, id])]);
        router.refresh();
      }}
      title="Hide from dashboard"
      aria-label="Hide from dashboard"
      className="shrink-0 -my-1 p-1 rounded text-subtle hover:text-fg hover:bg-surface-2 transition-colors"
    >
      <EyeOff className="size-3.5" />
    </button>
  );
}

/** Brings every hidden overdue assignment back onto the Today page. */
export function ShowHiddenOverdue({ count }: { count: number }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        write([]);
        router.refresh();
      }}
      className="block w-full text-center text-[12.5px] text-muted hover:text-fg py-1"
    >
      {count} hidden · Show
    </button>
  );
}
