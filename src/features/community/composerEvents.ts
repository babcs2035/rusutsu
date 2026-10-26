import type { ReportMapTarget } from "./contract";

export const COMPOSE_EVENT = "rusutsu:community-compose";
export const COMPOSE_STATE_EVENT = "rusutsu:community-compose-state";
export const MAP_PICK_MODE_EVENT = "rusutsu:community-map-pick-mode";
export const MAP_TARGET_EVENT = "rusutsu:community-map-target";
export const MAP_POINT_EVENT = "rusutsu:community-map-point";
export type ComposeRequest = {
  resortId: string;
  target?: { kind: "COURSE" | "LIFT"; id: string };
  postId?: string;
};

// A mounted resort detail handles this synchronously. Outside that view the
// caller can navigate to the resort URL, which opens the same panel.
export function requestCommunityComposer(request: ComposeRequest) {
  return !window.dispatchEvent(
    new CustomEvent(COMPOSE_EVENT, {
      detail: request,
      cancelable: true,
    }),
  );
}
export function communityComposerUrl(request: ComposeRequest) {
  const query = new URLSearchParams({ compose: "1" });
  if (request.postId) query.set("edit", request.postId);
  if (request.target)
    query.set(
      request.target.kind === "COURSE" ? "courseId" : "liftId",
      request.target.id,
    );
  return `/${encodeURIComponent(request.resortId)}?${query}`;
}
export function setCommunityMapPickMode(
  resortId: string,
  mode: "POINT" | null,
) {
  window.dispatchEvent(
    new CustomEvent(MAP_PICK_MODE_EVENT, { detail: { resortId, mode } }),
  );
}
export function selectCommunityMapTarget(
  resortId: string,
  target: ReportMapTarget,
) {
  window.dispatchEvent(
    new CustomEvent(MAP_TARGET_EVENT, { detail: { resortId, target } }),
  );
}

export function setCommunityMapPoint(
  resortId: string,
  point: [number, number] | null,
) {
  window.dispatchEvent(
    new CustomEvent(MAP_POINT_EVENT, { detail: { resortId, point } }),
  );
}
