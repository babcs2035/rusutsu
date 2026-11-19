import type { Resort } from "../types";

export type ResortElevationValues = {
  top: number;
  base: number;
  verticalDrop: number;
};

/**
 * 詳細に出す山頂・山麓の標高。標高差は同じ行で矛盾しないよう山頂−山麓から出す。
 * 値が無い・逆転しているときは出さない。
 */
export const resortElevationOf = (
  resort: Pick<Resort, "topElevation" | "baseElevation">,
): ResortElevationValues | null => {
  const top = resort.topElevation;
  const base = resort.baseElevation;
  if (!Number.isFinite(top) || !Number.isFinite(base)) return null;
  if (top <= 0 || base <= 0 || top <= base) return null;
  return { top, base, verticalDrop: top - base };
};

const meters = (value: number) => `${Math.round(value).toLocaleString()}m`;

/** 営業状況の上に添える1行。見出しは付けず、値とその意味だけを並べる。 */
export function ResortElevation({
  resort,
}: {
  resort: Pick<Resort, "topElevation" | "baseElevation">;
}) {
  const elevation = resortElevationOf(resort);
  if (!elevation) return null;
  return (
    <p className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-xs text-slate-500">
      <span>標高</span>
      <span className="text-sm font-semibold text-slate-800 tabular-nums">
        {meters(elevation.base)}〜{meters(elevation.top)}
      </span>
      <span className="ml-1.5">標高差</span>
      <span className="text-sm font-semibold text-slate-800 tabular-nums">
        {meters(elevation.verticalDrop)}
      </span>
    </p>
  );
}
