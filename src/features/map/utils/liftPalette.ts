import type { FinalizedFeatureStatus } from "../types";

/** 地図と凡例で共有する、営業状態別の地色と流れる色。 */
export const LIFT_PALETTE: Record<
  FinalizedFeatureStatus,
  { color: string; flowColor: string }
> = {
  open: { color: "#1E40AF", flowColor: "#00E1FF" },
  limited: { color: "#B91C1C", flowColor: "#FECACA" },
  closed: { color: "#64748B", flowColor: "#FFFFFF" },
  unknown: { color: "#7C3AED", flowColor: "#EDE9FE" },
};
