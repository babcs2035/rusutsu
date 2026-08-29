import type L from "leaflet";
import type {
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";

/** 画面上の座標（px）。地図ライブラリの Point 型に依存しないための最小の形 */
export type MapPoint = {
  x: number;
  y: number;
};

/**
 * 地図の投影だけを取り出したもの。
 * ラベル配置のロジックを地図ライブラリから切り離すために使う。
 */
export type MapProjection = {
  getZoom: () => number;
  getSize: () => MapPoint;
  /** 緯度経度 → 画面座標（px） */
  project: (latitude: number, longitude: number) => MapPoint;
  /** 画面座標（px） → 緯度経度 */
  unproject: (x: number, y: number) => { lat: number; lng: number };
};

/** 地図の表示範囲。地図ライブラリの Bounds 型に依存しないための最小の形 */
export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LabelLayout = {
  labelPosition: L.LatLngTuple;
  leaderEndPosition: L.LatLngTuple;
  showLeaderLine: boolean;
  labelWidth: number;
  /** 点からラベル左上までのずれ（px）。ラベルは点に貼り付けて置く */
  labelOffsetPx: {
    x: number;
    y: number;
  };
  /** 点から引き出し線の先端までのずれ（px） */
  leaderEndOffsetPx: {
    x: number;
    y: number;
  };
};

export type CandidatePlacement = {
  left: number;
  top: number;
  forceLeaderLine?: boolean;
};

export type CandidateEvaluation = {
  rect: Rect;
  collisionRect: Rect;
  leaderSegment: Segment;
  showLeaderLine: boolean;
  score: number;
};

export type MapPointEntry = {
  id: string;
  point: L.Point;
};

export type CourseColorMode = "difficulty" | "slope";
export type MapTileVariant = "pale" | "photo";
export type FinalizedFeatureStatus = "open" | "limited" | "closed" | "unknown";

export type SelectedMapFeature =
  | { kind: "course"; id: string }
  | { kind: "lift"; id: string };

export type ElevationProfileMapPoint = {
  courseGroupId: string;
  courseName: string;
  coordinate: GeoCoordinate;
  distance: number;
  elevation: number;
  slope: number | null;
};

export type FinalizedLineFeatureProperties = {
  id: string;
  kind: "course" | "lift";
  sourceId: string;
  name?: string;
  color: string;
  flowColor?: string;
  /** 営業状態（コース・リフト共通） */
  statusKind: FinalizedFeatureStatus;
  /** 非圧雪コースか（芯線を破線にする） */
  ungroomed: boolean;
  /** 斜度モードの色分割片か */
  segmented: boolean;
  flowSpeed?: "slow" | "normal" | "fast";
};

export type FinalizedLineFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: GeoCoordinate[];
  };
  properties: FinalizedLineFeatureProperties;
};

export type FinalizedLineFeatureCollection = {
  type: "FeatureCollection";
  features: FinalizedLineFeature[];
};

export type MapViewSnapshot = {
  center: { lat: number; lng: number };
  zoom: number;
};

export type MapViewRestoreRequest = MapViewSnapshot & {
  key: number;
};

export type JapanResortMapProps = {
  resorts: MapSkiResort[];
  filteredResortIdSet?: Set<string>;
  isFilterActive?: boolean;
  searchResultResortIds?: string[];
  searchViewportRequestKey?: number;
  searchViewportBottomPaddingRatio?: number;
  selectedResortId: string | null;
  selectedViewportBottomPaddingRatio?: number;
  hoveredResortId?: string | null;
  onSelectResort: (id: string) => void;
  interactionMode?: "default" | "detail" | "compare";
  selectedCompareIdSet?: Set<string>;
  onToggleCompare?: (id: string, selected: boolean) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  onViewChange?: (view: MapViewSnapshot) => void;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
  restoreViewRequest?: MapViewRestoreRequest | null;
  finalizedMapData?: FinalizedResortMapData | null;
  mapPresentation?: "default" | "preview" | "expanded";
  /**
   * 生成直後に描く位置。
   * 指定しないと日本全体から始まるので、1 スキー場だけを出す地図では
   * 白地図が一瞬見えてしまう。
   */
  initialViewport?: { center: [number, number]; zoom: number } | null;
  /**
   * コースマップ用ツールバー（色分け・タイル・営業中のみ・凡例）を出すか。
   * 高さの限られた地図では場所を取りすぎるので、呼び出し側で落とせるようにする。
   */
  showMapToolbar?: boolean;
  mapTileVariant?: MapTileVariant;
  onMapTileVariantChange?: (variant: MapTileVariant) => void;
  /**
   * コースの色分け・営業中のみ絞り込み。
   * 渡すと地図側の状態ではなく呼び出し側の状態を使う。
   * 比較のゲレンデ一覧のように、複数の地図へ同じ設定を効かせるときに渡す。
   */
  courseColorMode?: CourseColorMode;
  onCourseColorModeChange?: (mode: CourseColorMode) => void;
  showOpenOnly?: boolean;
  onShowOpenOnlyChange?: (showOpenOnly: boolean) => void;
  detailViewportMode?: "finalized" | "resort";
  /**
   * 値を変えるたびに詳細地図の表示範囲を初期状態（スキー場全体）へ戻す。
   * コース選択を解除して一覧へ戻るときに使う。
   */
  detailViewportResetKey?: number;
  selectedFinalizedFeature?: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange?: (
    feature: SelectedMapFeature | null,
  ) => void;
  selectedElevationProfilePoint?: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange?: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};
