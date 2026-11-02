"use client";

import { useSyncExternalStore } from "react";
import type { MapDisplaySettings } from "./mapDisplaySettings";

export type DetailCourseStatusState = {
  resortId: string;
  /** 営業状況が取得できていて「営業中のみ」を使えるか */
  enabled: boolean;
  showOpenOnly: boolean;
  settings: MapDisplaySettings;
};

type DetailCourseStatusRequest = Partial<
  Pick<DetailCourseStatusState, "showOpenOnly" | "settings">
>;

/**
 * 詳細地図の「営業中のみ」の状態。
 * 地図と詳細パネルは別の木にあるので、地図が状態を書き込み、
 * パネルからの切り替えは地図へ依頼して、地図の状態を唯一の正とする。
 */
let current: DetailCourseStatusState | null = null;
const listeners = new Set<() => void>();
const requestListeners = new Set<
  (resortId: string, request: DetailCourseStatusRequest) => void
>();

export function publishDetailCourseStatus(state: DetailCourseStatusState) {
  if (
    current?.resortId === state.resortId &&
    current.enabled === state.enabled &&
    current.showOpenOnly === state.showOpenOnly &&
    current.settings === state.settings
  )
    return;
  current = state;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDetailCourseStatus(resortId: string) {
  return useSyncExternalStore(
    subscribe,
    () => (current?.resortId === resortId ? current : null),
    () => null,
  );
}

/** 絞り込み中ならその営業状況、絞り込んでいなければ null */
export function getDetailCourseStatusFilter(
  state: DetailCourseStatusState | null,
) {
  return state?.enabled && state.showOpenOnly && state.settings.showCourses
    ? state.settings.courseStatuses
    : null;
}

export function requestDetailCourseStatus(
  resortId: string,
  request: DetailCourseStatusRequest,
) {
  for (const listener of requestListeners) listener(resortId, request);
}

export function subscribeDetailCourseStatusRequests(
  listener: (resortId: string, request: DetailCourseStatusRequest) => void,
) {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}
