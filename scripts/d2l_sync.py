#!/usr/bin/env python3
"""
d2l_sync.py — pull Brightspace data via d2l-cli into College Dashboard.

Runs wherever d2l-cli is logged in (`d2l login`). Read-only against
Brightspace. Credentials and tokens stay in d2l-cli's own store (~/.d2l);
nothing secret is written to the snapshot.

Modes:
  --push HOST   build the snapshot locally, ship it over SSH to HOST
                (e.g. `myserver`) and swap it in atomically there.
  --dest DIR    write directly into a local data dir (the d2l-sync container).

Snapshot layout under <data>/d2l/:
  current -> snapshots/<UTC stamp>/      (atomic symlink swap)
  last-attempt.json                      {at, ok, error} for the /status page

Exit codes: 0 ok (individual step failures are recorded in manifest.json),
2 login expired / course listing failed (existing data kept), 1 other error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from notify import notify
except ImportError:  # notify.py not shipped alongside: alerts off
    def notify(*_a, **_k):
        return False

REMOTE_DATA = "/srv/appdata/college-dashboard/data"
STEP_TIMEOUT = 180
KEEP = 5
REFRESH_WAIT = 45


def log(msg: str) -> None:
    print(f"{dt.datetime.now().isoformat(timespec='seconds')} d2l-sync: {msg}", file=sys.stderr, flush=True)


class Runner:
    def __init__(self, d2l: str):
        self.d2l = d2l
        self.failures: list[str] = []
        # d2l-cli is Python; force UTF-8 so course names survive on Windows.
        self.env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}

    def json(self, label: str, out: Path, *args: str) -> object | None:
        try:
            p = subprocess.run([self.d2l, "--json", *args], capture_output=True, timeout=STEP_TIMEOUT, env=self.env)
            data = json.loads(p.stdout) if p.returncode == 0 else None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as e:
            p, data = None, None
            err = type(e).__name__
        else:
            err = p.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] if p.returncode else ["invalid JSON"]
            err = err[0] if err else f"exit {p.returncode}"
        if data is None:
            log(f"step failed: {label} ({str(err)[:200]})")
            self.failures.append(label)
            return None
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(p.stdout)
        return data


def course_ids(courses: object) -> list[str]:
    items = courses if isinstance(courses, list) else next((v for v in (courses or {}).values() if isinstance(v, list)), [])
    ids = []
    for c in items:
        ou, access = c.get("OrgUnit", {}), c.get("Access", {})
        if (ou.get("Type") or {}).get("Code", "Course Offering") != "Course Offering":
            continue
        if access.get("IsActive") is False or access.get("CanAccess") is False:
            continue
        cid = str(ou.get("Id", c.get("Id", "")))
        if re.fullmatch(r"[0-9A-Za-z_-]+", cid):
            ids.append(cid)
    return ids


def collect(runner: Runner, root: Path, days: int) -> bool:
    # Refreshes an expired saved session when d2l-cli can; harmless otherwise.
    subprocess.run([runner.d2l, "token"], capture_output=True, timeout=STEP_TIMEOUT, env=runner.env)

    courses = runner.json("courses", root / "courses.json", "courses")
    if courses is None:
        # d2l-cli refreshes "in the background"; give it one chance to finish.
        log(f"course listing failed; waiting {REFRESH_WAIT}s for a background token refresh and retrying once")
        time.sleep(REFRESH_WAIT)
        subprocess.run([runner.d2l, "token"], capture_output=True, timeout=STEP_TIMEOUT, env=runner.env)
        runner.failures.clear()
        courses = runner.json("courses", root / "courses.json", "courses")
    if courses is None:
        return False
    runner.json("due", root / "due.json", "due", "--days", str(days))
    runner.json("overdue", root / "overdue.json", "overdue")
    runner.json("calendar", root / "calendar.json", "calendar", "--days", str(days))
    runner.json("news", root / "news.json", "news")
    runner.json("final grades", root / "final-grades.json", "grades", "--final")
    ids = course_ids(courses)
    client = submissions_client()
    if client is None:
        runner.failures.append("submissions")
    for cid in ids:
        folders = runner.json(f"assignments {cid}", root / "courses" / cid / "assignments.json", "assignments", cid)
        runner.json(f"grades {cid}", root / "courses" / cid / "grades.json", "grades", cid)
        # Quizzes not linked to a tracked content topic never show up in `due`.
        runner.json(f"quizzes {cid}", root / "courses" / cid / "quizzes.json", "quizzes", cid)
        # The global news feed can come back empty while per-course news has items.
        runner.json(f"news {cid}", root / "courses" / cid / "news.json", "news", cid)
        if client is not None and isinstance(folders, list):
            collect_submissions(runner, client, root / "courses" / cid / "submissions.json", cid, folders)
        if client is not None:
            collect_gradebook(runner, client, root / "courses" / cid, cid)
            # The course's Content tree: what /status offers to fetch into the library.
            try:
                (root / "courses" / cid / "content-toc.json").write_text(json.dumps(client.content_toc(cid)), encoding="utf-8")
            except Exception as e:  # noqa: BLE001
                if type(e).__name__ not in ("ForbiddenError", "NotFoundError"):
                    runner.failures.append(f"content {cid}")
                    log(f"content {cid} failed: {type(e).__name__}: {str(e)[:200]}")
    (root / "manifest.json").write_text(
        json.dumps({"fetchedAt": now_iso(), "courses": len(ids), "failures": runner.failures}, indent=2), encoding="utf-8"
    )
    log(f"collected {len(ids)} courses, {len(runner.failures)} failed step(s)")
    return True


def submissions_client():
    """d2l-cli has no command for your own dropbox submissions, so use its
    client in-process. Needs d2l-cli importable from this interpreter; it's an
    internal API, so any failure just disables submission status."""
    try:
        from d2l.cli import _make_client_factory

        client = _make_client_factory()()
        client.my_submissions  # noqa: B018 — fail here if the API moved
        return client
    except Exception as e:  # noqa: BLE001
        log(f"submission status unavailable: {type(e).__name__}: {str(e)[:200]}")
        return None


def collect_submissions(runner: Runner, client, out: Path, cid: str, folders: list) -> None:
    """Writes {folderId: mysubmissions[]}. 403/404 (closed, not yet open, or
    special-access folders) just means no data for that folder."""
    result, errors = {}, 0
    for f in folders:
        fid = f.get("Id") if isinstance(f, dict) else None
        if fid is None or f.get("IsHidden"):
            continue
        try:
            result[str(fid)] = client.my_submissions(cid, fid)
        except Exception as e:  # noqa: BLE001
            if type(e).__name__ not in ("ForbiddenError", "NotFoundError"):
                errors += 1
                log(f"submissions {cid}/{fid} failed: {type(e).__name__}: {str(e)[:200]}")
    if errors:
        runner.failures.append(f"submissions {cid}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result), encoding="utf-8")


def collect_gradebook(runner: Runner, client, out: Path, cid: str) -> None:
    """Grade item definitions, categories and setup: what the dashboard needs
    to estimate a course grade before one is released. 403/404 just means the
    course doesn't expose its gradebook to students."""
    out.mkdir(parents=True, exist_ok=True)
    for name, fetch in (
        ("grade-objects", lambda: client.grade_objects(cid)),
        ("grade-categories", lambda: client.lms_get(client.le(f"/{cid}/grades/categories/"))),
        ("grade-setup", lambda: client.lms_get(client.le(f"/{cid}/grades/setup/"))),
    ):
        try:
            (out / f"{name}.json").write_text(json.dumps(fetch()), encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            if type(e).__name__ not in ("ForbiddenError", "NotFoundError"):
                runner.failures.append(f"{name} {cid}")
                log(f"{name} {cid} failed: {type(e).__name__}: {str(e)[:200]}")


# --- content fetch ----------------------------------------------------------
#
# /status queues requests as $STATE_DIR/content-requests/<id>.json
# ({id, courseId, moduleId|null, requestedAt}); the sync loop runs them with
# --content and records progress in $STATE_DIR/content-jobs.json. Files land in
# "<CODE> Course Content/<module>/<submodule>/YYYY-MM-DD <Title>.<ext>" so the
# library shows them as a dated folder tree. A hidden index in that folder
# (topic id → file) makes re-fetches update changed files instead of copying them.

CONTENT_FOLDER = "Course Content"
CONTENT_INDEX = ".d2l-content.json"
JOBS_KEEP = 20
CODE_EXTS = {".java", ".py", ".c", ".cpp", ".h", ".js", ".ts", ".txt", ".csv", ".json", ".xml", ".sql", ".r", ".m", ".zip", ".jar"}
DATE_RE = re.compile(r"(20\d\d)-(\d\d)-(\d\d)")


def safe_name(s: str, limit: int = 120) -> str:
    s = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", " - ", s)
    s = re.sub(r"\s+", " ", re.sub(r"(\s-\s)+", " - ", s)).strip(" .-")
    return s[:limit].rstrip(" .-") or "Untitled"


def course_code(course: dict) -> str | None:
    ou = course.get("OrgUnit", {})
    m = re.search(r"[A-Z]{3,4}\s?\d{4}[A-Z]?", ou.get("Code") or ou.get("Name") or "")
    return m.group(0).replace(" ", "") if m else None


def content_root(library: Path, code: str) -> Path:
    """The class's content folder, using the prefix its folders already use ("CSCI1301" or "CSCI 1301")."""
    spaced = re.sub(r"^([A-Z]+)(\d)", r"\1 \2", code)
    for prefix in (code, spaced):
        if any(p.is_dir() and (p.name == prefix or p.name.startswith(prefix + " ")) for p in library.iterdir()):
            return library / f"{prefix} {CONTENT_FOLDER}"
    return library / f"{code} {CONTENT_FOLDER}"


def html_title(data: bytes) -> str | None:
    m = re.search(rb"<title[^>]*>(.*?)</title>", data[:20000], re.S | re.I)
    if not m:
        return None
    import html

    t = html.unescape(m.group(1).decode("utf-8", "replace")).strip()
    return re.sub(r"\s+", " ", t) or None


def tidy_title(title: str, code: str) -> str:
    """'CSCI 1301: 2026-10-13-TUE (Cotterell) Part 8: Enforcing Preconditions' → 'Part 8 - Enforcing Preconditions';
    'cs1301-2026-10-13-TUE-part1' → 'part1'. Course codes, dates and weekdays are dropped: the date leads the name."""
    letters, digits = re.match(r"([A-Z]+)(\d+)", code).groups()
    t = re.sub(rf"^\s*(?:{letters}\s?{digits}|{letters.lower()}\s?{digits})\s*[:\-–]?\s*", "", title, flags=re.I)
    t = re.sub(r"^\s*20\d\d-\d\d-\d\d(?:-(?:MON|TUE|WED|THU|FRI|SAT|SUN))?\s*(?:\([^)]*\))?\s*[:\-–]?\s*", "", t, flags=re.I)
    # Site-name suffixes: "… - CSCI 1302", "… | CSCI 1301".
    t = re.sub(r"\s*[-–|]\s*[A-Z]{2,4}\s?\d{4}[A-Z]?\s*$", "", t).strip()
    return safe_name(t) if t else "Notes"


def topic_date(topic: dict, folders: list[str]) -> str:
    for s in (topic.get("Title") or "", topic.get("Url") or "", *reversed(folders)):
        m = DATE_RE.search(s)
        if m:
            return m.group(0)
    return (topic.get("LastModifiedDate") or now_iso())[:10]


def walk_toc(modules: list, path: list[str]):
    """(folder titles, topic) for every downloadable file topic, depth first."""
    for m in modules or []:
        if m.get("IsHidden"):
            continue
        here = [*path, safe_name(m.get("Title") or "Module", 80)]
        for t in m.get("Topics") or []:
            if t.get("TypeIdentifier") == "File" and not t.get("IsHidden") and not t.get("IsBroken"):
                yield here, t
        yield from walk_toc(m.get("Modules") or [], here)


def find_module(modules: list, module_id: str, path: list[str]):
    for m in modules or []:
        here = [*path, safe_name(m.get("Title") or "Module", 80)]
        if str(m.get("ModuleId")) == module_id:
            return m, path
        found = find_module(m.get("Modules") or [], module_id, here)
        if found:
            return found
    return None


def fetch_content(client, library: Path, cid: str, code: str, module_id: str | None, progress) -> dict:
    toc = client.content_toc(cid)
    modules = toc.get("Modules") or []
    if module_id:
        found = find_module(modules, module_id, [])
        if not found:
            raise RuntimeError("That unit is no longer in the course content.")
        mod, parents = found
        topics = list(walk_toc([mod], parents))
    else:
        topics = list(walk_toc(modules, []))
    root = content_root(library, code)
    root.mkdir(parents=True, exist_ok=True)
    index_file = root / CONTENT_INDEX
    index = _load(index_file) or {}
    counts = {"total": len(topics), "added": 0, "updated": 0, "skipped": 0, "failed": 0}
    for n, (folders, t) in enumerate(topics, 1):
        tid = str(t.get("TopicId"))
        modified = t.get("LastModifiedDate")
        prev = index.get(tid)
        if prev and prev.get("modified") == modified and (root / prev["path"]).exists():
            counts["skipped"] += 1
            continue
        try:
            data = client.content_topic_file(cid, tid).content
        except Exception as e:  # noqa: BLE001
            counts["failed"] += 1
            log(f"content {cid}/{tid} failed: {type(e).__name__}: {str(e)[:200]}")
            continue
        url_name = (t.get("Url") or "").rsplit("/", 1)[-1]
        ext = Path(url_name).suffix.lower() or ".bin"
        if ext in CODE_EXTS:
            # Code and data keep the names the course gives them.
            name = safe_name(re.sub(r" - Copy( \(\d+\))?(?=\.)", "", url_name), 160)
        else:
            date = topic_date(t, folders)
            title = (html_title(data) if ext in (".html", ".htm") else None) or t.get("Title") or url_name
            name = f"{date} {tidy_title(title, code)}{ext}"
        rel = Path(*folders, name)
        dest = root / rel
        # Two topics with the same name in one folder: keep both.
        owner = next((k for k, v in index.items() if v.get("path") == rel.as_posix()), None)
        if owner not in (None, tid):
            rel = rel.with_name(f"{rel.stem} ({tid}){rel.suffix}")
            dest = root / rel
        if prev and prev.get("path") != rel.as_posix():
            old = root / prev["path"]
            if old.exists():
                old.unlink()
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f".{dest.name}.part")
        tmp.write_bytes(data)
        os.replace(tmp, dest)
        counts["updated" if prev else "added"] += 1
        index[tid] = {"path": rel.as_posix(), "modified": modified, "title": t.get("Title")}
        if n % 5 == 0:
            progress(counts)
    tmp = index_file.with_name(CONTENT_INDEX + ".new")
    tmp.write_text(json.dumps(index, indent=1), encoding="utf-8")
    os.replace(tmp, index_file)
    counts["folder"] = root.name
    return counts


def run_content_requests(state: Path, library: Path, data: Path) -> int:
    """Runs every queued /status content request, oldest first."""
    req_dir = state / "content-requests"
    reqs = sorted(req_dir.glob("*.json")) if req_dir.is_dir() else []
    if not reqs:
        return 0
    jobs_file = state / "content-jobs.json"

    def save(job: dict) -> None:
        jobs = [j for j in (_load(jobs_file) or []) if isinstance(j, dict) and j.get("id") != job["id"]]
        jobs = [job, *jobs][:JOBS_KEEP]
        tmp = jobs_file.with_name("content-jobs.json.new")
        tmp.write_text(json.dumps(jobs, indent=1), encoding="utf-8")
        os.replace(tmp, jobs_file)

    client = submissions_client()
    courses = _load(data / "d2l" / "current" / "courses.json")
    items = courses if isinstance(courses, list) else next((v for v in (courses or {}).values() if isinstance(v, list)), [])
    codes = {str(c.get("OrgUnit", {}).get("Id")): course_code(c) for c in items}
    for f in reqs:
        req = _load(f)
        f.unlink(missing_ok=True)
        if not isinstance(req, dict) or not re.fullmatch(r"[0-9A-Za-z_-]{1,64}", str(req.get("id", ""))):
            continue
        cid = str(req.get("courseId", ""))
        mid = req.get("moduleId")
        mid = str(mid) if mid not in (None, "") else None
        job = {**req, "state": "running", "startedAt": now_iso()}
        save(job)
        try:
            if client is None:
                raise RuntimeError("Can't reach Brightspace (sign in again on Data status).")
            code = codes.get(cid)
            if not code or not re.fullmatch(r"\d+", cid) or (mid and not re.fullmatch(r"\d+", mid)):
                raise RuntimeError("Unknown course.")
            log(f"content fetch {cid} {mid or 'whole course'}")
            result = fetch_content(client, library, cid, code, mid, lambda c: save({**job, **c}))
            job = {**job, **result, "state": "done", "finishedAt": now_iso()}
            log(f"content fetch {cid}: {result}")
        except Exception as e:  # noqa: BLE001
            job = {**job, "state": "failed", "error": str(e)[:300], "finishedAt": now_iso()}
            log(f"content fetch {cid} failed: {type(e).__name__}: {str(e)[:200]}")
        save(job)
    return 0


# --- alerts ---------------------------------------------------------------

FAIL_ALERT_AFTER = 2  # consecutive failed syncs before alerting (one blip isn't news)


def _load(p: Path) -> object:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _course_names(snap: Path) -> dict[str, str]:
    names = {}
    data = _load(snap / "courses.json")
    items = data if isinstance(data, list) else next((v for v in (data or {}).values() if isinstance(v, list)), [])
    for c in items:
        ou = c.get("OrgUnit", {})
        code = re.search(r"[A-Z]{3,4}\s?\d{4}[A-Z]?", ou.get("Code") or ou.get("Name") or "")
        names[str(ou.get("Id"))] = code.group(0) if code else (ou.get("Name") or "")[:40]
    return names


def _grades(snap: Path) -> dict[tuple[str, str], tuple[str, str]]:
    """(course, grade object) → (name, score text) for released item scores (not categories)."""
    out = {}
    for f in (snap / "courses").glob("*/grades.json"):
        for g in _load(f) or []:
            if not isinstance(g, dict) or g.get("GradeObjectTypeName") in ("Category", "Calculated", "Final Calculated", "Final Adjusted"):
                continue
            num, den = g.get("PointsNumerator"), g.get("PointsDenominator")
            score = g.get("DisplayedGrade") or (f"{num:g}/{den:g}" if isinstance(num, (int, float)) and den else None)
            if score is not None:
                out[(f.parent.name, str(g.get("GradeObjectIdentifier")))] = (g.get("GradeObjectName") or "Grade", str(score).strip())
    return out


def _news(snap: Path) -> dict[tuple[str, str], str]:
    out = {}
    for f in (snap / "courses").glob("*/news.json"):
        for n in _load(f) or []:
            if isinstance(n, dict) and not n.get("IsHidden") and n.get("IsPublished", True):
                out[(f.parent.name, str(n.get("Id")))] = n.get("Title") or "Announcement"
    return out


def alert_changes(prev: Path, new: Path) -> None:
    """New or changed grades and new announcements since the previous snapshot."""
    if not (prev / "manifest.json").exists():
        return  # first sync: everything is "new"
    names = _course_names(new)
    old_g, new_g = _grades(prev), _grades(new)
    changed = [(k, v) for k, v in new_g.items() if old_g.get(k) != v]
    if changed:
        lines = [f"{names.get(c, c)} · {name}: {score}" for (c, _), (name, score) in changed[:8]]
        more = f"\n…and {len(changed) - 8} more" if len(changed) > 8 else ""
        notify(f"{len(changed)} new grade{'s' if len(changed) > 1 else ''}", "\n".join(lines) + more, "/", "mortar_board")
    old_n = _news(prev)
    fresh = [(k, t) for k, t in _news(new).items() if k not in old_n]
    for (c, _), title in fresh[:5]:
        notify(f"{names.get(c, c)} announcement", title, f"/courses/{c}", "loudspeaker")


def track_failures(root: Path, ok: bool) -> None:
    """Alerts once after FAIL_ALERT_AFTER failed syncs in a row, and once on recovery."""
    state_file = root / "alert-state.json"
    state = _load(state_file) or {}
    fails = 0 if ok else int(state.get("fails", 0)) + 1
    if fails == FAIL_ALERT_AFTER:
        notify("School sync is failing", "The last syncs couldn't reach the LMS; the dashboard is showing older data. Sign in again if the session expired.", "/status", "warning", "high")
    elif ok and int(state.get("fails", 0)) >= FAIL_ALERT_AFTER:
        notify("School sync is back", "Syncing works again.", "/status", "white_check_mark")
    try:
        state_file.write_text(json.dumps({"fails": fails}), encoding="utf-8")
    except OSError:
        pass


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def attempt_json(ok: bool, error: str | None) -> str:
    return json.dumps({"at": now_iso(), "ok": ok, "error": error})


# --- delivery -------------------------------------------------------------

SWAP = r"""
set -euo pipefail
ROOT="$DATA/d2l"; mkdir -p "$ROOT/snapshots"
exec 9>"$ROOT/.lock"; flock -n 9 || { echo "another sync is running" >&2; exit 3; }
if [ "$STAMP" != "-" ]; then
  tmp="$ROOT/snapshots/.tmp-$STAMP"; rm -rf "$tmp"; mkdir -p "$tmp"
  tar -xzf - -C "$tmp"
  chmod -R a+rX "$tmp"
  mv "$tmp" "$ROOT/snapshots/$STAMP"
  ln -sfn "snapshots/$STAMP" "$ROOT/current.new"
  mv -T "$ROOT/current.new" "$ROOT/current"
  ls -1d "$ROOT"/snapshots/2* | sort | head -n -"$KEEP" | xargs -r rm -rf --
fi
printf '%s\n' "$ATTEMPT" > "$ROOT/last-attempt.json.new"; chmod a+r "$ROOT/last-attempt.json.new"
mv -f "$ROOT/last-attempt.json.new" "$ROOT/last-attempt.json"
"""


def deliver_push(host: str, remote: str, stamp: str, snap: Path | None, attempt: str) -> None:
    payload = b""
    if snap is not None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for f in sorted(snap.rglob("*")):
                tar.add(f, arcname=f.relative_to(snap).as_posix(), recursive=False)
        payload = buf.getvalue()
    env = f"DATA={shlex.quote(remote)} STAMP={shlex.quote(stamp)} KEEP={KEEP} ATTEMPT={shlex.quote(attempt)}"
    cmd = f"{env} bash -c {shlex.quote(SWAP)}"
    p = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, cmd], input=payload, capture_output=True, timeout=300)
    if p.returncode != 0:
        raise RuntimeError(f"push to {host} failed: {p.stderr.decode('utf-8', 'replace').strip()[:300]}")


def deliver_local(dest: Path, stamp: str, snap: Path | None, attempt: str) -> None:
    root = dest / "d2l"
    (root / "snapshots").mkdir(parents=True, exist_ok=True)
    if snap is not None:
        final = root / "snapshots" / stamp
        shutil.copytree(snap, final)
        tmp_link = root / "current.new"
        if tmp_link.is_symlink() or tmp_link.exists():
            tmp_link.unlink()
        tmp_link.symlink_to(Path("snapshots") / stamp, target_is_directory=True)
        os.replace(tmp_link, root / "current")
        for old in sorted(p for p in (root / "snapshots").iterdir() if p.name.startswith("2"))[:-KEEP]:
            shutil.rmtree(old)
    tmp = root / "last-attempt.json.new"
    tmp.write_text(attempt + "\n", encoding="utf-8")
    os.replace(tmp, root / "last-attempt.json")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--push", metavar="HOST", help="ssh host to push to (e.g. myserver)")
    g.add_argument("--dest", metavar="DIR", type=Path, help="local data dir")
    ap.add_argument("--content", metavar="STATE_DIR", type=Path, help="with --dest: run queued content fetches instead of a sync")
    ap.add_argument("--library", metavar="DIR", type=Path, default=Path("/library"), help="library to fetch content into (default /library)")
    ap.add_argument("--remote-dir", default=REMOTE_DATA, help=f"data dir on the push host (default {REMOTE_DATA})")
    ap.add_argument("--d2l", default=shutil.which("d2l"), help="path to the d2l executable")
    ap.add_argument("--days", type=int, default=120, help="look-ahead for due/calendar (default 120)")
    args = ap.parse_args()
    if args.content:
        if not args.dest:
            ap.error("--content needs --dest")
        return run_content_requests(args.content, args.library, args.dest)
    if not args.d2l:
        log("d2l-cli not found on PATH; pass --d2l")
        return 1

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with tempfile.TemporaryDirectory(prefix="d2l-sync-") as tmp:
        snap = Path(tmp) / "snap"
        snap.mkdir()
        ok = collect(Runner(args.d2l), snap, args.days)
        attempt = attempt_json(ok, None if ok else "Brightspace login expired or unreachable. Run `d2l login` on the sync machine.")
        try:
            if args.push:
                deliver_push(args.push, args.remote_dir, stamp if ok else "-", snap if ok else None, attempt)
            else:
                prev = (args.dest / "d2l" / "current").resolve()
                deliver_local(args.dest, stamp, snap if ok else None, attempt)
                if ok:
                    try:
                        alert_changes(prev, args.dest / "d2l" / "current")
                    except Exception as e:  # noqa: BLE001 — alerts never fail the sync
                        log(f"alert check failed: {type(e).__name__}: {e}")
                track_failures(args.dest / "d2l", ok)
        except Exception as e:  # noqa: BLE001 — report and exit non-zero for the scheduler
            log(str(e))
            return 1
    if not ok:
        log("course listing failed — login probably expired; kept previous data")
        return 2
    log(f"delivered snapshot {stamp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
