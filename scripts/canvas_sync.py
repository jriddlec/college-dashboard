#!/usr/bin/env python3
"""
canvas_sync.py — pull Canvas data into College Dashboard.

Read-only: every request is a GET to the Canvas REST API on LMS_URL, with a
personal access token (Canvas → Account → Settings → New Access Token). It
never submits, posts, edits or deletes anything. The token is only sent to
LMS_URL's host and is never printed or written to the snapshot.

Settings (environment):
  LMS_URL             e.g. https://school.instructure.com
  CANVAS_TOKEN        the access token, or
  CANVAS_TOKEN_FILE   a file holding it

Snapshot layout under <dest>/canvas/:
  current -> snapshots/<UTC stamp>/      (atomic symlink swap, last 5 kept)
    manifest.json                        {fetchedAt, failures}
    courses.json announcements.json calendar.json
    courses/<id>/assignments.json assignment-groups.json
  last-attempt.json                      {at, ok, error} for the /status page

Exit codes: 0 ok (individual step failures are recorded in manifest.json),
2 token rejected / course listing failed (existing data kept), 1 other error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

KEEP = 5
TIMEOUT = 60
PER_PAGE = 100
MAX_PAGES = 50
CONTEXTS_PER_REQUEST = 10
NEWS_DAYS = 120
CALENDAR_BACK_DAYS = 14
CALENDAR_AHEAD_DAYS = 150

TOKEN_HELP = (
    "Canvas rejected the access token (401): it may have expired or been revoked. "
    "Make a new one in Canvas → Account → Settings → New Access Token, put it in .env (CANVAS_TOKEN), "
    "and restart the sync: docker compose up -d canvas-sync"
)


def log(msg: str) -> None:
    print(f"{dt.datetime.now().isoformat(timespec='seconds')} canvas-sync: {msg}", file=sys.stderr, flush=True)


class CanvasError(Exception):
    def __init__(self, status: int | None, message: str):
        super().__init__(message)
        self.status = status


class Canvas:
    """GET-only Canvas API client with Link-header pagination."""

    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.host = urllib.parse.urlsplit(self.base).netloc
        self.token = token

    def _get(self, url: str) -> tuple[object, str | None]:
        # Never send the token anywhere but the configured Canvas host.
        if urllib.parse.urlsplit(url).netloc != self.host:
            raise CanvasError(None, f"refusing to follow a link off {self.host}")
        req = urllib.request.Request(url, method="GET", headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                    return json.loads(r.read().decode("utf-8")), next_link(r.headers.get("Link"))
            except urllib.error.HTTPError as e:
                body = e.read(500).decode("utf-8", "replace")
                # Canvas throttles with 403 "Rate Limit Exceeded"; back off and retry.
                if e.code == 403 and "rate limit" in body.lower() and attempt < 2:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise CanvasError(e.code, f"HTTP {e.code}") from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                if attempt < 2:
                    time.sleep(2)
                    continue
                raise CanvasError(None, type(e).__name__ + (f": {e.reason}" if isinstance(e, urllib.error.URLError) else "")) from None
        raise CanvasError(None, "retries exhausted")

    def get(self, path: str, params: list[tuple[str, str]] | None = None) -> list | dict:
        """One object, or every page of a list."""
        query = urllib.parse.urlencode([*(params or []), ("per_page", str(PER_PAGE))])
        data, nxt = self._get(f"{self.base}/api/v1/{path}?{query}")
        if not isinstance(data, list):
            return data
        out = list(data)
        pages = 1
        while nxt and pages < MAX_PAGES:
            data, nxt = self._get(nxt)
            out.extend(data if isinstance(data, list) else [])
            pages += 1
        return out


def next_link(header: str | None) -> str | None:
    for part in (header or "").split(","):
        m = re.match(r'\s*<([^>]+)>\s*;\s*rel="next"', part)
        if m:
            return m.group(1)
    return None


def write(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chunks(items: list[str], n: int) -> list[list[str]]:
    return [items[i : i + n] for i in range(0, len(items), n)]


def collect(api: Canvas, root: Path) -> tuple[bool, str | None]:
    """Fetch everything into root. Returns (ok, error for last-attempt)."""
    failures: list[str] = []
    now = dt.datetime.now(dt.timezone.utc)

    try:
        courses = api.get("courses", [
            ("enrollment_state", "active"),
            ("include[]", "term"),
            ("include[]", "total_scores"),
            ("include[]", "teachers"),
        ])
    except CanvasError as e:
        if e.status == 401:
            log("token rejected (401)")
            return False, TOKEN_HELP
        log(f"course listing failed ({e})")
        return False, f"Canvas course listing failed ({e}). Check that LMS_URL is your school's Canvas address (it works in a browser) and that Canvas isn't down."
    courses = [c for c in courses if isinstance(c, dict) and c.get("id") is not None and not c.get("access_restricted_by_date")]
    write(root / "courses.json", courses)
    ids = [str(c["id"]) for c in courses]

    def step(label: str, fn) -> None:
        try:
            fn()
        except CanvasError as e:
            # 403/404: closed or hidden for students; not a sync problem.
            if e.status in (403, 404):
                return
            log(f"step failed: {label} ({e})")
            failures.append(label)

    for cid in ids:
        base = root / "courses" / cid
        step(f"assignments {cid}", lambda: write(base / "assignments.json", api.get(f"courses/{cid}/assignments", [("include[]", "submission"), ("order_by", "due_at")])))
        step(f"assignment groups {cid}", lambda: write(base / "assignment-groups.json", api.get(f"courses/{cid}/assignment_groups")))

    news: list = []
    events: list = []
    for group in chunks(ids, CONTEXTS_PER_REQUEST):
        ctx = [("context_codes[]", f"course_{c}") for c in group]
        step("announcements", lambda: news.extend(api.get("announcements", [*ctx, ("start_date", iso(now - dt.timedelta(days=NEWS_DAYS))), ("end_date", iso(now))])))
        step("calendar", lambda: events.extend(api.get("calendar_events", [
            *ctx,
            ("type", "event"),
            ("start_date", iso(now - dt.timedelta(days=CALENDAR_BACK_DAYS))),
            ("end_date", iso(now + dt.timedelta(days=CALENDAR_AHEAD_DAYS))),
        ])))
    write(root / "announcements.json", news)
    write(root / "calendar.json", events)
    write(root / "manifest.json", {"fetchedAt": iso(now), "failures": failures})
    return True, None


def deliver(dest: Path, stamp: str, snap: Path | None, attempt: dict) -> None:
    root = dest / "canvas"
    (root / "snapshots").mkdir(parents=True, exist_ok=True)
    if snap is not None:
        tmp = root / "snapshots" / f".tmp-{stamp}"
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(snap, tmp)
        final = root / "snapshots" / stamp
        if final.exists():  # two runs in the same second
            shutil.rmtree(final)
        os.replace(tmp, final)
        link = root / "current.new"
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(Path("snapshots") / stamp, target_is_directory=True)
        os.replace(link, root / "current")
        for old in sorted(p for p in (root / "snapshots").iterdir() if p.name.startswith("2"))[:-KEEP]:
            shutil.rmtree(old)
    tmp_attempt = root / "last-attempt.json.new"
    tmp_attempt.write_text(json.dumps(attempt) + "\n", encoding="utf-8")
    os.replace(tmp_attempt, root / "last-attempt.json")


def token() -> str | None:
    t = os.environ.get("CANVAS_TOKEN", "").strip()
    f = os.environ.get("CANVAS_TOKEN_FILE", "").strip()
    if not t and f:
        try:
            t = Path(f).read_text(encoding="utf-8").strip()
        except OSError:
            return None
    return t or None


def run_once(dest: Path) -> int:
    base = os.environ.get("LMS_URL", "").strip()
    tok = token()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    at = iso(dt.datetime.now(dt.timezone.utc))
    # https only, except a local test server.
    secure = base.startswith("https://") or re.match(r"http://(localhost|127\.0\.0\.1)(:\d+)?(/|$)", base)
    if not secure or not tok:
        msg = "Set LMS_URL (https://...) and CANVAS_TOKEN in .env, then restart the sync: docker compose up -d canvas-sync"
        log(msg)
        deliver(dest, stamp, None, {"at": at, "ok": False, "error": msg})
        return 1
    with tempfile.TemporaryDirectory(prefix="canvas-sync-") as tmp:
        snap = Path(tmp) / "snap"
        snap.mkdir()
        ok, error = collect(Canvas(base, tok), snap)
        deliver(dest, stamp, snap if ok else None, {"at": at, "ok": ok, "error": error})
    if not ok:
        return 2
    log(f"delivered snapshot {stamp}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", type=Path, default=Path("/data"), help="data dir (default /data)")
    ap.add_argument("--every", type=int, default=0, metavar="SECONDS", help="keep running, syncing every SECONDS")
    args = ap.parse_args()
    if not os.access(args.dest, os.W_OK):
        # Docker creates a missing bind-mounted folder as root.
        log(f"{args.dest} (DATA_DIR) is not writable by uid {os.getuid()}:{os.getgid()}. Create it before starting, "
            "as the user in PUID/PGID (e.g. mkdir -p data), or fix its owner: sudo chown -R "
            f"{os.getuid()}:{os.getgid()} <path>.")
        return 1
    while True:
        try:
            code = run_once(args.dest)
        except Exception as e:  # noqa: BLE001 — report and keep the loop alive
            log(f"sync failed: {type(e).__name__}: {e}")
            code = 1
        if not args.every:
            return code
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())
