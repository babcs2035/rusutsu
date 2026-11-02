import {
  COURSE_DIFFICULTY_META,
  type CourseDifficulty,
  type FinalizedCourseFeature,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import type { FinalizedCourseGroup } from "../types";
import {
  getMainCourseGroup,
  haversineMeters,
  normalizeIconSymbol,
  type StatusSymbol,
} from "./detailMetrics";

export type SectionSymbol = { label: string; symbol: StatusSymbol | null };
export type CourseSymbolField = "status" | "piste" | "morning" | "night";

const positionLabel = (index: number, count: number) =>
  index === 0
    ? "上部"
    : index === count - 1
      ? "下部"
      : count === 3
        ? "中部"
        : `中${index}`;

/** 各区間の情報を残し、全区間が同じ値のときだけ1つの記号にまとめる。 */
export function courseSectionSymbols(
  group: FinalizedCourseGroup,
  field: CourseSymbolField,
): SectionSymbol[] {
  const courses = getMainCourseGroup(group).courses;
  const sections = courses.flatMap<SectionSymbol>(course => {
    const symbol = normalizeIconSymbol(course.properties[field]);
    const segments =
      field === "status" ? null : course.properties[`${field}Segments`];
    if (!segments?.length) return [{ label: course.sectionName ?? "", symbol }];
    // 区間設定のない隙間には元の値を使い、途中の状態を落とさない。
    const values: SectionSymbol[] = [];
    let end = 0;
    for (const segment of segments) {
      if (segment.from > end) values.push({ label: "", symbol });
      values.push({ label: "", symbol: segment.value });
      end = segment.to;
    }
    if (end < 1) values.push({ label: "", symbol });
    return (course.coordinates[0]?.[2] ?? 0) <
      (course.coordinates.at(-1)?.[2] ?? 0)
      ? values.reverse()
      : values;
  });
  if (!sections.length) return [{ label: "", symbol: null }];
  // ○○×のように変化が一度だけなら上部○・下部×にまとめる。
  // ○×○は3つとも残し、不明な区間をまたいで結合しない。
  const runs = sections.filter(
    (section, index) =>
      index === 0 || section.symbol !== sections[index - 1].symbol,
  );
  if (runs.length === 1) return [{ label: "", symbol: runs[0].symbol }];
  return runs.map((section, index) => ({
    symbol: section.symbol,
    label: positionLabel(index, runs.length),
  }));
}

const courseDistance = (course: FinalizedCourseFeature) => {
  const declared = course.properties.slopeDistMap ?? course.properties.distance;
  if (declared != null && Number.isFinite(declared) && declared > 0)
    return declared;
  return course.coordinates.slice(1).reduce((sum, point, index) => {
    const before = course.coordinates[index];
    const vertical =
      before[2] != null && point[2] != null ? point[2] - before[2] : 0;
    return sum + Math.hypot(haversineMeters(before, point), vertical);
  }, 0);
};

/** メインルートの滑走距離に応じた難易度の帯。順序も上部→下部に保つ。 */
export function courseDifficultyBands(group: FinalizedCourseGroup) {
  const courses = getMainCourseGroup(group).courses;
  const lengths = courses.map(courseDistance);
  const total = lengths.reduce((sum, value) => sum + value, 0);
  return courses.map((course, index) => ({
    difficulty: getCourseDifficulty(course.properties.level),
    fraction: total > 0 ? lengths[index] / total : 1 / courses.length,
  }));
}

export function courseNameBackground(
  bands: Array<{ difficulty: CourseDifficulty; fraction: number }>,
) {
  let offset = 0;
  const stops = bands.map(band => {
    const from = offset;
    offset += band.fraction * 100;
    const color = `color-mix(in srgb, ${COURSE_DIFFICULTY_META[band.difficulty].color} 16%, white)`;
    return `${color} ${from}% ${offset}%`;
  });
  return stops.length
    ? `linear-gradient(to right, ${stops.join(", ")})`
    : "white";
}
