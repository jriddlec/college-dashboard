"""Long-lived D2L session for the sync.

Many schools' Brightspace and SSO cookies are session cookies, so they die with the browser;
a fresh headless browser per refresh always lands on /d2l/login. Instead this
keeps one Chromium running (visible through noVNC for signing in) and, every
KEEPALIVE_SECONDS, reloads the Brightspace home page (keeps the session active) and mints a
fresh token through D2L's own token endpoint, saved where d2l-cli reads it.

When the session is gone it logs `needs_login` and waits, without navigating,
for a sign-in through noVNC. Tokens are never logged.

Logs: ~/.d2l/session.log (one JSON line per event), ~/.d2l/status.json (current).
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

from d2l.cli import _make_client_factory
from d2l.commands.auth_cmd import _request_token_in_page, _save_token
from d2l.config import BROWSER_PROFILE, TOKEN_DIR, TOKEN_FILE, get_lms_host
from notify import notify

KEEPALIVE = int(os.environ.get("KEEPALIVE_SECONDS", "600"))
LOGIN_POLL = 15
LOG = TOKEN_DIR / "session.log"
STATUS = TOKEN_DIR / "status.json"
HOST = get_lms_host().rstrip("/")


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def record(event, **kw):
    rec = {"at": now(), "event": event, **kw}
    with LOG.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)


def write_status(state, **kw):
    STATUS.write_text(json.dumps({"at": now(), "state": state, **kw}, indent=2) + "\n")


def signed_in(page):
    """On Brightspace itself and not on its login page (SSO hosts mean mid-sign-in)."""
    url = page.url
    return url.startswith(HOST + "/d2l/") and not url.startswith(HOST + "/d2l/login")


def mint(page):
    """Fresh token from the live session; saved for d2l-cli. Returns exp or None."""
    result = _request_token_in_page(page)
    if not result:
        return None
    token, claims = result
    _save_token(token, claims, TOKEN_FILE, TOKEN_DIR)
    os.chmod(TOKEN_FILE, 0o600)
    return claims["exp"]


def api_ok():
    try:
        _make_client_factory()().whoami()
        return "ok"
    except Exception as e:  # noqa: BLE001 - recorded, loop continues
        return f"{type(e).__name__}: {str(e)[:150]}"


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(BROWSER_PROFILE), headless=False, viewport={"width": 1280, "height": 900}
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        record("started")
        state, next_keepalive = None, 0.0

        while True:
            if state != "needs_login" and time.time() >= next_keepalive:
                # Keepalive: reload home. Landing on /d2l/login means the session is gone.
                try:
                    page.goto(HOST + "/d2l/home", wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(3000)
                except Exception as e:  # noqa: BLE001
                    record("reload_error", error=f"{type(e).__name__}: {str(e)[:150]}")
                if not signed_in(page):
                    state = "needs_login"
                    record("needs_login")
                    write_status("needs_login")
                    notify("Sign in to your LMS", "The sign-in session expired, so syncing has stopped. Open Data status for the sign-in link.", "/status", "key", "high")
                    continue
                exp = mint(page)
                api = api_ok() if exp else None
                ok = bool(exp) and api == "ok"
                record("refresh", ok=ok, expires=time.strftime("%H:%M:%SZ", time.gmtime(exp)) if exp else None, api=api)
                write_status("ok" if ok else "refresh_failed", expires_at=exp)
                state = "ok" if ok else "refresh_failed"
                next_keepalive = time.time() + (KEEPALIVE if ok else 60)

            elif state == "needs_login":
                # Don't navigate: someone may be signing in through noVNC.
                live = next((pg for pg in reversed(ctx.pages) if signed_in(pg)), None)
                if live:
                    page = live
                    record("signed_in")
                    notify("Signed in", "The LMS session is back; a sync starts within a minute.", "/status", "white_check_mark", "low")
                    state, next_keepalive = "ok", 0.0
                    continue

            if not ctx.pages:
                record("browser_closed")
                raise SystemExit(1)
            ctx.pages[-1].wait_for_timeout(LOGIN_POLL * 1000)


if __name__ == "__main__":
    main()
