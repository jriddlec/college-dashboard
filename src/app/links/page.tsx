import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { getLinks } from "@/lib/links";
import { LinkIcon } from "@/components/link-icon";
import { PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage() {
  await connection();
  const links = await getLinks();
  return (
    <div>
      <PageHeader
        title="Links"
        subtitle={
          links.customPath ? (
            <>
              Edit <code className="font-mono text-[12px]">links.json</code> in the config directory to change these.
            </>
          ) : (
            <>
              Showing defaults. Create <code className="font-mono text-[12px]">links.json</code> in the config directory to customize (see links.example.json).
            </>
          )
        }
      />
      {links.error && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-warn mb-6">
          <CircleAlert className="size-3.5" /> {links.error}
        </p>
      )}
      <div className="space-y-8">
        {links.groups.map((g) => (
          <Section key={g.name} title={g.name}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.links.map((l) => (
                <a
                  key={l.url + l.label}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="card group flex items-center gap-3 px-4 py-3 hover:border-border-strong transition-colors"
                >
                  <span className="size-8 rounded-lg bg-surface-2 grid place-items-center shrink-0">
                    <LinkIcon name={l.icon} className="size-4 text-muted" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{l.label}</span>
                    <span className="block text-[12px] text-muted truncate">{l.description ?? new URL(l.url).host}</span>
                  </span>
                  <ArrowUpRight className="size-3.5 text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
