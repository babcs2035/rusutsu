#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
initialize_operations
work=''
owns_lock=false
BACKUP_SIZE_MARGIN_PERCENT=25
MIN_FREE_SPACE_MARGIN_BYTES=$((64 * 1024 * 1024))
cleanup() {
  if [[ -n "$work" ]]; then rm -rf -- "$work"; fi
  if [[ "$owns_lock" == true ]]; then release_operations; fi
}
trap cleanup EXIT

check_backup_capacity() {
  local database_bytes margin required available
  database_bytes="$(docker exec "$OPS_DB_CONTAINER" sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT pg_database_size(current_database())"')" \
    || ops_die 'Could not determine a safe database backup size.'
  [[ "$database_bytes" =~ ^[0-9]{1,15}$ ]] \
    || ops_die 'Could not determine a safe database backup size.'

  # pg_database_size is a conservative dump-size baseline; retain an additional
  # 25% or 64 MiB, whichever is larger. This is a preflight estimate, not a
  # guarantee that a database with unusual objects cannot exceed the estimate.
  margin=$((database_bytes / 100 * BACKUP_SIZE_MARGIN_PERCENT))
  if (( margin < MIN_FREE_SPACE_MARGIN_BYTES )); then
    margin="$MIN_FREE_SPACE_MARGIN_BYTES"
  fi
  required=$((database_bytes + margin))

  available="$(df --output=avail -B1 -- "$BACKUP_DIR" | tail -n 1 | tr -d '[:space:]')" \
    || ops_die 'Could not determine free space for the database backup.'
  [[ "$available" =~ ^[0-9]{1,15}$ ]] \
    || ops_die 'Could not determine free space for the database backup.'
  if (( available < required )); then
    ops_die "Insufficient free space for database backup (available: ${available} bytes; required: ${required} bytes including margin)."
  fi
}

case "${1:-}" in
  ''|--operation-lock-held|--dry-run) ;;
  *) ops_die 'Usage: backup-database.sh [--dry-run]' ;;
esac
if [[ "${1:-}" != --operation-lock-held ]]; then
  lock_operations
  owns_lock=true
  load_runtime_environment
fi
if [[ "${1:-}" == --dry-run ]]; then
  ops_node local-backup.ts plan-legacy
  exit 0
fi
migrated_generations="$(ops_node local-backup.ts migrate-legacy)"
if [[ -n "$migrated_generations" ]]; then
  while IFS= read -r generation; do
    bash "$OPS_SCRIPTS_DIR/restore-backup-test.sh" --operation-lock-held "$generation"
    ops_node local-backup.ts confirm-legacy "$generation"
  done <<< "$migrated_generations"
fi
check_backup_capacity
work="$(mktemp -d "$BACKUP_DIR/.incomplete-XXXXXXXX")"
docker exec "$OPS_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$work/database.dump"
test -s "$work/database.dump" || ops_die 'PostgreSQL backup was empty.'
docker exec -i "$OPS_DB_CONTAINER" pg_restore --list < "$work/database.dump" > "$work/archive.list"
test -s "$work/archive.list" || ops_die 'PostgreSQL archive validation failed.'
backup_id="$(ops_node local-backup.ts finalize "${work##*/}")"
printf 'Verified VPS-local database backup: %s\n' "$backup_id"
