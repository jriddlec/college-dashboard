import { getLibrary } from "@/lib/library";

/**
 * The library's classes and the top-level folders each one owns, for
 * scripts/init_library.py (which creates folders for classes that have none).
 * Read-only; no file contents.
 */
export async function GET() {
  const lib = await getLibrary();
  if (!lib.ok) return Response.json({ ok: false, error: lib.error }, { status: 503 });
  return Response.json({
    ok: true,
    courses: lib.courses.map(({ course, roots, stats }) => ({
      slug: course.slug,
      id: course.id,
      code: course.code,
      name: course.name,
      roots,
      items: stats.items,
    })),
  });
}
