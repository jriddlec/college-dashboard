"""
notify.py — optional push alerts for the sync (stdlib only).

Set NOTIFY_URL to one of:
  https://ntfy.sh/<topic> (or your own ntfy server)   plain-text POST with Title/Tags/Click headers
  https://discord.com/api/webhooks/...                 Discord message
  anything else                                        JSON POST {"title", "message", "url"}
Unset: alerts are off. A failed alert is logged and never fails the sync.

Settings saved on the app's /settings page ($STATE_DIR/settings.json, mounted
at /state; SETTINGS_FILE overrides the path) win over the environment: the
target (notifyUrl), appUrl, and alert kinds turned off (alertsOff).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

SETTINGS_FILE = os.environ.get("SETTINGS_FILE", "/state/settings.json")


def _settings() -> dict:
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            v = json.load(f)
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def notify(title: str, message: str, path: str = "", tags: str = "", priority: str = "default", kind: str = "") -> bool:
    s = _settings()
    url = s["notifyUrl"] if isinstance(s.get("notifyUrl"), str) else os.environ.get("NOTIFY_URL", "")
    url = url.strip()
    if not url or (kind and kind in (s.get("alertsOff") or [])):
        return False
    app_url = (s["appUrl"] if isinstance(s.get("appUrl"), str) else os.environ.get("APP_URL", "")).rstrip("/")
    click = f"{app_url}{path}" if app_url else ""
    if "discord.com/api/webhooks" in url or "discordapp.com/api/webhooks" in url:
        text = f"**{title}**\n{message}" + (f"\n{click}" if click else "")
        req = urllib.request.Request(url, json.dumps({"content": text[:1900]}).encode(), {"Content-Type": "application/json"})
    elif "ntfy" in url:
        headers = {"Title": title.encode("utf-8").decode("latin-1", "replace"), "Priority": priority}
        if tags:
            headers["Tags"] = tags
        if click:
            headers["Click"] = click
        req = urllib.request.Request(url, message.encode("utf-8"), headers)
    else:
        body = {"title": title, "message": message, "url": click or None}
        req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except Exception as e:  # noqa: BLE001 — alerts are best-effort
        print(f"notify failed: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr, flush=True)
        return False
