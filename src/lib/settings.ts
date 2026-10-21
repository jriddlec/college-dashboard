/**
 * Environment settings (see .env.example). Read on the server; client
 * components receive what they need as props.
 */

export type Lms = "fixture" | "d2l" | "canvas";

/** Where school data comes from. Unset → demo data (with a banner). */
export const LMS: Lms = ((v) => (v === "d2l" || v === "canvas" ? v : "fixture"))(process.env.LMS);

/** Base URL of the school's LMS, e.g. https://school.brightspace.com or https://school.instructure.com. */
export const LMS_URL = (process.env.LMS_URL || "https://lms.example.edu").replace(/\/$/, "");

/** What students call the LMS ("eLC", "iCollege", "Canvas"...). */
export const LMS_LABEL = process.env.LMS_LABEL || (LMS === "canvas" ? "Canvas" : "Brightspace");

export const APP_NAME = process.env.APP_NAME || "College Dashboard";
export const SCHOOL_NAME = process.env.SCHOOL_NAME || "";

/** Brand color as hex ("#ba0c2f"; the "#" is optional), or null for the default blue. */
export const ACCENT_COLOR = ((v) => (/^#?[0-9a-f]{3,8}$/i.test(v) ? `#${v.replace(/^#/, "")}` : null))(process.env.ACCENT_COLOR ?? "");

/** CSS that applies ACCENT_COLOR in both themes (dark mode gets a lighter tint). */
export function accentCss(c: string): string {
  return (
    // html-qualified so it outranks globals.css, which loads after this tag.
    `html:root{--accent:${c};--accent-soft:color-mix(in srgb,${c} 9%,#fff);--ring:color-mix(in srgb,${c} 33%,transparent)}` +
    `html[data-theme="dark"]{--accent:color-mix(in srgb,${c} 65%,#fff);--accent-soft:color-mix(in srgb,${c} 22%,#111112)}`
  );
}

/** The course's page in the LMS: its home, or its content/modules. */
export function lmsCourseUrl(id: string, page: "home" | "content" = "home"): string {
  if (LMS === "canvas") return page === "content" ? `${LMS_URL}/courses/${id}/modules` : `${LMS_URL}/courses/${id}`;
  return page === "content" ? `${LMS_URL}/d2l/le/content/${id}/Home` : `${LMS_URL}/d2l/home/${id}`;
}

/** Shortcuts into the LMS for a course page. */
export function lmsCourseLinks(id: string): { label: string; url: string }[] {
  const u = (p: string) => `${LMS_URL}${p}`;
  if (LMS === "canvas") {
    return [
      { label: "Course home", url: u(`/courses/${id}`) },
      { label: "Modules", url: u(`/courses/${id}/modules`) },
      { label: "Assignments", url: u(`/courses/${id}/assignments`) },
      { label: "Grades", url: u(`/courses/${id}/grades`) },
      { label: "Discussions", url: u(`/courses/${id}/discussion_topics`) },
      { label: "Announcements", url: u(`/courses/${id}/announcements`) },
    ];
  }
  return [
    { label: "Course home", url: u(`/d2l/home/${id}`) },
    { label: "Content", url: u(`/d2l/le/content/${id}/Home`) },
    { label: "Assignments", url: u(`/d2l/lms/dropbox/user/folders_list.d2l?ou=${id}`) },
    { label: "Grades", url: u(`/d2l/lms/grades/my_grades/main.d2l?ou=${id}`) },
    { label: "Discussions", url: u(`/d2l/le/${id}/discussions/List`) },
    { label: "Announcements", url: u(`/d2l/lms/news/main.d2l?ou=${id}`) },
  ];
}

/** List library files that don't follow the recommended naming on /status (docs/library.md). */
export const LIBRARY_NAMING_CHECK = /^(1|true|yes|on)$/i.test(process.env.LIBRARY_NAMING_CHECK ?? "");

/** Where reminders and alerts go: an ntfy topic URL, a Discord webhook, or a URL taking a JSON POST. Empty = off. */
export const NOTIFY_URL = (process.env.NOTIFY_URL ?? "").trim();
/** The dashboard's own address, so alerts link back to it. */
export const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

/** Brightspace sign-in page for the d2l-session browser (noVNC), shown on /status when a sign-in is needed. */
export const SIGNIN_URL = process.env.SIGNIN_URL || (LMS === "d2l" ? "http://localhost:6080/vnc.html?autoconnect=1&resize=scale" : "");
/** Extra instructions next to it, e.g. the SSH tunnel command for a server. */
export const SIGNIN_HINT = process.env.SIGNIN_HINT || "";
