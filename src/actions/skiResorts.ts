"use server";

import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { prisma } from "@/lib/prisma";
import SkiResortWeatherIds from "@/private/data/SkiResortWeatherIds.json";
import type { SkiResortWithRelations } from "@/types";

type TenkiJpWeatherId = {
  tenkijpId: string;
  tenkijpName?: string | null;
  displayName?: string | null;
};

type SnowForecastWeatherId = {
  snowForecastId: string;
  snowForecastName?: string | null;
  displayName?: string | null;
};

type SkiResortWeatherIdsEntry = {
  skiResortId?: string;
  tenkijp?: TenkiJpWeatherId[];
  weathernewsSpotId?: string | null;
  snowForecast?: SnowForecastWeatherId[];
  SnowForecastId?: string | null;
  SnowForecastName?: string | null;
};

function getWeatherIdsBySkiResortId(id: string) {
  const entry = (SkiResortWeatherIds as SkiResortWeatherIdsEntry[]).find(
    weatherIds => weatherIds.skiResortId === id,
  );

  if (!entry) return null;

  return {
    tenkijp: entry.tenkijp ?? [],
    weathernewsSpotId: entry.weathernewsSpotId ?? null,
    snowForecast: entry.snowForecast ?? [],
    SnowForecastId: entry.SnowForecastId ?? null,
    SnowForecastName: entry.SnowForecastName ?? null,
  };
}

// スキーリゾート一覧を取得（リレーション込み）
export async function getSkiResorts(): Promise<SkiResortWithRelations[]> {
  return prisma.skiResort.findMany({
    include: {
      courses: true,
      lifts: true,
      tickets: true,
      yukiMagi: true,
    },
    orderBy: { nameJa: "asc" },
  });
}

// スキーリゾート一覧を地図表示用に軽量取得
export async function getSkiResortsForMap() {
  return prisma.skiResort.findMany({
    select: {
      id: true,
      nameJa: true,
      nameEn: true,
      prefecture: true,
      town: true,
      latitude: true,
      longitude: true,
      topElevation: true,
      baseElevation: true,
      verticalDrop: true,
      numberOfCourses: true,
      numberOfLifts: true,
      beginnersCoursesPercent: true,
      status: true,
      yukiMagiId: true,
    },
    orderBy: { nameJa: "asc" },
  });
}

// スキーリゾート詳細を取得
export async function getSkiResortById(id: string) {
  const [resort, finalizedMapData] = await Promise.all([
    prisma.skiResort.findUnique({
      where: { id },
      include: {
        courses: true,
        lifts: true,
        tickets: true,
        weathers: {
          orderBy: { date: "desc" },
          take: 1,
        },
        latestReports: true,
        yukiMagi: true,
        snowDepths: {
          orderBy: { date: "asc" },
        },
      },
    }),
    getFinalizedResortMapData(id),
  ]);

  if (!resort) return null;

  return {
    ...resort,
    weatherIds: getWeatherIdsBySkiResortId(id),
    finalizedMapData,
  };
}

// スキーリゾートの天気データを取得
export async function getSkiResortWeather(id: string) {
  return prisma.weather.findMany({
    where: { skiResortId: id },
    orderBy: { date: "desc" },
    take: 7,
  });
}

// スキーリゾートの積雪データを取得
export async function getSkiResortSnowDepths(id: string) {
  return prisma.snowDepthRecord.findMany({
    where: { skiResortId: id },
    orderBy: { date: "desc" },
    take: 30,
  });
}

// 雪マジ一覧を取得
export async function getYukiMagiList() {
  return prisma.yukiMagi.findMany({
    orderBy: { name: "asc" },
  });
}
