"use client";

import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { HIDDEN_OVERDUE_COOKIE } from "@/lib/hidden-overdue";
import { saveShared, writeCookieIds } from "@/lib/state-client";

/** Hides one overdue assignment from the Today page. It stays on /assignments?filter=overdue. */
export function HideOverdueButton({ id, hidden }: { id: string; hidden: string[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await saveShared("hiddenOverdue", { ids: [id], on: true }))) writeCookieIds(HIDDEN_OVERDUE_COOKIE, [...new Set([...hidden, id])]);
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
      onClick={async () => {
        await saveShared("hiddenOverdue", { clear: true });
        writeCookieIds(HIDDEN_OVERDUE_COOKIE, []);
        router.refresh();
      }}
      className="block w-full text-center text-[12.5px] text-muted hover:text-fg py-1"
    >
      {count} hidden · Show
    </button>
  );
}
