"use client";

import { Box, Grid, Text } from "@chakra-ui/react";
import type { PointerEvent } from "react";
import type { ElevationProfilePoint } from "../types";
import { formatMeters } from "../utils/detailMetrics";

export const ElevationProfile = ({
  points,
  showSlope,
  activeDistance = null,
  onPointSelect,
}: {
  points: ElevationProfilePoint[];
  showSlope: boolean;
  activeDistance?: number | null;
  onPointSelect?: (point: ElevationProfilePoint) => void;
}) => {
  if (points.length < 2) return null;

  const width = 420;
  const height = 132;
  const padding = 14;
  const maxDistance = Math.max(...points.map(point => point.distance));
  const minElevation = Math.min(...points.map(point => point.elevation));
  const maxElevation = Math.max(...points.map(point => point.elevation));
  const elevationRange = Math.max(1, maxElevation - minElevation);
  const toX = (distance: number) =>
    padding + (distance / Math.max(1, maxDistance)) * (width - padding * 2);
  const toY = (elevation: number) =>
    height -
    padding -
    ((elevation - minElevation) / elevationRange) * (height - padding * 2);
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${toX(point.distance).toFixed(1)} ${toY(
          point.elevation,
        ).toFixed(1)}`,
    )
    .join(" ");
  const activePoint =
    activeDistance == null
      ? null
      : points.reduce((nearest, point) =>
          Math.abs(point.distance - activeDistance) <
          Math.abs(nearest.distance - activeDistance)
            ? point
            : nearest,
        );
  const steepestPoint =
    showSlope && points.some(point => point.slope != null)
      ? points.reduce((best, point) =>
          (point.slope ?? -Infinity) > (best.slope ?? -Infinity) ? point : best,
        )
      : null;
  const handleProfilePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!onPointSelect) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.min(width - padding, Math.max(padding, pointerX));
    const targetDistance =
      ((clampedX - padding) / Math.max(1, width - padding * 2)) * maxDistance;
    const nearestPoint = points.reduce((nearest, point) =>
      Math.abs(point.distance - targetDistance) <
      Math.abs(nearest.distance - targetDistance)
        ? point
        : nearest,
    );

    onPointSelect(nearestPoint);
  };

  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      p={4}
    >
      <Text mb={2} fontSize="sm" fontWeight="900" color="gray.900">
        標高プロファイル
      </Text>
      <svg
        aria-label="標高プロファイル上の位置を選択"
        viewBox={`0 0 ${width} ${height}`}
        role={onPointSelect ? "button" : "img"}
        onPointerDown={handleProfilePointerDown}
        style={{
          cursor: onPointSelect ? "pointer" : "default",
          display: "block",
          touchAction: "manipulation",
          width: "100%",
        }}
      >
        <path
          d={`M${padding} ${height - padding}H${width - padding}`}
          stroke="#E5E7EB"
          strokeLinecap="round"
          strokeWidth={2}
        />
        <path
          d={path}
          fill="none"
          stroke="#2563EB"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
        />
        {activePoint && (
          <>
            <line
              x1={toX(activePoint.distance)}
              x2={toX(activePoint.distance)}
              y1={padding}
              y2={height - padding}
              stroke="#111827"
              strokeDasharray="3 4"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activePoint.distance)}
              cy={toY(activePoint.elevation)}
              r={5.5}
              fill="#FACC15"
              stroke="#111827"
              strokeWidth={2.5}
            />
            <text
              x={Math.min(width - padding - 28, toX(activePoint.distance) + 8)}
              y={Math.max(padding + 10, toY(activePoint.elevation) - 8)}
              fill="#111827"
              fontSize={13}
              fontWeight={900}
              paintOrder="stroke"
              stroke="#FFFFFF"
              strokeLinejoin="round"
              strokeWidth={4}
            >
              {activePoint.slope == null
                ? "--"
                : `${Math.round(activePoint.slope)}°`}
            </text>
          </>
        )}
      </svg>
      <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
        <Box>
          <Text color="gray.500" fontSize="xs" fontWeight="700">
            距離
          </Text>
          <Text fontWeight="900">{formatMeters(maxDistance)}</Text>
        </Box>
        <Box>
          <Text color="gray.500" fontSize="xs" fontWeight="700">
            標高差
          </Text>
          <Text fontWeight="900">
            {formatMeters(maxElevation - minElevation)}
          </Text>
        </Box>
        {steepestPoint && (
          <Box>
            <Text color="gray.500" fontSize="xs" fontWeight="700">
              最大付近
            </Text>
            <Text fontWeight="900">
              {Math.round(steepestPoint.slope ?? 0)}°
            </Text>
          </Box>
        )}
      </Grid>
    </Box>
  );
};
