/**
 * Keeps every announcement the app has seen in $STATE_DIR/announcements.json,
 * so posts the LMS later expires or deletes still show on class pages.
 *
 * Optional: without STATE_DIR (or when it isn't writable) only the LMS's
 * current announcements show.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stateDir } from "@/lib/state";
import { AnnouncementSchema, type Announcement } from "./types";

const MAX_ITEMS = 5000;

let cache: { mtimeMs: number; items: Announcement[] } | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function readArchive(file: string): Promise<Announcement[]> {
  const st = await fs.stat(file).catch(() => null);
  if (!st) return [];
  if (cache && cache.mtimeMs === st.mtimeMs) return cache.items;
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    const items = (Array.isArray(raw) ? raw : []).flatMap((x) => {
      const r = AnnouncementSchema.safeParse(x);
      return r.success ? [r.data] : [];
    });
    cache = { mtimeMs: st.mtimeMs, items };
    return items;
  } catch {
    return [];
  }
}

const byNewest = (a: Announcement, b: Announcement) => Date.parse(b.postedAt) - Date.parse(a.postedAt);

/** Current announcements plus archived ones no longer in the LMS (marked `archived`). Saves new ones. */
export async function withArchivedAnnouncements(current: Announcement[]): Promise<Announcement[]> {
  const dir = stateDir();
  if (!dir) return current;
  const file = path.join(dir, "announcements.json");
  const archive = await readArchive(file);
  const live = new Set(current.map((n) => n.id));
  const gone = archive.filter((n) => !live.has(n.id)).map((n) => ({ ...n, archived: true }));

  // Save when something is new or changed (edited title/body).
  const saved = new Map(archive.map((n) => [n.id, n]));
  const changed = current.some((n) => {
    const s = saved.get(n.id);
    return !s || s.title !== n.title || s.body !== n.body || s.postedAt !== n.postedAt;
  });
  if (changed) {
    const next = [...current, ...archive.filter((n) => !live.has(n.id))].sort(byNewest).slice(0, MAX_ITEMS);
    const write = async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next), "utf8");
      await fs.rename(tmp, file);
      cache = null;
    };
    const p = queue.then(write, write);
    queue = p.catch(() => undefined);
    await p.catch(() => undefined); // read-only state dir: just show the LMS's list
  }
  return [...current, ...gone].sort(byNewest);
}
