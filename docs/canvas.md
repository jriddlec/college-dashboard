# Canvas

College Dashboard reads Canvas through its REST API with a personal access
token. The `canvas-sync` container makes **GET requests only**: it never
submits, posts, edits, or deletes anything in Canvas.

> Status: written against the [Canvas API docs](https://canvas.instructure.com/doc/api/)
> and hand-made sample responses (`src/lib/school/canvas/fixtures`), not yet
> tested against a live school. If something looks wrong for your school,
> please open an issue.

## 1. Make an access token

1. Sign in to Canvas.
2. Click **Account** (your profile picture), then **Settings**.
3. Under **Approved Integrations**, click **New Access Token**.
4. Purpose: `College Dashboard`. Set an expiration date if you like (or your
   school may require one).
5. Click **Generate Token** and copy it. Canvas won't show the whole token again.

Some schools turn off personal tokens or require approval. If you can't find
**New Access Token**, ask your school's Canvas admins.

Treat the token like a password: it can read everything you can see in Canvas.
Don't paste it into chats, issues, or AI tools.

## 2. Configure

In `.env`:

```env
LMS=canvas
LMS_URL=https://yourschool.instructure.com   # the address you see in the browser
CANVAS_TOKEN=paste-the-token-here
COMPOSE_PROFILES=canvas
```

Keep `.env` private (`chmod 600 .env` on Linux/macOS). Only the `canvas-sync`
container gets the token; the web app never sees it.

## 3. Start

```bash
docker compose up -d --build
docker compose logs -f canvas-sync    # "delivered snapshot ..." means it worked
```

The first sync runs right away, then every `SYNC_INTERVAL` seconds (default
30 minutes). The **Data status** page shows when it last synced.

## What it reads

| Canvas API | Used for |
|---|---|
| `GET /api/v1/courses?enrollment_state=active` (with term, teachers) | Classes |
| `GET /api/v1/courses/:id/assignments?include[]=submission` | Assignments, due dates, your submission state and scores |
| `GET /api/v1/courses/:id/assignment_groups` | Group weights and drop rules, for the grade estimate |
| `GET /api/v1/announcements` | Announcements (last 120 days) |
| `GET /api/v1/calendar_events?type=event` | Calendar events (2 weeks back, 5 months ahead) |

Grades are estimated over graded work only, using the course's assignment
group weights (or points), drop-lowest rules, and your syllabus settings in
`config/grading.json` if you add them. Excused and "don't count toward final
grade" items are left out.

## When the token expires

Canvas tokens don't refresh. When yours expires or is revoked, the dashboard
keeps the last data and shows "Canvas rejected the access token (401)". Make a
new token (step 1), replace `CANVAS_TOKEN` in `.env`, and run
`docker compose up -d canvas-sync`.

## Troubleshooting

- **"Set LMS_URL (https://...) and CANVAS_TOKEN"**: one of them is missing from `.env`.
- **"Canvas course listing failed (HTTP 404)"** or other HTTP errors:
  check `LMS_URL` (the address you use in the browser, without a path).
- **"DATA_DIR is not writable"**: create the folder before starting
  (`mkdir -p data`), or `chown` it to the user in `PUID`/`PGID`.
- Run one sync by hand: `docker compose run --rm canvas-sync --dest /data`.
