import { libraryDir, safeResolve } from "@/lib/library";
import { serveFile } from "@/lib/library/serve";

/** A library file, as-is. Inline by default (PDFs and HTML open in the browser); ?download=1 saves it. */
async function handle(req: Request, ctx: RouteContext<"/library/f/[...path]">) {
  const { path: segments } = await ctx.params;
  const target = safeResolve(libraryDir(), segments);
  if (!target) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return serveFile(req, target.abs, { filename: target.rel.split("/").at(-1)!, download });
}

export const GET = handle;
export const HEAD = handle;
