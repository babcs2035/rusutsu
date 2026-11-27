"use client";

import { useSyncExternalStore } from "react";
import {
  detectMobilePlatform,
  getAppLink,
  type MobilePlatform,
} from "@/shared/utils/appLinks";

const subscribe = () => () => {};
const getPlatform = (): MobilePlatform =>
  detectMobilePlatform(navigator.userAgent, navigator.maxTouchPoints);
const getServerPlatform = (): MobilePlatform => "other";

/**
 * スマホでアプリを開かせたいリンク（Windy など）のURLと開き方。
 * サーバーとPCでは元のURLを新しいタブで開く。
 */
export function useAppLink(href: string): {
  href: string;
  target?: "_self";
} {
  const platform = useSyncExternalStore(
    subscribe,
    getPlatform,
    getServerPlatform,
  );
  return getAppLink(href, platform) ?? { href };
}
