"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastsT, SnowDepthsT, WeathersT } from "@/types";

type Elevation = "top" | "mid" | "bot";
type ForecastElevation = "top" | "middle" | "bottom";

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
    <div className="flex space-x-0.5 sm:space-x-1 rounded-lg bg-gray-100 p-0.5 sm:p-1">
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`w-16 sm:w-20 rounded-md py-1 px-1 text-xs sm:text-sm font-semibold transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 ${
            value === option.value
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:bg-white/50"
          }`}
        >
          {option.label}
        </button>
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
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white/80 p-3 shadow-md backdrop-blur-sm">
        <p className="font-bold text-gray-700">{label}</p>
        {payload.map((pld: TooltipPayload) => (
          <div key={`${pld.name}-${pld.value}`} style={{ color: pld.color }}>
            {`${pld.name}: ${pld.value}${pld.unit || ""}`}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * 1. 直近の天気
 */
export const ForecastTable = ({ weathers }: { weathers: WeathersT }) => {
  const [elevation, setElevation] = useState<Elevation>("mid");
  const weatherData = weathers[elevation];

  const forecastDays = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const date = new Date(weathers.meta.date);
        date.setDate(date.getDate() + i);
        const day = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
        return `${date.getDate()}日(${day})`;
      }),
    [weathers.meta.date],
  );

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
      <div className="mt-4 w-full overflow-x-auto rounded-lg border">
        <table className="min-w-full border-collapse text-center">
          <thead>
            <tr className="bg-gray-100">
              <th className="sticky left-0 z-10 w-12 sm:w-16 border-r bg-gray-100 p-0.5 sm:p-1 text-xs font-medium"></th>
              {forecastDays.map(day => (
                <th
                  key={day}
                  colSpan={4}
                  className="border-b border-r p-0.5 sm:p-1 text-xs font-medium min-w-0"
                >
                  <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                    {day}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 border-r bg-gray-50 p-0.5 sm:p-1 text-xs font-medium"></th>
              {Array.from({ length: 40 }).map((_, i) => {
                const timeOfDay = ["朝", "昼", "夜", "晩"][i % 4];
                const dayIndex = Math.floor(i / 4);
                return (
                  <th
                    key={`day-${dayIndex}-${timeOfDay}`}
                    className="border-b border-r p-0.5 text-xs font-medium text-gray-500 w-8 sm:w-10"
                  >
                    {timeOfDay}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 z-10 border-r bg-gray-50 p-0.5 sm:p-1 text-xs font-semibold">
                <div className="text-center">
                  風<br />
                  <span className="text-gray-400 text-xs">km/h</span>
                </div>
              </td>
              {weatherData.winds.map((wind, i) => {
                const windSpeed = wind.speed;
                const windColor =
                  windSpeed >= 30
                    ? "text-red-500"
                    : windSpeed >= 20
                      ? "text-orange-500"
                      : windSpeed >= 10
                        ? "text-yellow-500"
                        : "text-gray-400";
                // 風向きを度数に変換（風は吹いてくる方向なので180度回転）
                const windAngle = wind.direction
                  ? `rotate(${parseFloat(wind.direction.replace("rotate(", "").replace("deg)", "")) + 180}deg)`
                  : "rotate(0deg)";

                return (
                  <td
                    key={`wind-${i}-${wind.speed}-${wind.direction}`}
                    className="border-r p-0.5 align-middle"
                  >
                    <div className="flex flex-col items-center space-y-0.5">
                      <svg
                        className={`h-3 w-3 sm:h-4 sm:w-4 ${windColor}`}
                        style={{ transform: windAngle }}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-label={`風向き ${wind.direction}, 風速 ${windSpeed}km/h`}
                      >
                        <title>風向き・風速</title>
                        <path d="M12 2L22 12H17V22H7V12H2L12 2Z" />
                      </svg>
                      <span className={`text-xs font-medium ${windColor}`}>
                        {windSpeed}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 border-r bg-gray-50 p-0.5 sm:p-1 text-xs font-semibold">
                <div className="text-center">
                  降雪
                  <br />
                  <span className="text-gray-400 text-xs">cm</span>
                </div>
              </td>
              {weatherData.snows.map((snow, i) => (
                <td
                  key={`snow-${i}-${snow}`}
                  className={`border-r p-0.5 text-xs ${snow > 0 ? "bg-sky-100 font-medium" : "text-gray-400"}`}
                >
                  {snow > 0 ? snow : "-"}
                </td>
              ))}
            </tr>
            <tr className="border-t">
              <td className="sticky left-0 z-10 border-r bg-gray-50 p-0.5 sm:p-1 text-xs font-semibold">
                <div className="text-center">
                  気温
                  <br />
                  <span className="text-gray-400 text-xs">°C</span>
                </div>
              </td>
              {weatherData.temperatures.map((temp, i) => (
                <td
                  key={`temp-${i}-${temp}`}
                  className={`border-r p-0.5 text-xs font-bold text-white ${temp > 0 ? "bg-orange-400" : "bg-blue-500"}`}
                >
                  {temp}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 2. 過去の気象データ（週単位）
 */
export const WeeklyWeatherChart = ({
  forecasts,
}: {
  forecasts: ForecastsT;
}) => {
  const [elevation, setElevation] = useState<ForecastElevation>("middle");
  const chartData = useMemo(() => {
    const data = forecasts[elevation];
    if (!data) return [];
    const startDate = new Date(forecasts.meta.date_start);
    return Array.from({ length: 48 }, (_, i) => {
      const currentDate = new Date(startDate.getTime());
      currentDate.setDate(currentDate.getDate() + i * 7);
      const label = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
      return {
        name: label,
        最高気温: data.temperatures.weeks.max[i]
          ? Math.max(...data.temperatures.weeks.max[i])
          : null,
        最低気温: data.temperatures.weeks.min[i]
          ? Math.min(...data.temperatures.weeks.min[i])
          : null,
        降雪確率: data.snowfalls.significantSnowfall[i] || 0,
      };
    });
  }, [forecasts, elevation]);

  return (
    <div>
      <ElevationSelector
        value={elevation}
        onChange={value => setElevation(value as ForecastElevation)}
        options={[
          { label: "山頂", value: "top" },
          { label: "中腹", value: "middle" },
          { label: "山麓", value: "bottom" },
        ]}
      />
      <ResponsiveContainer width="100%" height={300} className="mt-4">
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            interval={4}
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            stroke="#f97316"
            label={{
              value: "気温 (°C)",
              angle: -90,
              position: "insideLeft",
              fill: "#6B7280",
            }}
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#8b5cf6"
            unit="%"
            label={{
              value: "確率 (%)",
              angle: 90,
              position: "insideRight",
              fill: "#6B7280",
            }}
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="最高気温"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            unit="°C"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="最低気温"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            unit="°C"
          />
          <Bar
            yAxisId="right"
            dataKey="降雪確率"
            fill="#8b5cf6"
            fillOpacity={0.6}
            barSize={15}
            unit="%"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * 3. 積雪の分布
 */
export const SnowDepthLineChart = ({
  snowDepths,
}: {
  snowDepths: SnowDepthsT;
}) => {
  const lineData = useMemo(() => {
    if (!snowDepths?.data || !snowDepths.firstYear) return [];
    const getDatesBetween = (start: Date, end: Date) => {
      const dates: Date[] = [];
      const currentDate = new Date(start);
      while (currentDate <= end) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return dates;
    };
    const seasonDates = getDatesBetween(
      new Date(2023, 11, 1),
      new Date(2024, 3, 30),
    );
    const snowDataByDate: { [key: string]: number[] } = {};
    seasonDates.forEach(date => {
      const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;
      snowDataByDate[dateKey] = [];
    });
    const monthMapping = [1, 2, 3, 4, 12];
    snowDepths.data.forEach(yearData => {
      yearData.forEach((monthData, monthIdx) => {
        const month = monthMapping[monthIdx];
        monthData.forEach((snowValue, dayIdx) => {
          if (snowValue === null) return;
          const dateKey = `${month}/${dayIdx + 1}`;
          if (snowDataByDate[dateKey]) snowDataByDate[dateKey].push(snowValue);
        });
      });
    });
    return seasonDates.map(date => {
      const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;
      const depths = snowDataByDate[dateKey].sort((a, b) => a - b);
      if (depths.length === 0)
        return {
          name: dateKey,
          min: null,
          q1: null,
          median: null,
          q3: null,
          max: null,
        };
      const quantile = (arr: number[], q: number) => {
        const pos = (arr.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (arr[base + 1] !== undefined)
          return arr[base] + rest * (arr[base + 1] - arr[base]);
        return arr[base];
      };
      return {
        name: dateKey,
        min: depths[0],
        q1: quantile(depths, 0.25),
        median: quantile(depths, 0.5),
        q3: quantile(depths, 0.75),
        max: depths[depths.length - 1],
      };
    });
  }, [snowDepths]);

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          data={lineData}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            interval={Math.floor(lineData.length / 8)}
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <YAxis
            unit="cm"
            domain={[0, "dataMax + 50"]}
            tick={{ fontSize: 12, fill: "#6B7280" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey={data =>
              data.q1 !== null && data.q3 !== null ? [data.q1, data.q3] : [0, 0]
            }
            fill="#10b981"
            stroke="none"
            name="25-75パーセンタイル"
            fillOpacity={0.4}
            unit="cm"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke="#059669"
            strokeWidth={2}
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
            dot={{ r: 3, fill: "#ef4444" }}
            activeDot={{ r: 6 }}
            connectNulls
            unit="cm"
          />
          <Line
            type="monotone"
            dataKey="min"
            stroke="#3b82f6"
            name="最小値"
            strokeWidth={0}
            dot={{ r: 3, fill: "#3b82f6" }}
            activeDot={{ r: 6 }}
            connectNulls
            unit="cm"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
