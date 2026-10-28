# College Dashboard

One page for everything school: what's due, your grades, your class schedule,
and all your own notes and study guides, in one place you host yourself.

![Dashboard with demo data](docs/screenshots/dashboard.png)

It pulls your classes, assignments, grades and announcements from **Brightspace
(D2L)** or **Canvas**, and pairs them with a **Library** of your own class folders.
It only ever *reads* from your school. It never submits or changes anything.

## What you get

- **Today at a glance.** What's due, what's overdue, your classes today, and
  countdowns to exams.
- **Grades that make sense.** Estimated grades from your syllabus weights, and
  what you need on the rest of the class.
- **Your notes, organized.** Folders on your computer show up per class, viewable
  in the browser (PDF, Word, slides, Markdown, code).
- **Search everything.** `Ctrl K` finds assignments, announcements, and words
  inside your notes.
- **On your phone.** Installs like an app, puts deadlines in your calendar, and
  can send push alerts.

<details>
<summary>More screenshots</summary>

| Class page | Library |
|---|---|
| ![A class](docs/screenshots/class.png) | ![A class's study material](docs/screenshots/library-class.png) |
| ![Calendar](docs/screenshots/calendar.png) | <img src="docs/screenshots/phone.png" alt="On a phone" width="260"> |

</details>

## Install

You need [Docker](https://docs.docker.com/get-docker/). Then:

```bash
git clone https://github.com/jriddlec/college-dashboard
cd college-dashboard
cp .env.example .env
mkdir -p data previews d2l-auth state
docker compose up -d --build
```

Open **http://localhost:3000**. A setup guide walks you through connecting your
school, finding your class folders, and turning on phone alerts. It starts with
demo data, so you can look around first.

Running it on a home server or NAS instead? See **[the install guide](docs/install.md)**.
It covers both setups step by step.

> **Keep it private.** There's no login, and it shows your grades. Use it on your
> own computer, your home network, or a VPN like Tailscale. Never open it to the
> internet. ([Why](SECURITY.md))

## Guides

| | |
|---|---|
| [Install](docs/install.md) | On your computer or a home server, plus updating and backups |
| [Brightspace / D2L](docs/d2l.md) | How the sign-in works, and fixing it when it expires |
| [Canvas](docs/canvas.md) | Access tokens and troubleshooting |
| [Library](docs/library.md) | Organizing class folders, and naming files so they sort well |
| [Home server extras](docs/homelab.md) | Reverse proxies (Caddy, Traefik), Tailscale, LAN access |
| [Configuration](docs/configuration.md) | Every setting and config file |

## Development

```bash
npm install
npm run dev     # http://localhost:3000 with demo data
npm test
```

More in [docs/configuration.md](docs/configuration.md#how-it-fits-together).

## License

MIT
