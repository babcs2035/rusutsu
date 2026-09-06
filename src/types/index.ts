// Prisma で生成された型を re-export
export type {
  AmedasData,
  Course,
  Forecast,
  LatestReport,
  Lift,
  SkiResort,
  SnowDepthRecord,
  SnowFallRecord,
  Ticket,
  Weather,
  YukiMagi,
} from "@prisma/client";

// リレーションを含むスキーリゾート型
import type { Prisma } from "@prisma/client";

export type { PublicSkiResortRecord as SkiResortWithRelations } from "@/server/ski-resorts/publicProjection";

export type SkiResortWithWeather = Prisma.SkiResortGetPayload<{
  include: {
    courses: true;
    lifts: true;
    tickets: true;
    weathers: true;
    forecasts: true;
    latestReports: true;
    yukiMagi: true;
  };
}>;
