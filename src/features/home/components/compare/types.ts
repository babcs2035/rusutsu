import type { SkiResortDetail } from "@/types/skiResorts";

export type Resort = SkiResortDetail;
export type Elevation = "top" | "mid" | "bot";
export type WeatherLink = {
  kind: "snowForecast" | "tenkiJp" | "weathernews" | "windy";
  id: string;
  label: string;
  url: string | null;
  /** タイル背景の Tailwind クラス */
  bg: string;
  /** タイル背景のホバー時 Tailwind クラス */
  hoverBg: string;
  /** タイル文字の Tailwind クラス */
  color: string;
};
export type SnowForecastLink = {
  id: string;
  displayName: string;
  url: string;
};
