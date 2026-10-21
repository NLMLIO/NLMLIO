#!/usr/bin/env bash
# Started by Superset's Run button. Launches the dev server on this
# workspace's reserved port.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$WORKSPACE_DIR"

load_workspace_env
log "Dev server port: $PORT"

if [ -f package.json ]; then
  pm="$(node_pm)"
  script=dev
  [ -n "$(pkg_script dev)" ] || script=start
  body="$(pkg_script "$script")"
  [ -n "$body" ] || die "package.json has no \"dev\" or \"start\" script"

  # Next.js and most servers read $PORT; Vite and Astro need a flag.
  args=()
  case "$body" in
    *vite* | *astro*) args=(--port "$PORT" --host 127.0.0.1) ;;
  esac
  [ "${#args[@]}" -gt 0 ] && [ "$pm" = npm ] && args=(-- "${args[@]}")
  exec "$pm" run "$script" ${args[@]+"${args[@]}"}
fi

if [ -f manage.py ]; then
  py=python3
  [ -x .venv/bin/python ] && py=.venv/bin/python
  exec "$py" manage.py runserver "127.0.0.1:$PORT"
fi

die "No dev command detected. Add a \"dev\" script to package.json, or set \"run\" in .superset/config.json."
