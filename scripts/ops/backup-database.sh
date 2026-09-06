#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
initialize_operations
work=''
owns_lock=false
cleanup() {
  if [[ -n "$work" ]]; then rm -rf -- "$work"; fi
  if [[ "$owns_lock" == true ]]; then release_operations; fi
}
trap cleanup EXIT
if [[ "${1:-}" != --operation-lock-held ]]; then
  lock_operations
  owns_lock=true
  load_runtime_environment
fi
work="$(mktemp -d "$BACKUP_DIR/.incomplete-XXXXXXXX")"
backup_id="rusutsu-db-$(date -u +%Y%m%dT%H%M%SZ)-${work##*-}"
docker exec "$OPS_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$work/database.dump"
test -s "$work/database.dump" || ops_die 'PostgreSQL backup was empty.'
docker exec -i "$OPS_DB_CONTAINER" pg_restore --list < "$work/database.dump" > "$work/archive.list"
test -s "$work/archive.list" || ops_die 'PostgreSQL archive validation failed.'
ops_node local-backup.mjs finalize "${work##*/}" "$backup_id"
printf 'Verified VPS-local database backup: %s\n' "$backup_id"
