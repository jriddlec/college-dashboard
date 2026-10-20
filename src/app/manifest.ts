import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { ACCENT_COLOR, APP_NAME, SCHOOL_NAME } from "@/lib/settings";

/** Web app manifest: "Add to Home Screen" opens it full-screen like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection(); // names and colors come from .env at runtime
  return {
    name: SCHOOL_NAME ? `${APP_NAME} · ${SCHOOL_NAME}` : APP_NAME,
    short_name: APP_NAME,
    description: "Classes, assignments, grades and study material",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: ACCENT_COLOR ?? "#fbfbfa",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Assignments", url: "/assignments" },
      { name: "Calendar", url: "/calendar" },
      { name: "Library", url: "/library" },
    ],
  };
}
