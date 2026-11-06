/** 仕様書 節A・A2: 標準型、午前券・午後券だけの型 */
import { type SpecRental, specResort } from "../../testing/specResort";
import { dayTicket, hourTicket, windowTicket } from "../helpers";

const rentals: SpecRental[] = [
  { id: "ski-set-day", items: ["ski_set"], prices: { adult: 5000 } },
  {
    id: "ski-set-4h",
    items: ["ski_set"],
    prices: { adult: 3800 },
    duration: { mode: "hours", hours: 4 },
  },
  { id: "skis", items: ["skis"], prices: { adult: 3500 } },
  { id: "ski-boots", items: ["ski_boots"], prices: { adult: 2000 } },
  { id: "poles", items: ["poles"], prices: { adult: 500 } },
  { id: "wear", items: ["wear"], prices: { adult: 4000 } },
];

const standardTickets = (fourHourPrice: number) => [
  dayTicket("day", "1日券", 5000),
  hourTicket("h4", "4時間券", 4, fourHourPrice),
  windowTicket("am", "午前券", "08:30", "12:30", 3500),
  windowTicket("pm", "午後券", "12:30", "16:30", 3500),
];

/** 営業 8:30〜16:30、ナイターなし */
export const resortA = specResort({
  id: "spec-a",
  tickets: standardTickets(4000),
  rentals,
});

/** A09: 4時間券を3,000円に変更 */
export const resortA09 = specResort({
  id: "spec-a09",
  tickets: standardTickets(3000),
  rentals,
});

/** A2: 午前券・午後券だけの型 */
export const resortA2 = specResort({
  id: "spec-a2",
  tickets: [
    dayTicket("day", "1日券", 5000),
    windowTicket("am", "午前券", "08:30", "12:30", 3000),
    windowTicket("pm", "午後券", "12:00", "16:30", 3000),
  ],
});
