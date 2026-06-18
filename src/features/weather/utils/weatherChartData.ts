import type { SnowDepthsT } from "@/types/weathers";
import type { SnowDepthChartDataPoint } from "../types";

const getDatesBetween = (start: Date, end: Date) => {
  const dates: Date[] = [];
  const currentDate = new Date(start);
  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

const quantile = (arr: number[], q: number) => {
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined)
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  return arr[base];
};

export const createSnowDepthLineData = (
  snowDepths: SnowDepthsT,
): SnowDepthChartDataPoint[] => {
  if (!snowDepths?.data || !snowDepths.firstYear) return [];

  const seasonDates = getDatesBetween(
    new Date(2023, 11, 1),
    new Date(2024, 3, 30),
  );
  const snowDataByDate: Record<string, number[]> = {};
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

  const rawData: SnowDepthChartDataPoint[] = seasonDates.map(date => {
    const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;
    const depths = snowDataByDate[dateKey].sort((a, b) => a - b);
    if (depths.length === 0) {
      return {
        name: dateKey,
        min: null,
        q1: null,
        median: null,
        q3: null,
        max: null,
      };
    }

    return {
      name: dateKey,
      min: depths[0],
      q1: quantile(depths, 0.25),
      median: quantile(depths, 0.5),
      q3: quantile(depths, 0.75),
      max: depths[depths.length - 1],
    };
  });

  const firstIndex = rawData.findIndex(d => d.max !== null);
  const lastIndex = rawData.reduce(
    (acc, d, i) => (d.max !== null ? i : acc),
    -1,
  );

  if (firstIndex === -1 || lastIndex === -1) return [];

  return rawData.slice(firstIndex, lastIndex + 1);
};
