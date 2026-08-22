"use client";

import { type PointerEvent, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ElevationProfilePoint } from "../types";

/** 断面図の線の色。開いている区間と閉じている区間を塗り分ける */
const STATUS_LINE_COLOR = {
  "○": "#2563EB",
  "△": "#F59E0B",
  "×": "#94A3B8",
} as const;

const getStatusLineColor = (status: ElevationProfilePoint["status"]) =>
  status ? STATUS_LINE_COLOR[status] : "#2563EB";

/** 営業状況が変わるところで線を分ける。境界の点は両方に入れて繋ぐ */
const createStatusSegments = (points: ElevationProfilePoint[]) => {
  const segments: {
    status: ElevationProfilePoint["status"];
    points: ElevationProfilePoint[];
  }[] = [];

  for (const point of points) {
    const current = segments[segments.length - 1];
    if (current && current.status === point.status) {
      current.points.push(point);
      continue;
    }

    const bridge = current ? [current.points[current.points.length - 1]] : [];
    segments.push({
      status: point.status,
      points: [...bridge.filter(Boolean), point],
    });
  }

  return segments;
};

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

  // 横スクロールなしで収めるため、viewBox を実際の表示幅に近づける。
  // ここを 900 のように大きく取ると、狭い画面では文字が潰れるほど縮小される。
  const width = 460;
  const height = 220;
  const chartLeft = 44;
  const chartRight = width - 12;
  const chartTop = 14;
  const chartBottom = height - 34;
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
  const toPath = (segmentPoints: ElevationProfilePoint[]) =>
    segmentPoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${toX(point.distance).toFixed(1)} ${toY(
            point.elevation,
          ).toFixed(1)}`,
      )
      .join(" ");
  const statusSegments = createStatusSegments(points);
  const hasMixedStatus =
    new Set(points.map(point => point.status ?? "")).size > 1;
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
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-gray-900">
            標高プロファイル
          </p>
          {hasMixedStatus && (
            <div className="flex items-center gap-2 text-[11px] font-medium text-gray-600">
              {(["○", "△", "×"] as const).map(status => (
                <span key={status} className="flex items-center gap-1">
                  <span
                    className="h-[3px] w-4 rounded-full"
                    style={{ background: STATUS_LINE_COLOR[status] }}
                  />
                  {status}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <svg
            aria-label="標高プロファイル上の位置を選択"
            viewBox={`0 0 ${width} ${height}`}
            role={onPointSelect ? "button" : "img"}
            onPointerDown={handleProfilePointerDown}
            onPointerMove={handleProfilePointerMove}
            onPointerCancel={handleProfilePointerUp}
            onPointerUp={handleProfilePointerUp}
            className={`block h-auto w-full ${onPointSelect ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
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
                  x={chartLeft - 6}
                  y={toY(elevation) + 3.5}
                  fill="#6B7280"
                  fontSize={10}
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
                  y={chartBottom + 15}
                  fill="#6B7280"
                  fontSize={10}
                  fontWeight={800}
                  textAnchor={distance === 0 ? "start" : "middle"}
                >
                  {formatDistanceTick(distance)}
                </text>
              </g>
            ))}
            <text
              x={chartRight}
              y={chartBottom + 29}
              fill="#6B7280"
              fontSize={10}
              fontWeight={800}
              textAnchor="end"
            >
              水平距離
            </text>
            {statusSegments.map(segment => (
              <path
                key={`${segment.status ?? "unknown"}-${segment.points[0]?.distance ?? 0}`}
                d={toPath(segment.points)}
                fill="none"
                stroke={getStatusLineColor(segment.status)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {steepestPoint && (
              <g>
                <circle
                  cx={toX(steepestPoint.distance)}
                  cy={toY(steepestPoint.elevation)}
                  r={4}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={Math.min(chartRight - 52, toX(steepestPoint.distance) + 7)}
                  y={Math.max(chartTop + 14, toY(steepestPoint.elevation) - 10)}
                  fill="#B91C1C"
                  fontSize={12}
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
                  r={4}
                  fill="#2563EB"
                  stroke="#111827"
                  strokeWidth={1.8}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={Math.min(chartRight - 92, toX(activePoint.distance) + 7)}
                  y={Math.max(chartTop + 10, toY(activePoint.elevation) - 8)}
                  fill="#111827"
                  fontSize={15}
                  fontWeight={900}
                  paintOrder="stroke"
                  stroke="#FFFFFF"
                  strokeLinejoin="round"
                  strokeWidth={5}
                >
                  {activePoint.slope == null
                    ? "--"
                    : `${Math.round(activePoint.slope)}°`}
                  {" / "}
                  {Math.round(activePoint.elevation).toLocaleString()}m
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
