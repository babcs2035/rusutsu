import type L from "leaflet";
import type {
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";

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
  opacity: number;
  pisteStyle?: "solid" | "dash" | "dot";
  pisteStatus?: FinalizedFeatureStatus;
  segmented?: boolean;
  statusKind: FinalizedFeatureStatus;
  liftStatus?: FinalizedFeatureStatus;
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
  mapControlBottomPaddingRatio?: number;
  selectedResortId: string | null;
  selectedViewportBottomPaddingRatio?: number;
  hoveredResortId?: string | null;
  onSelectResort: (id: string) => void;
  interactionMode?: "default" | "detail" | "compare";
  selectedCompareIdSet?: Set<string>;
  onToggleCompare?: (id: string, selected: boolean) => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  onViewChange?: (view: MapViewSnapshot) => void;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
  restoreViewRequest?: MapViewRestoreRequest | null;
  finalizedMapData?: FinalizedResortMapData | null;
  mapPresentation?: "default" | "preview" | "expanded";
  detailViewportMode?: "finalized" | "resort";
  selectedFinalizedFeature?: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange?: (
    feature: SelectedMapFeature | null,
  ) => void;
  selectedElevationProfilePoint?: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange?: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};
