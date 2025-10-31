// src/shared/types.ts
export interface WeatherData {
  update: string | null;
  weather: string | null;
  temperature: number | string | null;
  snowDepth: number | string | null;
  snowfall: number | string | null;
  condition: string | null;
  windSpeed: number | string | null;
}

export interface Course {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

export interface Lift {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

/**
 * 天候のチェックのためのフィールド設定
 */
export interface FieldConfig {
  type?: "string" | "number";
  min?: number;
  max?: number;
  disabled?:
    | boolean
    | ((
        // biome-ignore lint/suspicious/noExplicitAny: for flexibility
        raw: any,
        data: WeatherData,
        point: string,
        key: keyof WeatherData,
      ) => boolean);
}

export type WeatherValidationConfig = Partial<
  Record<keyof WeatherData, FieldConfig>
>;
