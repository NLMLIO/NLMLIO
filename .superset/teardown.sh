#!/usr/bin/env bash
# Runs when a Superset workspace is deleted. Undoes what setup.sh started.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$WORKSPACE_DIR"

if cf="$(compose_file)" && command -v docker >/dev/null; then
  project="$(compose_project_name)"
  log "Stopping docker compose services ($project)"
  docker compose -f "$cf" -p "$project" down --volumes --remove-orphans
fi

release_port
rm -f "$WORKSPACE_ENV"
log "Released this workspace's port reservation"
