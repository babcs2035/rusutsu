"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/shared/utils/basePath";

type GoogleMapsLinks = Record<string, string>;

// 一度読んだら画面を閉じるまで使い回す
let cached: GoogleMapsLinks | null = null;
let pending: Promise<GoogleMapsLinks> | null = null;

const loadGoogleMapsLinks = () => {
  pending ??= fetch(withBasePath("/api/google-maps-links"))
    .then(response => (response.ok ? response.json() : {}))
    .then((links: GoogleMapsLinks) => {
      cached = links;
      return links;
    })
    .catch(() => {
      pending = null;
      return {};
    });
  return pending;
};

/** スキー場ごとの Google マップの施設リンク。enabled になったときだけ読む */
export function useGoogleMapsLinks(enabled: boolean) {
  const [links, setLinks] = useState<GoogleMapsLinks | null>(cached);
  useEffect(() => {
    if (!enabled || links) return;
    let active = true;
    void loadGoogleMapsLinks().then(result => {
      if (active) setLinks(result);
    });
    return () => {
      active = false;
    };
  }, [enabled, links]);
  return links;
}
