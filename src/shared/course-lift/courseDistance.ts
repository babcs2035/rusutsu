/**
 * コースの滑走距離（m）。詳細の「滑走距離」と、一覧の並び替えに使う保存済み集計の
 * 両方がこの計算を使い、同じスキー場で数字が食い違わないようにする。
 */

const isLength = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * 1本の線の長さ。標高を取得済みなら斜面距離、まだなら線の保存時に必ず計算される
 * 水平距離で代える（水平距離は斜面距離より数%短い）。どちらも無ければ null。
 */
export const courseLengthMeters = (
  slopeDistance: number | null | undefined,
  horizontalDistance: number | null | undefined,
) =>
  isLength(slopeDistance)
    ? slopeDistance
    : isLength(horizontalDistance)
      ? horizontalDistance
      : null;

/** ○・△は滑走できる区間として数える（地図の「営業中のみ」と同じ） */
const isSkiable = (status: string | null | undefined) =>
  Boolean(status && /[○〇◯△]/u.test(status));

export type CourseDistanceLine = {
  slopeDistance: number | null | undefined;
  horizontalDistance: number | null | undefined;
  status: string | null | undefined;
};

export type CourseDistanceSummary = {
  /** 全コースの合計（m） */
  total: number;
  /** ○・△のコースの合計（m）。営業状況の出典が無いときは null */
  open: number | null;
  /** 斜面距離が無く、水平距離で代えた線の本数 */
  fallbackLines: number;
  /** 斜面距離も水平距離も無く、合計に入らなかった線の本数 */
  missingLines: number;
};

export function summarizeCourseDistance(
  lines: readonly CourseDistanceLine[],
  hasStatusSource: boolean,
): CourseDistanceSummary | null {
  let total = 0;
  let open = 0;
  let fallbackLines = 0;
  let missingLines = 0;
  for (const line of lines) {
    const length = courseLengthMeters(
      line.slopeDistance,
      line.horizontalDistance,
    );
    if (length === null) {
      missingLines++;
      continue;
    }
    if (!isLength(line.slopeDistance)) fallbackLines++;
    total += length;
    if (isSkiable(line.status)) open += length;
  }
  if (total <= 0) return null;
  return {
    total: Math.round(total),
    open: hasStatusSource ? Math.round(open) : null,
    fallbackLines,
    missingLines,
  };
}
