"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/shared/utils/basePath";

type GoogleMapsLinks = Record<string, string>;

interface GoogleMapsLinksLoader {
  getCached(): GoogleMapsLinks | null;
  load(): Promise<GoogleMapsLinks | null>;
}

/** Cache successful link responses and allow failed requests to be retried. */
export function createGoogleMapsLinksLoader(
  request: () => Promise<Pick<Response, "ok" | "json">>,
): GoogleMapsLinksLoader {
  let cached: GoogleMapsLinks | null = null;
  let pending: Promise<GoogleMapsLinks | null> | null = null;

  return {
    getCached: () => cached,
    load: () => {
      if (cached) return Promise.resolve(cached);

      pending ??= request()
        .then(response => {
          if (!response.ok) throw new Error("Google Maps links request failed");
          return response.json() as Promise<GoogleMapsLinks>;
        })
        .then(links => {
          cached = links;
          return links;
        })
        .catch(() => null)
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}

const googleMapsLinksLoader = createGoogleMapsLinksLoader(() =>
  fetch(withBasePath("/api/google-maps-links")),
);

/** スキー場ごとの Google マップの施設リンク。enabled になったときだけ読む */
export function useGoogleMapsLinks(enabled: boolean) {
  const [links, setLinks] = useState<GoogleMapsLinks | null>(
    googleMapsLinksLoader.getCached(),
  );
  useEffect(() => {
    if (!enabled || links) return;
    let active = true;
    void googleMapsLinksLoader.load().then(result => {
      if (active && result) setLinks(result);
    });
    return () => {
      active = false;
    };
  }, [enabled, links]);
  return links;
}
