# Running it on a home server

Use the same `compose.yml` as on a laptop. Everything specific to your server
goes in `.env` and an optional `compose.override.yml` next to `compose.yml`
(Docker Compose reads it automatically; it's ignored by git).

## Paths and ports

```env
LIBRARY_DIR=/srv/data/school          # your class folders
DATA_DIR=/srv/appdata/college-dashboard/data
CONFIG_DIR=/srv/appdata/college-dashboard/config
PREVIEWS_DIR=/srv/appdata/college-dashboard/previews
D2L_AUTH_DIR=/srv/appdata/college-dashboard/d2l-auth
STATE_DIR=/srv/appdata/college-dashboard/state   # shared marks, sent reminders
PUID=1000                             # the owner of those folders (`id`)
PGID=1000
WEB_PORT=127.0.0.1:3000               # loopback; a proxy or VPN serves it
```

Create the folders as that user before the first start. Docker creates
missing ones as root, and the containers can't write to them.

## Access

There is no login, and the pages show your grades. Reach it only through your
LAN or a VPN. Never port-forward it to the internet or put it on a public
domain. See [SECURITY.md](../SECURITY.md).

### Reverse proxy (Caddy)

Put the web container on your proxy's Docker network:

```yaml
# compose.override.yml
services:
  web:
    networks: [default, proxy]
networks:
  proxy:
    external: true
```

```caddyfile
http://school.home.arpa {
	reverse_proxy college-dashboard:3000
}
```

For HTTPS on a LAN-only name, use `tls internal` (Caddy's own CA; trust its
root certificate on your devices) or a DNS-challenge certificate.

### Traefik

```yaml
# compose.override.yml
services:
  web:
    networks: [default, proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.school.rule=Host(`school.home.arpa`)
      - traefik.http.services.school.loadbalancer.server.port=3000
networks:
  proxy:
    external: true
```

### Tailscale

From any device on your tailnet, without a proxy:

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
```

That serves `https://<machine>.<tailnet>.ts.net` to your tailnet only. Don't
use `tailscale funnel`, which makes it public.

### Plain LAN

`WEB_PORT=0.0.0.0:3000` publishes it on every interface of the server. Your
firewall must keep that port off the internet.

## D2L sign-in on a server

noVNC listens on `127.0.0.1:6080` on the server. From your computer:

```bash
ssh -N -L 6080:127.0.0.1:6080 yourserver
```

Then open http://localhost:6080/vnc.html. See [d2l.md](d2l.md).

## Updating

```bash
git pull
docker compose up -d --build
```

Rebuilding the `d2l` image recreates the session container, which may need a
new sign-in.

## Backups

Back up `CONFIG_DIR` (your settings), `STATE_DIR` (your marks) and your library. `DATA_DIR` is
re-synced from the LMS, and `PREVIEWS_DIR` is rebuilt by `convert`. Don't
back up `D2L_AUTH_DIR` to shared or cloud storage: it holds a live session.
