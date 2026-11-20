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

if [[ "${1:-}" != --operation-lock-held ]]; then
  lock_operations
  owns_lock=true
  load_runtime_environment
fi
migrated_generations="$(ops_node local-backup.mjs migrate-legacy)"
if [[ -n "$migrated_generations" ]]; then
  work="$(mktemp -d "$BACKUP_DIR/.migration-check-XXXXXXXX")"
  while IFS= read -r generation; do
    [[ "$generation" =~ ^rusutsu-db-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8}$ ]] \
      || ops_die 'Invalid migrated backup generation.'
    # Parse the copied dump itself before deleting the legacy copy. archive.list
    # alone is only recorded evidence; this repeats pg_restore's TOC check.
    docker exec -i "$OPS_DB_CONTAINER" pg_restore --list \
      < "$BACKUP_DIR/$generation/database.dump" \
      > "$work/$generation.archive.list"
    test -s "$work/$generation.archive.list" \
      || ops_die 'Migrated PostgreSQL archive validation failed.'
    ops_node local-backup.mjs confirm-legacy "$generation"
  done <<< "$migrated_generations"
  rm -rf -- "$work"
  work=''
fi
check_backup_capacity
work="$(mktemp -d "$BACKUP_DIR/.incomplete-XXXXXXXX")"
docker exec "$OPS_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$work/database.dump"
test -s "$work/database.dump" || ops_die 'PostgreSQL backup was empty.'
docker exec -i "$OPS_DB_CONTAINER" pg_restore --list < "$work/database.dump" > "$work/archive.list"
test -s "$work/archive.list" || ops_die 'PostgreSQL archive validation failed.'
backup_id="$(ops_node local-backup.mjs finalize "${work##*/}")"
printf 'Verified VPS-local database backup: %s\n' "$backup_id"
