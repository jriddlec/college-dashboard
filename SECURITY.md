# Security

College Dashboard is a personal app for one student. Read this before you run
it anywhere but your own computer.

## Keep it private

- **There is no login.** Anyone who can reach the web port sees your classes,
  grades, assignments and library files.
- By default it listens on `127.0.0.1` only. To use it from other devices, use
  your LAN behind a firewall, a VPN such as Tailscale or WireGuard, or a
  reverse proxy that is itself LAN/VPN-only (see [docs/homelab.md](docs/homelab.md)).
- **Never expose it to the internet:** no port forwarding, no public domain,
  no `tailscale funnel`, no tunnels like ngrok or Cloudflare Tunnel without an
  authentication layer in front.

## Credentials

- **Canvas:** your personal access token lives in `.env` and is passed only to
  the `canvas-sync` container, which sends it only to `LMS_URL`'s host. It is
  never written to the synced data or logged. Keep `.env` private (`chmod 600`),
  never commit it, and revoke the token in Canvas (Account → Settings) if it
  leaks.
- **Brightspace:** your password is never stored. `D2L_AUTH_DIR` holds the
  signed-in browser profile and a short-lived API token: treat it like a
  password (the container sets mode 700) and don't copy it to shared or cloud
  storage. Signing out of Brightspace in noVNC, or deleting the folder, ends
  the session.
- The noVNC sign-in page has no password and is published on `127.0.0.1`
  only. Don't change `NOVNC_PORT` to listen on other interfaces.

## What the app does and doesn't do

- **Read-only against your LMS.** The Canvas sync only sends GET requests. The
  Brightspace sync only reads (through d2l-cli); it never submits, posts or
  changes anything.
- **Read-only on your files.** The web container mounts the library, config
  and data read-only, runs as a non-root user with a read-only filesystem and
  no Linux capabilities, and refuses paths outside the library.
- Library files are served as-is. HTML study guides run their own scripts in
  your browser, so only put files you trust in the library.

## Reporting a problem

Please open a GitHub issue for bugs. For a security issue, use GitHub's
"Report a vulnerability" (private) instead of a public issue. Never include
tokens, cookies or your `D2L_AUTH_DIR` in a report.
