import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { extOf } from "./catalog";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  java: "text/plain; charset=utf-8",
  xml: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
};

export function contentType(name: string): string {
  return TYPES[extOf(name)] ?? "application/octet-stream";
}

function disposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Stream a file inline (or as an attachment), with Range support so video
 * and audio seek, and validators so repeat visits are cheap.
 */
export async function serveFile(req: Request, abs: string, opts: { filename: string; download?: boolean; type?: string }): Promise<Response> {
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!st.isFile()) return new Response("Not found", { status: 404 });

  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    "Content-Type": opts.type ?? contentType(opts.filename),
    "Content-Disposition": disposition(opts.download ? "attachment" : "inline", opts.filename),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300, must-revalidate",
    "Last-Modified": st.mtime.toUTCString(),
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    } else {
      start = Math.max(0, st.size - Number(m[2]));
      end = st.size - 1;
    }
    if (start > end || start >= st.size) {
      headers.set("Content-Range", `bytes */${st.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${st.size}`);
    headers.set("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") return new Response(null, { status: 206, headers });
    return new Response(Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(st.size));
  if (req.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { status: 200, headers });
}
