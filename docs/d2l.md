# Brightspace (D2L)

College Dashboard reads Brightspace with [d2l-cli](https://pypi.org/project/d2l-cli/).
Brightspace has no personal API tokens for students, so the `d2l-session`
container keeps one browser signed in to your school and mints short-lived API
tokens from that session; `d2l-sync` uses them to read your data. Both are
read-only against Brightspace.

## Setup

In `.env`:

```env
LMS=d2l
LMS_URL=https://yourschool.brightspace.com   # the address you see when signed in
COMPOSE_PROFILES=d2l
```

Optional: `LMS_LABEL` (what your school calls it, e.g. "eLC", "iCollege").

```bash
mkdir -p data previews d2l-auth   # before the first start
docker compose up -d --build
```

## Sign in

1. Open http://localhost:6080/vnc.html and click **Connect**. On a server,
   tunnel the port first: `ssh -N -L 6080:127.0.0.1:6080 yourserver`.
2. Sign in to Brightspace in the browser shown, as you normally would (SSO,
   Duo, and so on).
3. Within about 15 seconds the session container notices and the sync starts.

Many schools' sign-in cookies only last while the browser runs, so expect to
sign in again after the session container restarts (a reboot, an image
update) or when your school ends the session. The dashboard keeps the last
data and shows "Latest sync failed" until you do.

noVNC has no password and is published on `127.0.0.1` only. Keep it that way.

## State and logs

`D2L_AUTH_DIR` holds the browser profile, the current token, `status.json`
(`ok`, `needs_login`, `refresh_failed`) and `session.log`. It's a live
session: keep it private (the container sets mode 700) and never share it.

```bash
docker compose logs -f d2l-session d2l-sync
cat d2l-auth/status.json
```

## What it reads

Courses, due and overdue work, calendar, announcements (per course), final
grades, and per course: assignments (dropbox folders), quizzes, grades, gradebook
setup (categories, weights, drops), and your own submissions. Steps that fail
are listed on the **Data status** page; the rest still sync.

## Limits

- Brightspace doesn't report your submission state in folder listings; the
  sync reads it per folder, and folders that are closed or hidden return
  nothing.
- Past work with no submission or grade shows "Past due / submission status
  not available" and is never counted as overdue.
