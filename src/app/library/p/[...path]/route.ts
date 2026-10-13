import { libraryDir, previewsDir, safeResolve } from "@/lib/library";
import { encodePath } from "@/lib/library/catalog";
import { serveFile } from "@/lib/library/serve";

/** The converted PDF of an Office file (written by the converter). Falls back to the viewer page. */
async function handle(req: Request, ctx: RouteContext<"/library/p/[...path]">) {
  const { path: segments } = await ctx.params;
  const original = safeResolve(libraryDir(), segments);
  if (!original) return new Response("Not found", { status: 404 });
  const name = original.rel.split("/").at(-1)!;
  const preview = safeResolve(previewsDir(), [...segments.slice(0, -1), `${name}.pdf`]);
  const res = preview ? await serveFile(req, preview.abs, { filename: `${name.replace(/\.[^.]+$/, "")}.pdf`, type: "application/pdf" }) : null;
  if (res && res.status !== 404) return res;
  // Relative Location: behind Caddy, req.url carries the internal scheme.
  return new Response(null, { status: 302, headers: { Location: `/library/view/${encodePath(original.rel)}` } });
}

export const GET = handle;
export const HEAD = handle;
