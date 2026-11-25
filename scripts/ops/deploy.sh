#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${DEPLOY_IMAGE_TAG:?Use the exact tested commit SHA as DEPLOY_IMAGE_TAG}"
[[ "$DEPLOY_IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || ops_die 'Image tag must be a full commit SHA.'
export APP_IMAGE="ghcr.io/babcs2035/rusutsu:$DEPLOY_IMAGE_TAG"
rollback_sha="${ROLLBACK_IMAGE_SHA:-}"
if [[ -n "$rollback_sha" ]]; then
  [[ "$rollback_sha" == "$DEPLOY_IMAGE_TAG" && "$rollback_sha" =~ ^[a-f0-9]{40}$ ]] \
    || ops_die 'Rollback image SHA must match the requested full image tag.'
  [[ "${INITIALIZE_CANONICAL_DATA:-false}" == false ]] \
    || ops_die 'Canonical data initialization is disabled during rollback.'
fi
initialize="${INITIALIZE_CANONICAL_DATA:-false}"
scheduler_enabled="${ENABLE_CRAWL_LATEST_SCHEDULER:-true}"
for value in "$initialize" "$scheduler_enabled"; do
  [[ "$value" == true || "$value" == false ]] || ops_die 'Deployment flags must be true or false.'
done
: "${RUSUTSU_SETTINGS_B64:?GitHub API token settings are required}"
initialize_operations
worker_stage=''
trap 'rm -f -- "$OPS_STATE_DIR/pending.env.sh" "$OPS_STATE_DIR/pending.env.sh.tmp"; [[ -z "$worker_stage" ]] || rm -f -- "$worker_stage"' EXIT
worker_override="$OPS_STATE_DIR/map-sw.js"
command -v curl >/dev/null 2>&1 || ops_die 'curl is required for deployment worker health checks.'
if [[ -n "$rollback_sha" ]]; then
  [[ -f "$worker_override" && ! -L "$worker_override" && -s "$worker_override" ]] \
    || ops_die 'Rollback refused because the private compatible map worker override is missing.'
  grep -Fq 'RUSUTSU_MAP_SW_ROLLBACK_COMPATIBLE' "$worker_override" \
    || ops_die 'Rollback refused because the private map worker override is not compatible.'
  export RUSUTSU_MAP_SW_OVERRIDE="$worker_override"
else
  if [[ -e "$worker_override" || -L "$worker_override" ]]; then
    [[ -f "$worker_override" && ! -L "$worker_override" ]] \
      || ops_die 'Private map worker override path must be a regular file.'
  fi
  uploaded_worker="$DEPLOY_TARGET/public/map-sw.js"
  [[ -f "$uploaded_worker" && ! -L "$uploaded_worker" && -s "$uploaded_worker" ]] \
    || ops_die 'Uploaded public/map-sw.js is missing or invalid.'
  grep -Fq 'RUSUTSU_MAP_SW_ROLLBACK_COMPATIBLE' "$uploaded_worker" \
    || ops_die 'Uploaded public/map-sw.js is not a compatible map worker.'
  worker_stage="$(mktemp "$OPS_STATE_DIR/map-sw.js.stage.XXXXXX")"
  install -m 0644 -- "$uploaded_worker" "$worker_stage"
  export RUSUTSU_MAP_SW_OVERRIDE="$worker_stage"
fi
docker pull "$APP_IMAGE" >/dev/null
# Keep a verified rollback image record before any container is replaced.
previous_record="$OPS_STATE_DIR/deployed-image.json"
if [[ -e "$previous_record" || -L "$previous_record" ]]; then
  [[ -f "$previous_record" && ! -L "$previous_record" ]] || ops_die 'Successful deployment record is not a regular file.'
  running_id="$(docker inspect --format '{{.Image}}' "$OPS_APP_CONTAINER")"
  if [[ -n "$rollback_sha" ]]; then
    rollback_image="$(docker image inspect --format "$OPS_IMAGE_INSPECT_FORMAT" "$APP_IMAGE")"
    ops_node deployment-image.ts verify-rollback-target "$rollback_sha" /operations "$rollback_image"
  else
    recorded_id="$(ops_node deployment-image.ts recorded-image-id /operations)"
    recorded_image="$(docker image inspect --format "$OPS_IMAGE_INSPECT_FORMAT" "$recorded_id")"
    ops_node deployment-image.ts verify-before-switch "$DEPLOY_IMAGE_TAG" /operations "$running_id" "$recorded_image"
  fi
  cp -- "$previous_record" "$OPS_STATE_DIR/previous-image.json.tmp"
  mv -- "$OPS_STATE_DIR/previous-image.json.tmp" "$OPS_STATE_DIR/previous-image.json"
else
  [[ -z "$rollback_sha" ]] || ops_die 'Rollback refused because no successful deployment record exists.'
  rm -f -- "$OPS_STATE_DIR/previous-image.json"
fi
# Read existing container metadata privately; never print DB/OAuth credentials.
docker inspect "$OPS_DB_CONTAINER" "$OPS_APP_CONTAINER" | ops_node prepare-environment.ts
unset RUSUTSU_SETTINGS_B64
source "$OPS_STATE_DIR/pending.env.sh"
[[ "$COMPOSE_PROJECT_NAME" == "$OPS_PROJECT" ]] || ops_die 'Existing Compose project changed during deployment.'
docker volume inspect "$POSTGRES_VOLUME" >/dev/null
if [[ "$scheduler_enabled" == true ]]; then export COMPOSE_PROFILES=crawlers; else export COMPOSE_PROFILES=''; fi
compose config --quiet
compose --profile crawlers config --format json | ops_node validate-production-config.ts
# Verify the new app can authenticate against the existing DB before stopping it.
compose run --rm --no-deps --entrypoint node app scripts/ops/check-existing-database.ts
# Only the two crawler volumes are mounted by these helpers, never postgres_data.
compose run --rm --no-deps --user 0 --entrypoint node app scripts/ops/prepare-artifact-directories.ts /app/var/crawler-artifacts
compose --profile crawlers run --rm --no-deps --user 0 --entrypoint node crawl-latest-scheduler scripts/ops/prepare-artifact-directories.ts /app/var/crawler-worker-artifacts
if [[ -n "$worker_stage" ]]; then
  mv -fT -- "$worker_stage" "$worker_override"
  worker_stage=''
  export RUSUTSU_MAP_SW_OVERRIDE="$worker_override"
fi
compose --profile crawlers stop crawl-latest-scheduler app
compose up -d --wait db
if [[ -z "$rollback_sha" ]]; then
  compose run --rm --no-deps app node node_modules/prisma/build/index.js migrate deploy
  if [[ "$initialize" == true ]]; then
    compose run --rm --no-deps app node --import tsx scripts/importCanonicalDataDocuments.ts --initialize
    compose run --rm --no-deps app node --import tsx scripts/importSkiResortShortNames.ts --initialize
  fi
  # Validate and cut over existing map data before the app resumes. The migration
  # compares the captured hashes again under table locks and is idempotent.
  compose run --rm --no-deps app node --import tsx src/private/scripts/migrateCanonicalMaps.ts --deploy
fi
# Canonical migration and document writes update their own features transactionally.
# Recovery rebuilds use the existing CLI only after an operator-directed backup.
compose up -d --wait --wait-timeout 180
compose exec -T app node scripts/ops/check-readiness.ts "$API_BASE_URL"
for worker_url in \
  "http://127.0.0.1:${APP_PORT:-3000}/rusutsu/map-sw.js" \
  "${API_BASE_URL%/}/map-sw.js"; do
  curl --fail --silent --show-error --max-time 10 "$worker_url" \
    | cmp -s - "$worker_override" \
    || ops_die 'Served map worker differs from the pinned private override.'
done
# Record image identity only after the running container and public readiness
# both confirm the requested immutable SHA image.
image_id="$(docker image inspect --format '{{.Id}}' "$APP_IMAGE")"
image_digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$APP_IMAGE" | awk -v prefix='ghcr.io/babcs2035/rusutsu@' 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); exit }')"
running_image_id="$(docker inspect --format '{{.Image}}' "$OPS_APP_CONTAINER")"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && "$image_digest" =~ ^sha256:[a-f0-9]{64}$ && "$running_image_id" == "$image_id" ]] \
  || ops_die 'Successful deployment image identity could not be verified.'
ops_node deployment-image.ts record "$DEPLOY_IMAGE_TAG" "$image_id" "$image_digest" /operations
mv "$OPS_STATE_DIR/pending.env.sh" "$OPS_STATE_DIR/runtime.env.sh"
printf '%s\n' "$DEPLOY_IMAGE_TAG" > "$OPS_STATE_DIR/deployed-image-sha"
printf '%s\n' 'Deployment completed; database and /rusutsu readiness checks passed.'
