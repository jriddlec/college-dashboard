"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card flex flex-col items-center text-center px-6 py-14">
      <div className="size-10 rounded-full bg-danger-soft grid place-items-center mb-4">
        <CircleAlert className="size-5 text-danger" />
      </div>
      <p className="text-[15px] font-medium">Something went wrong</p>
      <p className="text-[13px] text-muted mt-1.5 max-w-md">This page hit an unexpected error{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <button onClick={() => retry()} className="mt-5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-border-strong">
        Try again
      </button>
    </div>
  );
}
