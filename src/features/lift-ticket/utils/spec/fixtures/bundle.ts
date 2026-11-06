/** 仕様書 BN（リフト券＋レンタルのセット券）の架空スキー場。test() は含めない */

import type { TicketRentalItem } from "../../../types";
import { type SpecTicket, specResort } from "../../testing/specResort";

const SKI3_ITEMS: TicketRentalItem[] = ["skis", "ski_boots", "poles"];
/** セットの中身は rental_items に構造化して持つ（名称の文字は読まない） */
const rentalItem = (name: string, items: TicketRentalItem[] = SKI3_ITEMS) => [
  { type: "rental", name_ja: name, rental_items: items },
];
const day = (prices: SpecTicket["prices"]): SpecTicket => ({
  id: "day",
  name: "1日券",
  validity: { mode: "calendar_day", days: 1 },
  covers: ["regular"],
  prices,
});
const AUDIENCES = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "university",
    name_ja: "大学生",
    school_levels: ["university", "graduate"],
  },
  {
    id: "elementary",
    name_ja: "小学生",
    school_levels: ["elementary_school"],
  },
];
const RENTAL_AUDIENCES = [
  { id: "adult", name_ja: "大人", is_default: true },
  {
    id: "kids",
    name_ja: "子ども",
    school_levels: ["elementary_school", "preschool"],
  },
];

/** BN01: 当日学割パック（6時間券＋スキーセット） */
export const studentPackResort = specResort({
  id: "spec-bundle-student",
  audiences: AUDIENCES,
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    {
      id: "h6",
      name: "6時間券",
      validity: { mode: "hours_from_first_use", hours: 6 },
      prices: { adult: 5700, university: 5700 },
    },
    {
      id: "pack-student",
      name: "当日学割パック（6時間券＋スキーセット）",
      validity: { mode: "hours_from_first_use", hours: 6 },
      included: rentalItem("スキーセット"),
      prices: { university: 7100 },
    },
  ],
  rentals: [{ id: "ski-set", items: ["ski_set"], prices: { adult: 4500 } }],
});

/** BN02: 1日・2日・3日のパック */
export const multiDayPackResort = specResort({
  id: "spec-bundle-multi-day",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    day({ adult: 6000 }),
    {
      id: "d2",
      name: "2日券",
      validity: { mode: "consecutive_days", days: 2 },
      prices: { adult: 11000 },
    },
    {
      id: "pack1",
      name: "1日パック",
      validity: { mode: "calendar_day", days: 1 },
      included: rentalItem("スキー3点"),
      prices: { adult: 9500 },
    },
    {
      id: "pack2",
      name: "2日パック",
      validity: { mode: "consecutive_days", days: 2 },
      included: rentalItem("スキー3点"),
      prices: { adult: 17000 },
    },
    {
      id: "pack3",
      name: "3日パック",
      validity: { mode: "consecutive_days", days: 3 },
      included: rentalItem("スキー3点"),
      prices: { adult: 24000 },
    },
  ],
  rentals: [
    { id: "ski-1", items: ["ski_set"], prices: { adult: 4500 } },
    {
      id: "ski-2",
      items: ["ski_set"],
      prices: { adult: 8500 },
      duration: { mode: "days", days: 2 },
    },
  ],
});

/** BN03: スキー3点＋ウェア＋ゴーグル＋グローブで 15,400円 */
export const fullPackResort = specResort({
  id: "spec-bundle-full",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    day({ adult: 6000 }),
    {
      id: "pack-full",
      name: "フルパック",
      validity: { mode: "calendar_day", days: 1 },
      included: rentalItem("スキー3点・ウェア・ゴーグル・グローブ", [
        ...SKI3_ITEMS,
        "wear",
        "goggles",
        "gloves",
      ]),
      prices: { adult: 15400 },
    },
  ],
  // 別々に買うと 6,000+4,500+4,800+2,500+1,500 = 19,300円
  rentals: [
    { id: "ski-set", items: ["ski_set"], prices: { adult: 4500 } },
    { id: "wear", items: ["wear"], prices: { adult: 4800 } },
    { id: "goggles", items: ["goggles"], prices: { adult: 2500 } },
    { id: "gloves", items: ["gloves"], prices: { adult: 1500 } },
  ],
});

/** BN04: パックにヘルメットが含まれない */
export const noHelmetPackResort = specResort({
  id: "spec-bundle-no-helmet",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    day({ adult: 5500 }),
    {
      id: "pack",
      name: "スキーパック",
      validity: { mode: "calendar_day", days: 1 },
      included: rentalItem("スキー3点"),
      prices: { adult: 8000 },
    },
  ],
  rentals: [
    { id: "ski-set", items: ["ski_set"], prices: { adult: 4500 } },
    { id: "helmet", items: ["helmet"], prices: { adult: 1000 } },
  ],
});

/** BN05: パック対象は大人だけ */
export const adultOnlyPackResort = specResort({
  id: "spec-bundle-adult-only",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    day({ adult: 5500, elementary: 3000 }),
    {
      id: "pack",
      name: "スキーパック",
      validity: { mode: "calendar_day", days: 1 },
      included: rentalItem("スキー3点"),
      prices: { adult: 8000 },
    },
  ],
  rentals: [
    { id: "ski-set", items: ["ski_set"], prices: { adult: 4500, kids: 3500 } },
  ],
});

/** BN06: 1日券＋スキーセットのパック 8,000円、4時間券 4,000円、4時間レンタル 3,800円 */
export const hoursVsPackResort = specResort({
  id: "spec-bundle-hours",
  rentalAudiences: RENTAL_AUDIENCES,
  tickets: [
    day({ adult: 6000 }),
    {
      id: "h4",
      name: "4時間券",
      validity: { mode: "hours_from_first_use", hours: 4 },
      prices: { adult: 4000 },
    },
    {
      id: "pack",
      name: "1日券＋スキーセット",
      validity: { mode: "calendar_day", days: 1 },
      included: rentalItem("スキー3点"),
      prices: { adult: 8000 },
    },
  ],
  rentals: [
    { id: "ski-day", items: ["ski_set"], prices: { adult: 5000 } },
    {
      id: "ski-4h",
      items: ["ski_set"],
      prices: { adult: 3800 },
      duration: { mode: "hours", hours: 4 },
    },
  ],
});
