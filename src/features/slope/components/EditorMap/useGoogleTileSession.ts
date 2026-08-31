"use client";

import { useEffect, useState } from "react";
import { GOOGLE_TILE_LAYERS } from "../../constants";
import type { TileLayerId } from "../../types";
import { isGoogleTileLayer } from "./editorTiles";

/**
 * Google Map Tiles API のセッションを作ってタイル URL を得る。
 *
 * 戻り値は 3 状態: undefined = Google 以外を選んでいる / 取得中、
 * null = 取得に失敗した、文字列 = 使える URL。
 */
export const useGoogleTileUrl = (
  apiKey: string | null,
  layerId: TileLayerId,
): string | null | undefined => {
  const [urls, setUrls] = useState<Partial<Record<TileLayerId, string | null>>>(
    {},
  );
  const isGoogleLayer = isGoogleTileLayer(layerId);

  useEffect(() => {
    if (!apiKey || !isGoogleLayer || urls[layerId] !== undefined) return;
    const googleLayer =
      GOOGLE_TILE_LAYERS[layerId as "googleSatellite" | "googleHybrid"];
    let cancelled = false;

    fetch(`https://tile.googleapis.com/v1/createSession?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: googleLayer.mapType,
        language: "ja-JP",
        region: "JP",
        ...(googleLayer.layerTypes
          ? { layerTypes: googleLayer.layerTypes }
          : {}),
      }),
    })
      .then(response =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${response.status}`)),
      )
      .then((data: { session?: string }) => {
        if (cancelled) return;
        setUrls(previous => ({
          ...previous,
          [layerId]: data.session
            ? `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${apiKey}`
            : null,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setUrls(previous => ({ ...previous, [layerId]: null }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, isGoogleLayer, layerId, urls]);

  if (!isGoogleLayer) return undefined;
  return urls[layerId];
};
