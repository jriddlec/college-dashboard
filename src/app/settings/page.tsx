import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { dataSource } from "@/lib/school";
import { stateDir } from "@/lib/state";
import { LMS, LMS_LABEL, LMS_URL, SIGNIN_HINT, SIGNIN_URL } from "@/lib/settings";
import { getSyncStatus } from "@/lib/sync-status";
import { effective, maskUrl, readSettings } from "@/lib/user-settings";
import { formatDateTime, relative } from "@/lib/school/time";
import { CopyText } from "@/components/copy-text";
import { PageHeader, Section } from "@/components/ui";
import { AlertToggles, NotifyTarget, QuietHours, Row, SelectSetting, SyncNow, TextSetting, ThemeChoice } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

const ALERTS = [
  { k: "deadlines", label: "Deadline reminders", from: "app" },
  { k: "exams", label: "Exam reminders", from: "app" },
  { k: "grades", label: "New grades", from: "sync" },
  { k: "announcements", label: "New announcements", from: "sync" },
  { k: "signin", label: "Sign-in needed", from: "sync" },
  { k: "sync", label: "Sync failing / back", from: "sync" },
];

const hoursOpts = (list: number[]) => list.map((h) => ({ v: h, label: h % 24 === 0 && h >= 24 ? `${h / 24} day${h > 24 ? "s" : ""}` : `${h} hours` }));
const INTERVALS = [
  { v: 900, label: "Every 15 minutes" },
  { v: 1800, label: "Every 30 minutes" },
  { v: 3600, label: "Every hour" },
  { v: 7200, label: "Every 2 hours" },
  { v: 21600, label: "Every 6 hours" },
];

function Step({ done, warn, title, children }: { done: boolean; warn?: boolean; title: string; children?: React.ReactNode }) {
  const Icon = done ? CircleCheck : warn ? CircleAlert : CircleDashed;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className={`size-4 mt-0.5 shrink-0 ${done ? "text-ok" : warn ? "text-danger" : "text-subtle"}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium ${done ? "" : "text-fg"}`}>{title}</div>
        {children && <div className="text-[12.5px] text-muted mt-1 space-y-2">{children}</div>}
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const now = new Date();
  const canSave = !!stateDir();
  const [saved, e, sync] = await Promise.all([readSettings(), effective(), getSyncStatus(now)]);
  const source = dataSource();
  const o = (k: keyof typeof saved) => saved[k] !== undefined;

  const lmsSet = LMS !== "fixture" && !LMS_URL.includes("example.edu");
  const signedIn = sync?.session?.state === "ok";
  const needsLogin = sync?.session?.state === "needs_login" || sync?.session?.state === "refresh_failed";
  const synced = !!sync?.fetchedAt;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Alerts, the LMS sync, and how the app looks" />

      {!canSave && (
        <p className="card px-4 py-3 mb-6 text-[13px] text-warn">
          Saving needs <code className="font-mono">STATE_DIR</code> on the server, so these are the <code className="font-mono">.env</code> values, read-only.
        </p>
      )}

      <Section title="Appearance">
        <div className="card divide-y divide-border">
          <Row label="Theme" hint="Saved in this browser">
            <ThemeChoice />
          </Row>
        </div>
      </Section>

      <Section title="Notifications" className="mt-8">
        <div className="card divide-y divide-border">
          <Row
            label="Send alerts to"
            hint={
              <>
                An{" "}
                <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  ntfy
                </a>{" "}
                topic URL, a Discord webhook, or any URL that takes a JSON POST. Hidden once saved.
              </>
            }
          >
            <NotifyTarget masked={maskUrl(e.notifyUrl)} overridden={o("notifyUrl")} canSave={canSave} />
          </Row>
          {canSave && (
            <>
              <Row label="Alert types" hint="Turn off the ones you don’t want">
                <AlertToggles kinds={ALERTS} off={[...e.alertsOff]} />
              </Row>
              <Row label="Deadline reminder" hint="Open work due within">
                <SelectSetting field="remindDueHours" value={e.remindDueHours} overridden={o("remindDueHours")} options={hoursOpts([2, 6, 12, 24, 48, 72])} />
              </Row>
              <Row label="Exam reminder" hint="Exams within">
                <SelectSetting field="remindExamHours" value={e.remindExamHours} overridden={o("remindExamHours")} options={hoursOpts([24, 48, 72, 168])} />
              </Row>
              <Row label="Quiet hours" hint="Reminders wait until after">
                <QuietHours value={e.remindQuiet} overridden={o("remindQuiet")} />
              </Row>
              <Row label="Dashboard address" hint="Tapping an alert opens this">
                <TextSetting field="appUrl" value={e.appUrl} overridden={o("appUrl")} placeholder="http://school.home.arpa" type="url" />
              </Row>
            </>
          )}
        </div>
        <details className="mt-3 text-[12.5px] text-muted">
          <summary className="cursor-pointer hover:text-fg">Setting up ntfy</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>Install the ntfy app (iOS, Android) or open ntfy.sh in a browser.</li>
            <li>Pick a long, hard-to-guess topic name: anyone who knows it can read your alerts on the public server.</li>
            <li>Subscribe to it in the app (use your own server’s address if you self-host ntfy).</li>
            <li>
              Paste <code className="font-mono">https://ntfy.sh/&lt;topic&gt;</code> (or your server’s URL) above, save, and send a test alert.
            </li>
          </ol>
        </details>
      </Section>

      <Section title={source === "d2l" ? `${LMS_LABEL} sync` : "Data sync"} className="mt-8">
        {source === "d2l" ? (
          <>
            <ol className="card divide-y divide-border">
              <Step done={lmsSet} title="LMS address">
                {lmsSet ? <code className="font-mono text-[12px]">{LMS_URL}</code> : <>Set LMS=d2l and LMS_URL in the server’s .env, then redeploy.</>}
              </Step>
              <Step done={signedIn} warn={needsLogin} title={signedIn ? "Signed in" : needsLogin ? "Sign-in needed" : "Sign in"}>
                {!signedIn && (
                  <>
                    <p>Sign in once in the session browser; it keeps the session alive after that. The dashboard notices within 15 seconds and syncs.</p>
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
                  </>
                )}
                {signedIn && sync?.session?.at && <>Checked {relative(sync.session.at, now)}</>}
              </Step>
              <Step done={synced} warn={sync?.lastFailed} title={synced ? "Syncing" : "First sync"}>
                {synced ? (
                  <>
                    Last synced {formatDateTime(sync!.fetchedAt!)} ({relative(sync!.fetchedAt!, now)})
                    {sync?.lastFailed && sync.lastAttemptAt && <span className="text-warn">; latest attempt failed {relative(sync.lastAttemptAt, now)}</span>}
                  </>
                ) : (
                  "Starts right after you sign in."
                )}
              </Step>
              <Step done={!!e.notifyUrl} title="Alerts (optional)">
                {e.notifyUrl ? "Set up above." : "Add an ntfy topic above to hear about grades, announcements and expired sign-ins."}
              </Step>
            </ol>
            {canSave && (
              <div className="card divide-y divide-border mt-3">
                <Row label="Sync interval" hint="Applies after the next sync">
                  <SelectSetting field="syncInterval" value={e.syncInterval} overridden={o("syncInterval")} options={INTERVALS} />
                </Row>
                <Row label="Sync now" hint="Fetch the latest from the LMS">
                  <SyncNow disabled={!signedIn} />
                </Row>
              </div>
            )}
          </>
        ) : (
          <p className="card px-4 py-3 text-[13px] text-muted">
            {source === "fixture"
              ? "Showing demo data. Set LMS=d2l or LMS=canvas in the server’s .env to use your school’s data."
              : `${LMS_LABEL} via the Canvas API; set its interval with SYNC_INTERVAL in .env.`}
          </p>
        )}
        <p className="mt-3 text-[12.5px] text-muted">
          Folders, ports and the LMS type stay in the server’s <code className="font-mono">.env</code>; see{" "}
          <Link href="/status" className="underline underline-offset-2">
            Data status
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
