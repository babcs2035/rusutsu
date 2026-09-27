"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import useMediaQuery from "@/hooks/use-media-query";
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
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [isMobile] = useMediaQuery("(max-width: 767px)");
  const hasProfile = points.length >= 2;
  useEffect(() => {
    if (!hasProfile) return;
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasProfile]);

  if (points.length < 2) return null;

  // 縦横とも同じ px/m。高さの上限に達したときは横幅も縮める。
  // 軸の文字とつまみは実寸のままにし、短い・平坦なコースでも潰さない。
  const axisLeftPadding = 50;
  const chartTop = 16;
  const maxDistance = Math.max(...points.map(point => point.distance));
  const minElevation = Math.min(...points.map(point => point.elevation));
  const maxElevation = Math.max(...points.map(point => point.elevation));
  const elevationDifference = maxElevation - minElevation;
  const availablePlotWidth = Math.max(1, width - axisLeftPadding - 12);
  // スマホだけ15°相当の高さを上限にする。PCはパネルが狭くても制限しない。
  const maxPlotHeight = isMobile
    ? Math.min(
        availablePlotWidth * Math.tan((15 * Math.PI) / 180),
        width < 400 ? 100 : 150,
      )
    : Infinity;
  const scale = Math.min(
    availablePlotWidth / Math.max(1, maxDistance),
    maxPlotHeight / Math.max(1, elevationDifference),
  );
  const chartWidth = Math.max(1, maxDistance) * scale;
  // 縮めた分の余白を左右に分け、軸ラベルを含む断面図を中央に置く。
  const chartLeft = axisLeftPadding + (availablePlotWidth - chartWidth) / 2;
  const chartRight = chartLeft + chartWidth;
  const chartHeight = elevationDifference * scale + 10;
  const chartBottom = chartTop + chartHeight;
  const height = chartBottom + 32;
  const bottomAxisElevation = minElevation - 10 / scale;
  const elevationRange = maxElevation - bottomAxisElevation;
  const elevationStep = getDistanceGridInterval(
    elevationRange,
    Math.max(1, Math.floor(chartHeight / 32)),
  );
  const minGridElevation =
    Math.ceil(bottomAxisElevation / elevationStep) * elevationStep;
  const maxGridElevation =
    Math.floor(maxElevation / elevationStep) * elevationStep;
  const gridElevations = Array.from(
    {
      length: Math.max(
        0,
        Math.round((maxGridElevation - minGridElevation) / elevationStep) + 1,
      ),
    },
    (_, index) => minGridElevation + index * elevationStep,
  ).filter(elevation => elevation >= bottomAxisElevation);
  const horizontalGridInterval = getDistanceGridInterval(
    maxDistance,
    Math.max(1, Math.floor(chartWidth / 70)),
  );
  const distanceGridValues = Array.from(
    { length: Math.floor(maxDistance / horizontalGridInterval) + 1 },
    (_, index) => index * horizontalGridInterval,
  ).filter(distance => distance <= maxDistance);
  const toX = (distance: number) => chartLeft + distance * scale;
  const toY = (elevation: number) =>
    chartTop + (maxElevation - elevation) * scale;
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
      ? points[0]
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
  const selectDistance = (distance: number) => {
    const nearestPoint = points.reduce((nearest, point) =>
      Math.abs(point.distance - distance) <
      Math.abs(nearest.distance - distance)
        ? point
        : nearest,
    );
    onPointSelect?.(nearestPoint);
  };

  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-2.5 sm:p-3">
        {hasMixedStatus && (
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
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
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs tabular-nums text-gray-700 sm:text-sm">
          <span>
            斜度{" "}
            <strong className="text-base text-gray-950 sm:text-lg">
              {activePoint.slope == null
                ? "--"
                : `${Math.round(activePoint.slope)}°`}
            </strong>
          </span>
          <span>
            標高{" "}
            <strong className="text-base text-gray-950 sm:text-lg">
              {Math.round(activePoint.elevation).toLocaleString()}m
            </strong>
          </span>
          <span>
            水平距離 {Math.round(activePoint.distance).toLocaleString()}m
          </span>
        </div>
        <div ref={chartRef}>
          <svg
            aria-label="コースの断面図（縦横同縮尺）"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            className="block h-auto w-full touch-pan-y"
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
                  y={chartBottom + 15}
                  fill="#6B7280"
                  fontSize={12}
                  fontWeight={800}
                  textAnchor={
                    distance === 0
                      ? "start"
                      : toX(distance) > chartRight - 20
                        ? "end"
                        : "middle"
                  }
                >
                  {formatDistanceTick(distance)}
                </text>
              </g>
            ))}
            <text
              x={chartRight}
              y={chartBottom + 29}
              fill="#6B7280"
              fontSize={12}
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
              </>
            )}
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
                {/* ハローを全字描いてから文字本体を描き、隣の字を覆わない。 */}
                {[true, false].map(halo => (
                  <text
                    key={String(halo)}
                    aria-hidden={halo || undefined}
                    x={Math.min(
                      width - 4,
                      Math.max(
                        chartLeft + 64,
                        toX(steepestPoint.distance) + 60,
                      ),
                    )}
                    y={Math.max(14, toY(steepestPoint.elevation) - 10)}
                    textAnchor="end"
                    fill={halo ? "none" : "#B91C1C"}
                    fontSize={12}
                    fontWeight={700}
                    stroke={halo ? "#FFFFFF" : "none"}
                    strokeLinejoin="round"
                    strokeWidth={halo ? 3 : 0}
                  >
                    最大 {Math.round(steepestPoint.slope ?? 0)}°
                  </text>
                ))}
              </g>
            )}
          </svg>
        </div>
        {onPointSelect && (
          <div className="mt-1">
            {/* つまみの中心が、グラフの始点・終点と同じX座標を通る。 */}
            <div
              style={{ marginLeft: chartLeft, marginRight: width - chartRight }}
            >
              <input
                type="range"
                aria-label="標高プロファイルの位置"
                aria-valuetext={`水平距離${Math.round(activePoint.distance)}m、標高${Math.round(activePoint.elevation)}m、斜度${activePoint.slope == null ? "不明" : `${Math.round(activePoint.slope)}度`}`}
                min={0}
                max={Math.max(1, maxDistance)}
                step="any"
                value={activePoint.distance}
                onChange={event => selectDistance(Number(event.target.value))}
                onKeyDown={event => {
                  const index = points.indexOf(activePoint);
                  const nextIndex = {
                    ArrowRight: Math.min(points.length - 1, index + 1),
                    ArrowUp: Math.min(points.length - 1, index + 1),
                    ArrowLeft: Math.max(0, index - 1),
                    ArrowDown: Math.max(0, index - 1),
                    Home: 0,
                    End: points.length - 1,
                  }[event.key];
                  if (nextIndex == null) return;
                  event.preventDefault();
                  onPointSelect(points[nextIndex]);
                }}
                // ネイティブrangeはつまみの半径ぶん内側までしか動かないため補正する。
                style={{ width: "calc(100% + 20px)", marginLeft: -10 }}
                className="block h-11 appearance-none bg-transparent touch-pan-y [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-gray-200 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-200 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const getDistanceGridInterval = (maxDistance: number, count: number) => {
  const target = Math.max(1, maxDistance / count);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return (
    ([1, 2, 5, 10].find(step => step * magnitude >= target) ?? 10) * magnitude
  );
};

const formatDistanceTick = (value: number) =>
  value >= 1000 ? `${Number((value / 1000).toFixed(1))}km` : `${value}m`;
