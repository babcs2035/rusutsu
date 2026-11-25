#!/usr/bin/env bash
# Export the existing PostgreSQL database to a private custom-format dump.
set -euo pipefail
umask 077

usage() {
  printf 'Usage: bash scripts/ops/backup-database.sh /absolute/path/unique.dump\n' >&2
  exit 2
}

[[ $# -eq 1 && "$1" == /* && "$1" != / ]] || usage
destination="$1"
directory="$(dirname -- "$destination")"
filename="$(basename -- "$destination")"
[[ -d "$directory" && ! -L "$directory" && "$filename" != . && "$filename" != .. ]] \
  || { printf 'Backup destination directory must exist and must not be a symlink.\n' >&2; exit 1; }
[[ ! -e "$destination" && ! -L "$destination" ]] \
  || { printf 'Backup destination already exists.\n' >&2; exit 1; }

container="${RUSUTSU_DB_CONTAINER:-rusutsu-db}"
temporary="$(mktemp -- "$directory/.${filename}.incomplete.XXXXXXXX")"
cleanup() {
  rm -f -- "$temporary"
}
trap cleanup EXIT

docker exec "$container" sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$temporary"
[[ -s "$temporary" ]] || { printf 'PostgreSQL dump is empty.\n' >&2; exit 1; }
chmod 600 "$temporary"

# A hard link publishes the fully written file atomically and fails if another
# process created the destination after the earlier existence check.
ln -T -- "$temporary" "$destination"
rm -- "$temporary"
trap - EXIT
printf 'PostgreSQL custom-format backup written to %s\n' "$destination"
