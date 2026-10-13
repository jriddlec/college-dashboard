#!/usr/bin/env python3
"""End-to-end test of canvas_sync.py against a local mock Canvas API that
serves the hand-written fixtures in src/lib/school/canvas/fixtures.

    python scripts/test_canvas_sync.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "src" / "lib" / "school" / "canvas" / "fixtures"
sys.path.insert(0, str(HERE))
import canvas_sync  # noqa: E402

TOKEN = "test-token-7f3a9c"
PAGE = 2  # small pages so pagination is exercised


def fixture(*parts: str):
    return json.loads((FIXTURES.joinpath(*parts)).read_text(encoding="utf-8"))


class Mock(BaseHTTPRequestHandler):
    calls: list[tuple[str, str]] = []
    fail_calendar = False

    def log_message(self, *args):  # quiet
        pass

    def _send(self, code: int, body, link: str | None = None):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        if link:
            self.send_header("Link", link)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        Mock.calls.append(("GET", self.path))
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            return self._send(401, {"errors": [{"message": "Invalid access token."}]})
        url = urlsplit(self.path)
        q = parse_qs(url.query)
        p = url.path.removeprefix("/api/v1/")
        if p == "courses":
            body = fixture("courses.json")
        elif p.startswith("courses/") and p.endswith("/assignments"):
            body = fixture("courses", p.split("/")[1], "assignments.json")
        elif p.startswith("courses/") and p.endswith("/assignment_groups"):
            body = fixture("courses", p.split("/")[1], "assignment-groups.json")
        elif p == "announcements":
            ctx = set(q.get("context_codes[]", []))
            body = [a for a in fixture("announcements.json") if a["context_code"] in ctx]
        elif p == "calendar_events":
            if Mock.fail_calendar:
                return self._send(500, {"errors": [{"message": "boom"}]})
            ctx = set(q.get("context_codes[]", []))
            body = [e for e in fixture("calendar.json") if e["context_code"] in ctx]
        else:
            return self._send(404, {"errors": [{"message": "not found"}]})
        page = int(q.get("page", ["1"])[0])
        chunk = body[(page - 1) * PAGE : page * PAGE]
        link = None
        if page * PAGE < len(body):
            rest = "&".join(f"{k}={v}" for k, vs in q.items() if k != "page" for v in vs)
            link = f'<http://{self.headers["Host"]}{url.path}?{rest}&page={page + 1}>; rel="next"'
        self._send(200, chunk, link)

    def do_POST(self):  # the sync must never write
        Mock.calls.append(("POST", self.path))
        self._send(405, {})

    do_PUT = do_PATCH = do_DELETE = do_POST


class CanvasSyncTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Mock)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Mock.calls = []
        Mock.fail_calendar = False
        self.tmp = tempfile.TemporaryDirectory()
        self.dest = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_sync(self, token: str | None = TOKEN, url: str | None = None) -> tuple[int, str]:
        env = {"LMS_URL": url if url is not None else self.base}
        if token is not None:
            env["CANVAS_TOKEN"] = token
        old = {k: os.environ.get(k) for k in ("LMS_URL", "CANVAS_TOKEN", "CANVAS_TOKEN_FILE")}
        os.environ.pop("CANVAS_TOKEN", None)
        os.environ.pop("CANVAS_TOKEN_FILE", None)
        os.environ.update(env)
        err = io.StringIO()
        try:
            with redirect_stderr(err):
                code = canvas_sync.run_once(self.dest)
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        return code, err.getvalue()

    def attempt(self) -> dict:
        return json.loads((self.dest / "canvas" / "last-attempt.json").read_text(encoding="utf-8"))

    def test_full_sync(self):
        code, _ = self.run_sync()
        self.assertEqual(code, 0)
        cur = self.dest / "canvas" / "current"
        self.assertTrue(cur.is_symlink())
        # Pagination: every course and assignment arrives despite 2-item pages.
        self.assertEqual(json.loads((cur / "courses.json").read_text()), fixture("courses.json"))
        for cid in ("101", "202", "303"):
            self.assertEqual(json.loads((cur / "courses" / cid / "assignments.json").read_text()), fixture("courses", cid, "assignments.json"))
            self.assertEqual(json.loads((cur / "courses" / cid / "assignment-groups.json").read_text()), fixture("courses", cid, "assignment-groups.json"))
        self.assertEqual(len(json.loads((cur / "announcements.json").read_text())), 2)
        self.assertEqual(len(json.loads((cur / "calendar.json").read_text())), 3)
        self.assertEqual(json.loads((cur / "manifest.json").read_text())["failures"], [])
        self.assertTrue(self.attempt()["ok"])

    def test_read_only(self):
        self.run_sync()
        self.assertTrue(Mock.calls)
        self.assertEqual({m for m, _ in Mock.calls}, {"GET"})

    def test_token_never_written(self):
        self.run_sync()
        for f in self.dest.rglob("*"):
            if f.is_file():
                self.assertNotIn(TOKEN, f.read_text(encoding="utf-8"), f)

    def test_bad_token_keeps_previous_data(self):
        self.assertEqual(self.run_sync()[0], 0)
        before = os.readlink(self.dest / "canvas" / "current")
        code, log = self.run_sync(token="expired")
        self.assertEqual(code, 2)
        self.assertEqual(os.readlink(self.dest / "canvas" / "current"), before)
        a = self.attempt()
        self.assertFalse(a["ok"])
        self.assertIn("401", a["error"])
        self.assertIn("New Access Token", a["error"])
        self.assertNotIn("expired", log)  # the token itself is never logged

    def test_failed_step_is_recorded(self):
        Mock.fail_calendar = True
        code, _ = self.run_sync()
        self.assertEqual(code, 0)
        manifest = json.loads((self.dest / "canvas" / "current" / "manifest.json").read_text())
        self.assertEqual(manifest["failures"], ["calendar"])

    def test_missing_settings(self):
        code, _ = self.run_sync(token=None)
        self.assertEqual(code, 1)
        self.assertIn("CANVAS_TOKEN", self.attempt()["error"])
        code, _ = self.run_sync(url="http://canvas.example.edu")
        self.assertEqual(code, 1)  # plain http only for a local test server

    def test_keeps_last_five(self):
        snaps = self.dest / "canvas" / "snapshots"
        for day in range(1, 7):
            (snaps / f"2026010{day}T000000Z").mkdir(parents=True)
        self.assertEqual(self.run_sync()[0], 0)
        self.assertEqual(self.run_sync()[0], 0)  # same second: replaces, doesn't fail
        kept = sorted(p.name for p in snaps.iterdir() if p.name.startswith("2"))
        self.assertEqual(len(kept), 5)
        self.assertEqual(os.readlink(self.dest / "canvas" / "current"), f"snapshots/{kept[-1]}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
