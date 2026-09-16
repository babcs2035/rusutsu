import type { CategoryKind } from "./labels";

/**
 * スナップショットのJSONを画面表示用に読み解く。
 *
 * 保存時は `src/server/crawl-latest/contract.ts` のschemaを通っているが、古い行や
 * 想定外の値でも画面が落ちないよう、ここでは緩く読み、読めない部分は生JSONで見せる。
 */

export type WeatherPoint = {
  point: string;
  update: string | null;
  weather: string | null;
  temperature: string | null;
  snowDepth: string | null;
  snowfall: string | null;
  condition: string | null;
  windSpeed: string | null;
};

export type OperationItem = {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
};

export const parseCommentValue = (data: unknown): string | null => {
  if (typeof data === "string") return asText(data);
  if (!isRecord(data)) return null;
  return asText(data.value);
};

export const parseWeatherPoints = (data: unknown): WeatherPoint[] => {
  if (!isRecord(data)) return [];
  return Object.entries(data).flatMap(([point, value]) =>
    isRecord(value)
      ? [
          {
            point,
            update: asText(value.update),
            weather: asText(value.weather),
            temperature: asText(value.temperature),
            snowDepth: asText(value.snowDepth),
            snowfall: asText(value.snowfall),
            condition: asText(value.condition),
            windSpeed: asText(value.windSpeed),
          },
        ]
      : [],
  );
};

export const parseOperationItems = (data: unknown): OperationItem[] => {
  if (!Array.isArray(data)) return [];
  return data.flatMap(entry =>
    isRecord(entry) && typeof entry.name === "string"
      ? [
          {
            name: entry.name,
            status: asText(entry.status),
            update: asText(entry.update),
            note: asText(entry.note),
          },
        ]
      : [],
  );
};

/** 稼働状態の表記ゆれ（○ / ◯ / 〇）を1つにまとめる。 */
export const normalizeStatus = (
  status: string | null,
): "open" | "hold" | "closed" | "unknown" => {
  if (status === null) return "unknown";
  if (["○", "◯", "〇"].includes(status)) return "open";
  if (status === "△") return "hold";
  if (["×", "✕"].includes(status)) return "closed";
  return "unknown";
};

export const summarizeOperationItems = (items: readonly OperationItem[]) => {
  const counts = { open: 0, hold: 0, closed: 0, unknown: 0 };
  for (const item of items) counts[normalizeStatus(item.status)] += 1;
  return counts;
};

export const categoryIsTabular = (kind: CategoryKind): boolean =>
  kind === "COURSES" || kind === "LIFTS";
