#!/bin/sh
# Mounted Fly volumes (/data) are root-owned when the container starts. This
# entrypoint runs as root just long enough to create the cache dir and hand
# ownership to the `nextjs` user, then drops privileges via su-exec before
# ever executing app code.
set -e

mkdir -p /data/fitdash-cache 2>/dev/null || true
chown -R nextjs:nodejs /data 2>/dev/null || true

exec su-exec nextjs "$@"
