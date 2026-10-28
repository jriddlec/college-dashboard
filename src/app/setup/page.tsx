import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, FolderOpen } from "lucide-react";
import { dataSource } from "@/lib/school";
import { getLibrary, libraryDir } from "@/lib/library";
import { stateDir } from "@/lib/state";
import { APP_NAME, LMS_LABEL, LMS_URL, SIGNIN_HINT, SIGNIN_URL } from "@/lib/settings";
import { getSyncStatus } from "@/lib/sync-status";
import { effective, maskUrl, readSettings } from "@/lib/user-settings";
import { relative } from "@/lib/school/time";
import { CopyText } from "@/components/copy-text";
import { SubscribeCalendar } from "@/components/subscribe-calendar";
import { NotifyTarget } from "../settings/settings-form";
import { ConnectSchool, FinishSetup } from "./setup-steps";

export const metadata: Metadata = { title: "Setup" };

const STEPS = ["Welcome", "Your school", "Class folders", "Alerts", "Your phone", "Done"] as const;

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheck : CircleDashed;
  return (
    <p className="flex items-start gap-2 text-[13px]">
      <Icon className={`size-4 mt-0.5 shrink-0 ${ok ? "text-ok" : "text-subtle"}`} />
      <span>{children}</span>
    </p>
  );
}

const next = "inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-4 py-2 text-[13px] font-medium hover:opacity-90";
const back = "text-[13px] text-muted hover:text-fg";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const n = Math.min(Math.max(Number((await searchParams).step) || 0, 0), STEPS.length - 1);
  const now = new Date();
  const source = dataSource();
  const canSave = !!stateDir();
  const [saved, e, sync] = await Promise.all([readSettings(), effective(), getSyncStatus(now)]);

  let body: React.ReactNode;
  if (n === 0) {
    body = (
      <>
        <h2 className="text-[20px] font-semibold">Welcome to {APP_NAME}</h2>
        <p>This takes about five minutes. We’ll connect your school, find your class folders, and (if you like) set up phone alerts and a calendar feed.</p>
        <p>You can skip any step and come back later from <strong>Settings</strong>.</p>
        {source === "fixture" && <p className="text-muted">Right now you’re looking at demo data, so you can poke around first.</p>}
        {!canSave && (
          <p className="text-warn">
            Heads up: <code className="font-mono">STATE_DIR</code> isn’t writable, so settings you choose here can’t be saved on the server.
          </p>
        )}
      </>
    );
  } else if (n === 1) {
    const signedIn = sync?.session?.state === "ok";
    body = (
      <>
        <h2 className="text-[20px] font-semibold">Connect your school</h2>
        {source === "fixture" ? (
          <>
            <p>The dashboard reads your classes, assignments and grades from your school’s learning system. It only ever reads; it never submits or changes anything.</p>
            <ConnectSchool />
          </>
        ) : source === "d2l" ? (
          <>
            <Check ok>
              Using {LMS_LABEL} at <code className="font-mono text-[12px]">{LMS_URL}</code>
            </Check>
            <Check ok={signedIn}>{signedIn ? "Signed in" : "Sign in once in the session browser. After that it stays signed in on its own."}</Check>
            {!signedIn && (
              <div className="pl-6 space-y-2">
                {SIGNIN_HINT && <CopyText text={SIGNIN_HINT} />}
                {SIGNIN_URL && (
                  <a href={SIGNIN_URL} target="_blank" rel="noreferrer" className={next}>
                    Open sign-in <ArrowUpRight className="size-3.5" />
                  </a>
                )}
                <p className="text-muted text-[12.5px]">Come back here when you’re done; reload to check.</p>
              </div>
            )}
            <Check ok={!!sync?.fetchedAt}>{sync?.fetchedAt ? `First sync done ${relative(sync.fetchedAt, now)}` : "The first sync starts a minute or two after you sign in."}</Check>
          </>
        ) : (
          <>
            <Check ok>
              Using Canvas at <code className="font-mono text-[12px]">{LMS_URL}</code>
            </Check>
            <Check ok={!!sync?.fetchedAt}>{sync?.fetchedAt ? `Synced ${relative(sync.fetchedAt, now)}` : "Waiting for the first sync. Check that CANVAS_TOKEN is set in .env."}</Check>
          </>
        )}
      </>
    );
  } else if (n === 2) {
    const lib = await getLibrary().catch(() => null);
    const found = lib?.ok ? lib.courses.filter((c) => c.roots.length > 0) : [];
    const empty = lib?.ok ? lib.courses.filter((c) => c.roots.length === 0) : [];
    body = (
      <>
        <h2 className="text-[20px] font-semibold">Your class folders</h2>
        <p>
          The Library shows your own notes, study guides and slides, straight from a folder on disk. Name top-level folders after the course code (<code className="font-mono">CSCI 1301</code>,{" "}
          <code className="font-mono">MATH2260 Notes</code>) and they’re matched up automatically.
        </p>
        <p className="flex items-center gap-2 text-muted text-[12.5px]">
          <FolderOpen className="size-4" /> Reading <code className="font-mono">{libraryDir()}</code> (set with <code className="font-mono">LIBRARY_DIR</code>)
        </p>
        {lib && !lib.ok && <p className="text-danger">Couldn’t read it: {lib.error}</p>}
        {found.map((c) => (
          <Check key={c.course.slug} ok>
            <strong>{c.course.code}</strong> <span className="text-muted">→ {c.roots.join(", ")}</span>
          </Check>
        ))}
        {empty.map((c) => (
          <Check key={c.course.slug} ok={false}>
            <strong>{c.course.code}</strong> <span className="text-muted">has no folder yet</span>
          </Check>
        ))}
        {empty.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted text-[12.5px]">To create a starter folder for each class missing one (it never touches existing folders), run on the server:</p>
            <CopyText text="docker compose run --rm init" />
          </div>
        )}
      </>
    );
  } else if (n === 3) {
    body = (
      <>
        <h2 className="text-[20px] font-semibold">Phone alerts (optional)</h2>
        <p>Get a push notification for deadlines coming up, exams, new grades and announcements. The easiest way is the free ntfy app:</p>
        <ol className="list-decimal pl-5 space-y-1 text-[13px]">
          <li>Install ntfy on your phone (iOS or Android).</li>
          <li>Subscribe to a long, hard-to-guess topic name, like <code className="font-mono">jake-classes-8f3k2</code>.</li>
          <li>
            Paste <code className="font-mono">https://ntfy.sh/your-topic</code> below, save, and send a test.
          </li>
        </ol>
        <p className="text-muted text-[12.5px]">A Discord webhook URL works too.</p>
        <div className="card p-4">
          <NotifyTarget masked={maskUrl(e.notifyUrl)} overridden={saved.notifyUrl !== undefined} canSave={canSave} />
        </div>
      </>
    );
  } else if (n === 4) {
    body = (
      <>
        <h2 className="text-[20px] font-semibold">On your phone</h2>
        <p>
          <strong>Add it to your home screen.</strong> Open this page on your phone, then use Share → <em>Add to Home Screen</em> (iPhone) or the ⋮ menu → <em>Install app</em> (Android).
        </p>
        <p>
          <strong>Deadlines in your calendar.</strong> Subscribe once and due dates show up in Apple, Google or Outlook Calendar with reminders.
        </p>
        <SubscribeCalendar />
      </>
    );
  } else {
    body = (
      <>
        <h2 className="text-[20px] font-semibold">You’re all set</h2>
        <p>A few things worth knowing:</p>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li>
            Press <kbd className="font-mono">Ctrl K</kbd> (or <kbd className="font-mono">/</kbd>) to search everything, including the text inside your notes.
          </li>
          <li>
            <strong>Data status</strong> (bottom of the sidebar) tells you if the sync needs attention.
          </li>
          <li>
            Change any of this later in <strong>Settings</strong>, where you can also reopen this guide.
          </li>
        </ul>
        <FinishSetup canSave={canSave} label="Go to my dashboard" />
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 mb-6 text-[12px]" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <Link href={`/setup?step=${i}`} aria-current={i === n ? "step" : undefined} className={i === n ? "text-fg font-semibold" : i < n ? "text-muted" : "text-subtle"}>
              {i + 1}. {s}
            </Link>
          </li>
        ))}
      </ol>
      <div className="card p-6 space-y-4 text-[13.5px] leading-relaxed">{body}</div>
      <div className="flex items-center justify-between mt-4">
        <div>
          {n > 0 && (
            <Link href={`/setup?step=${n - 1}`} className={back}>
              ← Back
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          {n < STEPS.length - 1 && !saved.setupDone && <FinishSetup canSave={canSave} label="Skip setup" quiet />}
          {n < STEPS.length - 1 && (
            <Link href={`/setup?step=${n + 1}`} className={next}>
              {n === 0 ? "Let’s go" : "Next"} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
