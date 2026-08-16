"use client";

import { type PointerEvent, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ElevationProfilePoint } from "../types";

export const ElevationProfile = ({
  points,
  activeDistance = null,
  onPointSelect,
}: {
  points: ElevationProfilePoint[];
  activeDistance?: number | null;
  onPointSelect?: (point: ElevationProfilePoint) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);

  if (points.length < 2) return null;

  const width = 900;
  const height = 300;
  const chartLeft = 68;
  const chartRight = width - 42;
  const chartTop = 24;
  const chartBottom = height - 60;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const maxDistance = Math.max(...points.map(point => point.distance));
  const minElevation = Math.min(...points.map(point => point.elevation));
  const maxElevation = Math.max(...points.map(point => point.elevation));
  const axisElevationOffset = Math.min(
    40,
    Math.max(12, (maxElevation - minElevation) * 0.08),
  );
  const bottomAxisElevation = minElevation - axisElevationOffset;
  const elevationRange = Math.max(1, maxElevation - bottomAxisElevation);
  const minGridElevation = Math.ceil(bottomAxisElevation / 100) * 100;
  const maxGridElevation = Math.ceil(maxElevation / 100) * 100;
  const gridElevations = Array.from(
    { length: (maxGridElevation - minGridElevation) / 100 + 1 },
    (_, index) => minGridElevation + index * 100,
  ).filter(elevation => elevation >= bottomAxisElevation);
  const horizontalGridInterval = getDistanceGridInterval(maxDistance);
  const distanceGridValues = Array.from(
    { length: Math.floor(maxDistance / horizontalGridInterval) + 1 },
    (_, index) => index * horizontalGridInterval,
  ).filter(distance => distance <= maxDistance);
  const toX = (distance: number) =>
    chartLeft + (distance / Math.max(1, maxDistance)) * chartWidth;
  const toY = (elevation: number) =>
    chartBottom -
    ((elevation - bottomAxisElevation) / elevationRange) * chartHeight;
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
  const steepestPoint = points.some(point => point.slope != null)
    ? points.reduce((best, point) =>
        (point.slope ?? -Infinity) > (best.slope ?? -Infinity) ? point : best,
      )
    : null;
  const selectNearestProfilePoint = (event: PointerEvent<SVGSVGElement>) => {
    if (!onPointSelect) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    const targetDistance = Math.min(
      maxDistance,
      Math.max(
        0,
        ((pointerX - chartLeft) / Math.max(1, chartWidth)) * maxDistance,
      ),
    );
    const nearestPoint = points.reduce((nearest, point) =>
      Math.abs(point.distance - targetDistance) <
      Math.abs(nearest.distance - targetDistance)
        ? point
        : nearest,
    );

    onPointSelect(nearestPoint);
  };
  const handleProfilePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!onPointSelect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    selectNearestProfilePoint(event);
  };
  const handleProfilePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    selectNearestProfilePoint(event);
  };
  const handleProfilePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-2 text-sm font-semibold text-gray-900">
          標高プロファイル
        </p>
        {/* 軸ラベルの可読性維持のため最小幅を確保し，狭い画面では横スクロールする */}
        <div className="overflow-x-auto overflow-y-hidden scroll-touch">
          <svg
            aria-label="標高プロファイル上の位置を選択"
            viewBox={`0 0 ${width} ${height}`}
            role={onPointSelect ? "button" : "img"}
            onPointerDown={handleProfilePointerDown}
            onPointerMove={handleProfilePointerMove}
            onPointerCancel={handleProfilePointerUp}
            onPointerUp={handleProfilePointerUp}
            className={`block h-auto max-h-[320px] touch-pan-x w-full min-w-[640px] ${onPointSelect ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
          >
            <path
              d={`M${chartLeft} ${chartTop}V${chartBottom}H${chartRight}`}
              fill="none"
              stroke="#CBD5E1"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {gridElevations.map(elevation => (
              <g key={elevation}>
                <line
                  x1={chartLeft}
                  x2={chartRight}
                  y1={toY(elevation)}
                  y2={toY(elevation)}
                  stroke="#E5E7EB"
                  strokeDasharray="4 6"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={chartLeft - 10}
                  y={toY(elevation) + 4}
                  fill="#6B7280"
                  fontSize={12}
                  fontWeight={800}
                  textAnchor="end"
                >
                  {elevation}m
                </text>
              </g>
            ))}
            {distanceGridValues.map(distance => (
              <g key={distance}>
                <line
                  x1={toX(distance)}
                  x2={toX(distance)}
                  y1={chartTop}
                  y2={chartBottom}
                  stroke="#EEF2F7"
                  strokeDasharray="4 8"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={toX(distance)}
                  y={chartBottom + 22}
                  fill="#6B7280"
                  fontSize={12}
                  fontWeight={800}
                  textAnchor={distance === 0 ? "start" : "middle"}
                >
                  {formatDistanceTick(distance)}
                </text>
              </g>
            ))}
            <text
              x={chartRight}
              y={chartBottom + 46}
              fill="#374151"
              fontSize={18}
              fontWeight={900}
              textAnchor="end"
            >
              水平距離
            </text>
            <path
              d={path}
              fill="none"
              stroke="#2563EB"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
            {steepestPoint && (
              <g>
                <circle
                  cx={toX(steepestPoint.distance)}
                  cy={toY(steepestPoint.elevation)}
                  r={6.5}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={Math.min(
                    chartRight - 60,
                    toX(steepestPoint.distance) + 10,
                  )}
                  y={Math.max(chartTop + 14, toY(steepestPoint.elevation) - 10)}
                  fill="#B91C1C"
                  fontSize={40}
                  fontWeight={900}
                  paintOrder="stroke"
                  stroke="#FFFFFF"
                  strokeLinejoin="round"
                  strokeWidth={4}
                >
                  最大 {Math.round(steepestPoint.slope ?? 0)}°
                </text>
              </g>
            )}
            {activePoint && (
              <>
                <line
                  x1={toX(activePoint.distance)}
                  x2={toX(activePoint.distance)}
                  y1={chartTop}
                  y2={chartBottom}
                  stroke="#111827"
                  strokeDasharray="3 4"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={toX(activePoint.distance)}
                  cy={toY(activePoint.elevation)}
                  r={6}
                  fill="#2563EB"
                  stroke="#111827"
                  strokeWidth={1.8}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={Math.min(chartRight - 28, toX(activePoint.distance) + 8)}
                  y={Math.max(chartTop + 10, toY(activePoint.elevation) - 8)}
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
        </div>
      </CardContent>
    </Card>
  );
};

const getDistanceGridInterval = (maxDistance: number) => {
  if (maxDistance <= 500) return 100;
  if (maxDistance <= 1500) return 250;
  if (maxDistance <= 3500) return 500;
  return 1000;
};

const formatDistanceTick = (value: number) =>
  value >= 1000 ? `${Number((value / 1000).toFixed(1))}km` : `${value}m`;
