"use client";

import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="xl"
        overflow="hidden"
        bg="white"
      >
        <Box
          overflowX="auto"
          overflowY="hidden"
          css={{ WebkitOverflowScrolling: "touch" }}
        >
          <iframe
            title={`${resortName} Snow-Forecast`}
            src={feedUrl}
            width="100%"
            height={260}
            scrolling="auto"
            loading="lazy"
            style={{
              border: "none",
              overflow: "auto",
              display: "block",
              minWidth: "720px",
            }}
          />
        </Box>

        <Box px={4} py={3} borderTopWidth="1px" borderColor="gray.100">
          <Text fontSize="sm" color="gray.600">
            詳細な予報は{" "}
            <Link
              href={detailUrl}
              color="blue.600"
              target="_blank"
              rel="noopener noreferrer"
            >
              snow-forecast.com
            </Link>{" "}
            からご確認ください
          </Text>
        </Box>
      </Box>
    </Box>
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
