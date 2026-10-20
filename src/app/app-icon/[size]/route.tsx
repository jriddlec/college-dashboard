import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { ACCENT_COLOR, APP_NAME } from "@/lib/settings";

const SIZES = new Set([180, 192, 512]);

/**
 * Home-screen icon: the app's initial on the accent color. Rendered at
 * request time so ACCENT_COLOR / APP_NAME from .env apply without a rebuild.
 * /app-icon/512?maskable=1 leaves the safe-zone padding Android expects.
 */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  await connection();
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(req.url).searchParams.has("maskable");
  const bg = ACCENT_COLOR ?? "#2563eb";
  const letter = APP_NAME.trim().slice(0, 1).toUpperCase() || "C";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: "white",
          fontSize: size * (maskable ? 0.42 : 0.56),
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
