#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${DEPLOY_IMAGE_TAG:?Use the exact tested commit SHA as DEPLOY_IMAGE_TAG}"
[[ "$DEPLOY_IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || ops_die 'Image tag must be a full commit SHA.'
export APP_IMAGE="ghcr.io/babcs2035/rusutsu:$DEPLOY_IMAGE_TAG"
initialize="${INITIALIZE_CANONICAL_DATA:-false}"
force_backup="${FORCE_DATABASE_BACKUP:-false}"
scheduler_enabled="${ENABLE_CRAWL_LATEST_SCHEDULER:-true}"
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
# Keep a verified rollback image record before any container is replaced.
previous_record="$OPS_STATE_DIR/deployed-image.json"
pending_record="$OPS_STATE_DIR/deployed-image.json.tmp"
if [[ -f "$previous_record" && ! -L "$previous_record" ]]; then
  cp -- "$previous_record" "$OPS_STATE_DIR/previous-image.json.tmp"
  mv -- "$OPS_STATE_DIR/previous-image.json.tmp" "$OPS_STATE_DIR/previous-image.json"
else
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
compose run --rm --no-deps --user 0 --entrypoint node app scripts/ops/prepare-artifact-directories.ts /app/var/crawler-artifacts
compose --profile crawlers run --rm --no-deps --user 0 --entrypoint node crawl-latest-scheduler scripts/ops/prepare-artifact-directories.ts /app/var/crawler-worker-artifacts
compose --profile crawlers stop crawl-latest-scheduler app
compose up -d --wait db
compose run --rm --no-deps app prisma migrate deploy
if [[ "$initialize" == true ]]; then
  compose run --rm --no-deps app node --import tsx scripts/importCanonicalDataDocuments.ts --initialize
  compose run --rm --no-deps app node --import tsx scripts/importSkiResortShortNames.ts --initialize
fi
# Validate and cut over existing map data before the app resumes. The migration
# compares the captured hashes again under table locks and is idempotent.
compose run --rm --no-deps app node --import tsx src/private/scripts/migrateCanonicalMaps.ts --deploy
# Derived recommendation rows must exist before serving searches. Rebuild from
# the canonical DB, including current entity/group IDs; never import fixtures.
compose run --rm --no-deps app node --import tsx src/private/scripts/rebuildCourseRecommendations.ts --apply
compose up -d --wait --wait-timeout 180
compose exec -T app node scripts/ops/check-readiness.ts "$API_BASE_URL"
# Record image identity only after the running container and public readiness
# both confirm the requested immutable SHA image.
image_id="$(docker image inspect --format '{{.Id}}' "$APP_IMAGE")"
image_digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$APP_IMAGE" | awk -v prefix='ghcr.io/babcs2035/rusutsu@' 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); exit }')"
running_image_id="$(docker inspect --format '{{.Image}}' "$OPS_APP_CONTAINER")"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && "$image_digest" =~ ^sha256:[a-f0-9]{64}$ && "$running_image_id" == "$image_id" ]] \
  || ops_die 'Successful deployment image identity could not be verified.'
ops_node image-cleanup.ts record "$DEPLOY_IMAGE_TAG" "$image_id" "$image_digest" /operations
mv "$OPS_STATE_DIR/pending.env.sh" "$OPS_STATE_DIR/runtime.env.sh"
cp db-change-manifest.sha256 "$OPS_STATE_DIR/deployed-db-manifest.sha256"
printf '%s\n' "$DEPLOY_IMAGE_TAG" > "$OPS_STATE_DIR/deployed-image-sha"
printf '%s\n' 'Deployment completed; database and /rusutsu readiness checks passed.'
