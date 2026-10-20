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
    ap.add_argument("--remote-dir", default=REMOTE_DATA, help=f"data dir on the push host (default {REMOTE_DATA})")
    ap.add_argument("--d2l", default=shutil.which("d2l"), help="path to the d2l executable")
    ap.add_argument("--days", type=int, default=120, help="look-ahead for due/calendar (default 120)")
    args = ap.parse_args()
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
                deliver_local(args.dest, stamp, snap if ok else None, attempt)
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
