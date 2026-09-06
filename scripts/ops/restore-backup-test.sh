#!/usr/bin/env bash
# Runs entirely on the VPS. Does not restore into the real application DB.
set -euo pipefail
source "$(dirname "$0")/common.sh"
initialize_operations
lock_operations
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null 2>&1 || true; fi
  release_operations
}
trap cleanup EXIT
load_runtime_environment
generation="$(ops_node local-backup.mjs verify-latest)"
[[ "$generation" =~ ^rusutsu-db-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8}$ ]] || ops_die 'Invalid verified backup generation.'
container_id="$(docker run -d --network none \
  --label com.rusutsu.operation=restore-test \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  -e POSTGRES_USER=restore_check -e POSTGRES_PASSWORD=disposable_restore_only \
  -e POSTGRES_DB=restore_check postgres:16-alpine)"
ready=false
for _ in {1..60}; do
  if docker exec "$container_id" pg_isready -U restore_check -d restore_check >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || ops_die 'Disposable restore database did not become ready.'
docker exec -i "$container_id" pg_restore --exit-on-error --no-owner --no-privileges \
  -U restore_check -d restore_check < "$BACKUP_DIR/$generation/database.dump"
docker exec "$container_id" psql -U restore_check -d restore_check -v ON_ERROR_STOP=1 \
  -c 'SELECT count(*) AS restored_resorts FROM "ski_resorts";'
echo 'Restore succeeded in an isolated disposable PostgreSQL container on this VPS.'
