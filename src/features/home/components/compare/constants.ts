import type { Elevation } from "./types";

export const DESKTOP_WEATHER_LINK_WIDTH = "116px";
export const DESKTOP_WEATHER_RESORT_INFO_WIDTH = "180px";
// 44px (標高コントロール) + 430px (フィードビューポート)。
// CompareWeatherTab.css のコンテナクエリ閾値 calc(180px + 32px + 474px) と同期が必要
export const SNOW_FORECAST_FEED_TOTAL_WIDTH = "474px";
export const SNOW_FORECAST_SOURCE_WIDTH = 750;
export const SNOW_FORECAST_SOURCE_HEIGHT = 250;
export const DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X = 20;
export const DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y = 10;
export const SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO = 0.58;

export const ELEVATION_OPTIONS: Array<{ label: string; value: Elevation }> = [
  { label: "山頂", value: "top" },
  { label: "中腹", value: "mid" },
  { label: "山麓", value: "bot" },
];
