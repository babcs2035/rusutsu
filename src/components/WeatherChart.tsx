"use client";

import { Box, Button, Flex, Text } from "@chakra-ui/react";
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
  <Flex w="full" justify="center">
    <Flex
      gap={2}
      rounded="full"
      bg="gray.100"
      border="1px solid"
      borderColor="gray.200"
      p={1.5}
      boxShadow="sm"
    >
      {options.map(option => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          w={{ base: "20", sm: "24" }}
          variant="ghost"
          bg={value === option.value ? "white" : "transparent"}
          color={value === option.value ? "brand.500" : "gray.500"}
          border={
            value === option.value ? "1px solid" : "1px solid transparent"
          }
          borderColor={value === option.value ? "gray.200" : "transparent"}
          borderRadius="full"
          shadow={value === option.value ? "sm" : "none"}
          _hover={{
            bg: value === option.value ? "white" : "gray.50",
            color: "gray.900",
          }}
          fontSize={{ base: "xs", sm: "sm" }}
          fontWeight="700"
          fontFamily="var(--font-heading)"
          transition="all 0.2s"
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
      <Box
        rounded="xl"
        border="1px solid"
        borderColor="gray.200"
        bg="white"
        p={4}
        shadow="md"
      >
        <Text
          fontWeight="800"
          fontFamily="var(--font-heading)"
          color="gray.900"
          mb={2}
        >
          {label}
        </Text>
        <Flex flexDirection="column" gap={1}>
          {payload.map((pld: TooltipPayload) => {
            const displayValue = Array.isArray(pld.value)
              ? `${pld.value[0]} - ${pld.value[1]}`
              : pld.value;

            // Resolve color based on name to ensure visibility
            // Fallback to payload colors, then default gray
            let textColor = "gray.700";
            if (pld.name === "四分位範囲" || pld.name === "Interquartile Range")
              textColor = "#10b981";
            else if (pld.name === "中央値" || pld.name === "Median")
              textColor = "#059669";
            else if (pld.name === "最大値" || pld.name === "Max")
              textColor = "#ef4444";
            else if (pld.name === "最小値" || pld.name === "Min")
              textColor = "#3b82f6";
            else if (pld.name === "最高気温" || pld.name === "High Temp")
              textColor = "#f97316";
            else if (pld.name === "最低気温" || pld.name === "Low Temp")
              textColor = "#3b82f6";
            else if (pld.name === "降雪確率" || pld.name === "Snow Prob.")
              textColor = "#8b5cf6";
            else if (pld.fill && pld.fill !== "none") textColor = pld.fill;
            else if (pld.stroke && pld.stroke !== "none")
              textColor = pld.stroke;
            else if (pld.color) textColor = pld.color;

            return (
              <Text
                key={pld.name}
                fontSize="sm"
                color={textColor}
                fontWeight="700"
              >
                {`${pld.name}: ${displayValue}${pld.unit || ""}`}
              </Text>
            );
          })}
        </Flex>
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

  // データ長に基づいて表示範囲を決定（データがない場合は空配列）
  const dataLength =
    weatherData?.temperatures?.length ||
    weatherData?.winds?.length ||
    weatherData?.snows?.length ||
    0;

  const colsPerDay = 3; // Snow-Forecast 6day is typically AM/PM/Night
  const timeLabels = ["朝", "昼", "夜"];

  const forecastDays = useMemo(() => {
    if (dataLength === 0) return [];
    const daysCount = Math.ceil(dataLength / colsPerDay);
    return Array.from({ length: daysCount }, (_, i) => {
      const date = weathers.meta.date
        ? new Date(weathers.meta.date)
        : new Date();
      date.setDate(date.getDate() + i);
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        date.getDay()
      ];
      return `${date.getMonth() + 1}/${date.getDate()} (${day})`;
    });
  }, [weathers.meta.date, dataLength]);

  const getSnowStyle = (snow: number) => {
    if (snow <= 0) return { bg: "transparent", color: "gray.400" };
    if (snow < 5) return { bg: "blue.50", color: "blue.400" };
    if (snow < 10) return { bg: "blue.100", color: "blue.500" };
    if (snow < 20) return { bg: "blue.300", color: "white" };
    return { bg: "blue.500", color: "white" };
  };

  const getTempStyle = (temp: number) => {
    if (temp < -10) return { bg: "blue.800", color: "blue.100" };
    if (temp < -5) return { bg: "blue.600", color: "white" };
    if (temp < 0) return { bg: "blue.400", color: "white" };
    if (temp < 5)
      return { bg: "orange.400", color: "black", textShadow: "none" };
    if (temp < 10)
      return { bg: "orange.500", color: "black", textShadow: "none" };
    return { bg: "orange.700", color: "white" };
  };

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
        w="full"
        overflowX="auto"
        rounded="lg"
        borderWidth="1px"
        borderColor="gray.200"
        bg="white"
      >
        {dataLength > 0 ? (
          <Box
            as="table"
            minW="full"
            borderCollapse="collapse"
            textAlign="center"
          >
            <Box as="thead">
              <Box as="tr" bg="gray.100">
                <Box
                  as="th"
                  position="sticky"
                  left={0}
                  zIndex={10}
                  w={{ base: "14", sm: "20" }}
                  borderRightWidth="1px"
                  borderColor="gray.200"
                  bg="gray.100"
                  p={{ base: 0.5, sm: 2 }}
                  fontSize="xs"
                  fontWeight="700"
                />
                {forecastDays.map(day => (
                  <Box
                    as="th"
                    key={day}
                    // @ts-expect-error: colSpan is valid for th
                    colSpan={colsPerDay}
                    borderBottomWidth="1px"
                    borderRightWidth="1px"
                    borderColor="gray.200"
                    p={{ base: 1, sm: 2 }}
                    fontSize="xs"
                    fontWeight="700"
                    color="gray.600"
                    minW={0}
                  >
                    <Box
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {day}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box as="tr" bg="gray.50">
                <Box
                  as="th"
                  position="sticky"
                  left={0}
                  zIndex={10}
                  borderRightWidth="1px"
                  borderColor="gray.200"
                  bg="gray.50"
                  p={{ base: 0.5, sm: 1 }}
                />
                {Array.from({ length: dataLength }).map((_, i) => {
                  const timeOfDay = timeLabels[i % colsPerDay];
                  const dayIndex = Math.floor(i / colsPerDay);
                  const key = `day-time-${dayIndex}-${timeOfDay}-${i}`;
                  return (
                    <Box
                      as="th"
                      key={key}
                      borderBottomWidth="1px"
                      borderRightWidth="1px"
                      borderColor="gray.200"
                      p={1}
                      fontSize="xs"
                      fontWeight="700"
                      color="gray.500"
                      textTransform="uppercase"
                      w={{ base: "12", sm: "16" }}
                      whiteSpace="nowrap"
                    >
                      {timeOfDay}
                    </Box>
                  );
                })}
              </Box>
            </Box>
            <Box as="tbody">
              <Box as="tr" borderBottomWidth="1px" borderColor="gray.200">
                <Box
                  as="td"
                  position="sticky"
                  left={0}
                  zIndex={10}
                  borderRightWidth="1px"
                  borderColor="gray.200"
                  bg="white"
                  p={{ base: 1, sm: 2 }}
                  fontSize="sm"
                  fontWeight="700"
                  color="gray.800"
                  whiteSpace="nowrap"
                >
                  <Box textAlign="center">
                    風
                    <br />
                    <Text as="span" color="gray.500" fontSize="xs">
                      km/h
                    </Text>
                  </Box>
                </Box>
                {weatherData?.winds?.slice(0, dataLength).map(wind => {
                  const windSpeed = wind.speed;
                  const windColor =
                    windSpeed >= 30
                      ? "pink.500"
                      : windSpeed >= 20
                        ? "orange.500"
                        : windSpeed >= 10
                          ? "yellow.400"
                          : "brand.300";

                  let angle = 0;
                  if (wind.direction) {
                    const match = wind.direction.match(/rotate\(([-\d.]+)/);
                    if (match) {
                      angle = parseFloat(match[1]);
                    }
                  }
                  const windAngle = `rotate(${angle + 180}deg)`;

                  return (
                    <Box
                      as="td"
                      key={crypto.randomUUID()}
                      borderRightWidth="1px"
                      borderColor="gray.200"
                      p={1}
                      verticalAlign="middle"
                      bg="white"
                      whiteSpace="nowrap"
                    >
                      <Flex direction="column" align="center" gap={1}>
                        <Box
                          as="svg"
                          // @ts-expect-error: viewBox is valid for svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          width={{ base: "14px", sm: "18px" }}
                          height={{ base: "14px", sm: "18px" }}
                          color={windColor}
                          style={{ transform: windAngle }}
                        >
                          <path d="M12 2L22 12H17V22H7V12H2L12 2Z" />
                        </Box>
                        <Text
                          fontSize="sm"
                          fontWeight="700"
                          color={windColor}
                          fontFamily="mono"
                        >
                          {windSpeed}
                        </Text>
                      </Flex>
                    </Box>
                  );
                })}
              </Box>
              <Box as="tr" borderBottomWidth="1px" borderColor="gray.200">
                <Box
                  as="td"
                  position="sticky"
                  left={0}
                  zIndex={10}
                  borderRightWidth="1px"
                  borderColor="gray.200"
                  bg="white"
                  p={{ base: 1, sm: 2 }}
                  fontSize="sm"
                  fontWeight="700"
                  color="gray.800"
                  whiteSpace="nowrap"
                >
                  <Box textAlign="center">
                    降雪
                    <br />
                    <Text as="span" color="gray.500" fontSize="xs">
                      cm
                    </Text>
                  </Box>
                </Box>
                {weatherData?.snows?.slice(0, dataLength).map(snow => {
                  const style = getSnowStyle(snow);
                  return (
                    <Box
                      as="td"
                      key={crypto.randomUUID()}
                      borderRightWidth="1px"
                      borderColor="gray.200"
                      p={1}
                      fontSize="sm"
                      fontFamily="mono"
                      bg={style.bg}
                      fontWeight="700"
                      color={style.color}
                      whiteSpace="nowrap"
                    >
                      {snow > 0 ? snow : "-"}
                    </Box>
                  );
                })}
              </Box>
              <Box as="tr" borderBottomWidth="1px" borderColor="gray.200">
                <Box
                  as="td"
                  position="sticky"
                  left={0}
                  zIndex={10}
                  borderRightWidth="1px"
                  borderColor="gray.200"
                  bg="white"
                  p={{ base: 1.5, sm: 2 }}
                  fontSize={{ base: "xs", sm: "sm" }}
                  fontWeight="700"
                  color="gray.800"
                  minW={{ base: "60px", sm: "80px" }}
                  whiteSpace="nowrap"
                >
                  <Box textAlign="center">
                    気温
                    <br />
                    <Text
                      as="span"
                      color="gray.500"
                      fontSize={{ base: "10px", sm: "xs" }}
                    >
                      °C
                    </Text>
                  </Box>
                </Box>
                {weatherData?.temperatures?.slice(0, dataLength).map(temp => {
                  const style = getTempStyle(temp);
                  return (
                    <Box
                      as="td"
                      key={crypto.randomUUID()}
                      borderRightWidth="1px"
                      borderColor="gray.200"
                      p={1}
                      fontSize="sm"
                      fontFamily="mono"
                      fontWeight="700"
                      color={style.color === "white" ? "white" : style.color}
                      bg={style.bg}
                      whiteSpace="nowrap"
                    >
                      {temp}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        ) : (
          <Box p={8} textAlign="center">
            <Text color="gray.400" fontSize="md" fontWeight="700">
              データがありません
            </Text>
          </Box>
        )}
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
        最高気温: data.temperatures.weeks.max[i] ?? null,
        最低気温: data.temperatures.weeks.min[i] ?? null,
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
      <Box w="full" h={{ base: "220px", sm: "260px", md: "300px" }} mt={8}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              interval={4}
              tick={{ fontSize: 12, fill: "#6b7280", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#f97316"
              label={{
                value: "気温 (°C)",
                angle: -90,
                position: "insideLeft",
                fill: "#f97316",
                fontWeight: "bold",
                fontSize: 10,
                dx: 15,
              }}
              tick={{ fontSize: 10, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#8b5cf6"
              unit="%"
              label={{
                value: "降雪確率 (%)",
                angle: 90,
                position: "insideRight",
                fill: "#8b5cf6",
                fontWeight: "bold",
                fontSize: 10,
                dx: -15,
              }}
              tick={{ fontSize: 10, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                color: "#374151",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="最高気温"
              name="最高気温"
              stroke="#f97316"
              strokeWidth={3}
              dot={{ r: 4, fill: "white", stroke: "#f97316", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#f97316" }}
              unit="°C"
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="最低気温"
              name="最低気温"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ r: 4, fill: "white", stroke: "#3b82f6", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#3b82f6" }}
              unit="°C"
              connectNulls
            />
            <Bar
              yAxisId="right"
              dataKey="降雪確率"
              name="降雪確率"
              fill="#8b5cf6"
              fillOpacity={0.6}
              barSize={12}
              unit="%"
              radius={[4, 4, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
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

    // Generate raw stats
    const rawData = seasonDates.map(date => {
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

    // Filter to range with available data
    // Assuming 'max' is null if no data
    const firstIndex = rawData.findIndex(d => d.max !== null);
    const lastIndex = rawData.reduce(
      (acc, d, i) => (d.max !== null ? i : acc),
      -1,
    );

    if (firstIndex === -1 || lastIndex === -1) return [];

    return rawData.slice(firstIndex, lastIndex + 1);
  }, [snowDepths]);

  return (
    <Box>
      <Box w="full" h="400px" mt={8}>
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
              tick={{ fontSize: 10, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
            />
            <YAxis
              unit="cm"
              domain={[0, "dataMax + 50"]}
              tick={{ fontSize: 10, fill: "#9ca3af", fontWeight: "bold" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={{ stroke: "#e5e7eb" }}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
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
      </Box>
    </Box>
  );
};
