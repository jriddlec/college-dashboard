#!/bin/sh
# Modes:
#   session  (default) one long-lived Chromium on a virtual display, shown via
#            noVNC on :6080 for signing in (http://localhost:6080/vnc.html;
#            on a server, tunnel it: `ssh -L 6080:127.0.0.1:6080 <server>`).
#            keeper.py keeps the LMS session alive and keeps
#            ~/.d2l/token.json fresh.
#   sync     every SYNC_INTERVAL seconds, run d2l_sync.py --dest /data with the
#            session's token (~/.d2l mounted read-only). Never opens a browser.
#   *        run the given command (e.g. `d2l token`, `d2l --json courses`).
set -eu

D2L_DIR="$HOME/.d2l"

# A bind-mounted folder that didn't exist is created by Docker as root, and this
# container runs as PUID:PGID, so say how to fix it instead of failing on chmod.
need_writable() {
  if ! ( : > "$1/.write-test" ) 2>/dev/null; then
    echo "$2 is not writable by uid $(id -u):$(id -g)." >&2
    echo "Create it before starting, as the user in PUID/PGID (e.g. mkdir -p $3), or fix its owner: sudo chown -R $(id -u):$(id -g) <path>." >&2
    exit 1
  fi
  rm -f "$1/.write-test"
}

case "${1:-session}" in
  session)
    need_writable "$D2L_DIR" "D2L_AUTH_DIR" "d2l-auth"
    chmod 700 "$D2L_DIR"
    # Each container has a new hostname, so a lock left by a stopped container
    # looks like "another computer" and Chromium refuses the profile. Only the
    # session container uses the profile.
    rm -f "$D2L_DIR"/browser_profile/Singleton*
    if [ -n "${LMS_URL:-}" ]; then
      printf '{\n  "lms_host": "%s"\n}\n' "${LMS_URL%/}" > "$D2L_DIR/config.json"
    elif [ ! -f "$D2L_DIR/config.json" ]; then
      echo "LMS_URL is not set (your Brightspace address, e.g. https://school.brightspace.com)" >&2
      exit 1
    fi
    Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >/dev/null 2>&1 &
    export DISPLAY=:99
    sleep 1
    x11vnc -display :99 -localhost -nopw -forever -shared -quiet -rfbport 5900 >/dev/null 2>&1 &
    websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
    exec python3 /opt/d2l-runner/keeper.py
    ;;
  sync)
    # Token refresh is the session container's job; d2l-cli must not launch a
    # second browser on the shared profile.
    export D2L_NO_AUTO_LOGIN=1
    need_writable /data "DATA_DIR" "data"
    while :; do
      if [ ! -f "$D2L_DIR/token.json" ]; then
        echo "$(date -u +%FT%T) d2l-sync: no session yet; waiting for d2l-session (sign in at http://localhost:6080/vnc.html)"
        sleep 60
        continue
      fi
      python3 /opt/d2l-runner/d2l_sync.py --dest /data || true
      sleep "${SYNC_INTERVAL:-1800}"
    done
    ;;
  *)
    exec "$@"
    ;;
esac
