import "server-only";
import { z } from "zod";
import { LMS_LABEL, LMS_URL } from "@/lib/settings";
import { readConfig } from "@/lib/config";

const LinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  description: z.string().optional(),
  icon: z.string().optional(),
});
const LinksSchema = z.object({
  groups: z.array(z.object({ name: z.string(), links: z.array(LinkSchema) })),
  /** Extra links per course, keyed by Brightspace course id or code ("CSCI 2720"). */
  courseLinks: z.record(z.string(), z.array(LinkSchema)).default({}),
});
export type QuickLink = z.infer<typeof LinkSchema>;
export type LinkGroup = z.infer<typeof LinksSchema>["groups"][number];
type Links = z.infer<typeof LinksSchema>;

export interface LinksResult extends Links {
  error: string | null;
  /** Path of the active custom file, or null when using bundled defaults. */
  customPath: string | null;
}

/**
 * Quick links come from $CONFIG_DIR/links.json when present (editable
 * without a rebuild), otherwise the bundled defaults.
 */
export async function getLinks(): Promise<LinksResult> {
  const fallback: Links = {
    groups: [
      { name: "School", links: [{ label: LMS_LABEL, description: "Courses", url: LMS_URL, icon: "graduation-cap" }] },
      {
        name: "Tools",
        links: [
          { label: "Google Drive", url: "https://drive.google.com", icon: "hard-drive" },
          { label: "GitHub", url: "https://github.com", icon: "github" },
        ],
      },
    ],
    courseLinks: {},
  };
  const r = await readConfig("links.json", LinksSchema, fallback);
  return { ...r.value, error: r.error && `${r.error} Showing defaults.`, customPath: r.path };
}
