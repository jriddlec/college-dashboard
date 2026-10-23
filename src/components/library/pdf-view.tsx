"use client";

import dynamic from "next/dynamic";

/** The PDF viewer, client-only: pdf.js needs the browser. */
export const PdfView = dynamic(
  () => import("./pdf-frame").then((m) => m.PdfFrame),
  { ssr: false },
);
