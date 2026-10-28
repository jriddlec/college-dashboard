# Configuration

Most people only need the setup guide in the app. This page is the full reference.

## `.env` (the server)

Copy `.env.example` to `.env`. Restart after changes (`docker compose up -d`).

| Setting | What it does |
|---|---|
| `LMS` | `fixture` (demo data), `d2l` or `canvas` |
| `LMS_URL` | Your school's LMS address, as in your browser |
| `COMPOSE_PROFILES` | Same as `LMS` (`d2l` or `canvas`), so the sync starts with the app |
| `CANVAS_TOKEN` | Canvas only. Your access token |
| `LMS_LABEL`, `SCHOOL_NAME`, `APP_NAME` | What to call things ("eLC", "University of Georgia") |
| `ACCENT_COLOR` | Brand color, quoted: `"#ba0c2f"` |
| `SCHOOL_TZ` | Time zone for due dates, e.g. `America/Chicago` |
| `SYNC_INTERVAL` | Seconds between syncs (default 1800) |
| `LIBRARY_DIR` | Your class folders (read-only to the app) |
| `DATA_DIR`, `CONFIG_DIR`, `PREVIEWS_DIR`, `D2L_AUTH_DIR`, `STATE_DIR` | Where the app keeps its files |
| `PUID`, `PGID` | The user that owns those folders (`id`) |
| `WEB_PORT`, `NOVNC_PORT` | Where it listens. Loopback by default |
| `SIGNIN_URL`, `SIGNIN_HINT` | Brightspace: the sign-in link and a hint (like an SSH tunnel command) |
| `LIBRARY_NAMING_CHECK=1` | List library files that don't follow the naming convention on Data status |

Alert settings (`NOTIFY_URL`, `APP_URL`, `REMIND_DUE_HOURS`, `REMIND_EXAM_HOURS`,
`REMIND_QUIET`) are just defaults. Change them on the **Settings** page.

`STATE_DIR` is the app's one writable folder: your checkmarks, read
announcements, settings and sent reminders. Without it, marks stay in each
browser and reminders are off.

## `config/` (optional files)

Copy any `config/*.example.json` without `.example` and edit it. Changes apply
without a restart. A broken file is skipped and reported on **Data status**.

| File | Use it to |
|---|---|
| `courses.json` | Rename classes, set icons and instructors, match library folders, hide enrollments |
| `links.json` | Add quick links to the home page and to each class |
| `grading.json` | Enter syllabus weights and letter scales for grade estimates |
| `syllabus.json` | Add deadlines the LMS doesn't list yet |
| `schedule.json` | Add class meeting times |
| `webassign.json` | Track WebAssign work by hand |
| `transcript.json` | Past credit hours and quality points, for GPA |

## Library commands

```bash
docker compose run --rm init --dry-run   # show folders it would create
docker compose run --rm init             # create starter folders for classes without one
docker compose run --rm convert          # make PDF previews of Word/PowerPoint/Excel files
```

See [library.md](library.md) for folder layouts and file naming.

## How it fits together

- `scripts/d2l_sync.py` and `scripts/canvas_sync.py` (in the sync containers)
  write a timestamped snapshot to `DATA_DIR` and swap `current` atomically, so
  the app never reads a half-written sync.
- `src/lib/school/{d2l,canvas}/normalize.ts` are the only code that knows each
  LMS's data shapes; everything else uses `src/lib/school/types.ts`.
- `src/lib/library/catalog.ts` turns the folder tree into units, exam prep and
  classwork (pure, unit-tested).
- `src/lib/config.ts`, `src/lib/settings.ts` and `src/lib/user-settings.ts` hold
  configuration; `src/lib/state.ts` is the shared state in `STATE_DIR`.
- `src/app/setup` is the first-run guide; `src/lib/reminders.ts` runs in the web
  server (started from `src/instrumentation.ts`).

Tests: `npm test`, `npm run typecheck`, `npm run lint`, and
`python3 scripts/test_canvas_sync.py` (Linux/macOS).
