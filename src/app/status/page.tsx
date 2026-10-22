import type { Metadata } from "next";
import { ArrowUpRight, CircleAlert, CircleCheck, CloudOff, FileWarning, FlaskConical, KeyRound } from "lucide-react";
import { dataDir, dataSource, getSchoolData } from "@/lib/school";
import { configDir } from "@/lib/config";
import { getLibrary, libraryDir } from "@/lib/library";
import { namingIssues, type NamingIssue } from "@/lib/library/naming";
import { stateDir } from "@/lib/state";
import { LIBRARY_NAMING_CHECK, LMS_LABEL, LMS_URL, NOTIFY_URL, SIGNIN_HINT, SIGNIN_URL } from "@/lib/settings";
import { getSyncStatus } from "@/lib/sync-status";
import { contentCourses, contentFetchEnabled, contentJobs } from "@/lib/content-fetch";
import { ContentFetch } from "@/components/content-fetch";
import { CopyText } from "@/components/copy-text";
import { formatDateTime, relative } from "@/lib/school/time";
import { PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Data status" };

export default async function StatusPage() {
  const result = await getSchoolData();
  const source = dataSource();
  const now = new Date();
  const s = result.status === "ok" ? result.snapshot : null;
  const sync = await getSyncStatus(now);
  const session = sync?.session ?? null;
  const SESSION_LABEL = { ok: "Signed in", needs_login: "Sign-in needed", refresh_failed: "Token refresh failing", unknown: "Unknown (no status from the sync yet)" };

  const rows: [string, React.ReactNode][] = [
    ["Source", source === "fixture" ? "Demo fixtures" : source === "d2l" ? `${LMS_LABEL} (Brightspace) via d2l-cli` : `${LMS_LABEL} via the Canvas API`],
    ...(source === "fixture" ? [] : ([["LMS", <code key="u" className="font-mono text-[12px]">{LMS_URL}</code>]] as [string, React.ReactNode][])),
    ["Data directory", <code key="d" className="font-mono text-[12px]">{dataDir()}</code>],
    ["Config directory", <code key="c" className="font-mono text-[12px]">{configDir()}</code>],
    ["Library directory", <code key="l" className="font-mono text-[12px]">{libraryDir()}</code>],
    ["Shared marks", stateDir() ? <code key="s" className="font-mono text-[12px]">{stateDir()}</code> : "Off (kept per browser)"],
    ["Reminders", NOTIFY_URL ? "On (deadlines due within a day, exams within two days)" : "Off (set NOTIFY_URL)"],
    ["Last sync", s ? `${formatDateTime(s.generatedAt)} (${relative(s.generatedAt, now)})` : "—"],
  ];
  if (sync?.lastFailed && sync.lastAttemptAt) rows.push(["Latest attempt", <span key="a" className="text-warn">Failed {relative(sync.lastAttemptAt, now)}</span>]);
  if (session) rows.push(["Sign-in session", `${SESSION_LABEL[session.state]}${session.at ? ` · checked ${relative(session.at, now)}` : ""}`]);
  if (s) {
    rows.push(
      ["Courses", s.courses.length],
      ["Assignments", s.assignments.length],
      ["Calendar events", s.events.length],
      ["Grades", s.grades.length],
      ["Announcements", s.announcements.length],
    );
  }

  const contentCourseList = s && contentFetchEnabled() ? await contentCourses(s.courses) : [];
  const jobs = contentCourseList.length ? await contentJobs() : [];

  const library = LIBRARY_NAMING_CHECK ? await getLibrary().catch(() => null) : null;
  const naming: (NamingIssue & { code: string })[] = library?.ok ? library.courses.flatMap((c) => namingIssues(c).map((i) => ({ ...i, code: c.course.code }))) : [];

  const [Icon, tone, headline, detail] =
    result.status === "error"
      ? [CircleAlert, "text-danger", "Data failed to load", result.message]
      : result.status === "empty"
        ? [CloudOff, "text-warn", "No data yet", result.reason]
        : source === "fixture"
          ? [FlaskConical, "text-warn", "Showing demo data", "Set LMS=d2l or LMS=canvas (and LMS_URL) to use your school’s data."]
          : session?.state === "needs_login"
            ? [CloudOff, "text-danger", "Syncing paused", `Showing the last synced ${LMS_LABEL} data until you sign in again.`]
            : sync?.lastFailed
              ? [CircleAlert, "text-warn", "Latest sync failed", `Showing the last synced ${LMS_LABEL} data; the next sync will retry.`]
              : [CircleCheck, "text-ok", "Connected", `${LMS_LABEL} data is loading normally.`];

  return (
    <div className="max-w-2xl">
      <PageHeader title="Data status" subtitle="Where the dashboard’s school data comes from" />
      <div className="card p-4 flex items-start gap-3 mb-8">
        <Icon className={`size-5 mt-0.5 ${tone}`} />
        <div>
          <p className="text-[14px] font-medium">{headline}</p>
          <p className="text-[13px] text-muted mt-0.5">{detail}</p>
        </div>
      </div>

      {session && session.state !== "ok" && (
        <div className="card p-4 mb-8 border-danger/40">
          <div className="flex items-start gap-3">
            <KeyRound className={`size-5 mt-0.5 ${session.state === "needs_login" ? "text-danger" : "text-warn"}`} />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[14px] font-medium">{session.state === "needs_login" ? `Sign in to ${LMS_LABEL}` : `${LMS_LABEL} session is having trouble`}</p>
                <p className="text-[13px] text-muted mt-0.5">
                  {session.state === "needs_login"
                    ? "The saved session expired, so syncing has stopped. Sign in in the session browser; the dashboard notices within 15 seconds and syncs right after."
                    : "Token refreshes are failing. Signing in again usually fixes it."}
                </p>
              </div>
              {SIGNIN_HINT && <CopyText text={SIGNIN_HINT} />}
              {SIGNIN_URL && (
                <a
                  href={SIGNIN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-3 py-1.5 text-[13px] font-medium hover:opacity-90"
                >
                  Open sign-in <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <Section title="Details">
        <dl className="card divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-[13px]">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right tabular-nums break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {contentCourseList.length > 0 && (
        <Section title="Course content" className="mt-8">
          <ContentFetch courses={contentCourseList} jobs={jobs} />
        </Section>
      )}

      {LIBRARY_NAMING_CHECK && library?.ok && (
        <Section title="Library naming" count={naming.length} className="mt-8">
          {naming.length === 0 ? (
            <p className="card flex items-center gap-2 px-4 py-3 text-[13px] text-ok">
              <CircleCheck className="size-4" /> Every file follows the naming convention.
            </p>
          ) : (
            <ul className="card divide-y divide-border">
              {naming.slice(0, 60).map((i) => (
                <li key={i.path} className="flex items-start gap-2 px-4 py-2.5 text-[12.5px]">
                  <FileWarning className="size-3.5 mt-0.5 shrink-0 text-warn" />
                  <span className="min-w-0">
                    <code className="block font-mono text-[11.5px] break-all">{i.path}</code>
                    <span className="text-muted">{i.problem}</span>
                  </span>
                </li>
              ))}
              {naming.length > 60 && <li className="px-4 py-2 text-[12px] text-muted">…and {naming.length - 60} more</li>}
            </ul>
          )}
        </Section>
      )}

      {s && s.warnings.length > 0 && (
        <Section title="Warnings" count={s.warnings.length} className="mt-8">
          <ul className="card divide-y divide-border">
            {s.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 px-4 py-2.5 text-[13px] text-warn">
                <CircleAlert className="size-3.5 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
