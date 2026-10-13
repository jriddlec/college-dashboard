"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";
const ORDER: Pref[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: "System theme", light: "Light theme", dark: "Dark theme" };

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Inline script for <head>: sets data-theme before first paint (no flash). */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<Pref>("system");

  useEffect(() => {
    let stored: Pref = "system";
    try {
      stored = (localStorage.getItem("theme") as Pref) || "system";
    } catch {}
    // Sync React state with the value the head script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(stored);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply((localStorage.getItem("theme") as Pref) || "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    apply(next);
  }

  const Icon = ICON[pref];
  if (compact) {
    return (
      <button onClick={cycle} aria-label={LABEL[pref]} title={LABEL[pref]} className="p-2 text-muted hover:text-fg">
        <Icon className="size-4" />
      </button>
    );
  }
  return (
    <button
      onClick={cycle}
      className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-surface-2/70 hover:text-fg transition-colors"
    >
      <Icon className="size-4" strokeWidth={1.8} />
      {LABEL[pref]}
    </button>
  );
}
