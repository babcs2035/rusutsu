import type { SelectedMapFeature } from "@/features/map/types";
import type { ENTRY_KINDS, ReportMapTarget } from "./contract";

export const COMPOSE_EVENT = "rusutsu:community-compose";
export const COMPOSE_STATE_EVENT = "rusutsu:community-compose-state";
export const MAP_PICK_MODE_EVENT = "rusutsu:community-map-pick-mode";
export const MAP_TARGET_EVENT = "rusutsu:community-map-target";
export const MAP_POINT_EVENT = "rusutsu:community-map-point";
export const MAP_HIGHLIGHT_EVENT = "rusutsu:community-map-highlight";
type ComposeMapState = {
  active: boolean;
  mode: "POINT" | null;
  point: [number, number] | null;
};
const mapStates = new Map<string, ComposeMapState>();
export function getCommunityMapState(
  resortId?: string | null,
): ComposeMapState {
  return (
    (resortId && mapStates.get(resortId)) || {
      active: false,
      mode: null,
      point: null,
    }
  );
}
export function setCommunityComposeActive(resortId: string, active: boolean) {
  if (active)
    mapStates.set(resortId, { ...getCommunityMapState(resortId), active });
  else mapStates.delete(resortId);
  window.dispatchEvent(
    new CustomEvent(COMPOSE_STATE_EVENT, { detail: { resortId, active } }),
  );
}
export type ComposeRequest = {
  resortId: string;
  target?: { kind: "COURSE" | "LIFT"; id: string };
  postId?: string;
  /** 閉じたら戻る先。自分の投稿一覧から編集したときは一覧へ戻す */
  returnTo?: "account-posts";
};

export const OPEN_RESORT_COMPOSER_EVENT = "rusutsu:open-resort-composer";
export const COMPOSER_RETURN_EVENT = "rusutsu:composer-return";
// 詳細がまだ開いていないスキー場の投稿画面を開くとき、詳細が届くまで預かる
let pendingCompose: ComposeRequest | null = null;
export function peekPendingCompose(resortId?: string | null) {
  return pendingCompose && pendingCompose.resortId === resortId
    ? pendingCompose
    : null;
}
export function takePendingCompose(resortId?: string | null) {
  const request = peekPendingCompose(resortId);
  if (request) pendingCompose = null;
  return request;
}
/**
 * 画面を移らずに、そのスキー場の詳細を開いて投稿画面を出す。
 * 詳細が開いていればそのまま渡し、開いていなければ一覧画面に開いてもらう。
 */
export function openResortComposer(request: ComposeRequest) {
  if (requestCommunityComposer(request)) return;
  pendingCompose = request;
  window.dispatchEvent(
    new CustomEvent(OPEN_RESORT_COMPOSER_EVENT, { detail: request }),
  );
}
/** 投稿画面を閉じたとき、開く前の画面へ戻してもらう */
export function returnFromComposer(returnTo: ComposeRequest["returnTo"]) {
  if (!returnTo) return;
  window.dispatchEvent(
    new CustomEvent(COMPOSER_RETURN_EVENT, { detail: { returnTo } }),
  );
}

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
  mapStates.set(resortId, { ...getCommunityMapState(resortId), mode });
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
  mapStates.set(resortId, { ...getCommunityMapState(resortId), point });
  window.dispatchEvent(
    new CustomEvent(MAP_POINT_EVENT, { detail: { resortId, point } }),
  );
}

// 投稿一覧で選んだ投稿の対象と場所を、詳細のコース選択とは別に地図で強調する。
// 選択に使うと PC の右パネルがコース詳細に切り替わってしまうため。
export type CommunityMapHighlight = {
  feature: SelectedMapFeature | null;
  point: [number, number] | null;
  /** 地点の点の色に使う投稿の種類 */
  kind: keyof typeof ENTRY_KINDS;
};
export function highlightCommunityPost(
  resortId: string,
  highlight: CommunityMapHighlight | null,
) {
  window.dispatchEvent(
    new CustomEvent(MAP_HIGHLIGHT_EVENT, { detail: { resortId, highlight } }),
  );
}
