export type LngLat = [number, number];

export type SlopeSourceKind = "curated" | "osm";

export type PisteMark = "○" | "△" | "×" | "";
export type BinaryMark = "○" | "×" | "";

export type CourseDetail = {
  level: string;
  distance: string;
  avg: string;
  max: string;
  piste: PisteMark;
  morning: BinaryMark;
  night: BinaryMark;
  image: string;
  searchWord: string;
};

export type EditorCourse = {
  id: string;
  // 現在の所属スキー場。OSM の距離割当が誤っている場合に管理画面で変更する。
  skiId: string;
  // 読み込み時点の所属スキー場。変更表示・元に戻す操作に使う。
  originalSkiId: string;
  name: string;
  unnamed: boolean;
  coordinates: LngLat[];
  detail: CourseDetail;
  // slope_before 由来の、詳細編集対象以外の properties を保持する
  beforeExtras: Record<string, unknown>;
  // slope_detail 由来の編集対象外フィールド（maxWidth, snowboard 等）を保持する
  detailExtras: Record<string, unknown> | null;
  splitGroupId: string | null;
  splitBaseName: string | null;
};

export type SlopeEditDraft = {
  version: 1;
  resortId: string;
  sourceKind?: SlopeSourceKind;
  fileHash: string | null;
  detailFileHash: string | null;
  courses: EditorCourse[];
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
  updatedAt: string;
  exportedAt: string | null;
};

export type DraftSummary = {
  resortId: string;
  sourceKind: SlopeSourceKind;
  updatedAt: string;
  courseCount: number;
};

export type ResortOption = {
  id: string;
  nameJa: string;
  // 検索ワードの先頭に使う名前（地図表示用の省略名を優先）
  searchName: string;
  // 地図のラベルに出す名前。一覧地図と同じ省略名にそろえる
  labelName: string;
  nameEn: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  // ラベルの置き場所を取る優先度。一覧地図と同じ基準にそろえる
  numberOfCourses: number;
  hasSlopeBefore: boolean;
  hasSlopeBeforeOsm: boolean;
  // クローラーがこのスキー場のコース営業情報を実際に取得できているか。
  // クローラー自体があっても、コースを取れていなければ false。
  hasCrawlerCourses: boolean;
};

export type EditStep = "select" | "assign" | "lines" | "details" | "confirm";

export type StartSource =
  | "draft-curated"
  | "draft-osm"
  | "curated"
  | "osm"
  | "new";

export type TileLayerId =
  | "gsiPale"
  | "gsiPhoto"
  | "osm"
  | "googleSatellite"
  | "googleHybrid";

export type SlopeBeforeFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

export type SlopeBeforeGeojson = {
  type: "FeatureCollection";
  features: SlopeBeforeFeature[];
};

export type SlopeDetailEntry = Record<string, unknown> & {
  resort?: string;
  name?: string;
};

export type SlopeSourceData = {
  sourceKind: SlopeSourceKind;
  geojson: SlopeBeforeGeojson | null;
  details: SlopeDetailEntry[] | null;
  fileHash: string | null;
  detailFileHash: string | null;
};

export type SaveCoursePayload = {
  targetSkiId: string;
  properties: Record<string, unknown>;
  coordinates: LngLat[];
  detail: Record<string, unknown>;
};

export type SaveRequest = {
  resortId: string;
  sourceKind: SlopeSourceKind;
  fileHash: string | null;
  detailFileHash: string | null;
  courses: SaveCoursePayload[];
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
};

export type SaveResult =
  | { ok: true; writtenFiles: string[] }
  | { ok: false; errors: string[] };

export type ApplySlopeFeatureOrderRequest = {
  resortId: string;
  sourceKind: SlopeSourceKind;
  fileHash: string | null;
  orderedGeojsonNames: string[];
};

export type ApplySlopeFeatureOrderResult =
  | { ok: true; fileHash: string; writtenFile: string }
  | { ok: false; errors: string[] };

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};
