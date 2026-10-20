# d2l-runner: d2l-cli + Playwright Chromium for the Brightspace sync
# (compose services d2l-session and d2l-sync). See docs/d2l.md.
#
# Playwright's image ships Chromium and its system deps; the pip pin must match
# the image tag so the bundled browser is the one Playwright expects.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble

# The long-lived browser runs on a virtual display, reachable through noVNC
# (published on loopback; from another machine, use an SSH tunnel) for signing in.
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*

RUN PIP_BREAK_SYSTEM_PACKAGES=1 pip install --no-cache-dir \
      "playwright==1.63.0" "d2l-cli[login]==0.3.0"

# Context is the app dir (see Dockerfile.dockerignore). The sync script is
# baked in, so rebuild the image after changing it.
COPY d2l-runner/entrypoint.sh d2l-runner/keeper.py scripts/d2l_sync.py scripts/notify.py /opt/d2l-runner/
# Runs as the host user that owns the data volumes (compose `user:`, PUID/PGID);
# Chromium needs a writable $HOME for ~/.config and crashpad, or it dies at launch.
RUN chmod 755 /opt/d2l-runner/entrypoint.sh \
 && mkdir -p /home/d2l && chmod 1777 /home/d2l

ENV HOME=/home/d2l PYTHONUTF8=1 PYTHONIOENCODING=utf-8
ENTRYPOINT ["/opt/d2l-runner/entrypoint.sh"]
CMD ["session"]
