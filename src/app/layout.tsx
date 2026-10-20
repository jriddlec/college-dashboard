import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MobileHeader, MobileNav, Sidebar, type NavCourse } from "@/components/nav";
import { themeInitScript } from "@/components/theme-toggle";
import { DemoBanner } from "@/components/data-state";
import { dataSource } from "@/lib/school";
import { getLibraryCourses } from "@/lib/library";
import { ACCENT_COLOR, APP_NAME, SCHOOL_NAME, accentCss } from "@/lib/settings";
import { getSyncStatus } from "@/lib/sync-status";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: "Classes, assignments, grades and study material",
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
    icons: { apple: "/app-icon/180" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#111112" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const courses: NavCourse[] = (await getLibraryCourses().catch(() => [])).map(({ slug, code, hue, icon }) => ({ slug, code, hue, icon }));
  const s = await getSyncStatus().catch(() => null);
  const sync = s && { fetchedAt: s.fetchedAt, level: s.level, needsLogin: s.session?.state === "needs_login", lastFailed: s.lastFailed };
  const brand = { appName: APP_NAME, schoolName: SCHOOL_NAME, sync };
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {ACCENT_COLOR && <style dangerouslySetInnerHTML={{ __html: accentCss(ACCENT_COLOR) }} />}
      </head>
      <body className="min-h-dvh">
        <div className="flex">
          <Sidebar courses={courses} {...brand} />
          <div className="flex-1 min-w-0">
            <MobileHeader {...brand} />
            <main className="mx-auto max-w-6xl px-4 md:px-8 pt-6 md:pt-10 pb-28 md:pb-16">
              {dataSource() === "fixture" && <DemoBanner />}
              {children}
            </main>
          </div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
