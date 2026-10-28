# Home server extras

Start with [install.md](install.md#on-a-home-server). This page covers ways to
reach the dashboard from other devices. Anything specific to your server goes
in a `compose.override.yml` next to `compose.yml` (Docker Compose reads it
automatically; it's ignored by git).

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

Updating and backups: see [install.md](install.md#updating).
