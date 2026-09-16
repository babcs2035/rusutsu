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
