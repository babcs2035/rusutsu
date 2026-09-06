#!/usr/bin/env bash
# VPS prerequisites: the Bash shell and Docker/Compose already used by deploys.
set -euo pipefail
umask 077

ops_die() { printf '%s\n' "$*" >&2; exit 1; }

initialize_operations() {
  OPS_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  OPS_DB_CONTAINER="${RUSUTSU_DB_CONTAINER:-rusutsu-db}"
  OPS_APP_CONTAINER="${RUSUTSU_APP_CONTAINER:-rusutsu-app}"
  OPS_PROJECT="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$OPS_DB_CONTAINER")" \
    || ops_die 'Existing DB container could not be inspected. No database will be created.'
  [[ "$OPS_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || ops_die 'Existing Compose project is unknown.'
  OPS_IMAGE="${APP_IMAGE:-$(docker inspect --format '{{.Config.Image}}' "$OPS_APP_CONTAINER")}" \
    || ops_die 'Existing app image could not be inspected.'
  OPS_STATE_DIR="${RUSUTSU_OPS_STATE_DIR:-$HOME/.local/state/rusutsu/$OPS_PROJECT}"
  [[ "$OPS_STATE_DIR" == /* && "$OPS_STATE_DIR" != / ]] || ops_die 'Operations directory must be an absolute private path.'
  [[ ! -L "$OPS_STATE_DIR" ]] || ops_die 'Operations directory must not be a symlink.'
  mkdir -p "$OPS_STATE_DIR"
  OPS_STATE_DIR="$(cd "$OPS_STATE_DIR" && pwd -P)"
  local ancestor="$OPS_STATE_DIR"
  while [[ "$ancestor" != / ]]; do
    [[ ! -e "$ancestor/.git" ]] || ops_die 'Operations data must be outside all Git worktrees.'
    ancestor="${ancestor%/*}"
    [[ -n "$ancestor" ]] || ancestor=/
  done
  chmod 700 "$OPS_STATE_DIR"
  BACKUP_DIR="$OPS_STATE_DIR/backups"
  [[ ! -L "$BACKUP_DIR" ]] || ops_die 'Backup directory must not be a symlink.'
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
}

# Helper code uses the app image's Node runtime: no Python, age, rclone, sudo,
# or manually created /etc and /var directories are required on the host.
ops_node() {
  docker run --rm -i --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$OPS_SCRIPTS_DIR,target=/ops,readonly" \
    --mount "type=bind,source=$OPS_STATE_DIR,target=/operations" \
    --workdir /ops --env RUSUTSU_SETTINGS_B64 --entrypoint node "$OPS_IMAGE" "$@"
}

lock_operations() {
  # Docker atomically claims this name. A lease outlasts the workflow's 30 min
  # timeout and expires even if an SSH disconnect prevents the shell EXIT trap.
  OPS_LOCK_ID="$(docker run --rm -d --network none --name "rusutsu-operation-$OPS_PROJECT" \
    --label com.rusutsu.operation=lock --entrypoint node "$OPS_IMAGE" \
    -e 'setTimeout(() => process.exit(0), 45 * 60 * 1000)')" \
    || ops_die 'Another production operation is running; retry after it finishes (lease: at most 45 minutes).'
}

release_operations() {
  if [[ -n "${OPS_LOCK_ID:-}" ]]; then
    docker rm -f "$OPS_LOCK_ID" >/dev/null 2>&1 || true
    OPS_LOCK_ID=''
  fi
}

load_runtime_environment() {
  [[ -f "$OPS_STATE_DIR/runtime.env.sh" && ! -L "$OPS_STATE_DIR/runtime.env.sh" ]] \
    || ops_die 'Run the new CI/CD deployment once before the backup workflow.'
  source "$OPS_STATE_DIR/runtime.env.sh"
  [[ "$COMPOSE_PROJECT_NAME" == "$OPS_PROJECT" ]] || ops_die 'Saved configuration belongs to a different Compose project.'
}

compose() {
  # Values are passed in the environment, not reparsed as dotenv or shell text.
  # Ignore the old .env file while keeping it untouched for reference.
  docker compose --env-file /dev/null -p "$COMPOSE_PROJECT_NAME" \
    -f "${RUSUTSU_COMPOSE_FILE:-docker-compose.production.yml}" "$@"
}
