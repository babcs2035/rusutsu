#!/usr/bin/env bash
# VPS prerequisites: Bash and Docker/Compose already used by deploys.
set -euo pipefail
umask 077
OPS_IMAGE_INSPECT_FORMAT='{"Id":{{json .Id}},"RepoTags":{{json .RepoTags}},"RepoDigests":{{json .RepoDigests}},"Config":{"Labels":{"com.rusutsu.image-cleanup":{{json (index .Config.Labels "com.rusutsu.image-cleanup")}}}}}'

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
  local git_root=''
  while [[ "$ancestor" != / ]]; do
    if [[ -f "$ancestor/.git" || -e "$ancestor/.git/HEAD" ]]; then
      git_root="$ancestor"
      break
    fi
    ancestor="${ancestor%/*}"
    [[ -n "$ancestor" ]] || ancestor=/
  done
  if [[ -n "$git_root" ]]; then
    command -v git >/dev/null 2>&1 || ops_die 'Git is required to verify ignored operations data inside a worktree.'
    local relative_state="${OPS_STATE_DIR#"$git_root"/}"
    [[ -n "$relative_state" && "$relative_state" != "$OPS_STATE_DIR" ]] || ops_die 'Operations data must not be the Git worktree root.'
    git -C "$git_root" check-ignore --quiet -- "$relative_state" \
      || ops_die 'Operations data inside a Git worktree must be explicitly ignored.'
  fi
  chmod 700 "$OPS_STATE_DIR"
  RUSUTSU_MAP_SW_OVERRIDE="$OPS_STATE_DIR/map-sw.js"
  export RUSUTSU_MAP_SW_OVERRIDE
  : "${DEPLOY_TARGET:?DEPLOY_TARGET must identify the deployed project directory.}"
  [[ "$DEPLOY_TARGET" == /* && "$DEPLOY_TARGET" != / ]] || ops_die 'DEPLOY_TARGET must be an absolute project directory.'
  [[ -d "$DEPLOY_TARGET" && ! -L "$DEPLOY_TARGET" ]] || ops_die 'DEPLOY_TARGET must be an existing non-symlink directory.'
  DEPLOY_TARGET="$(cd -- "$DEPLOY_TARGET" && pwd -P)"
}

# Helper code uses the app image's Node runtime: no Python, age, rclone, sudo,
# or manually created /etc and /var directories are required on the host.
ops_node() {
  docker run --rm -i --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$OPS_SCRIPTS_DIR,target=/ops,readonly" \
    --mount "type=bind,source=$OPS_STATE_DIR,target=/operations" \
    --workdir /ops --env RUSUTSU_SETTINGS_B64 --entrypoint node "$OPS_IMAGE" "$@"
}

compose() {
  # Values are passed in the environment, not reparsed as dotenv or shell text.
  # Ignore the old .env file while keeping it untouched for reference.
  docker compose --env-file /dev/null -p "$COMPOSE_PROJECT_NAME" \
    -f "${RUSUTSU_COMPOSE_FILE:-docker-compose.production.yml}" "$@"
}

load_runtime_environment() {
  [[ -f "$OPS_STATE_DIR/runtime.env.sh" && ! -L "$OPS_STATE_DIR/runtime.env.sh" ]] \
    || ops_die 'Complete one CI/CD deployment before rebuilding the recommendation projection.'
  source "$OPS_STATE_DIR/runtime.env.sh"
  [[ "$COMPOSE_PROJECT_NAME" == "$OPS_PROJECT" ]] \
    || ops_die 'Saved configuration belongs to a different Compose project.'
}
