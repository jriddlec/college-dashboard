"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "pdf-dark";

/**
 * A PDF in the browser's own viewer. In the dark theme the page is inverted
 * (hue-rotated back so colors stay close), unless turned off; the choice is remembered.
 */
export function PdfFrame({ src, title }: { src: string; title: string }) {
  const [invert, setInvert] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "0") setInvert(false);
    } catch {}
  }, []);
  const toggle = () => {
    setInvert((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  };
  return (
    <div>
      <div className="hidden dark:flex justify-end mb-2">
        <button
          type="button"
          onClick={toggle}
          title={invert ? "Show original colors" : "Dark PDF"}
          aria-label={invert ? "Show original colors" : "Dark PDF"}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-muted hover:text-fg"
        >
          {invert ? (
            <Sun className="size-3.5" />
          ) : (
            <Moon className="size-3.5" />
          )}
          {invert ? "Light PDF" : "Dark PDF"}
        </button>
      </div>
      <iframe
        src={src}
        title={title}
        className={`card w-full h-[calc(100dvh-12rem)] min-h-[480px] bg-white ${invert ? "dark:[filter:invert(0.9)_hue-rotate(180deg)]" : ""}`}
      />
    </div>
  );
}
