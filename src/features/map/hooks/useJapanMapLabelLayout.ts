"use client";

import { useCallback, useState } from "react";
import {
  ADVANCED_NEAR_POINT_DISTANCE,
  DESKTOP_INITIAL_ZOOM,
  LABEL_COLLISION_PADDING,
  LABEL_POINT_CLEARANCE,
  LEADER_POINT_CLEARANCE,
  MOBILE_INITIAL_ZOOM,
} from "../constants";
import type {
  CandidateEvaluation,
  CandidatePlacement,
  LabelableResort,
  LabelLayout,
  MapPoint,
  MapPointEntry,
  MapProjection,
  Rect,
  Segment,
} from "../types";
import {
  createDenseFallbackCandidates,
  createExpandedLabelViewport,
  createPrimaryCandidates,
  createSimpleVerticalCandidates,
  distancePointToRect,
  distancePointToSegment,
  expandRect,
  getLeaderEndPoint,
  isRectInsideLabelViewport,
  rectContainsPoint,
  rectsOverlap,
  segmentIntersectsRect,
  segmentsIntersect,
} from "../utils/labelCollision";
import { measureLabelHeight } from "../utils/labelMeasure";
import {
  detectCrowdedPointIds,
  getResortLabelWidth,
  getResortPointLabelGap,
} from "../utils/resortLabels";
import {
  getResortPriority,
  getResortPriorityRank,
} from "../utils/resortMarkerPriority";

type UseJapanMapLabelLayoutParams = {
  resorts: LabelableResort[];
  displayNameById: Map<string, string>;
  filteredResortIdSet?: Set<string>;
  hoveredResortId: string | null;
  /** このズーム以上ではスキー場名ラベルを出さない（コース表示中） */
  hideLabelsMinZoom: number | null;
  interactionMode: "default" | "detail" | "compare";
  isFilterActive: boolean;
  isMobileMapZoom: boolean;
  labelAdvancedLayoutZoom: number;
  labelShowZoom: number;
  selectedCompareIdSet?: Set<string>;
  selectedResortId: string | null;
};

export const useJapanMapLabelLayout = ({
  resorts,
  displayNameById,
  filteredResortIdSet,
  hideLabelsMinZoom,
  hoveredResortId,
  interactionMode,
  isFilterActive,
  isMobileMapZoom,
  labelAdvancedLayoutZoom,
  labelShowZoom,
  selectedCompareIdSet,
  selectedResortId,
}: UseJapanMapLabelLayoutParams) => {
  const [labelLayouts, setLabelLayouts] = useState<Record<string, LabelLayout>>(
    {},
  );
  const initialZoom = isMobileMapZoom
    ? MOBILE_INITIAL_ZOOM
    : DESKTOP_INITIAL_ZOOM;
  const [mapZoom, setMapZoom] = useState(initialZoom);

  const updateLabelLayout = useCallback(
    (map: MapProjection) => {
      const currentZoom = map.getZoom();
      setMapZoom(currentZoom);

      // コース・リフトを表示しているズームではスキー場名ラベルを出さないので、
      // 重い衝突計算そのものを回避する（FR-1.2）
      if (hideLabelsMinZoom != null && currentZoom >= hideLabelsMinZoom) {
        setLabelLayouts(previousLayouts =>
          Object.keys(previousLayouts).length === 0 ? previousLayouts : {},
        );
        return;
      }
      const selectedResortIdSet =
        interactionMode === "compare"
          ? new Set(selectedCompareIdSet ?? [])
          : selectedResortId
            ? new Set([selectedResortId])
            : new Set<string>();
      if (hoveredResortId) {
        selectedResortIdSet.add(hoveredResortId);
      }
      const shouldShowLabelsBelowDefaultZoom = selectedResortIdSet.size > 0;

      if (currentZoom < labelShowZoom && !shouldShowLabelsBelowDefaultZoom) {
        setLabelLayouts(previousLayouts =>
          Object.keys(previousLayouts).length === 0 ? previousLayouts : {},
        );
        return;
      }

      const isSimpleVerticalLayout = currentZoom < labelAdvancedLayoutZoom;
      const useAdvancedLayout = currentZoom >= labelAdvancedLayoutZoom;

      const mapSize = map.getSize();
      const labelViewport = createExpandedLabelViewport(mapSize);
      const labelHeight = measureLabelHeight();
      const isInsideLabelViewport = (point: MapPoint) =>
        point.x >= labelViewport.left &&
        point.x <= labelViewport.right &&
        point.y >= labelViewport.top &&
        point.y <= labelViewport.bottom;

      const placedCollisionRects: Rect[] = [];
      const placedActualRects: Rect[] = [];
      const placedLeaderSegments: Segment[] = [];

      const visibleCandidates = resorts.filter(resort =>
        isInsideLabelViewport(map.project(resort.latitude, resort.longitude)),
      );
      const labelCandidates = visibleCandidates.filter(resort => {
        if (currentZoom < labelShowZoom) {
          return selectedResortIdSet.has(resort.id);
        }

        if (isFilterActive && currentZoom < labelAdvancedLayoutZoom) {
          return (
            selectedResortIdSet.has(resort.id) ||
            filteredResortIdSet?.has(resort.id) === true
          );
        }

        return true;
      });

      const sortedCandidates = labelCandidates.sort((a, b) => {
        const aPriority = getResortPriority({
          resortId: a.id,
          filteredResortIdSet,
          isFilterActive,
          selectedResortIdSet,
        });
        const bPriority = getResortPriority({
          resortId: b.id,
          filteredResortIdSet,
          isFilterActive,
          selectedResortIdSet,
        });
        const priorityDiff =
          getResortPriorityRank(bPriority) - getResortPriorityRank(aPriority);

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return b.numberOfCourses - a.numberOfCourses;
      });

      const pointById = new Map<string, MapPoint>(
        sortedCandidates.map(resort => [
          resort.id,
          map.project(resort.latitude, resort.longitude),
        ]),
      );

      const pointEntries: MapPointEntry[] = sortedCandidates
        .map(resort => {
          const point = pointById.get(resort.id);
          return point ? { id: resort.id, point } : null;
        })
        .filter((value): value is MapPointEntry => value !== null);

      const nextLayouts: Record<string, LabelLayout> = {};

      if (isSimpleVerticalLayout) {
        for (const resort of sortedCandidates) {
          const point = pointById.get(resort.id);
          if (!point) continue;

          const labelWidth = getResortLabelWidth(resort, displayNameById);
          const pointGap = getResortPointLabelGap(
            selectedResortIdSet.has(resort.id),
          );

          const candidates = createSimpleVerticalCandidates({
            point,
            labelWidth,
            labelHeight,
            pointGap,
          });

          let acceptedRect: Rect | undefined;
          let acceptedCollisionRect: Rect | undefined;

          for (const candidate of candidates) {
            const rect: Rect = {
              left: candidate.left,
              right: candidate.left + labelWidth,
              top: candidate.top,
              bottom: candidate.top + labelHeight,
            };

            const collisionRect = expandRect(rect, LABEL_COLLISION_PADDING);

            const inViewport = isRectInsideLabelViewport(
              collisionRect,
              labelViewport,
            );

            if (!inViewport) continue;

            const overlapsPlacedLabel = placedCollisionRects.some(placed =>
              rectsOverlap(collisionRect, placed),
            );
            if (overlapsPlacedLabel) continue;

            acceptedRect = rect;
            acceptedCollisionRect = collisionRect;
            break;
          }

          if (!acceptedRect || !acceptedCollisionRect) continue;

          placedCollisionRects.push(acceptedCollisionRect);
          placedActualRects.push(acceptedRect);

          const labelTopLeftLatLng = map.unproject(
            acceptedRect.left,
            acceptedRect.top,
          );

          nextLayouts[resort.id] = {
            labelPosition: [labelTopLeftLatLng.lat, labelTopLeftLatLng.lng],
            leaderEndPosition: [resort.latitude, resort.longitude],
            showLeaderLine: false,
            labelWidth,
            labelOffsetPx: {
              x: acceptedRect.left - point.x,
              y: acceptedRect.top - point.y,
            },
            leaderEndOffsetPx: { x: 0, y: 0 },
          };
        }

        setLabelLayouts(nextLayouts);
        return;
      }

      const crowdedPointIds = useAdvancedLayout
        ? detectCrowdedPointIds(pointEntries, ADVANCED_NEAR_POINT_DISTANCE)
        : new Set<string>();

      for (const resort of sortedCandidates) {
        const point = pointById.get(resort.id);
        if (!point) continue;

        const shouldForceLeaderLine =
          useAdvancedLayout && crowdedPointIds.has(resort.id);

        const labelWidth = getResortLabelWidth(resort, displayNameById);
        const pointGap = getResortPointLabelGap(
          selectedResortIdSet.has(resort.id),
        );

        const evaluateCandidates = (
          candidates: CandidatePlacement[],
          options: { allowLineCrossing: boolean },
        ): CandidateEvaluation | undefined => {
          let best: CandidateEvaluation | undefined;

          for (const candidate of candidates) {
            const rect: Rect = {
              left: candidate.left,
              right: candidate.left + labelWidth,
              top: candidate.top,
              bottom: candidate.top + labelHeight,
            };

            const collisionRect = expandRect(rect, LABEL_COLLISION_PADDING);

            const inViewport = isRectInsideLabelViewport(
              collisionRect,
              labelViewport,
            );

            if (!inViewport) continue;

            const overlapsPlacedLabel = placedCollisionRects.some(placed =>
              rectsOverlap(collisionRect, placed),
            );
            if (overlapsPlacedLabel) continue;

            const coversOtherPoint = pointEntries.some(
              ({ id, point: otherPoint }) =>
                id !== resort.id &&
                rectContainsPoint(rect, otherPoint, LABEL_POINT_CLEARANCE),
            );
            if (coversOtherPoint) continue;

            const overlapsOwnPoint =
              distancePointToRect(point, rect) < pointGap;
            if (overlapsOwnPoint) continue;

            const leaderEndPoint = getLeaderEndPoint(point, rect);
            const leaderSegment: Segment = {
              x1: point.x,
              y1: point.y,
              x2: leaderEndPoint.x,
              y2: leaderEndPoint.y,
            };

            const leaderLength = Math.hypot(
              leaderSegment.x2 - leaderSegment.x1,
              leaderSegment.y2 - leaderSegment.y1,
            );

            const showLeaderLine =
              useAdvancedLayout &&
              (candidate.forceLeaderLine ||
                shouldForceLeaderLine ||
                leaderLength > pointGap + 4);

            if (showLeaderLine) {
              const intersectsExistingLabel = placedActualRects.some(
                existingRect =>
                  segmentIntersectsRect(leaderSegment, existingRect),
              );
              if (intersectsExistingLabel) continue;

              const existingLineCrossesNewLabel = placedLeaderSegments.some(
                existingSegment => segmentIntersectsRect(existingSegment, rect),
              );
              if (existingLineCrossesNewLabel) continue;

              const intersectsOtherPoint = pointEntries.some(
                ({ id, point: otherPoint }) =>
                  id !== resort.id &&
                  distancePointToSegment(otherPoint, leaderSegment) <
                    LEADER_POINT_CLEARANCE,
              );
              if (intersectsOtherPoint) continue;

              if (!options.allowLineCrossing) {
                const crossesExistingLeader = placedLeaderSegments.some(
                  existingSegment =>
                    segmentsIntersect(existingSegment, leaderSegment),
                );
                if (crossesExistingLeader) continue;
              }
            }

            let score = leaderLength;
            if (showLeaderLine) score += 18;

            const nearestOtherPointDistance = pointEntries
              .filter(({ id }) => id !== resort.id)
              .reduce((minDistance, { point: otherPoint }) => {
                const distance = distancePointToRect(otherPoint, rect);
                return Math.min(minDistance, distance);
              }, Number.POSITIVE_INFINITY);

            if (nearestOtherPointDistance < 28) {
              score += (28 - nearestOtherPointDistance) * 3;
            }

            if (best === undefined || score < best.score) {
              best = {
                rect,
                collisionRect,
                leaderSegment,
                showLeaderLine,
                score,
              };
            }
          }

          return best;
        };

        const primaryCandidates = createPrimaryCandidates({
          point,
          labelWidth,
          labelHeight,
          mapSize,
          useAdvancedLayout,
          shouldForceLeaderLine,
          pointGap,
        });

        const denseFallbackCandidates = useAdvancedLayout
          ? createDenseFallbackCandidates({
              point,
              labelWidth,
              labelHeight,
              mapSize,
            })
          : [];

        const accepted =
          evaluateCandidates(primaryCandidates, { allowLineCrossing: false }) ??
          evaluateCandidates(denseFallbackCandidates, {
            allowLineCrossing: false,
          }) ??
          evaluateCandidates(denseFallbackCandidates, {
            allowLineCrossing: true,
          });

        if (!accepted) continue;

        placedCollisionRects.push(accepted.collisionRect);
        placedActualRects.push(accepted.rect);

        if (accepted.showLeaderLine) {
          placedLeaderSegments.push(accepted.leaderSegment);
        }

        const labelTopLeftLatLng = map.unproject(
          accepted.rect.left,
          accepted.rect.top,
        );
        const leaderEndLatLng = map.unproject(
          accepted.leaderSegment.x2,
          accepted.leaderSegment.y2,
        );

        nextLayouts[resort.id] = {
          labelPosition: [labelTopLeftLatLng.lat, labelTopLeftLatLng.lng],
          leaderEndPosition: [leaderEndLatLng.lat, leaderEndLatLng.lng],
          showLeaderLine: accepted.showLeaderLine,
          labelWidth,
          labelOffsetPx: {
            x: accepted.rect.left - point.x,
            y: accepted.rect.top - point.y,
          },
          leaderEndOffsetPx: {
            x: accepted.leaderSegment.x2 - point.x,
            y: accepted.leaderSegment.y2 - point.y,
          },
        };
      }

      setLabelLayouts(nextLayouts);
    },
    [
      displayNameById,
      filteredResortIdSet,
      hideLabelsMinZoom,
      interactionMode,
      isFilterActive,
      labelAdvancedLayoutZoom,
      labelShowZoom,
      resorts,
      selectedCompareIdSet,
      selectedResortId,
      hoveredResortId,
    ],
  );

  return { labelLayouts, mapZoom, updateLabelLayout };
};
