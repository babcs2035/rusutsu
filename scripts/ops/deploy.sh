#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${DEPLOY_IMAGE_TAG:?Use the exact tested commit SHA as DEPLOY_IMAGE_TAG}"
[[ "$DEPLOY_IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || ops_die 'Image tag must be a full commit SHA.'
export APP_IMAGE="ghcr.io/babcs2035/rusutsu:$DEPLOY_IMAGE_TAG"
initialize="${INITIALIZE_CANONICAL_DATA:-false}"
force_backup="${FORCE_DATABASE_BACKUP:-false}"
scheduler_enabled="${ENABLE_CRAWL_LATEST_SCHEDULER:-false}"
for value in "$initialize" "$force_backup" "$scheduler_enabled"; do
  [[ "$value" == true || "$value" == false ]] || ops_die 'Deployment flags must be true or false.'
done
: "${RUSUTSU_SETTINGS_B64:?GitHub API token settings are required}"
test -s db-change-manifest.sha256 || ops_die 'Missing database change manifest.'
# A pull never replaces running containers or their volumes.
docker pull "$APP_IMAGE" >/dev/null
initialize_operations
lock_operations
trap 'rm -f -- "$OPS_STATE_DIR/pending.env.sh" "$OPS_STATE_DIR/pending.env.sh.tmp"; release_operations' EXIT
# Read existing container metadata privately; never print DB/OAuth credentials.
docker inspect "$OPS_DB_CONTAINER" "$OPS_APP_CONTAINER" | ops_node prepare-environment.mjs
unset RUSUTSU_SETTINGS_B64
source "$OPS_STATE_DIR/pending.env.sh"
[[ "$COMPOSE_PROJECT_NAME" == "$OPS_PROJECT" ]] || ops_die 'Existing Compose project changed during deployment.'
docker volume inspect "$POSTGRES_VOLUME" >/dev/null
if [[ "$scheduler_enabled" == true ]]; then export COMPOSE_PROFILES=crawlers; else export COMPOSE_PROFILES=''; fi
compose config --quiet
compose --profile crawlers config --format json | ops_node validate-production-config.mjs
# Verify the new app can authenticate against the existing DB before stopping it.
compose run --rm --no-deps --entrypoint node app scripts/ops/check-existing-database.mjs
needs_backup=false
if [[ "$initialize" == true || "$force_backup" == true ]] || \
   ! cmp -s db-change-manifest.sha256 "$OPS_STATE_DIR/deployed-db-manifest.sha256"; then
  needs_backup=true
fi
if [[ "$needs_backup" == true ]]; then
  bash "$(dirname "$0")/backup-database.sh" --operation-lock-held
else
  printf '%s\n' 'Database-changing paths are unchanged; pre-deploy backup is not required.'
fi
# Only the two crawler volumes are mounted by these helpers, never postgres_data.
compose run --rm --no-deps --user 0 --entrypoint node app scripts/ops/prepare-artifact-directories.mjs /app/var/crawler-artifacts
compose --profile crawlers run --rm --no-deps --user 0 --entrypoint node crawl-latest-scheduler scripts/ops/prepare-artifact-directories.mjs /app/var/crawler-worker-artifacts
compose --profile crawlers stop crawl-latest-scheduler app
compose up -d --wait db
compose run --rm --no-deps app prisma migrate deploy
if [[ "$initialize" == true ]]; then
  compose run --rm --no-deps app node --import tsx scripts/importCanonicalDataDocuments.ts --initialize
  compose run --rm --no-deps app node --import tsx scripts/importSkiResortShortNames.ts --initialize
fi
compose up -d --wait --wait-timeout 180
compose exec -T app node scripts/ops/check-readiness.mjs "$DATA_API_BASE_URL"
mv "$OPS_STATE_DIR/pending.env.sh" "$OPS_STATE_DIR/runtime.env.sh"
cp db-change-manifest.sha256 "$OPS_STATE_DIR/deployed-db-manifest.sha256"
printf '%s\n' "$DEPLOY_IMAGE_TAG" > "$OPS_STATE_DIR/deployed-image-sha"
printf '%s\n' 'Deployment completed; database and /rusutsu readiness checks passed.'
