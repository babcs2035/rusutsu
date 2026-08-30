import { RESORT_POINT_RADIUS, SELECTED_MARKER_RING_WIDTH } from "../constants";
import type { LabelableResort, MapPointEntry } from "../types";
import { measureTextWidth } from "./labelMeasure";

export const getResortDisplayName = (
  resort: LabelableResort,
  displayNameById: Map<string, string>,
): string => displayNameById.get(resort.id) ?? resort.nameJa;

export const getResortLabelWidth = (
  resort: LabelableResort,
  displayNameById: Map<string, string>,
): number =>
  Math.max(measureTextWidth(getResortDisplayName(resort, displayNameById)), 1);

export const getResortPointLabelGap = (isSelected: boolean): number =>
  RESORT_POINT_RADIUS + (isSelected ? SELECTED_MARKER_RING_WIDTH : 0);

export const detectCrowdedPointIds = (
  pointEntries: MapPointEntry[],
  nearDistance: number,
): Set<string> => {
  const crowdedPointIds = new Set<string>();

  if (pointEntries.length <= 1) {
    return crowdedPointIds;
  }

  const cellSize = nearDistance;
  const grid = new Map<string, MapPointEntry[]>();

  const getCellKey = (cellX: number, cellY: number) => `${cellX}:${cellY}`;

  for (const entry of pointEntries) {
    const cellX = Math.floor(entry.point.x / cellSize);
    const cellY = Math.floor(entry.point.y / cellSize);

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const neighborKey = getCellKey(cellX + offsetX, cellY + offsetY);
        const neighborEntries = grid.get(neighborKey);
        if (!neighborEntries) {
          continue;
        }

        for (const other of neighborEntries) {
          const distance = Math.hypot(
            entry.point.x - other.point.x,
            entry.point.y - other.point.y,
          );

          if (distance <= nearDistance) {
            crowdedPointIds.add(entry.id);
            crowdedPointIds.add(other.id);
          }
        }
      }
    }

    const ownCellKey = getCellKey(cellX, cellY);
    const ownCellEntries = grid.get(ownCellKey);
    if (ownCellEntries) {
      ownCellEntries.push(entry);
    } else {
      grid.set(ownCellKey, [entry]);
    }
  }

  return crowdedPointIds;
};
