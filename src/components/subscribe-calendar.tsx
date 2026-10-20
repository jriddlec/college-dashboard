"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { buttonClass } from "./ui";

const FEED = "/api/calendar.ics";
const noop = () => () => {};

/** Feed URL with copy and webcal:// buttons; the origin is whatever host this page was opened on. */
export function SubscribeCalendar() {
  const url = useSyncExternalStore(noop, () => `${location.origin}${FEED}`, () => FEED);
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start gap-2.5">
        <CalendarPlus className="size-4 text-muted mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px]">Subscribe from your phone or computer calendar to get deadlines, exams and early-bonus cutoffs with reminders (1 day and 2 hours before).</p>
          <code className="block mt-2 font-mono text-[11.5px] text-muted break-all">{url}</code>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              type="button"
              className={buttonClass}
              onClick={async () => {
                await navigator.clipboard?.writeText(url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy link"}
            </button>
            <a className={buttonClass} href={url.replace(/^https?:/, "webcal:")}>
              Open in Calendar
            </a>
          </div>
          <p className="text-[11.5px] text-subtle mt-2">
            Add <code className="font-mono">?alarms=none</code> for no reminders or <code className="font-mono">?classes=1</code> for class meetings. Items marked done here still show there.
          </p>
        </div>
      </div>
    </div>
  );
}
