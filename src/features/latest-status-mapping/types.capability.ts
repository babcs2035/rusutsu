/**
 * 冬季に何が取得できるかを記録する台帳。
 *
 * 対応表（latest_status_mapping）が「クローラー名とGeoJSON名を結ぶ辺」を持つのに対し、
 * こちらは「そのスキー場でクローラーが取得できる項目そのもの」を持つ。GeoJSONの有無に
 * 依存しないので、地図データがないスキー場でも作成できる。
 *
 * オフシーズンの実装・監査の基準になり、営業期間中に「取れるはずの項目が取れていない」
 * 欠損警告の判定にも使う。値そのものは保存しない。
 */

export type CapabilityOperationKind = "courses" | "lifts";

/** Course / Lift のどのフィールドが営業期間中に埋まるか。 */
export type CapabilityOperationFields = {
  name: boolean;
  status: boolean;
  update: boolean;
  note: boolean;
};

export type CapabilityOperationSection = {
  /** false は「公式ページにこのカテゴリが存在しない」。未調査は台帳に載せない。 */
  available: boolean;
  /** 冬季に列挙された件数。 */
  count: number;
  fields: CapabilityOperationFields;
  /** 冬季に列挙された名前。対応表の初期値と固定在庫の根拠に使う。 */
  names: string[];
  /** 冬季に実際に現れた状態記号。未知値判定の基準に使う。 */
  statuses: string[];
};

/** WeatherData の 7 フィールドと同じキー。 */
export type CapabilityWeatherFields = {
  update: boolean;
  weather: boolean;
  temperature: boolean;
  snowDepth: boolean;
  snowfall: boolean;
  condition: boolean;
  windSpeed: boolean;
};

export type CapabilityConditionsSection = {
  /** 専用コメント欄から本文を取得できるか。 */
  comment: boolean;
  /** お知らせ・ニュース一覧への参照リンクがあるか。 */
  news: boolean;
  /** 観測地点名（山頂・山麓など）。 */
  points: string[];
  fields: CapabilityWeatherFields;
};

export type CapabilitySource = {
  mode: "LIVE" | "WAYBACK_VALIDATION";
  /** Wayback のタイムスタンプ（YYYYMMDD または YYYYMMDDhhmmss）。 */
  archiveTimestamp: string | null;
  urls: string[];
};

export type LatestStatusCapabilityFile = {
  version: 1;
  resortId: string;
  source: CapabilitySource;
  /** 台帳を作った時刻。 */
  observedAt: string;
  /** 台帳を作ったときのクローラーファイルの sha256。変わったら作り直す。 */
  crawlerSourceHash: string | null;
  courses: CapabilityOperationSection;
  lifts: CapabilityOperationSection;
  conditions: CapabilityConditionsSection;
};

export const CAPABILITY_WEATHER_KEYS = [
  "update",
  "weather",
  "temperature",
  "snowDepth",
  "snowfall",
  "condition",
  "windSpeed",
] as const satisfies readonly (keyof CapabilityWeatherFields)[];

export const CAPABILITY_OPERATION_KEYS = [
  "name",
  "status",
  "update",
  "note",
] as const satisfies readonly (keyof CapabilityOperationFields)[];
