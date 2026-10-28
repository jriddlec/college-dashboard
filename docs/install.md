# Installing College Dashboard

Pick one:

- **[On your own computer](#on-your-computer)**: easiest. It runs while your
  computer is on.
- **[On a home server](#on-a-home-server)**: a NAS, mini PC or Raspberry Pi
  that's always on, so your phone can reach it any time.

Either way, once it's running, open it in a browser and the **setup guide**
takes it from there.

---

## On your computer

### 1. Install Docker

Get [Docker Desktop](https://docs.docker.com/get-docker/) (Windows, Mac) or
Docker Engine (Linux), and start it.

### 2. Download the app

Grab the latest **Source code (zip)** from the
[Releases page](https://github.com/jriddlec/college-dashboard/releases) and
unzip it, or use git:

```bash
git clone https://github.com/jriddlec/college-dashboard
cd college-dashboard
```

### 3. Start it

**Mac / Linux** (in a terminal, inside the folder):

```bash
cp .env.example .env
mkdir -p data previews d2l-auth state
docker compose up -d --build
```

**Windows** (PowerShell, inside the folder):

```powershell
Copy-Item .env.example .env
mkdir data, previews, d2l-auth, state
docker compose up -d --build
```

The first build takes a few minutes.

### 4. Open it

Go to **http://localhost:3000**. The setup guide opens and walks you through the rest.

---

## On a home server

Same app, a few extra settings. These steps assume a Linux server with Docker
and that you're signed in over SSH.

### 1. Download and pick folders

```bash
git clone https://github.com/jriddlec/college-dashboard
cd college-dashboard
cp .env.example .env
```

Open `.env` and point the folders somewhere permanent. For example:

```env
LIBRARY_DIR=/srv/school                 # your class folders
DATA_DIR=/srv/appdata/college-dashboard/data
CONFIG_DIR=/srv/appdata/college-dashboard/config
PREVIEWS_DIR=/srv/appdata/college-dashboard/previews
D2L_AUTH_DIR=/srv/appdata/college-dashboard/d2l-auth
STATE_DIR=/srv/appdata/college-dashboard/state
PUID=1000    # run `id` and use your numbers
PGID=1000
```

Create them **as your user** before starting (if Docker creates them, they're
owned by root and the app can't write to them):

```bash
mkdir -p /srv/appdata/college-dashboard/{data,config,previews,d2l-auth,state}
```

### 2. Decide how you'll reach it

| You want | Set in `.env` | Notes |
|---|---|---|
| Any device on your home Wi-Fi | `WEB_PORT=0.0.0.0:3000` | Then open `http://<server-ip>:3000`. Make sure your router doesn't forward that port. |
| Your phone anywhere, privately | keep the default | Use [Tailscale](homelab.md#tailscale). |
| A nice name like `school.home.arpa` | keep the default | Put it behind [Caddy or Traefik](homelab.md#reverse-proxy-caddy). |

Also set `APP_URL` to that address so alerts link back to the dashboard.

### 3. Start it

```bash
docker compose up -d --build
```

Open the address from step 2. The setup guide takes it from there.

**Brightspace on a server:** the sign-in browser listens only on the server
itself. When the guide asks you to sign in, run this on your computer first,
then click **Open sign-in**:

```bash
ssh -N -L 6080:127.0.0.1:6080 you@yourserver
```

---

## Updating

```bash
git pull
docker compose up -d --build
```

(Or download the new release zip and copy your `.env` and `config/` over.)
With Brightspace, you may need to sign in again after an update.

## Backing up

Keep copies of `.env`, your `config` folder, your `state` folder (your
checkmarks and settings), and of course your class folders. Everything else is
re-downloaded from your school. **Don't** sync `d2l-auth` to cloud storage:
it holds a live sign-in.

## Uninstalling

```bash
docker compose down
```

Then delete the folder. Your class folders are never touched.
