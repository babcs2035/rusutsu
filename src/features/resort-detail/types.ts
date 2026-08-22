import type {
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import type { SkiResortDetail } from "@/types/skiResorts";

export type Resort = SkiResortDetail;

export type FinalizedCourseGroup = {
  id: string;
  displayName: string;
  courses: NonNullable<FinalizedResortMapData["courses"]>["features"];
};

export type ElevationProfilePoint = {
  distance: number;
  elevation: number;
  slope: number | null;
  coordinate: GeoCoordinate;
  /** その区間の営業状況。断面図で開いている区間と閉じている区間を塗り分ける */
  status?: "○" | "△" | "×" | null;
};
