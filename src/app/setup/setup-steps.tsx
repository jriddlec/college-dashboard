"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CopyText } from "@/components/copy-text";
import { SETUP_COOKIE } from "@/lib/setup";

/** Marks the guide finished (or skipped) and goes to the dashboard. */
export function FinishSetup({ canSave, label, quiet }: { canSave: boolean; label: string; quiet?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // The cookie also covers servers without STATE_DIR.
        document.cookie = `${SETUP_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
        if (canSave) {
          await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { setupDone: true } }) }).catch(() => {});
        }
        router.push("/");
      }}
      className={quiet ? "text-[13px] text-muted hover:text-fg" : "inline-flex items-center rounded-lg bg-accent text-white px-4 py-2 text-[13px] font-medium hover:opacity-90 disabled:opacity-50"}
    >
      {label}
    </button>
  );
}

const LMS = [
  { v: "d2l", label: "Brightspace / D2L", eg: "https://yourschool.brightspace.com" },
  { v: "canvas", label: "Canvas", eg: "https://yourschool.instructure.com" },
] as const;

/** Builds the .env lines for the chosen LMS. The LMS type lives in .env, so the server needs a restart. */
export function ConnectSchool() {
  const [lms, setLms] = useState<"d2l" | "canvas">("d2l");
  const [url, setUrl] = useState("");
  const pick = LMS.find((l) => l.v === lms)!;
  const clean = url.trim().replace(/\/+$/, "") || pick.eg;
  const env = [`LMS=${lms}`, `LMS_URL=${clean}`, `COMPOSE_PROFILES=${lms}`, ...(lms === "canvas" ? ["CANVAS_TOKEN=paste-your-token-here"] : [])].join("\n");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-medium mb-1.5">1. Which system does your school use?</p>
        <div role="radiogroup" className="inline-flex rounded-lg bg-surface-2 p-0.5">
          {LMS.map((l) => (
            <button
              key={l.v}
              type="button"
              role="radio"
              aria-checked={lms === l.v}
              onClick={() => setLms(l.v)}
              className={clsx("px-3 py-1 rounded-md text-[13px]", lms === l.v ? "bg-surface text-fg font-medium shadow-sm" : "text-muted hover:text-fg")}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[13px] font-medium mb-1.5" htmlFor="lms-url">
          2. Its web address (copy it from your browser while signed in)
        </label>
        <input
          id="lms-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={pick.eg}
          className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-fg"
        />
      </div>
      {lms === "canvas" && (
        <p className="text-[13px]">
          <span className="font-medium">3. Make an access token:</span> in Canvas, go to <em>Account → Settings → New Access Token</em> and copy it.
        </p>
      )}
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">{lms === "canvas" ? "4" : "3"}. Add these lines to the .env file next to compose.yml:</p>
        <pre className="rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] whitespace-pre-wrap break-all">{env}</pre>
        <p className="text-[13px] font-medium pt-2">Then restart:</p>
        <CopyText text="docker compose up -d --build" />
        <p className="text-muted text-[12.5px]">
          When it’s back, open this page again and this step will show {lms === "d2l" ? "the sign-in button" : "the sync status"}.
        </p>
      </div>
    </div>
  );
}
