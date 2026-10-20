import type { Metadata } from "next";
import { ArrowUpRight, CircleAlert, CircleCheck, CloudOff, FlaskConical, KeyRound } from "lucide-react";
import { dataDir, dataSource, getSchoolData } from "@/lib/school";
import { configDir } from "@/lib/config";
import { libraryDir } from "@/lib/library";
import { LMS_LABEL, LMS_URL, SIGNIN_HINT, SIGNIN_URL } from "@/lib/settings";
import { getSyncStatus } from "@/lib/sync-status";
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
