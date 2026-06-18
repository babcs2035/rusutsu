import type { SkiResortDetail } from "@/types/skiResorts";

export type Resort = SkiResortDetail;
export type Elevation = "top" | "mid" | "bot";
export type WeatherLink = {
  kind: "snowForecast" | "tenkiJp" | "weathernews" | "windy";
  id: string;
  label: string;
  url: string | null;
  bg: string;
  hoverBg: string;
  color: string;
};
export type SnowForecastLink = {
  id: string;
  displayName: string;
  url: string;
};
