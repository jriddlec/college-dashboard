"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/** Full-screen state for an embed: fills the page beside the sidebar; Esc leaves. */
export function useFullScreen(): [boolean, (v: boolean) => void] {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);
  return [full, setFull];
}

export function FullScreenButton({
  full,
  setFull,
  className,
}: {
  full: boolean;
  setFull: (v: boolean) => void;
  className: string;
}) {
  const label = full ? "Exit full screen (Esc)" : "Full screen";
  return (
    <button
      type="button"
      className={className}
      onClick={() => setFull(!full)}
      title={label}
      aria-label={label}
      aria-pressed={full}
    >
      {full ? (
        <Minimize2 className="size-4" />
      ) : (
        <Maximize2 className="size-4" />
      )}
    </button>
  );
}

/** An HTML file in an iframe, with a full-screen button. */
export function HtmlFrame({ src, title }: { src: string; title: string }) {
  const [full, setFull] = useFullScreen();
  return (
    <div
      className={full ? "fixed inset-0 md:left-56 z-40 bg-white" : "relative"}
    >
      <FullScreenButton
        full={full}
        setFull={setFull}
        className="absolute top-2 right-2 z-10 inline-flex items-center justify-center size-8 rounded-md border border-border bg-surface/90 text-muted hover:text-fg shadow-sm"
      />
      <iframe
        src={src}
        title={title}
        className={
          full
            ? "block size-full bg-white"
            : "card w-full h-[calc(100dvh-12rem)] min-h-[480px] bg-white"
        }
      />
    </div>
  );
}
