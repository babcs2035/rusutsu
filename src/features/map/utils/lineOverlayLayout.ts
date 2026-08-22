/**
 * コース名・リフト名のラベルと、滑走／上り方向の矢羽をどこに置くかを決める。
 *
 * Leaflet と DOM に依存しない純関数だけを置く。呼び出し側が緯度経度を
 * レイヤーピクセルへ投影してから渡す。
 *
 * 配置は「線の長さ」と「ズーム」だけで決まり、地図をどこにパンしているかには
 * 依存しない（FR-3.3）。長い線には一定間隔でラベルと矢羽が並ぶため、
 * 拡大しても近くに必ず名前と方向がある。
 */

import type { FinalizedFeatureStatus } from "../types";
import {
  createProjectedLine,
  getLabelDistances,
  getPointAtDistance,
  getSpacedDistances,
  getTangentAngle,
  isPointInsideOrientedRect,
  type LayoutPoint,
  type OrientedRect,
  orientedRectsOverlap,
  refineAnchor,
} from "./lineLayout";

export type OverlayKind = "course" | "lift";

export type LabelSource = {
  kind: OverlayKind;
  /** 選択判定に使う id 群（同名のコースが複数フィーチャに分かれている） */
  sourceIds: string[];
  /** クリックで選択する代表 id */
  primaryId: string;
  name: string;
  status: FinalizedFeatureStatus;
  /** 種別の重み（リフトはゴンドラを優先） */
  weight: number;
  points: LayoutPoint[];
  isSelected: boolean;
  /** 「営業中のみ」表示で沈ませる対象か */
  isMuted: boolean;
};

export type LabelPlacement = {
  id: string;
  kind: OverlayKind;
  selectId: string;
  name: string;
  x: number;
  y: number;
  /** 度。group の回転角 */
  angle: number;
  isSelected: boolean;
  isMuted: boolean;
  fontSize: number;
  boxWidth: number;
  boxHeight: number;
};

export type LabelCandidate = {
  placement: LabelPlacement;
  rect: OrientedRect;
  score: number;
  order: number;
};

export type DirectionMark = {
  id: string;
  x: number;
  y: number;
  /** 度。矢羽が指す実際の進行方向（読みやすさのための折り返しはしない） */
  angle: number;
  scale: number;
  isSelected: boolean;
};

const COURSE_SECTION_SUFFIX_RE = /_#?(上部|中部|下部)$/u;
const COURSE_INDEX_SUFFIX_RE = /_\d+$/u;

export const STATUS_LABEL_WEIGHT: Record<FinalizedFeatureStatus, number> = {
  open: 1,
  limited: 0.8,
  closed: 0.55,
  unknown: 0.7,
};

export const getLabelFontSize = (zoom: number) => (zoom >= 16 ? 12 : 11);

export const getLabelFont = (fontSize: number) =>
  `900 ${fontSize}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif`;

export const getLabelCollisionPadding = (zoom: number) => {
  if (zoom >= 16) return 3;
  if (zoom >= 15) return 5;
  return 7;
};

/**
 * 表示用のラベル名。
 * 旧実装は `_` を含む名前をまるごと除外していたため、`ホワイトラバー_2` のような
 * コースには名前が出なかった（P5）。区間・連番の接尾辞だけを落として表示する。
 */
export const getCourseLabelName = (displayName: string) =>
  displayName
    .replace(COURSE_SECTION_SUFFIX_RE, "")
    .replace(COURSE_INDEX_SUFFIX_RE, "")
    .trim();

export const shouldSkipCourseLabel = (labelName: string) =>
  labelName.length === 0 || labelName.startsWith("無名");

export const collectLabelCandidates = ({
  sources,
  zoom,
  twoLabelMinLength,
  measureWidth,
}: {
  sources: LabelSource[];
  zoom: number;
  /** これ以上長い線だけ 2 箇所に名前を出す */
  twoLabelMinLength: number;
  measureWidth: (text: string, fontSize: number) => number;
}): LabelCandidate[] => {
  const fontSize = getLabelFontSize(zoom);
  const labelHeight = fontSize + 3;
  const candidates: LabelCandidate[] = [];

  for (const source of sources) {
    const line = createProjectedLine(source.points);
    if (!line) continue;

    const labelWidth = measureWidth(source.name, fontSize) + 2;
    if (line.length < labelWidth * 1.05) continue;

    const distances = getLabelDistances({
      length: line.length,
      labelWidth,
      twoLabelMinLength,
    });
    const score = source.isSelected
      ? Number.POSITIVE_INFINITY
      : line.length * STATUS_LABEL_WEIGHT[source.status] * source.weight;

    distances.forEach((distance, index) => {
      // 探索半径を狭くして、1/4・1/2・3/4 から大きくずれないようにする
      const anchor = refineAnchor({
        line,
        targetDistance: distance,
        span: labelWidth,
        searchRadius: Math.min(line.length * 0.06, 36),
      });
      // 文字は線の向きそのままに沿わせる。呼び出し側が山頂側を始点にした
      // 点列を渡すので、コースもリフトも山頂側から書き始まる。
      const angle = anchor.angle;
      const boxWidth = labelWidth;
      const boxHeight = labelHeight;

      candidates.push({
        score,
        order: index,
        placement: {
          id: `${source.kind}:${source.primaryId}:${index}`,
          kind: source.kind,
          selectId: source.primaryId,
          name: source.name,
          x: anchor.point.x,
          y: anchor.point.y,
          angle,
          isSelected: source.isSelected,
          isMuted: source.isMuted,
          fontSize,
          boxWidth,
          boxHeight,
        },
        // 回転を含んだ矩形。group の回転と同じ角度で判定する（FR-3.7）
        rect: {
          cx: anchor.point.x,
          cy: anchor.point.y,
          halfWidth: boxWidth / 2,
          halfHeight: boxHeight / 2,
          angle,
        },
      });
    });
  }

  return candidates;
};

/** 優先度の高い順に置いていき、重なるものを落とす（FR-3.8） */
export const placeLabelCandidates = (
  candidates: LabelCandidate[],
  placedRects: OrientedRect[],
  padding: number,
): LabelPlacement[] => {
  const sorted = [...candidates].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.order - b.order;
  });
  const placements: LabelPlacement[] = [];

  for (const candidate of sorted) {
    const rect: OrientedRect = {
      ...candidate.rect,
      halfWidth: candidate.rect.halfWidth + padding,
      halfHeight: candidate.rect.halfHeight + padding,
    };
    if (placedRects.some(placed => orientedRectsOverlap(rect, placed))) {
      continue;
    }

    placedRects.push(rect);
    placements.push(candidate.placement);
  }

  return placements;
};

/**
 * 進行方向の矢羽を線上に等間隔で置く（FR-4.2）。
 * ラベルの矩形と重なる位置は空ける。
 */
export const collectDirectionMarks = ({
  id,
  points,
  spacing,
  markLength,
  maxCount,
  avoidRects,
  isSelected,
  scale,
}: {
  id: string;
  points: LayoutPoint[];
  spacing: number;
  markLength: number;
  maxCount: number;
  avoidRects: OrientedRect[];
  isSelected: boolean;
  scale: number;
}): DirectionMark[] => {
  const line = createProjectedLine(points);
  if (!line) return [];
  if (line.length < markLength * 4) return [];

  const distances = getSpacedDistances({
    length: line.length,
    spacing,
    margin: markLength,
    maxCount,
  });

  return distances.flatMap((distance, index) => {
    const point = getPointAtDistance(line, distance);
    const isCovered = avoidRects.some(rect =>
      isPointInsideOrientedRect(point, rect, markLength * 0.6),
    );
    if (isCovered) return [];

    return [
      {
        id: `${id}:${index}`,
        x: point.x,
        y: point.y,
        angle: getTangentAngle(line, distance, Math.max(8, markLength)),
        scale,
        isSelected,
      },
    ];
  });
};

/** 矢羽のパス。単純な三角形より、切り欠きのある矢の方が向きが読める */
export const getDirectionMarkPath = (length: number, halfWidth: number) => {
  const tip = length * 0.5;
  const back = -length * 0.5;
  const notch = -length * 0.14;

  return [
    `M ${tip.toFixed(2)} 0`,
    `L ${back.toFixed(2)} ${(-halfWidth).toFixed(2)}`,
    `L ${notch.toFixed(2)} 0`,
    `L ${back.toFixed(2)} ${halfWidth.toFixed(2)}`,
    "Z",
  ].join(" ");
};
