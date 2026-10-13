import type { Metadata } from "next";
import { CircleAlert, CircleCheck, CloudOff, FlaskConical } from "lucide-react";
import { dataDir, dataSource, getSchoolData } from "@/lib/school";
import { configDir } from "@/lib/config";
import { libraryDir } from "@/lib/library";
import { LMS_LABEL, LMS_URL } from "@/lib/settings";
import { formatDateTime, relative } from "@/lib/school/time";
import { PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Data status" };

export default async function StatusPage() {
  const result = await getSchoolData();
  const source = dataSource();
  const now = new Date();
  const s = result.status === "ok" ? result.snapshot : null;

  const rows: [string, React.ReactNode][] = [
    ["Source", source === "fixture" ? "Demo fixtures" : source === "d2l" ? `${LMS_LABEL} (Brightspace) via d2l-cli` : `${LMS_LABEL} via the Canvas API`],
    ...(source === "fixture" ? [] : ([["LMS", <code key="u" className="font-mono text-[12px]">{LMS_URL}</code>]] as [string, React.ReactNode][])),
    ["Data directory", <code key="d" className="font-mono text-[12px]">{dataDir()}</code>],
    ["Config directory", <code key="c" className="font-mono text-[12px]">{configDir()}</code>],
    ["Library directory", <code key="l" className="font-mono text-[12px]">{libraryDir()}</code>],
    ["Last sync", s ? `${formatDateTime(s.generatedAt)} (${relative(s.generatedAt, now)})` : "—"],
  ];
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
