#!/usr/bin/env bash
# Runs when a Superset workspace is created. Safe to re-run.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$WORKSPACE_DIR"

need() { command -v "$1" >/dev/null || die "$1 is required ($2) but not installed"; }

# 1. Env files. Copy every untracked .env* file from the main checkout without
#    overwriting anything already in the workspace.
ROOT="${SUPERSET_ROOT_PATH:-}"
if [ -n "$ROOT" ] && [ "$ROOT" != "$WORKSPACE_DIR" ] && [ -d "$ROOT" ]; then
  git -C "$ROOT" ls-files --others --directory -z | while IFS= read -r -d '' f; do
    case "$(basename "$f")" in .env | .env.* | .envrc) ;; *) continue ;; esac
    [ -f "$ROOT/$f" ] || continue
    if [ -e "$f" ]; then
      log "Keeping existing $f"
    else
      mkdir -p "$(dirname "$f")"
      cp "$ROOT/$f" "$f"
      log "Copied $f from $ROOT"
    fi
  done
else
  log "SUPERSET_ROOT_PATH not set or is this checkout; skipping env copy"
fi

# Fall back to the committed template when no real .env was available.
git ls-files -z -- ':(glob).env.example' ':(glob)**/.env.example' | while IFS= read -r -d '' ex; do
  target="$(dirname "$ex")/.env"
  if [ ! -e "$target" ]; then
    cp "$ex" "$target"
    log "Created $target from $ex"
  fi
done

# 2. Ports.
load_workspace_env
log "Reserved ports $PORT-$((PORT + PORT_BLOCK - 1)) (PORT=$PORT)"

# 3. Dependencies, detected from lockfiles / manifests.
installed=0
if [ -f package.json ]; then
  pm="$(node_pm)"
  need "$pm" "package.json"
  log "Installing Node dependencies with $pm"
  case "$pm" in
    npm) if [ -f package-lock.json ]; then npm ci; else npm install; fi ;;
    *) "$pm" install ;;
  esac
  installed=1
fi
if [ -f uv.lock ]; then
  need uv "uv.lock"; log "Installing Python dependencies with uv"; uv sync; installed=1
elif [ -f poetry.lock ]; then
  need poetry "poetry.lock"; log "Installing Python dependencies with poetry"; poetry install; installed=1
elif [ -f requirements.txt ]; then
  need python3 "requirements.txt"
  log "Installing Python dependencies into .venv"
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
  installed=1
fi
if [ -f Cargo.toml ]; then
  need cargo "Cargo.toml"; log "Fetching Rust crates"; cargo fetch; installed=1
fi
if [ -f go.mod ]; then
  need go "go.mod"; log "Downloading Go modules"; go mod download; installed=1
fi
[ "$installed" = 1 ] || log "No dependency manifest found; nothing to install"

# 4. Background services. Stopped again by teardown.sh.
if cf="$(compose_file)"; then
  need docker "$cf"
  log "Starting docker compose services ($COMPOSE_PROJECT_NAME)"
  docker compose -f "$cf" up -d
fi

log "Workspace ready. Press Run to start the dev server on port $PORT."
