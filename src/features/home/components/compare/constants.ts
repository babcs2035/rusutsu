import type { Elevation } from "./types";

/**
 * 比較のカード並び。1 画面にできるだけ多くのスキー場を出すため、
 * コンテナ幅 340px 前後ごとに列を増やす（@container を付けた親の中で使う）
 */
export const COMPARE_CARD_GRID_CLASS =
  "grid grid-cols-1 gap-2 @min-[44rem]:grid-cols-2 @min-[66rem]:grid-cols-3 @min-[88rem]:grid-cols-4 @min-[110rem]:grid-cols-5 @min-[132rem]:grid-cols-6";

/**
 * 天気タブのカード並び。カード 1 枚は Snow Forecast 埋め込み（約 386px）＋余白で
 * 約 416px 必要なので、その倍数 + gap(8px) からコンテナ幅の閾値を決める
 * （2 列 53rem / 3 列 79rem / 4 列 105rem / 5 列 131rem / 6 列 157rem）
 */
export const COMPARE_WEATHER_GRID_CLASS =
  "grid grid-cols-1 gap-2 @min-[53rem]:grid-cols-2 @min-[79rem]:grid-cols-3 @min-[105rem]:grid-cols-4 @min-[131rem]:grid-cols-5 @min-[157rem]:grid-cols-6";

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
