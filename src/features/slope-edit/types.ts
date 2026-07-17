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
};

export type EditorCourse = {
  id: string;
  name: string;
  unnamed: boolean;
  coordinates: LngLat[];
  detail: CourseDetail;
  // slope_detail 由来の編集対象外フィールド（maxWidth, snowboard 等）を保持する
  detailExtras: Record<string, unknown> | null;
  splitGroupId: string | null;
  splitBaseName: string | null;
};

export type SlopeEditDraft = {
  version: 1;
  resortId: string;
  courses: EditorCourse[];
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
  nameEn: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  hasSlopeBefore: boolean;
};

export type EditStep = "select" | "lines" | "details";

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
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};
