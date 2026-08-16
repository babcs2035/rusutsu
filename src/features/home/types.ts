import type { NullableSkiResortDetail } from "@/types/skiResorts";

export type MapViewSnapshot = {
  center: { lat: number; lng: number };
  zoom: number;
};

export type MapViewRestoreRequest = MapViewSnapshot & {
  key: number;
};

export type ReturnViewState = {
  isListSheetOpen: boolean;
  listSheetSnapPoint: number | string | null;
  listScrollTop: number;
  mapView: MapViewSnapshot | null;
};

export type MobileSearchReturnState = {
  mobileContentTab: "info" | "map";
  isListSheetOpen: boolean;
  listSheetSnapPoint: number | string | null;
  selectedResortId: string | null;
  selectedResortData: NullableSkiResortDetail | null;
  isCompareOpen: boolean;
};

export type VisualViewportState = {
  keyboardInset: number;
};
