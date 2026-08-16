"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { SnowDepthsT } from "@/types/weathers";
import { createSnowDepthLineData } from "./utils/weatherChartData";

type Elevation = "top" | "mid" | "bot";

export const SnowForecastEmbed = ({
  snowForecastSlug,
  resortName,
}: {
  snowForecastSlug: string;
  resortName: string;
}) => {
  const [elevation, setElevation] = useState<Elevation>("mid");
  const feedUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/forecasts/feed/${elevation}/m`;
  const detailUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/6day/${elevation}`;

  return (
    <div>
      <ElevationSelector
        value={elevation}
        onChange={value => setElevation(value as Elevation)}
        options={[
          { label: "山頂", value: "top" },
          { label: "中腹", value: "mid" },
          { label: "山麓", value: "bot" },
        ]}
      />
      <Card className="mt-4 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto overflow-y-hidden scroll-touch">
            <iframe
              title={`${resortName} Snow-Forecast`}
              src={feedUrl}
              width="100%"
              height={260}
              scrolling="auto"
              loading="lazy"
              className="min-w-[720px] block border-0 bg-transparent"
            />
          </div>

          <Separator className="border-gray-100" />
          <div className="px-4 py-3">
            <p className="text-sm text-gray-600">
              詳細な予報は{" "}
              <ExternalLinkComponent
                href={detailUrl}
                className="text-blue-600 hover:text-blue-700"
              >
                snow-forecast.com
              </ExternalLinkComponent>{" "}
              からご確認ください
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * 標高を選択するための共通UIコンポーネント
 */
const ElevationSelector = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) => (
  <div className="flex w-full justify-center">
    <div className="flex gap-1 rounded-full bg-gray-100 border border-gray-200 p-1 shadow-sm">
      {options.map(option => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          className={cn(
            "rounded-full font-semibold transition-all duration-200 w-auto min-w-[5rem] md:min-w-[6rem]",
            value !== option.value &&
              "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  </div>
);

/**
 * カスタムツールチップ
 */
interface TooltipPayload {
  color: string;
  name: string;
  value: number | string;
  unit?: string;
  fill?: string;
  stroke?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload?.length) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <span className="opacity-0" />
          </TooltipTrigger>
          <TooltipContent className="rounded-xl shadow-md border border-gray-200 p-4 bg-white">
            <p className="font-bold text-gray-900 mb-2 font-[var(--font-heading)]">
              {label}
            </p>
            <div className="flex flex-col gap-1">
              {payload.map((pld: TooltipPayload) => {
                const displayValue = Array.isArray(pld.value)
                  ? `${pld.value[0]} - ${pld.value[1]}`
                  : pld.value;

                // Resolve color based on name to ensure visibility
                // Fallback to payload colors, then default gray
                let textColor = "text-gray-700";
                // 動的な色値（Recharts payload）は Tailwind JIT がクラスを生成できないため
                // インライン style で適用する（§19 の動的値例外）
                let dynamicColor: string | null = null;
                if (
                  pld.name === "四分位範囲" ||
                  pld.name === "Interquartile Range"
                )
                  textColor = "text-emerald-500";
                else if (pld.name === "中央値" || pld.name === "Median")
                  textColor = "text-green-600";
                else if (pld.name === "最大値" || pld.name === "Max")
                  textColor = "text-red-500";
                else if (pld.name === "最小値" || pld.name === "Min")
                  textColor = "text-blue-600";
                else if (pld.name === "最高気温" || pld.name === "High Temp")
                  textColor = "text-orange-500";
                else if (pld.name === "最低気温" || pld.name === "Low Temp")
                  textColor = "text-blue-600";
                else if (pld.name === "降雪確率" || pld.name === "Snow Prob.")
                  textColor = "text-violet-500";
                else if (pld.fill && pld.fill !== "none")
                  dynamicColor = pld.fill;
                else if (pld.stroke && pld.stroke !== "none")
                  dynamicColor = pld.stroke;
                else if (pld.color) dynamicColor = pld.color;

                return (
                  <p
                    key={pld.name}
                    className={cn("text-sm font-medium", textColor)}
                    style={dynamicColor ? { color: dynamicColor } : undefined}
                  >
                    {`${pld.name}: ${displayValue}${pld.unit || ""}`}
                  </p>
                );
              })}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return null;
};

/**
 * 1. 積雪の分布
 */
export const SnowDepthLineChart = ({
  snowDepths,
}: {
  snowDepths: SnowDepthsT;
}) => {
  const lineData = useMemo(
    () => createSnowDepthLineData(snowDepths),
    [snowDepths],
  );

  return (
    <div>
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={lineData}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              interval={Math.floor(lineData.length / 5)}
              tick={{ fontSize: 11, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
            />
            <YAxis
              unit="cm"
              domain={[0, "dataMax + 50"]}
              tick={{ fontSize: 11, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
              width={45}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                color: "#374151",
                fontWeight: "700",
                fontSize: "12px",
                paddingTop: "10px",
              }}
            />
            <Area
              type="monotone"
              dataKey={data =>
                data.q1 !== null && data.q3 !== null
                  ? [data.q1, data.q3]
                  : [0, 0]
              }
              fill="#10b981"
              stroke="none"
              name="中央50%範囲"
              fillOpacity={0.15}
              unit="cm"
            />
            <Line
              type="monotone"
              dataKey="median"
              stroke="#10b981"
              strokeWidth={3}
              name="中央値"
              dot={false}
              connectNulls
              unit="cm"
            />
            <Line
              type="monotone"
              dataKey="max"
              stroke="#ef4444"
              name="最大値"
              strokeWidth={0}
              dot={{ r: 4, fill: "#ef4444" }}
              activeDot={{ r: 7 }}
              connectNulls
              unit="cm"
            />
            <Line
              type="monotone"
              dataKey="min"
              stroke="#3b82f6"
              name="最小値"
              strokeWidth={0}
              dot={{ r: 4, fill: "#3b82f6" }}
              activeDot={{ r: 7 }}
              connectNulls
              unit="cm"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
