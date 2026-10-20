/** Cookie holding overdue assignment ids the user hid from the Today page. */
export const HIDDEN_OVERDUE_COOKIE = "hidden-overdue";
/** Cookie holding assignment ids the user marked done by hand. */
export const MARKED_DONE_COOKIE = "marked-done";
/** Largest encoded cookie value kept (browsers cap a cookie at ~4 KB); the oldest ids are dropped first. */
const MAX_COOKIE_BYTES = 3800;

/** Encodes ids (newest last) for a cookie, dropping the oldest ones that don't fit. */
export function encodeIdCookie(ids: string[]): string {
  let keep = ids;
  let value = encodeURIComponent(JSON.stringify(keep));
  while (value.length > MAX_COOKIE_BYTES && keep.length) {
    keep = keep.slice(1);
    value = encodeURIComponent(JSON.stringify(keep));
  }
  return value;
}

/** Parses one of the id-list cookies; anything malformed reads as empty. */
export function parseIdCookie(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const ids: unknown = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
