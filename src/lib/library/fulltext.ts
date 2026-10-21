/**
 * Plain text of library documents, for search. Study guides built from a
 * template keep their content in a script (a data object rendered in the
 * browser), so string literals inside scripts count as text too.
 */

export const TEXT_EXT = new Set(["html", "htm", "md", "txt"]);
const MAX_CHARS = 300_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable strings inside a script: quoted literals of a few words or more, unescaped. */
function scriptStrings(js: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.){12,})"|'((?:[^'\\\n]|\\.){12,})'|`((?:[^`\\]|\\.){12,})`/g;
  for (const m of js.matchAll(re)) {
    const s = (m[1] ?? m[2] ?? m[3]).replace(/\\n/g, " ").replace(/\\(.)/g, "$1");
    // Skip code-looking strings (selectors, URLs, CSS) by requiring a space and a letter run.
    if (/\s/.test(s) && /[a-z]{3}/i.test(s) && !/^https?:\/\//.test(s)) out.push(s);
  }
  return out;
}

/** Searchable text of a document's contents. */
export function extractText(raw: string, ext: string): string {
  let text: string;
  if (ext === "html" || ext === "htm") {
    const scripts: string[] = [];
    const body = raw
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, js: string) => {
        scripts.push(...scriptStrings(js));
        return " ";
      })
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ");
    text = decodeEntities(body) + " " + scripts.join(" ");
  } else {
    text = raw;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
}

/** Every term appears (case-insensitive). */
export function matchesAll(haystack: string, terms: string[]): boolean {
  const h = haystack.toLowerCase();
  return terms.every((t) => h.includes(t));
}

/** ~160 characters around the first term found, with ellipses where cut. */
export function snippet(text: string, terms: string[], width = 160): string | null {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return null;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
