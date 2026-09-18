import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import { haversineMeters } from "./detailMetrics";

/** 3D線分長で加重する。標高欠損の区間は分母にも含めない。 */
export function slopeDistribution(courses: FinalizedCourseFeature[]) {
  const bins = Array.from({ length: 18 }, (_, index) => ({
    label: `${index * 5}–${(index + 1) * 5}°`,
    distance: 0,
  }));
  let omitted = 0;
  for (const course of courses) {
    for (let i = 1; i < course.coordinates.length; i++) {
      const a = course.coordinates[i - 1];
      const b = course.coordinates[i];
      if (!Number.isFinite(a[2]) || !Number.isFinite(b[2])) {
        omitted++;
        continue;
      }
      const horizontal = haversineMeters(a, b);
      const vertical = Math.abs((b[2] as number) - (a[2] as number));
      const distance = Math.hypot(horizontal, vertical);
      if (distance <= 0) continue;
      const slope = (Math.atan2(vertical, horizontal) * 180) / Math.PI;
      bins[Math.min(17, Math.floor(slope / 5))].distance += distance;
    }
  }
  const total = bins.reduce((sum, bin) => sum + bin.distance, 0);
  return {
    bins: bins.map(bin => ({
      ...bin,
      percent: total ? (bin.distance / total) * 100 : 0,
    })),
    total,
    omitted,
  };
}
export function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  return {
    total: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
    missing: values.length - known.length,
  };
}

/**
 * 帯グラフ用の斜度区分。
 * 5°刻みのままだと 20°以上が細切れになって潰れ、色も読み取れないので、
 * 両端をまとめた 7 区分（5°以下／5°刻み／30°以上）にそろえる。
 */
export const SLOPE_DISPLAY_BINS = [
  { label: "5°以下", from: 0, to: 5, sample: 2.5 },
  { label: "5–10°", from: 5, to: 10, sample: 7.5 },
  { label: "10–15°", from: 10, to: 15, sample: 12.5 },
  { label: "15–20°", from: 15, to: 20, sample: 17.5 },
  { label: "20–25°", from: 20, to: 25, sample: 22.5 },
  { label: "25–30°", from: 25, to: 30, sample: 27.5 },
  { label: "30°以上", from: 30, to: 90, sample: 33 },
] as const;

/** slopeDistribution の 5°刻みビンを、表示用の 7 区分へまとめる。 */
export function groupSlopeBins(bins: Array<{ percent: number }>) {
  return SLOPE_DISPLAY_BINS.map(bin => ({
    label: bin.label,
    sample: bin.sample,
    percent: bins
      .slice(bin.from / 5, bin.to / 5)
      .reduce((sum, item) => sum + item.percent, 0),
  }));
}
