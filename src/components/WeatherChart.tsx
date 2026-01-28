"use client";

import { Box, Button, Flex, Table, Text } from "@chakra-ui/react";
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
import type { ForecastsT } from "@/types/forecasts";
import type { SnowDepthsT, WeathersT } from "@/types/weathers";

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
  <Flex w="100%" justifyContent="center">
    <Flex
      gap={{ base: 0.5, sm: 1 }}
      borderRadius="lg"
      bg="#f3f4f6"
      p={{ base: 0.5, sm: 1 }}
    >
      {options.map(option => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          w={{ base: 16, sm: 20 }}
          borderRadius="md"
          py={1}
          px={1}
          fontSize={{ base: "xs", sm: "sm" }}
          fontWeight="semibold"
          transition="all 0.2s ease-in-out"
          _focus={{
            outline: "none",
            boxShadow: "0 0 0 2px rgba(14, 165, 233, 0.5)",
          }}
          bg={value === option.value ? "white" : "transparent"}
          color={value === option.value ? "gray.800" : "gray.500"}
          boxShadow={value === option.value ? "sm" : "none"}
          _hover={{ bg: value === option.value ? "white" : "whiteAlpha.500" }}
        >
          {option.label}
        </Button>
      ))}
    </Flex>
  </Flex>
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
      <Box
        borderRadius="lg"
        border="1px solid"
        borderColor="#e5e7eb"
        bg="whiteAlpha.800"
        p={3}
        boxShadow="md"
        backdropFilter="blur(4px)"
      >
        <Text fontWeight="bold" color="#374151">
          {label}
        </Text>
        {payload.map((pld: TooltipPayload) => (
          <Box key={`${pld.name}-${pld.value}`} color={pld.color}>
            {`${pld.name}: ${pld.value}${pld.unit || ""}`}
          </Box>
        ))}
      </Box>
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
    <Box>
      <ElevationSelector
        value={elevation}
        onChange={value => setElevation(value as Elevation)}
        options={[
          { label: "山頂", value: "top" },
          { label: "中腹", value: "mid" },
          { label: "山麓", value: "bot" },
        ]}
      />
      <Box
        mt={4}
        w="100%"
        overflowX="auto"
        borderRadius="lg"
        border="1px solid"
        borderColor="#e5e7eb"
      >
        <Table.Root
          size="sm"
          style={{
            minWidth: "100%",
            borderCollapse: "collapse",
            textAlign: "center",
          }}
        >
          <Table.Header>
            <Table.Row bg="#f3f4f6">
              <Table.ColumnHeader
                position="sticky"
                left={0}
                zIndex={10}
                w={{ base: 12, sm: 16 }}
                borderRight="1px solid"
                borderColor="#e5e7eb"
                bg="#f3f4f6"
                p={{ base: 0.5, sm: 1 }}
                fontSize="xs"
                fontWeight="medium"
              />
              {forecastDays.map(day => (
                <Table.ColumnHeader
                  key={day}
                  colSpan={4}
                  borderBottom="1px solid"
                  borderRight="1px solid"
                  borderColor="#e5e7eb"
                  p={{ base: 0.5, sm: 1 }}
                  fontSize="xs"
                  fontWeight="medium"
                  minW={0}
                >
                  <Box
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {day}
                  </Box>
                </Table.ColumnHeader>
              ))}
            </Table.Row>
            <Table.Row bg="#f9fafb">
              <Table.ColumnHeader
                position="sticky"
                left={0}
                zIndex={10}
                borderRight="1px solid"
                borderColor="#e5e7eb"
                bg="#f9fafb"
                p={{ base: 0.5, sm: 1 }}
                fontSize="xs"
                fontWeight="medium"
              />
              {Array.from({ length: 40 }).map((_, i) => {
                const timeOfDay = ["朝", "昼", "夜", "晩"][i % 4];
                const dayIndex = Math.floor(i / 4);
                return (
                  <Table.ColumnHeader
                    key={`day-${dayIndex}-${timeOfDay}`}
                    borderBottom="1px solid"
                    borderRight="1px solid"
                    borderColor="#e5e7eb"
                    p={0.5}
                    fontSize="xs"
                    fontWeight="medium"
                    color="#6b7280"
                    w={{ base: 8, sm: 10 }}
                  >
                    {timeOfDay}
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell
                position="sticky"
                left={0}
                zIndex={10}
                borderRight="1px solid"
                borderColor="#e5e7eb"
                bg="#f9fafb"
                p={{ base: 0.5, sm: 1 }}
                fontSize="xs"
                fontWeight="semibold"
              >
                <Box textAlign="center">
                  風<br />
                  <Text as="span" color="gray.400" fontSize="xs">
                    km/h
                  </Text>
                </Box>
              </Table.Cell>
              {weatherData.winds.map((wind, i) => {
                const windSpeed = wind.speed;
                const windColor =
                  windSpeed >= 30
                    ? "red.500"
                    : windSpeed >= 20
                      ? "orange.500"
                      : windSpeed >= 10
                        ? "yellow.500"
                        : "gray.400";
                // 風向きを度数に変換（風は吹いてくる方向なので180度回転）
                const windAngle = wind.direction
                  ? `rotate(${parseFloat(wind.direction.replace("rotate(", "").replace("deg)", "")) + 180}deg)`
                  : "rotate(0deg)";

                return (
                  <Table.Cell
                    key={`wind-${i}-${wind.speed}-${wind.direction}`}
                    borderRight="1px solid"
                    borderColor="#e5e7eb"
                    p={0.5}
                    verticalAlign="middle"
                  >
                    <Flex flexDirection="column" alignItems="center" gap={0.5}>
                      <svg
                        style={{
                          width: "1rem",
                          height: "1rem",
                          transform: windAngle,
                          color:
                            windColor === "red.500"
                              ? "#ef4444"
                              : windColor === "orange.500"
                                ? "#f97316"
                                : windColor === "yellow.500"
                                  ? "#eab308"
                                  : "#9ca3af",
                        }}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-label={`風向き ${wind.direction}, 風速 ${windSpeed}km/h`}
                      >
                        <title>風向き・風速</title>
                        <path d="M12 2L22 12H17V22H7V12H2L12 2Z" />
                      </svg>
                      <Text
                        as="span"
                        fontSize="xs"
                        fontWeight="medium"
                        color={windColor}
                      >
                        {windSpeed}
                      </Text>
                    </Flex>
                  </Table.Cell>
                );
              })}
            </Table.Row>
            <Table.Row>
              <Table.Cell
                position="sticky"
                left={0}
                zIndex={10}
                borderRight="1px solid"
                borderColor="#e5e7eb"
                bg="#f9fafb"
                p={{ base: 0.5, sm: 1 }}
                fontSize="xs"
                fontWeight="semibold"
              >
                <Box textAlign="center">
                  降雪
                  <br />
                  <Text as="span" color="gray.400" fontSize="xs">
                    cm
                  </Text>
                </Box>
              </Table.Cell>
              {weatherData.snows.map((snow, i) => (
                <Table.Cell
                  key={`snow-${i}-${snow}`}
                  borderRight="1px solid"
                  borderColor="#e5e7eb"
                  p={0.5}
                  fontSize="xs"
                  bg={snow > 0 ? "sky.100" : "transparent"}
                  fontWeight={snow > 0 ? "medium" : "normal"}
                  color={snow > 0 ? "gray.800" : "gray.400"}
                >
                  {snow > 0 ? snow : "-"}
                </Table.Cell>
              ))}
            </Table.Row>
            <Table.Row borderTop="1px solid" borderColor="#e5e7eb">
              <Table.Cell
                position="sticky"
                left={0}
                zIndex={10}
                borderRight="1px solid"
                borderColor="#e5e7eb"
                bg="#f9fafb"
                p={{ base: 0.5, sm: 1 }}
                fontSize="xs"
                fontWeight="semibold"
              >
                <Box textAlign="center">
                  気温
                  <br />
                  <Text as="span" color="gray.400" fontSize="xs">
                    °C
                  </Text>
                </Box>
              </Table.Cell>
              {weatherData.temperatures.map((temp, i) => (
                <Table.Cell
                  key={`temp-${i}-${temp}`}
                  borderRight="1px solid"
                  borderColor="#e5e7eb"
                  p={0.5}
                  fontSize="xs"
                  fontWeight="bold"
                  color="white"
                  bg={temp > 0 ? "orange.400" : "blue.500"}
                >
                  {temp}
                </Table.Cell>
              ))}
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
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
    <Box>
      <ElevationSelector
        value={elevation}
        onChange={value => setElevation(value as ForecastElevation)}
        options={[
          { label: "山頂", value: "top" },
          { label: "中腹", value: "middle" },
          { label: "山麓", value: "bottom" },
        ]}
      />
      <ResponsiveContainer
        width="100%"
        height={300}
        style={{ marginTop: "1rem" }}
      >
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
    </Box>
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
    <Box>
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
    </Box>
  );
};
