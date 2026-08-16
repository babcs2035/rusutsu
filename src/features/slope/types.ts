export type LngLat = [number, number];

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
  updatedAt: string;
  courseCount: number;
};

export type ResortOption = {
  id: string;
  nameJa: string;
  // 検索ワードの先頭に使う名前（地図表示用の省略名を優先）
  searchName: string;
  nameEn: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  hasSlopeBefore: boolean;
};

export type EditStep = "select" | "lines" | "details" | "confirm";

export type StartSource = "draft" | "existing" | "new";

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
  geojson: SlopeBeforeGeojson | null;
  details: SlopeDetailEntry[] | null;
  fileHash: string | null;
  detailFileHash: string | null;
};

export type SaveCoursePayload = {
  properties: Record<string, unknown>;
  coordinates: LngLat[];
  detail: Record<string, unknown>;
};

export type SaveRequest = {
  resortId: string;
  fileHash: string | null;
  detailFileHash: string | null;
  courses: SaveCoursePayload[];
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
};

export type SaveResult =
  | { ok: true; writtenFiles: string[] }
  | { ok: false; errors: string[] };

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};
