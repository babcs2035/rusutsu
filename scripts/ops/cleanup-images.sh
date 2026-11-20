#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${DEPLOY_IMAGE_TAG:?Use the exact successfully deployed commit SHA}"
[[ "$DEPLOY_IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || ops_die 'Image tag must be a full commit SHA.'
initialize_operations
lock_operations
snapshot=''
cleanup_exit() {
  if [[ -n "$snapshot" ]]; then rm -rf -- "$snapshot"; fi
  release_operations
}
trap cleanup_exit EXIT
load_runtime_environment
[[ -f "$OPS_STATE_DIR/deployed-image.json" && ! -L "$OPS_STATE_DIR/deployed-image.json" ]] \
  || ops_die 'Successful immutable deployment record is missing.'
snapshot="$(mktemp -d "$OPS_STATE_DIR/.cleanup-images-XXXXXX")"
chmod 700 "$snapshot"
cp -- "$OPS_STATE_DIR/deployed-image.json" "$snapshot/deployed-image.json"
image_format='{"Id":{{json .Id}},"RepoTags":{{json .RepoTags}},"RepoDigests":{{json .RepoDigests}},"Config":{"Labels":{"com.rusutsu.image-cleanup":{{json (index .Config.Labels "com.rusutsu.image-cleanup")}}}}}'
docker image ls -aq --no-trunc | sort -u | xargs -r docker image inspect --format "$image_format" > "$snapshot/images.jsonl"
docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .Image}}' > "$snapshot/container-image-ids.jsonl"
docker inspect --format '{{.Image}}' "$OPS_APP_CONTAINER" > "$snapshot/running-app-image-id"
ops_node image-cleanup.ts plan "$DEPLOY_IMAGE_TAG" "/operations/$(basename "$snapshot")"

docker_root="$(docker info --format '{{.DockerRootDir}}')"
[[ "$docker_root" == /* ]] || ops_die 'Docker storage path is unavailable.'
printf '%s\n' 'Docker storage before cleanup:'
df -Pk -- "$docker_root"
remove_count=0
while IFS=$'\t' read -r tag image_id; do
  [[ -n "$tag" && -n "$image_id" ]] || continue
  current_id="$(docker image inspect --format '{{.Id}}' "$tag")"
  [[ "$current_id" == "$image_id" ]] || ops_die "Image tag changed during cleanup: $tag"
  docker image rm --no-prune "$tag" >/dev/null
  remove_count=$((remove_count + 1))
done < "$snapshot/tag-removals.txt"

# Only prune after proving the complete dangling set contains exclusively
# images selected above. A foreign label match suppresses pruning entirely.
docker image ls -aq --filter dangling=true --filter label=com.rusutsu.image-cleanup=app --no-trunc \
  | sort -u | xargs -r docker image inspect --format "$image_format" > "$snapshot/dangling-images.jsonl"
ops_node image-cleanup.ts check-prune "/operations/$(basename "$snapshot")"
if [[ "$(cat "$snapshot/prune-approved")" == yes ]]; then
  docker image prune --force --filter "label=com.rusutsu.image-cleanup=app" >/dev/null
else
  printf '%s\n' 'Dangling image prune skipped because its full candidate set was not verified.' >&2
fi
printf 'Removed verified obsolete SHA tags: %s\n' "$remove_count"
printf '%s\n' 'Docker storage after cleanup:'
df -Pk -- "$docker_root"
