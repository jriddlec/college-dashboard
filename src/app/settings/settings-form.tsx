"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, type ThemePref } from "@/components/theme-toggle";

type Result = { ok: boolean; error?: string };

async function post(body: unknown): Promise<Result> {
  try {
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as Result;
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** Saves one change, shows "Saved" or the error, and re-renders the server page. */
function useSave() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(body: unknown, okText = "Saved") {
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? okText : (r.error ?? "Failed") });
    if (r.ok) router.refresh();
    return r.ok;
  }
  const note = msg && <span className={clsx("text-[12px]", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</span>;
  return { run, busy, note };
}

const input = "rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-fg min-w-0";
const button = "rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2 disabled:opacity-50";
const primary = "rounded-lg bg-accent text-white px-3 py-1.5 text-[13px] font-medium hover:opacity-90 disabled:opacity-50";

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6">
      <div className="lg:w-52 shrink-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-[12px] text-muted mt-0.5">{hint}</div>}
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ResetLink({ field, overridden, run }: { field: string; overridden: boolean; run: (b: unknown, t?: string) => Promise<boolean> }) {
  if (!overridden) return <span className="text-[11.5px] text-subtle">default</span>;
  return (
    <button type="button" onClick={() => run({ set: { [field]: null } }, "Reset to default")} className="text-[11.5px] text-muted hover:text-fg underline underline-offset-2">
      Reset
    </button>
  );
}

const THEMES: { v: ThemePref; label: string; icon: typeof Sun }[] = [
  { v: "system", label: "System", icon: Monitor },
  { v: "light", label: "Light", icon: Sun },
  { v: "dark", label: "Dark", icon: Moon },
];

export function ThemeChoice() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPref((localStorage.getItem("theme") as ThemePref) || "system");
    } catch {}
  }, []);
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {THEMES.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={pref === v}
          onClick={() => {
            setPref(v);
            try {
              localStorage.setItem("theme", v);
            } catch {}
            applyTheme(v);
          }}
          className={clsx("inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px]", pref === v ? "bg-surface text-fg font-medium shadow-sm" : "text-muted hover:text-fg")}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

export function NotifyTarget({ masked, overridden, canSave }: { masked: string; overridden: boolean; canSave: boolean }) {
  const { run, busy, note } = useSave();
  const test = useSave();
  const [url, setUrl] = useState("");
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-mono">{masked || <span className="text-muted font-sans">Not set: alerts are off</span>}</span>
        {canSave && <ResetLink field="notifyUrl" overridden={overridden} run={run} />}
      </div>
      {canSave && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ set: { notifyUrl: url.trim() } }, url.trim() ? "Saved" : "Alerts turned off")) setUrl("");
          }}
        >
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ntfy.sh/your-secret-topic" className={clsx(input, "flex-1 min-w-48 max-w-md")} />
          <button type="submit" disabled={busy || !url.trim()} className={primary}>
            Save
          </button>
          {masked && (
            <button type="button" disabled={busy} onClick={() => run({ set: { notifyUrl: "" } }, "Alerts turned off")} className={button}>
              Turn off
            </button>
          )}
          {note}
        </form>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={test.busy || !masked} onClick={() => test.run({ action: "test" }, "Sent. Check your phone.")} className={button}>
          Send test alert
        </button>
        {test.note}
      </div>
    </div>
  );
}

export function TextSetting({ field, value, overridden, placeholder, type = "text" }: { field: string; value: string; overridden: boolean; placeholder?: string; type?: string }) {
  const { run, busy, note } = useSave();
  const [v, setV] = useState(value);
  return (
    <form
      className="flex flex-wrap items-center gap-2 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ set: { [field]: v.trim() } });
      }}
    >
      <input type={type} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className={clsx(input, "flex-1 min-w-48 max-w-md")} />
      <button type="submit" disabled={busy || v === value} className={button}>
        Save
      </button>
      <ResetLink field={field} overridden={overridden} run={run} />
      {note}
    </form>
  );
}

export function SelectSetting({ field, value, options, overridden }: { field: string; value: number; options: { v: number; label: string }[]; overridden: boolean }) {
  const { run, busy, note } = useSave();
  const opts = options.some((o) => o.v === value) ? options : [...options, { v: value, label: `${value}` }].sort((a, b) => a.v - b.v);
  return (
    <>
      <select value={value} disabled={busy} onChange={(e) => run({ set: { [field]: Number(e.target.value) } })} className={input}>
        {opts.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      <ResetLink field={field} overridden={overridden} run={run} />
      {note}
    </>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ v: h, label: `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` }));

export function QuietHours({ value, overridden }: { value: string; overridden: boolean }) {
  const { run, busy, note } = useSave();
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(value);
  const [a, b] = m ? [Number(m[1]), Number(m[2])] : [22, 7];
  const set = (v: string) => run({ set: { remindQuiet: v } });
  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-[13px]">
        <input type="checkbox" checked={!!m} disabled={busy} onChange={(e) => set(e.target.checked ? "22-7" : "")} /> Quiet
      </label>
      {m && (
        <>
          <select value={a} disabled={busy} onChange={(e) => set(`${e.target.value}-${b}`)} className={input} aria-label="Quiet from">
            {HOURS.map((h) => (
              <option key={h.v} value={h.v}>
                {h.label}
              </option>
            ))}
          </select>
          <span className="text-[13px] text-muted">to</span>
          <select value={b} disabled={busy} onChange={(e) => set(`${a}-${e.target.value}`)} className={input} aria-label="Quiet until">
            {HOURS.map((h) => (
              <option key={h.v} value={h.v}>
                {h.label}
              </option>
            ))}
          </select>
        </>
      )}
      <ResetLink field="remindQuiet" overridden={overridden} run={run} />
      {note}
    </>
  );
}

export function AlertToggles({ kinds, off }: { kinds: { k: string; label: string; from: string }[]; off: string[] }) {
  const { run, busy, note } = useSave();
  const offSet = new Set(off);
  return (
    <div className="w-full">
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {kinds.map(({ k, label, from }) => (
          <li key={k}>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={!offSet.has(k)}
                disabled={busy}
                onChange={(e) => {
                  const next = new Set(offSet);
                  if (e.target.checked) next.delete(k);
                  else next.add(k);
                  void run({ set: { alertsOff: [...next] } });
                }}
              />
              <span title={from === "app" ? "Sent by the dashboard" : "Sent by the sync"}>{label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 h-4">{note}</div>
    </div>
  );
}

export function SyncNow({ disabled }: { disabled?: boolean }) {
  const { run, busy, note } = useSave();
  return (
    <>
      <button type="button" disabled={busy || disabled} onClick={() => run({ action: "sync" }, "Requested. It starts within 10 seconds.")} className={primary}>
        Sync now
      </button>
      {note}
    </>
  );
}
