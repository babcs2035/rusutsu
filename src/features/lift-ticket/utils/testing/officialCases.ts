/**
 * 公式照合ケース（uiContract.test.ts が読む期待値）。
 *
 * 期待値はスキー場ごとに rusutsu-library の
 * `data/lift-ticket-test-fixtures/official-cases/<resort-id>.json` に置く。
 * 公式資料から独立に転記したもので、計算結果から生成しない。
 * 1ファイルの形: { "audienceTickets": { "<resort>@<season>": [...] }, "cases": [OfficialCase, ...] }
 */
import fs from "node:fs";
import path from "node:path";
import type { LiftTicketSearchInput, TicketPartyCategory } from "../../types";

/** 券種を変えても学校区分・資格が保持されることを公式表で照合する1行 */
export type OfficialAudienceTicket = [
  product: string,
  category: TicketPartyCategory,
  age: number | null,
  amount: number | null,
];

/** 公式から独立転記した期待値（2026-10-14に3施設追加）。計算結果から生成しない。 */
export type OfficialCase = {
  resort: string;
  season: string;
  date: string;
  urls: string[];
  /** UIの「1日」、年齢未入力（小7〜12・中13〜15・高16〜18歳として扱う）。nullは年齢確認が必要。 */
  categories: Record<Exclude<TicketPartyCategory, "other">, number | null>;
  ages: Array<[TicketPartyCategory, number, number]>;
  disabilityAmounts: Partial<
    Record<Exclude<TicketPartyCategory, "disabled" | "other">, number>
  >;
  /** UIの「1日」の日付別期待値（大人30歳）。 */
  dates: Array<[string, number]>;
  /** 券を指定して確認する公式料金。購入可能なWeb料金も含む。 */
  products: Array<[string, number | null]>;
  /** 利用日と照会日を分け、前売販売期間を公式の期限で照合する。 */
  productQueries?: Array<{
    product: string;
    date: string;
    today: string;
    amount: number | null;
    payable?: number | null;
    category?: TicketPartyCategory;
    age?: number | null;
  }>;
  multiDays?: Array<[string[], number, number]>;
  audienceDates?: Array<[TicketPartyCategory, number | null, string, number]>;
  /** UIの時間入力→期待額（大人30歳）。nullは営業時間超過等。 */
  hours: Array<[number, number | null]>;
  /** 単独では公式料金がない区分（保護者同伴時のみ無料など）。年齢未入力でnullを期待する。 */
  noPriceCategories?: TicketPartyCategory[];
  /** UIの「1日（ナイター込）」の期待値（大人30歳）。省略時は categories.adult。 */
  dayWithNight?: number | null;
  /** ナイター営業の公式情報が未掲載の場合は照合を保留する。 */
  nightUnknown?: boolean;
  closed?: string[];
  ambiguousAges?: Array<[TicketPartyCategory, number]>;
  openExceptions?: string[];
  hourAudiences?: Array<
    [TicketPartyCategory, number | null, number, number, string]
  >;
  partyQueries?: Array<{
    name: string;
    input: LiftTicketSearchInput;
    product?: string;
    amount: number | null;
  }>;
  rentalQueries?: Array<{
    name: string;
    input: LiftTicketSearchInput;
    amount: number | null;
    /** 借りられない用具として合計の横に添える要約（「ゴーグル」） */
    missing?: string[];
    /** 区分によって貸出が無い用具（「小学生のウェア」）。合計には含めない */
    unavailable?: string[];
  }>;
};

type OfficialCaseFile = {
  audienceTickets?: Record<string, OfficialAudienceTicket[]>;
  cases?: OfficialCase[];
};

const CASES_DIR = path.join(
  process.cwd(),
  "src/private/data/lift-ticket-test-fixtures/official-cases",
);
const readJson = <T>(file: string) =>
  JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), "utf8")) as T;
const caseFiles = fs
  .readdirSync(CASES_DIR)
  .filter(file => file.endsWith(".json") && !file.startsWith("_"))
  .sort();

/** 券種を変えても学校区分・資格が保持されることを公式表で照合する。 */
export const OFFICIAL_AUDIENCE_TICKETS: Record<
  string,
  OfficialAudienceTicket[]
> = {};
/** 公式から独立転記した期待値。計算結果から生成しない。 */
export const OFFICIAL_CASES: OfficialCase[] = [];
for (const file of caseFiles) {
  const { audienceTickets = {}, cases = [] } = readJson<OfficialCaseFile>(file);
  Object.assign(OFFICIAL_AUDIENCE_TICKETS, audienceTickets);
  OFFICIAL_CASES.push(...cases);
}

/** 五竜・Hakuba47 の子IDだけのレンタル照会（料金表は親IDと共通） */
const CHILD_RENTAL_QUERIES = readJson<
  Record<string, OfficialCase["rentalQueries"]>
>("_child-rental-queries.json");

// 五竜・Hakuba47は子IDにも同じ共通料金表のJSONがあるため、親IDの公式照合ケースで照合する。
for (const resort of ["able-hakuba-goryu", "hakuba-47-winter-sports-park"]) {
  OFFICIAL_AUDIENCE_TICKETS[resort] =
    OFFICIAL_AUDIENCE_TICKETS["able-hakuba-goryu-area"];
  for (const spec of OFFICIAL_CASES.filter(
    c => c.resort === "able-hakuba-goryu-area",
  ))
    OFFICIAL_CASES.push({
      ...spec,
      resort,
      rentalQueries: CHILD_RENTAL_QUERIES[resort],
    });
}
