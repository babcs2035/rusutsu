"use client";

import { useEffect, useRef, useState } from "react";
import type { MapTileVariant } from "../types";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  type MapDisplaySettings,
} from "../utils/mapDisplaySettings";

// 地図の表示設定をブラウザ (localStorage) に保存し、画面遷移でリセットされないようにする。
// ホーム・詳細・比較の 3 つの地図が同じキーを共有するため、どこで変えても共有される。

const SETTINGS_KEY = "rusutsu.mapDisplaySettings.v1";
const TILE_VARIANT_KEY = "rusutsu.mapTileVariant.v1";

// デフォルトは航空写真（選択時・比較時・ホームで揃える）
export const DEFAULT_TILE_VARIANT: MapTileVariant = "photo";

function readStoredSettings(): MapDisplaySettings {
  if (typeof window === "undefined") return DEFAULT_MAP_DISPLAY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_MAP_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<MapDisplaySettings>;
    // 将来の項目追加に備え、欠けたキーはデフォルトで埋める
    return {
      ...DEFAULT_MAP_DISPLAY_SETTINGS,
      ...parsed,
      courseStatuses: {
        ...DEFAULT_MAP_DISPLAY_SETTINGS.courseStatuses,
        ...parsed.courseStatuses,
      },
    };
  } catch {
    return DEFAULT_MAP_DISPLAY_SETTINGS;
  }
}

function readStoredTileVariant(): MapTileVariant {
  if (typeof window === "undefined") return DEFAULT_TILE_VARIANT;
  const value = window.localStorage.getItem(TILE_VARIANT_KEY);
  return value === "pale" || value === "photo" ? value : DEFAULT_TILE_VARIANT;
}

function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // プライベートモード・容量超過などの書き込み失敗は無視する
  }
}

/**
 * 地図の表示設定とタイル種別を localStorage に永続化する。
 * 初回マウント時の書き込みはスキップし、ユーザー操作による変更だけ保存する。
 */
export function usePersistentMapSettings() {
  const [mapDisplaySettings, setMapDisplaySettings] =
    useState<MapDisplaySettings>(readStoredSettings);
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>(
    readStoredTileVariant,
  );
  // 初回マウント時の書き込みをスキップするフラグ（変更ごとに独立させる）
  const firstSettingsRun = useRef(true);
  const firstTileRun = useRef(true);

  useEffect(() => {
    if (firstSettingsRun.current) {
      firstSettingsRun.current = false;
      return;
    }
    writeSetting(SETTINGS_KEY, JSON.stringify(mapDisplaySettings));
  }, [mapDisplaySettings]);

  useEffect(() => {
    if (firstTileRun.current) {
      firstTileRun.current = false;
      return;
    }
    writeSetting(TILE_VARIANT_KEY, mapTileVariant);
  }, [mapTileVariant]);

  return {
    mapDisplaySettings,
    setMapDisplaySettings,
    mapTileVariant,
    setMapTileVariant,
  };
}
