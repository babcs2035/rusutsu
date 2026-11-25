#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
snapshot=''
docker_root=''
storage_before_recorded=false
remove_tag_count=0
remove_image_id_count=0
cleanup_exit() {
  exit_status=$?
  trap - EXIT
  if [[ -n "$docker_root" ]]; then
    printf '%s\n' 'Docker storage after cleanup:'
    if ! df -Pk -- "$docker_root"; then
      printf '%s\n' 'Docker storage after cleanup: unavailable' >&2
      if (( exit_status == 0 )); then exit_status=1; fi
    fi
  else
    printf '%s\n' 'Docker storage after cleanup: unavailable' >&2
  fi
  if [[ "$storage_before_recorded" != true ]]; then
    printf '%s\n' 'Docker storage before cleanup: unavailable'
  fi
  if [[ -n "$snapshot" ]] && ! rm -rf -- "$snapshot"; then
    printf '%s\n' 'Image cleanup snapshot could not be removed.' >&2
    if (( exit_status == 0 )); then exit_status=1; fi
  fi
  release_operations
  printf 'Image cleanup exit code: %s\n' "$exit_status"
  printf 'Removed verified obsolete SHA tags: %s\n' "$remove_tag_count"
  printf 'Removed verified dangling app image IDs: %s\n' "$remove_image_id_count"
  exit "$exit_status"
}
trap cleanup_exit EXIT
: "${DEPLOY_IMAGE_TAG:?Use the exact successfully deployed commit SHA}"
[[ "$DEPLOY_IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || ops_die 'Image tag must be a full commit SHA.'
initialize_operations
lock_operations
load_runtime_environment
[[ -f "$OPS_STATE_DIR/deployed-image.json" && ! -L "$OPS_STATE_DIR/deployed-image.json" ]] \
  || ops_die 'Successful immutable deployment record is missing.'
snapshot="$(mktemp -d "$OPS_STATE_DIR/.cleanup-images-XXXXXX")"
chmod 700 "$snapshot"
cp -- "$OPS_STATE_DIR/deployed-image.json" "$snapshot/deployed-image.json"
docker image ls -aq --no-trunc | sort -u | xargs -r docker image inspect --format "$OPS_IMAGE_INSPECT_FORMAT" > "$snapshot/images.jsonl"
docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .Image}}' > "$snapshot/container-image-ids.jsonl"
docker inspect --format '{{.Image}}' "$OPS_APP_CONTAINER" > "$snapshot/running-app-image-id"
ops_node image-cleanup.ts plan "$DEPLOY_IMAGE_TAG" "/operations/$(basename "$snapshot")"

docker_root="$(docker info --format '{{.DockerRootDir}}')"
[[ "$docker_root" == /* ]] || ops_die 'Docker storage path is unavailable.'
printf '%s\n' 'Docker storage before cleanup:'
df -Pk -- "$docker_root" || ops_die 'Docker storage before cleanup is unavailable.'
storage_before_recorded=true
while IFS=$'\t' read -r tag image_id; do
  [[ -n "$tag" && -n "$image_id" ]] || continue
  current_id="$(docker image inspect --format '{{.Id}}' "$tag")"
  [[ "$current_id" == "$image_id" ]] || ops_die "Image tag changed during cleanup: $tag"
  docker image rm --no-prune "$tag" >/dev/null
  remove_tag_count=$((remove_tag_count + 1))
done < "$snapshot/tag-removals.txt"

# Removing an image's last tag can delete its image ID immediately. Re-list
# dangling images afterwards and consider only IDs approved from the original
# app-tag snapshot; this keeps Docker's automatic deletion safe and repeatable.
docker image ls -q --filter dangling=true --no-trunc | sort -u > "$snapshot/dangling-image-ids.txt"
while IFS= read -r image_id; do
  [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || ops_die 'Invalid dangling image ID.'
  grep -Fxq -- "$image_id" "$snapshot/removable-image-ids.txt" || continue

  # Recheck every container, including stopped containers, immediately before
  # removal. Docker's non-forced removal remains the final race guard.
  docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .Image}}' \
    > "$snapshot/container-image-ids.jsonl"
  if grep -Fxq -- "\"$image_id\"" "$snapshot/container-image-ids.jsonl"; then
    continue
  fi
  if ! image_json="$(docker image inspect --format "$OPS_IMAGE_INSPECT_FORMAT" "$image_id" 2>/dev/null)"; then
    current_dangling="$(docker image ls -q --filter dangling=true --no-trunc)"
    if grep -Fxq -- "$image_id" <<< "$current_dangling"; then
      ops_die 'A selected dangling image could not be inspected.'
    fi
    continue
  fi
  ops_node image-cleanup.ts check-id "$image_id" "$image_json" /operations
  docker image rm --no-prune "$image_id" >/dev/null
  remove_image_id_count=$((remove_image_id_count + 1))
done < "$snapshot/dangling-image-ids.txt"
