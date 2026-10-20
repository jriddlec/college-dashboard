"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A command or URL in a code box with a copy button. */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 pl-3 pr-1 py-1">
      <code className="flex-1 min-w-0 font-mono text-[12px] break-all">{text}</code>
      <button
        type="button"
        aria-label="Copy"
        title="Copy"
        className="shrink-0 p-1.5 rounded text-muted hover:text-fg hover:bg-surface"
        onClick={async () => {
          await navigator.clipboard?.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
