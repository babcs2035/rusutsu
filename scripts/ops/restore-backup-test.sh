#!/usr/bin/env bash
# Runs entirely on the VPS. Does not restore into the real application DB.
set -euo pipefail
source "$(dirname "$0")/common.sh"
initialize_operations
generation=''
owns_lock=false
case "${1:-}" in
  '')
    lock_operations
    owns_lock=true
    ;;
  --operation-lock-held) generation="${2:?Missing migrated backup generation.}" ;;
  *) ops_die 'Usage: restore-backup-test.sh' ;;
esac
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null 2>&1 || true; fi
  if [[ "$owns_lock" == true ]]; then release_operations; fi
}
trap cleanup EXIT
if [[ "$owns_lock" == true ]]; then
  load_runtime_environment
  generation="$(ops_node local-backup.ts verify-latest)"
fi
[[ "$generation" =~ ^rusutsu-db-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8}$ ]] || ops_die 'Invalid verified backup generation.'
# 配備中の DB と同じ版を使い，外部から image を取得しない．
db_image="$(docker inspect --format '{{.Image}}' "$OPS_DB_CONTAINER")"
container_id="$(docker run -d --pull never --network none \
  --label com.rusutsu.operation=restore-test \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  -e POSTGRES_USER=restore_check -e POSTGRES_PASSWORD=disposable_restore_only \
  -e POSTGRES_DB=restore_check "$db_image")"
ready=false
for _ in {1..60}; do
  if docker exec "$container_id" pg_isready -h 127.0.0.1 -U restore_check -d restore_check >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || ops_die 'Disposable restore database did not become ready.'
docker exec -i "$container_id" pg_restore --exit-on-error --no-owner --no-privileges \
  -U restore_check -d restore_check < "$BACKUP_DIR/$generation/database.dump"
docker exec "$container_id" psql -U restore_check -d restore_check -v ON_ERROR_STOP=1 \
  -c 'DO $$
DECLARE resort_count bigint;
BEGIN
  IF NOT (
    to_regclass('\''public.ski_resorts'\'') IS NOT NULL AND
    to_regclass('\''public.users'\'') IS NOT NULL AND
    to_regclass('\''public.accounts'\'') IS NOT NULL AND
    to_regclass('\''public.contribution_photos'\'') IS NOT NULL AND
    to_regclass('\''public.edit_requests'\'') IS NOT NULL AND
    to_regclass('\''public.crawl_latest_currents'\'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION '\''Required application tables are missing'\'';
  END IF;
  SELECT count(*) INTO resort_count FROM ski_resorts;
  IF resort_count = 0 THEN
    RAISE EXCEPTION '\''Restored ski resort data is empty'\'';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype = '\''f'\'' AND NOT convalidated) THEN
    RAISE EXCEPTION '\''Restored database has unvalidated foreign keys'\'';
  END IF;
END $$;
SELECT
    (SELECT count(*) FROM ski_resorts) AS restored_resorts,
    (SELECT count(*) FROM users) AS restored_users,
    (SELECT count(*) FROM accounts) AS restored_accounts,
    (SELECT count(*) FROM contribution_photos) AS restored_photos,
    (SELECT count(*) FROM edit_requests) AS restored_requests,
    (SELECT count(*) FROM crawl_latest_currents) AS restored_current_snapshots;'
echo 'Restore succeeded in an isolated disposable PostgreSQL container on this VPS.'
