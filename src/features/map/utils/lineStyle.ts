/**
 * コース・リフトの線のスタイル決定（R2 / R5）。
 *
 * Leaflet を型としてだけ参照し、実行時依存を持たない純関数に閉じている。
 * ここが返すのは属性値だけで、DOM やパスは作り直さない（FR-1.1）。
 */

import type L from "leaflet";
import type {
  CourseColorMode,
  FinalizedFeatureStatus,
  FinalizedLineFeature,
  MapTileVariant,
  SelectedMapFeature,
} from "../types";

export type MapLineKind = "course" | "lift";

export type LayerVariant = "casing" | "line" | "flow" | "hit";

export type FinalizedPathOptions = L.PathOptions & {};

export type LineStyleContext = {
  zoom: number;
  courseColorMode: CourseColorMode;
  mapTileVariant: MapTileVariant;
  isFocusMode: boolean;
  showOpenOnly: boolean;
  selectedFeature: SelectedMapFeature | null;
};

export const DIMMED_LINE_COLOR = "#94A3B8";
export const LINE_PATH_CLASS = "finalized-line-path";

/** 「営業中のみ」で沈ませるときの不透明度（線・ラベル・矢羽で共通） */
export const MUTED_LINE_OPACITY = 0.2;

/**
 * ズーム別の線幅テーブル（CSS px）。難易度モードと斜度モードは同じ太さ。
 */
const MAP_LINE_WIDTH_STOPS: Record<MapLineKind, Record<number, number>> = {
  course: { 12: 2.0, 13: 2.4, 14: 3.0, 15: 3.6, 16: 4.4, 17: 5.2, 18: 6.0 },
  lift: { 12: 1.8, 13: 2.1, 14: 2.4, 15: 2.8, 16: 3.2, 17: 3.6, 18: 4.0 },
};

const MIN_LINE_WIDTH_ZOOM = 12;
const MAX_LINE_WIDTH_ZOOM = 18;

export const getMapLineWidth = (zoom: number, kind: MapLineKind): number => {
  const stops = MAP_LINE_WIDTH_STOPS[kind];
  const clamped = Math.max(
    MIN_LINE_WIDTH_ZOOM,
    Math.min(MAX_LINE_WIDTH_ZOOM, zoom),
  );
  const lower = Math.floor(clamped);
  const upper = Math.min(MAX_LINE_WIDTH_ZOOM, lower + 1);
  const lowerWidth = stops[lower] ?? stops[MIN_LINE_WIDTH_ZOOM] ?? 1;
  const upperWidth = stops[upper] ?? lowerWidth;

  return lowerWidth + (upperWidth - lowerWidth) * (clamped - lower);
};

/**
 * 白ケーシングは線幅に比例させる（FR-2.2）。
 * 固定 +3.4px だと低ズームで白が線の 4 倍以上になり「白い紐」に見えていた。
 */
export const getMapCasingWidth = (lineWidth: number, isPhotoTile: boolean) => {
  const extra = Math.max(1, Math.min(1.8, lineWidth * 0.55 + 0.5));
  return lineWidth + extra + (isPhotoTile ? 0.4 : 0);
};

/** リフトのフロー（流れる破線）の幅。ベース線より細くして縁を残す */
export const getLiftFlowWidth = (liftLineWidth: number) =>
  Math.max(1.1, liftLineWidth * 0.62);

/** 流れる破線を持つのは運行中のリフトだけ */
export const hasLiftFlow = (status: FinalizedFeatureStatus) =>
  status === "open";

/** 待機中のリフトは赤く点滅させて、運行中とはっきり区別する */
export const hasLiftBlink = (status: FinalizedFeatureStatus) =>
  status === "limited";

export const LIFT_BLINK_CLASS = "finalized-lift-blink";

export const getLiftFlowDashLength = (zoom: number) => {
  const zoomScale = 1.3 ** Math.max(0, zoom - 11);
  return Number((6 * zoomScale).toFixed(2));
};

/**
 * 非圧雪の芯線パターン（FR-5.2 / Q2）。
 * 水色のアンダーレイは総幅が変わって斜度の色帯が読めなくなるため、
 * 総幅を変えない「芯線を破線にする」方式にした。
 */
export const getUngroomedDashArray = (lineWidth: number) => {
  // 斜度モードはコースを 24 片に分けて描くため、縮小時は 1 片が数 px しかない。
  // 線幅に比例させると 1 片がまるごと 1 つの破線になり実線に見えてしまうので、
  // 周期に上限を設けて、どのズームでも点線として読めるようにする。
  const dash = Math.min(4.5, Math.max(3, lineWidth * 1.1));
  const gap = Math.min(3.5, Math.max(2.5, lineWidth * 0.8));
  return `${dash.toFixed(1)} ${gap.toFixed(1)}`;
};

export const getLineKind = (featureKind: "course" | "lift"): MapLineKind =>
  featureKind;

const HIDDEN_PATH_OPTIONS: FinalizedPathOptions = {
  opacity: 0,
  weight: 0,
  dashArray: undefined,
};

export const getLineStyle = ({
  feature,
  featureKind,
  variant,
  hitWeight,
  context,
}: {
  feature: FinalizedLineFeature;
  featureKind: "course" | "lift";
  variant: LayerVariant;
  hitWeight: number;
  context: LineStyleContext;
}): FinalizedPathOptions => {
  const properties = feature.properties;
  const { selectedFeature } = context;
  const isSelected =
    selectedFeature?.kind === properties.kind &&
    selectedFeature.id === properties.sourceId;
  const isDimmed = selectedFeature !== null && !isSelected;
  const status = properties.statusKind;
  const isOpen = status === "open";
  const isPhotoTile = context.mapTileVariant === "photo";
  // 通常表示では営業状態で見た目を変えない。「営業中のみ」を入れたときだけ、
  // 営業中を濃く太く、それ以外をはっきり薄くしてコントラストをつける。
  const isMutedByOpenOnly = context.showOpenOnly && !isOpen && !isSelected;
  const isEmphasized = context.showOpenOnly && isOpen;

  if (variant === "hit") {
    return { color: "#000000", opacity: 0, weight: hitWeight };
  }

  const baseWidth = getMapLineWidth(context.zoom, getLineKind(featureKind));
  const focusBoost = context.isFocusMode ? 0.3 : 0;
  const lineWidth =
    (isMutedByOpenOnly ? baseWidth * 0.6 : baseWidth) +
    (isEmphasized ? 0.3 : 0) +
    focusBoost +
    (isSelected ? 1.6 : 0);

  if (variant === "flow") {
    // Leaflet は className をパス生成時にしか適用しないので、
    // 非表示のときも同じ className を返しておく（後から表示に変わっても効くように）
    const flowClassName = `finalized-lift-flow finalized-lift-flow-${properties.flowSpeed ?? "normal"}`;
    if (
      featureKind !== "lift" ||
      !hasLiftFlow(status) ||
      isDimmed ||
      isMutedByOpenOnly
    ) {
      return { ...HIDDEN_PATH_OPTIONS, className: flowClassName };
    }

    const dashLength = getLiftFlowDashLength(context.zoom);
    return {
      color: properties.flowColor ?? "#FFFFFF",
      opacity: 0.95,
      weight: getLiftFlowWidth(lineWidth),
      dashArray: `${dashLength} ${dashLength}`,
      lineCap: "butt",
      lineJoin: "round",
      className: flowClassName,
    };
  }

  if (variant === "casing") {
    // 沈ませる線はケーシングを外す。白い縁が残ると「薄いのに目立つ」ままになる
    if (isMutedByOpenOnly) return HIDDEN_PATH_OPTIONS;

    const casingOpacity = isDimmed ? 0.12 : isPhotoTile ? 0.74 : 0.56;

    return {
      color: "#FFFFFF",
      opacity: casingOpacity,
      weight: getMapCasingWidth(lineWidth, isPhotoTile),
      dashArray: undefined,
      lineCap: "round",
      lineJoin: "round",
      className: LINE_PATH_CLASS,
    };
  }

  // 色（難易度・斜度）は状態に関わらず保つ。営業していないことは
  // 不透明度と太さ、ケーシングの有無で示す。
  const color = isDimmed ? DIMMED_LINE_COLOR : properties.color;
  const opacity = (() => {
    if (isDimmed) return 0.4;
    if (isSelected) return 1;
    if (isMutedByOpenOnly) return MUTED_LINE_OPACITY;
    return 1;
  })();

  const shouldBlink =
    featureKind === "lift" &&
    hasLiftBlink(status) &&
    !isDimmed &&
    !isMutedByOpenOnly;

  return {
    color,
    opacity,
    weight: lineWidth,
    // 非圧雪は総幅を変えずに芯線を破線にする。
    // ただし選択中は形をはっきり見せたいので実線に戻す。
    dashArray:
      properties.ungroomed && !isDimmed && !isSelected
        ? getUngroomedDashArray(lineWidth)
        : undefined,
    lineCap: properties.ungroomed && !isSelected ? "butt" : "round",
    lineJoin: "round",
    className: shouldBlink
      ? `${LINE_PATH_CLASS} ${LIFT_BLINK_CLASS}`
      : LINE_PATH_CLASS,
  };
};
