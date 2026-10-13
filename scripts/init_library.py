#!/usr/bin/env python3
"""
init_library.py — create library folders for classes that don't have any yet.

Asks the running app (/api/library) which classes have no folders in the
library, then creates for each one:

    <LIBRARY_DIR>/<CODE>/Notes/
    <LIBRARY_DIR>/<CODE>/Classwork/
    <LIBRARY_DIR>/<CODE>/Important Documents/

It only creates missing folders: nothing existing is moved, renamed or
overwritten, and classes that already have folders are left alone.

    docker compose run --rm init             # create
    docker compose run --rm init --dry-run   # show what it would create
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SECTIONS = ("Notes", "Classwork", "Important Documents")
# The demo library ships with this marker; init refuses to write into it.
EXAMPLE_MARKER = ".example-library"
# Not allowed in folder names on Windows/macOS (the library may be synced there).
UNSAFE = str.maketrans({c: "-" for c in '<>:"/\\|?*'})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--app", default="http://web:3000", help="the running app (default http://web:3000)")
    ap.add_argument("--library", type=Path, default=Path("/library"), help="library folder (default /library)")
    ap.add_argument("--dry-run", action="store_true", help="show what would be created; change nothing")
    args = ap.parse_args()

    if (args.library / EXAMPLE_MARKER).exists():
        print("LIBRARY_DIR is the example library. Point LIBRARY_DIR in .env at your own class folder first.", file=sys.stderr)
        return 1
    try:
        with urllib.request.urlopen(f"{args.app.rstrip('/')}/api/library", timeout=30) as r:
            data = json.load(r)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"Couldn't read the class list from the app at {args.app} ({e}). Is it running? docker compose up -d", file=sys.stderr)
        return 1
    if not data.get("ok"):
        print(f"The app can't read the library: {data.get('error')}", file=sys.stderr)
        return 1

    courses = data.get("courses") or []
    if not courses:
        print("No classes yet. Connect your LMS (or add classes in config/courses.json), then run init again.")
        return 0
    created = 0
    for c in courses:
        code = str(c.get("code") or "").strip()
        if not code:
            continue
        if c.get("roots"):
            print(f"  {code}: has folders ({', '.join(c['roots'])}); left alone")
            continue
        base = args.library / code.translate(UNSAFE)
        if base.exists():  # the app's 30 s library cache may not show it yet
            print(f"  {code}: has folders ({base.name}); left alone")
            continue
        for section in SECTIONS:
            d = base / section
            if d.exists():
                continue
            print(f"  {code}: {'would create' if args.dry_run else 'created'} {d.relative_to(args.library)}/")
            if not args.dry_run:
                d.mkdir(parents=True, exist_ok=True)
            created += 1
    if args.dry_run:
        print(f"Dry run: {created} folder(s) would be created. Run without --dry-run to create them.")
    else:
        print(f"Done: {created} folder(s) created." + (" Put notes, study guides and classwork in them; see docs/library.md." if created else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
