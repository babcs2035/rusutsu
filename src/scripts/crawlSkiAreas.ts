import { tqdm } from "ts-tqdm";
import SkiAreaNameDict from "@/data/SkiAreaNameDict.json";
import { disconnectPrisma, prisma } from "@/lib/prisma";

// 簡易的な fetch ラッパー関数．
// エラーハンドリングと型安全性を確保するために使用する．
async function fetchAsync<T>(args: {
  url: string;
  options?: RequestInit;
}): Promise<T> {
  const res = await fetch(args.url, args.options);
  if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// SkiArea API のレスポンス型定義．
interface SkiAreaApiResponse {
  Id: number;
  UniqueName: string;
  NameJapanese: string;
  Name: string;
  PrefectureNameJapanese: string;
  TownNameJapanese: string;
  Location_Latitude: string;
  Location_Longitude: string;
  CourseMapLarge: string | null;
  CourseMapSmall: string | null;
  MaximumElevation: number;
  VerticalDifference: number;
  MinimumElevation: number;
  TotalSkiCourses: number;
  LongestCourse: number;
  steepestSlope: number;
  BeginnersCourses: number;
  IntermediateCourses: number;
  AdvancedCourses: number;
  TotalSkiLifts: number;
  RopeWays: number;
  Gondolas: number;
  QuadLifts: number;
  TripleLifts: number;
  PairLifts: number;
  SingleLifts: number;
  OtherLifts: number;
  WeekdayOpenTime: string;
  WeekdayCloseTime: string;
  WeekendOpenTime: string;
  WeekendCloseTime: string;
  OpeningTimeComments: string;
  WebUrl: string;
  SkiersPercent: number;
  SnowboardersPercent: number;
}

interface TicketApiResponse {
  NameOfTicket: string;
  AdultTicket: string | null;
  ChildTicket: string | null;
  OlderChildTicket: string | null;
  SeniorTicket: string | null;
}

// リスト取得 API のレスポンス型（クローリングに必要なフィールドのみ）．
interface SkiAreaListResponse {
  UniqueName: string;
}

async function main() {
  console.log("🎿 Starting ski area crawler...");

  // 全スキー場のリストを取得する．
  const outlines = await fetchAsync<SkiAreaListResponse[]>({
    url: "https://www.snowjapan.com/rest-api/skiarea/list/All",
    options: { method: "POST" },
  });

  console.log(`📦 Found ${outlines.length} ski resorts to crawl.`);

  for (const outline of tqdm(outlines)) {
    const uniqueName = outline.UniqueName;

    // 各スキー場の詳細情報を取得する．
    const details: SkiAreaApiResponse = await fetchAsync({
      url: `https://www.snowjapan.com/rest-api/skiarea/${uniqueName}`,
      options: { method: "POST" },
    });

    // 表記揺れを防ぐため，辞書を用いてリゾート名を正規化する．
    const normalizedNameJa =
      (SkiAreaNameDict as Record<string, string>)[details.NameJapanese] ||
      details.NameJapanese;

    // リフト券情報を取得する．
    const tickets: TicketApiResponse[] = await fetchAsync({
      url: `https://www.snowjapan.com/rest-api/skiarea/ticket/list/${uniqueName}`,
      options: { method: "POST" },
    });

    // 取得したスキー場情報をデータベースに保存（存在する場合は更新）する．
    await prisma.skiResort.upsert({
      where: { id: uniqueName },
      update: {
        nameJa: normalizedNameJa,
        nameEn: details.Name,
        prefecture: details.PrefectureNameJapanese,
        town: details.TownNameJapanese,
        latitude: Number(details.Location_Latitude),
        longitude: Number(details.Location_Longitude),
        topElevation: details.MaximumElevation,
        baseElevation: details.MinimumElevation,
        verticalDrop: details.VerticalDifference,
        numberOfCourses: details.TotalSkiCourses,
        longestCourse: details.LongestCourse,
        steepestSlope: details.steepestSlope,
        beginnersCoursesPercent: details.BeginnersCourses,
        intermediateCoursesPercent: details.IntermediateCourses,
        advancedCoursesPercent: details.AdvancedCourses,
        courseImages: details.CourseMapLarge
          ? [`https://www.snowjapan.com${details.CourseMapLarge.slice(1)}`]
          : details.CourseMapSmall
            ? [`https://www.snowjapan.com${details.CourseMapSmall.slice(1)}`]
            : [],
        numberOfLifts: details.TotalSkiLifts,
        ropeways: details.RopeWays,
        gondolas: details.Gondolas,
        quadLifts: details.QuadLifts,
        tripleLifts: details.TripleLifts,
        pairLifts: details.PairLifts,
        singleLifts: details.SingleLifts,
        otherLifts: details.OtherLifts,
        weekdayOpen: details.WeekdayOpenTime,
        weekdayClose: details.WeekdayCloseTime,
        weekendOpen: details.WeekendOpenTime,
        weekendClose: details.WeekendCloseTime,
        timesComment: details.OpeningTimeComments,
        website: details.WebUrl,
        skiersPercent: details.SkiersPercent,
        snowboardersPercent: details.SnowboardersPercent,
        sources: [
          `https://www.snowjapan.com/japan-ski-resorts/${details.PrefectureNameJapanese}/${details.TownNameJapanese}/${uniqueName}`,
        ],
      },
      create: {
        id: uniqueName,
        nameJa: normalizedNameJa,
        nameEn: details.Name,
        prefecture: details.PrefectureNameJapanese,
        town: details.TownNameJapanese,
        latitude: Number(details.Location_Latitude),
        longitude: Number(details.Location_Longitude),
        topElevation: details.MaximumElevation,
        baseElevation: details.MinimumElevation,
        verticalDrop: details.VerticalDifference,
        numberOfCourses: details.TotalSkiCourses,
        longestCourse: details.LongestCourse,
        steepestSlope: details.steepestSlope,
        beginnersCoursesPercent: details.BeginnersCourses,
        intermediateCoursesPercent: details.IntermediateCourses,
        advancedCoursesPercent: details.AdvancedCourses,
        courseImages: details.CourseMapLarge
          ? [`https://www.snowjapan.com${details.CourseMapLarge.slice(1)}`]
          : details.CourseMapSmall
            ? [`https://www.snowjapan.com${details.CourseMapSmall.slice(1)}`]
            : [],
        numberOfLifts: details.TotalSkiLifts,
        ropeways: details.RopeWays,
        gondolas: details.Gondolas,
        quadLifts: details.QuadLifts,
        tripleLifts: details.TripleLifts,
        pairLifts: details.PairLifts,
        singleLifts: details.SingleLifts,
        otherLifts: details.OtherLifts,
        weekdayOpen: details.WeekdayOpenTime,
        weekdayClose: details.WeekdayCloseTime,
        weekendOpen: details.WeekendOpenTime,
        weekendClose: details.WeekendCloseTime,
        timesComment: details.OpeningTimeComments,
        website: details.WebUrl,
        skiersPercent: details.SkiersPercent,
        snowboardersPercent: details.SnowboardersPercent,
        sources: [
          `https://www.snowjapan.com/japan-ski-resorts/${details.PrefectureNameJapanese}/${details.TownNameJapanese}/${uniqueName}`,
        ],
      },
    });

    // 既存のチケット情報を削除し，最新の情報を登録する．
    await prisma.ticket.deleteMany({ where: { skiResortId: uniqueName } });
    for (const ticket of tickets) {
      await prisma.ticket.create({
        data: {
          skiResortId: uniqueName,
          name: ticket.NameOfTicket,
          priceAdult: ticket.AdultTicket
            ? Number(ticket.AdultTicket.replaceAll(",", ""))
            : null,
          priceChild: ticket.ChildTicket
            ? Number(ticket.ChildTicket.replaceAll(",", ""))
            : null,
          priceOlderChild: ticket.OlderChildTicket
            ? Number(ticket.OlderChildTicket.replaceAll(",", ""))
            : null,
          priceSenior: ticket.SeniorTicket
            ? Number(ticket.SeniorTicket.replaceAll(",", ""))
            : null,
        },
      });
    }
  }

  const count = await prisma.skiResort.count();
  console.log(`\n✅ Successfully saved ${count} ski resorts to the database.`);
}

// 他のモジュールから呼び出せるようにエクスポートする．
export { main as runCrawlSkiAreas };

// スクリプトとして直接実行された場合のエントリーポイント．
if (require.main === module) {
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await disconnectPrisma();
    });
}
