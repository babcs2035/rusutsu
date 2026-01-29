"use server";

import { prisma } from "@/lib/prisma";
import type { SkiResortWithRelations } from "@/types";

// スキーリゾート一覧を取得（リレーション込み）
export async function getSkiResorts(): Promise<SkiResortWithRelations[]> {
  return prisma.skiResort.findMany({
    include: {
      courses: true,
      lifts: true,
      tickets: true,
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
      verticalDrop: true,
      numberOfCourses: true,
      beginnersCoursesPercent: true,
      status: true,
      yukiMagiAvailable: true,
    },
    orderBy: { nameJa: "asc" },
  });
}

// スキーリゾート詳細を取得
export async function getSkiResortById(id: string) {
  return prisma.skiResort.findUnique({
    where: { id },
    include: {
      courses: true,
      lifts: true,
      tickets: true,
      weathers: {
        orderBy: { date: "desc" },
        take: 1,
      },
      forecasts: true,
      latestReports: true,
    },
  });
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
