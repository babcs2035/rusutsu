export type GeoCoordinate = [number, number] | [number, number, number];

export type FinalizedCourseFeature = {
  id: string;
  name: string;
  displayName: string;
  groupId: string;
  sectionName: string | null;
  coordinates: GeoCoordinate[];
  slopeDeg: number[] | null;
  properties: {
    name: string;
    level: string | null;
    piste: string | null;
    snowboard: string | null;
    status: string | null;
    update: string | null;
    latestNote: string | null;
    horizontalDistMap: number | null;
    slopeDistMap: number | null;
    elevationDiffMap: number | null;
    avgSlopeDegMap: number | null;
    maxSlopeDegMap: number | null;
    distance: number | null;
    avg: number | null;
    max: number | null;
    maxWidth: number | null;
    minWidth: number | null;
    note: string | null;
    image: string | null;
    searchWord: string | null;
    morning: string | null;
    night: string | null;
  };
};

export type ParsedCourseName = {
  displayName: string;
  groupName: string;
  sectionName: string | null;
};

const COURSE_SECTION_NAME_RE = /^(.+)_#?(上部|中部|下部)$/u;
const NAMELESS_COURSE_RE = /^無名_(.+)$/u;

export const getCourseDisplayName = (name: string): string => {
  const namelessMatch = NAMELESS_COURSE_RE.exec(name);
  if (!namelessMatch) return name;

  const suffix = namelessMatch[1]?.trim();
  if (!suffix) return "無名";
  return /^\d+$/u.test(suffix) ? "無名" : suffix;
};

export const parseFinalizedCourseName = (name: string): ParsedCourseName => {
  const sectionMatch = COURSE_SECTION_NAME_RE.exec(name);
  if (!sectionMatch) {
    return {
      displayName: getCourseDisplayName(name),
      groupName: name,
      sectionName: null,
    };
  }

  const baseName = sectionMatch[1] ?? name;
  return {
    displayName: getCourseDisplayName(baseName),
    groupName: baseName,
    sectionName: sectionMatch[2] ?? null,
  };
};

export type FinalizedLiftFeature = {
  id: string;
  name: string;
  coordinates: GeoCoordinate[];
  properties: {
    name: string;
    type: string | null;
    speed: string | null;
    hood: string | null;
    capacity: number | null;
    distance: number | null;
    vertical: number | null;
    top: number | null;
    bottom: number | null;
    footrest: string | null;
    towers: number | null;
    signal: string | null;
    oilShield: string | null;
    maker: string | null;
    year: number | null;
    note: string | null;
    status: string | null;
    update: string | null;
    latestNote: string | null;
    horizontalDistMap: number | null;
    slopeDistMap: number | null;
    elevationDiffMap: number | null;
    searchWord: string | null;
    link: string | null;
    morning: string | null;
    night: string | null;
  };
};

export type ResortMapSection<TFeature> = {
  /** 線を取ってきた場所 */
  source: "slope_10m" | "slope_before" | "lift_20m" | "lift_before";
  /** 基本情報を取ってきた場所 */
  baseSource:
    | "slope_before"
    | "slope_detail"
    | "lift_before"
    | "lift_detail"
    | "resorts.xlsx"
    | null;
  fileName: string;
  /** 公式サイトの出典（latest_data の courseUrl / liftUrl） */
  sourceUrls: string[];
  features: TFeature[];
};

export type FinalizedResortMapData = {
  courses: ResortMapSection<FinalizedCourseFeature> | null;
  lifts: ResortMapSection<FinalizedLiftFeature> | null;
};

export const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export type CourseDifficulty =
  | "beginner"
  | "beginnerIntermediate"
  | "intermediate"
  | "intermediateAdvanced"
  | "advanced"
  | "unknown";

export const COURSE_DIFFICULTY_META: Record<
  CourseDifficulty,
  { label: string; color: string }
> = {
  beginner: { label: "初級", color: "#22C55E" },
  beginnerIntermediate: { label: "初・中級", color: "#F2C94C" },
  intermediate: { label: "中級", color: "#E53935" },
  intermediateAdvanced: { label: "中・上級", color: "#B45309" },
  advanced: { label: "上級", color: "#222222" },
  unknown: { label: "不明", color: "#6B7280" },
};

export const getCourseDifficulty = (
  level: string | null | undefined,
): CourseDifficulty => {
  if (!level) return "unknown";

  const hasBeginner = level.includes("初");
  const hasIntermediate = level.includes("中");
  const hasAdvanced = level.includes("上");
  const count = [hasBeginner, hasIntermediate, hasAdvanced].filter(
    Boolean,
  ).length;

  if (count !== 1 && count !== 2) return "unknown";
  if (hasBeginner && hasIntermediate && !hasAdvanced) {
    return "beginnerIntermediate";
  }
  if (!hasBeginner && hasIntermediate && hasAdvanced) {
    return "intermediateAdvanced";
  }
  if (hasBeginner && !hasIntermediate && !hasAdvanced) return "beginner";
  if (!hasBeginner && hasIntermediate && !hasAdvanced) return "intermediate";
  if (!hasBeginner && !hasIntermediate && hasAdvanced) return "advanced";
  return "unknown";
};

export type PisteStyle = "solid" | "dash" | "dot";

export const getPisteStyle = (piste: string | null | undefined): PisteStyle => {
  if (!piste) return "solid";
  if (/[×✕✖]/u.test(piste)) return "dot";
  return "solid";
};

export const getStatusOpacity = (status: string | null | undefined) => {
  if (!status) return 0.75;
  if (/[○〇◯]/u.test(status)) return 1;
  if (/[△]/u.test(status)) return 0.6;
  if (/[×✕✖]/u.test(status)) return 0.25;
  return 0.75;
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map(value =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * 斜度の色。
 * 平坦〜登り返し（マイナス）は青系にして、「板を漕ぐ必要がある区間」だと
 * ひと目でわかるようにしている。実データの 1.6% はマイナス、6.9% は 3 度未満。
 */
export const SLOPE_COLOR_STOPS = [
  { slope: -12, color: "#1D4ED8" },
  { slope: -3, color: "#3B82F6" },
  { slope: 1, color: "#38BDF8" },
  { slope: 4, color: "#22C55E" },
  { slope: 8, color: "#84CC16" },
  { slope: 12, color: "#FACC15" },
  { slope: 16, color: "#F97316" },
  { slope: 18, color: "#EF4444" },
  { slope: 23, color: "#991B1B" },
  { slope: 27, color: "#581C87" },
  { slope: 35, color: "#3B0A45" },
  { slope: 40, color: "#222222" },
] as const;

export const SLOPE_MIN_DEG = -12;
export const SLOPE_MAX_DEG = 40;

export const getSlopeColor = (slope: number | null | undefined): string => {
  if (slope == null || !Number.isFinite(slope)) return "#6B7280";

  const clamped = Math.max(SLOPE_MIN_DEG, Math.min(SLOPE_MAX_DEG, slope));
  const upperIndex = SLOPE_COLOR_STOPS.findIndex(stop => clamped <= stop.slope);
  if (upperIndex <= 0) return SLOPE_COLOR_STOPS[0].color;

  const lower = SLOPE_COLOR_STOPS[upperIndex - 1];
  const upper = SLOPE_COLOR_STOPS[upperIndex];
  const ratio = (clamped - lower.slope) / (upper.slope - lower.slope);
  const lowerRgb = hexToRgb(lower.color);
  const upperRgb = hexToRgb(upper.color);

  return rgbToHex({
    r: lowerRgb.r + (upperRgb.r - lowerRgb.r) * ratio,
    g: lowerRgb.g + (upperRgb.g - lowerRgb.g) * ratio,
    b: lowerRgb.b + (upperRgb.b - lowerRgb.b) * ratio,
  });
};

export type CourseSlopeSegment = {
  courseId: string;
  index: number;
  coordinates: GeoCoordinate[];
  slope: number | null;
};

export const createCourseSlopeSegments = (
  course: FinalizedCourseFeature,
  pointStride = 1,
): CourseSlopeSegment[] => {
  const { coordinates, slopeDeg } = course;
  if (coordinates.length < 2) return [];
  const stride = Math.max(1, Math.floor(pointStride));

  const canUsePointSlopes =
    slopeDeg != null &&
    slopeDeg.length === coordinates.length &&
    slopeDeg.every(slope => Number.isFinite(slope));

  const segments: CourseSlopeSegment[] = [];
  for (let index = 0; index < coordinates.length - 1; index += stride) {
    const endIndex = Math.min(index + stride, coordinates.length - 1);
    const fallbackSlope = course.properties.avgSlopeDegMap;
    const slope =
      canUsePointSlopes && slopeDeg
        ? slopeDeg
            .slice(index, endIndex + 1)
            .reduce((sum, value) => sum + value, 0) /
          (endIndex - index + 1)
        : fallbackSlope;

    segments.push({
      courseId: course.id,
      index,
      coordinates: coordinates.slice(index, endIndex + 1),
      slope,
    });
  }

  return segments;
};

/**
 * 斜度モードの色分割数の上限。
 * ズームに応じて分割数を変えると、ズーム段ごとにパスを作り直すことになり
 * 描画がカクつくため、分割数はズームに依存させない（FR-1.4）。
 *
 * 上限が低いと、拡大しても色の段が粗いままになる（24 だと 1 コース 24 色まで）。
 * 元データは頂点ごとに slope_deg を持っているので、実質「頂点ごと」に色を
 * 分けられるところまで上げる。現データの最長コースは約 280 頂点、
 * 1 スキー場あたり全コース合計でも約 4,100 頂点しかない。
 * 分割の作り直しはデータか表示モードが変わったときだけで、ズームでは走らない。
 * WebGL 描画にとって数千本の線は負荷にならないため、上限は余裕を持たせる。
 */
export const COURSE_COLOR_SEGMENT_LIMIT = 512;

/**
 * 1 コースあたりのセグメント数に上限を設けた色分割。
 * 点数が少ないコースは間引かず、多いコースだけ間引く。
 */
export const createCourseColorSegments = (
  course: FinalizedCourseFeature,
  maxSegments = COURSE_COLOR_SEGMENT_LIMIT,
): CourseSlopeSegment[] => {
  const pointCount = course.coordinates.length;
  if (pointCount < 2) return [];

  const stride = Math.max(1, Math.ceil((pointCount - 1) / maxSegments));
  return createCourseSlopeSegments(course, stride);
};

/**
 * 標高が下がる向き（滑走方向）に座標列を正規化する。
 * 標高を持たないデータはそのまま返す。
 */
export const getDownhillCoordinates = (
  coordinates: GeoCoordinate[],
): GeoCoordinate[] => {
  const first = coordinates[0]?.[2];
  const last = coordinates[coordinates.length - 1]?.[2];
  if (typeof first !== "number" || typeof last !== "number") {
    return coordinates;
  }

  return first < last ? [...coordinates].reverse() : coordinates;
};

/** 標高差（m）。標高を持たない場合は null。 */
export const getCoordinatesElevationDrop = (
  coordinates: GeoCoordinate[],
): number | null => {
  const first = coordinates[0]?.[2];
  const last = coordinates[coordinates.length - 1]?.[2];
  if (typeof first !== "number" || typeof last !== "number") return null;

  return Math.abs(first - last);
};

export type LiftClass = "gondola" | "highSpeedQuad" | "quad" | "pair" | "other";

const GONDOLA_RE = /ゴンドラ|ロープウェイ|gondola|cabin/iu;

/** ラベル優先度と種別アイコンに使うリフト種別。 */
export const getLiftClass = (
  lift: Pick<FinalizedLiftFeature, "name" | "properties">,
): LiftClass => {
  const source = `${lift.name} ${lift.properties.type ?? ""}`;
  if (GONDOLA_RE.test(source)) return "gondola";

  const capacity = lift.properties.capacity ?? 0;
  const isHighSpeed = /高速|express|fast/iu.test(
    `${lift.properties.speed ?? ""} ${lift.name}`,
  );
  if (capacity >= 4) return isHighSpeed ? "highSpeedQuad" : "quad";
  if (capacity >= 2) return "pair";
  return "other";
};

export const LIFT_CLASS_LABEL_WEIGHT: Record<LiftClass, number> = {
  gondola: 1.6,
  highSpeedQuad: 1.4,
  quad: 1.25,
  pair: 1,
  other: 0.9,
};
