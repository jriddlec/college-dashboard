import { search } from "@/lib/search";

/** Search classes, assignments, announcements and library files (titles and contents): /api/search?q=ratio+test */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  return Response.json({ q, hits: await search(q) });
}
