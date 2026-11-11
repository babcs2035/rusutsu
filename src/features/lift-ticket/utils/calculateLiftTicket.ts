import type {
  LiftTicketAudience,
  LiftTicketCalendar,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketPartyRule,
  LiftTicketPrice,
  LiftTicketProduct,
  LiftTicketSearchInput,
  LiftTicketSourceQuote,
  PriceReference,
  TicketCalculationLine,
  TicketCalculationResult,
  TicketConditionalOffer,
  TicketDayPlan,
  TicketDurationRequest,
  TicketPartyCategory,
  TicketPartyGroup,
} from "../types";
import {
  isDailyLiftTicketProduct,
  isSharedLiftTicketProduct,
  priceModeOf,
} from "../types";
import {
  calculateDurationOptions,
  type TicketDurationOptions,
} from "./durationOptions";

export const TICKET_PARTY_CATEGORY_LABELS: Record<TicketPartyCategory, string> =
  {
    preschool: "未就学児",
    elementary: "小学生",
    junior_high: "中学生",
    high_school: "高校生",
    university: "大学・専門学生",
    adult: "大人",
    disabled: "障がい者",
    other: "学校区分なし",
  };

/** 学校区分ごとにあり得る年齢（早生まれ・遅生まれの両方を含む） */
const SCHOOL_AGE_RANGES: Partial<
  Record<TicketPartyCategory, { min: number; max: number }>
> = {
  preschool: { min: 0, max: 6 },
  elementary: { min: 6, max: 12 },
  junior_high: { min: 12, max: 15 },
  high_school: { min: 15, max: 18 },
};

/** 入力した年齢が学校区分にあり得ない場合の案内。障がい者は学校区分で見る */
export const schoolAgeMismatchOf = (group: TicketPartyGroup) => {
  const category =
    group.category === "disabled"
      ? (group.baseCategory ?? "adult")
      : group.category;
  const range = SCHOOL_AGE_RANGES[category];
  if (group.age == null || !range) return null;
  if (group.age >= range.min && group.age <= range.max) return null;
  return `${TICKET_PARTY_CATEGORY_LABELS[category]}は${range.min}〜${range.max}歳です。年齢を確認してください。`;
};

export const getTodayInJapan = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const DEFAULT_LIFT_TICKET_SEARCH_INPUT: LiftTicketSearchInput = {
  visitDate: getTodayInJapan(),
  usePreference: "full_day",
  // 日ごとの計画を最初から1件持たせる。持たせないと計算対象が空になり、
  // 画面が「何も計算されない」状態になる
  days: [
    {
      id: "day-1",
      date: getTodayInJapan(),
      duration: { kind: "day", withNight: false },
    },
  ],
  party: [
    {
      id: "default-adult",
      category: "adult",
      age: null,
      // 最初から「大人1人」で料金が出ている状態にする
      count: 1,
    },
  ],
};

const pad = (value: number) => String(value).padStart(2, "0");
const ymd = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;
const dayOfWeek = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();
const nthMonday = (year: number, month: number, nth: number) => {
  const firstDayOfWeek = dayOfWeek(year, month, 1);
  const firstMonday = 1 + ((8 - firstDayOfWeek) % 7);
  return firstMonday + (nth - 1) * 7;
};
const vernalEquinoxDay = (year: number) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980)) -
  Math.floor((year - 1980) / 4);
const autumnalEquinoxDay = (year: number) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980)) -
  Math.floor((year - 1980) / 4);
export const addDays = (dateString: string, numberOfDays: number) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + numberOfDays));
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const holidayCache = new Map<number, Map<string, string>>();

const holidaysOfYear = (year: number) => {
  const holidays = new Map([
    [ymd(year, 1, 1), "元日"],
    [ymd(year, 1, nthMonday(year, 1, 2)), "成人の日"],
    [ymd(year, 2, 11), "建国記念の日"],
    [ymd(year, 2, 23), "天皇誕生日"],
    [ymd(year, 3, vernalEquinoxDay(year)), "春分の日"],
    [ymd(year, 4, 29), "昭和の日"],
    [ymd(year, 5, 3), "憲法記念日"],
    [ymd(year, 5, 4), "みどりの日"],
    [ymd(year, 5, 5), "こどもの日"],
    [ymd(year, 7, nthMonday(year, 7, 3)), "海の日"],
    [ymd(year, 8, 11), "山の日"],
    [ymd(year, 9, nthMonday(year, 9, 3)), "敬老の日"],
    [ymd(year, 9, autumnalEquinoxDay(year)), "秋分の日"],
    [ymd(year, 10, nthMonday(year, 10, 2)), "スポーツの日"],
    [ymd(year, 11, 3), "文化の日"],
    [ymd(year, 11, 23), "勤労感謝の日"],
  ]);

  for (const dateString of [...holidays.keys()]) {
    const [holidayYear, month, day] = dateString.split("-").map(Number);
    if (dayOfWeek(holidayYear, month, day) !== 0) continue;

    let nextDate = addDays(dateString, 1);
    while (holidays.has(nextDate)) {
      nextDate = addDays(nextDate, 1);
    }
    holidays.set(nextDate, "振替休日");
  }

  for (const dateString of [...holidays.keys()]) {
    const between = addDays(dateString, 1);
    const after = addDays(dateString, 2);
    if (holidays.has(between) || !holidays.has(after)) continue;

    const [betweenYear, month, day] = between.split("-").map(Number);
    if (dayOfWeek(betweenYear, month, day) !== 0) {
      holidays.set(between, "国民の休日");
    }
  }

  return holidays;
};

const getDayInfo = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = dayOfWeek(year, month, day);
  if (!holidayCache.has(year)) {
    holidayCache.set(year, holidaysOfYear(year));
  }
  const holidayName = holidayCache.get(year)?.get(dateString) ?? null;

  return {
    weekday,
    isSaturday: weekday === 6,
    isSunday: weekday === 0,
    isPublicHoliday: holidayName !== null,
    isWeekday: weekday >= 1 && weekday <= 5 && holidayName === null,
  };
};

/** 曜日番号 → included_day_types のラベル（0=日曜） */
const WEEKDAY_DAY_TYPES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const dayTypeMatches = (dayType: string, dateString: string) => {
  const dayInfo = getDayInfo(dateString);
  switch (dayType) {
    case "all":
      return true;
    case "weekday":
      return dayInfo.isWeekday;
    case "saturday":
      return dayInfo.isSaturday;
    case "sunday":
      return dayInfo.isSunday;
    case "public_holiday":
      return dayInfo.isPublicHoliday;
    // ★個別曜日。「毎週火曜定休」「毎週土曜こどもデー」を表すために必要。
    // これが無いと定休日のカレンダーが一致せず、営業していない日に料金が出る。
    // 祝日かどうかは問わない（定休日は祝日でも定休なのが普通）
    case "monday":
    case "tuesday":
    case "wednesday":
    case "thursday":
    case "friday":
      return WEEKDAY_DAY_TYPES[dayInfo.weekday] === dayType;
    default:
      // year_end_new_year / special / unknown は明示日付でのみ一致させる
      return false;
  }
};

export const calendarMatchesDate = (
  calendar: LiftTicketCalendar | undefined,
  dateString: string,
) => {
  if (!calendar) return false;
  if (calendar.excluded_dates?.includes(dateString)) return false;
  if (
    calendar.excluded_date_ranges?.some(
      range => range.start <= dateString && dateString <= range.end,
    )
  ) {
    return false;
  }
  return (
    calendar.included_dates?.includes(dateString) === true ||
    calendar.included_date_ranges?.some(
      range => range.start <= dateString && dateString <= range.end,
    ) === true ||
    calendar.included_day_types?.some(dayType =>
      dayTypeMatches(dayType, dateString),
    ) === true
  );
};

export const periodContains = (
  period: { start?: string | null; end?: string | null } | null | undefined,
  dateString: string,
) => {
  if (!period) return true;
  if (period.start && dateString < period.start) return false;
  if (period.end && dateString > period.end) return false;
  return true;
};

export const seasonContains = (data: LiftTicketData, dateString: string) =>
  periodContains(
    {
      start: data.season.start_date,
      end: data.season.end_date,
    },
    dateString,
  );

export const selectLiftTicketSeason = (
  seasons: LiftTicketData[],
  dateString: string,
) => {
  if (seasons.length === 0) return null;
  if (!dateString) return seasons[0];
  return seasons.find(season => seasonContains(season, dateString)) ?? null;
};

export const getDailyLiftTicketProducts = (data: LiftTicketData) =>
  data.products.filter(isDailyLiftTicketProduct);

const durationHours = (product: LiftTicketProduct) => {
  if (typeof product.validity?.hours === "number") {
    return product.validity.hours;
  }
  if (
    product.validity?.mode === "fixed_time_window" &&
    product.validity.start_time &&
    product.validity.end_time
  ) {
    const [startHour, startMinute] = product.validity.start_time
      .split(":")
      .map(Number);
    const [endHour, endMinute] = product.validity.end_time
      .split(":")
      .map(Number);
    return endHour + endMinute / 60 - (startHour + startMinute / 60);
  }
  return null;
};

/**
 * 対象者の絞り込み（性別・資格）が付いているか。
 * 付いているofferは誰でも買えるわけではないので、代表価格には使わない。
 */
const hasTargetRestriction = (offer: LiftTicketOffer) =>
  offer.target_genders != null || offer.target_qualification != null;

const isUnconditionalStandardOffer = (offer: LiftTicketOffer) =>
  (offer.discount_reasons?.length ?? 0) === 0 && !hasTargetRestriction(offer);

/**
 * 日付と人物区分だけで対象可否が確定するイベント料金。
 *
 * こどもデーのような special_day は、calendar と audience が一致し、
 * 追加資格・提示物・事前購入条件が無ければ利用者がすでに条件を満たしている。
 * 会員・宿泊者・クーポン等は入力から確定できないため、ここには含めない。
 */
const isAutomaticallyApplicableCalendarOffer = (offer: LiftTicketOffer) => {
  const reasons = offer.discount_reasons ?? [];
  return (
    reasons.length > 0 &&
    reasons.every(reason => ["special_day", "kids_day"].includes(reason)) &&
    !hasTargetRestriction(offer) &&
    (offer.requirements?.length ?? 0) === 0 &&
    offer.purchase_deadline == null
  );
};

/** 購入方法だけで安くなる割引の理由（WEB購入・前売・早割）。誰でも期限内に買える */
const PURCHASE_METHOD_REASONS = ["online_purchase", "advance_purchase"];

/**
 * 購入方法だけが条件の割引（WEB前売・早割など）。
 *
 * 会員・宿泊者のような資格は要らず、**今買えるなら誰でもその値段になる**ので、
 * 通常料金より安ければ条件付き候補ではなく計算結果そのものに使う。
 * 対象日の割引（special_day）と重なっていてもよい。
 */
const isPurchaseMethodOffer = (offer: LiftTicketOffer) => {
  const reasons = offer.discount_reasons ?? [];
  return (
    reasons.some(reason => PURCHASE_METHOD_REASONS.includes(reason)) &&
    reasons.every(reason =>
      [...PURCHASE_METHOD_REASONS, "special_day", "kids_day"].includes(reason),
    ) &&
    !hasTargetRestriction(offer)
  );
};

/**
 * 利用日に現地の窓口で買える券か（前売・WEB割引ではなく、URLの無い販売経路がある）。
 * 販売経路が未記録なら窓口とみなす
 */
const isSoldOnVisitDay = (
  data: LiftTicketData,
  item: Pick<LiftTicketOffer, "discount_reasons" | "channel_ids">,
) => {
  if (
    (item.discount_reasons ?? []).some(reason =>
      PURCHASE_METHOD_REASONS.includes(reason),
    )
  ) {
    return false;
  }
  const channelIds = item.channel_ids ?? [];
  return (
    channelIds.length === 0 ||
    channelIds.some(
      channelId =>
        !data.channels.find(channel => channel.id === channelId)?.url,
    )
  );
};

/**
 * 照会日（today）に販売中で、その利用日の購入期限に間に合うか。
 *
 * ★**販売期間は利用日ではなく購入する日と比べる。** 「11/30まで販売の早割」は
 * 1月に滑る分でも11/30を過ぎたら買えない。販売期間外・販売期限切れ・
 * 「利用日の〇日前まで」を過ぎた券は、計算にも候補にも出さない。
 *
 * 販売開始前の前売・WEB料金はまだ購入できないので、計算には使わない。
 * 当日に窓口で買える券（`soldOnVisitDay`）は、利用日までに販売が始まれば買える。
 */
export const isPurchasableOn = (
  offer: Pick<LiftTicketOffer, "sales_period" | "purchase_deadline">,
  visitDate: string,
  today: string,
  soldOnVisitDay = false,
) => {
  const sales = offer.sales_period;
  const deadline = offer.purchase_deadline;
  if (sales?.start && today < sales.start && !soldOnVisitDay) return false;
  if (!sales?.start && !sales?.end && !deadline) return true;

  // 買える最初の日: 今日と販売開始日の遅いほう
  const firstPurchaseDate =
    sales?.start && sales.start > today ? sales.start : today;
  // 買える最後の日: 販売終了日・固定期限・「利用日の〇日前まで」の早いほう。
  // 利用開始後に買う券ではないので、利用日を超えることはない
  const daysBeforeUse = Math.max(
    deadline?.days_before_use ?? 0,
    deadline?.same_day_allowed === false ? 1 : 0,
  );
  const lastPurchaseDate = [
    addDays(visitDate, -daysBeforeUse),
    sales?.end,
    deadline?.deadline_date,
  ]
    .filter((date): date is string => Boolean(date))
    .reduce((earliest, date) => (date < earliest ? date : earliest));
  return firstPurchaseDate <= lastPurchaseDate;
};

/**
 * 販売が終わった券か（利用日に関係なく、今日の時点でもう買えない）。
 * 料金表から外すのに使う。販売開始前の券は、これから買えるので残す
 */
export const isSalesEnded = (offer: LiftTicketOffer, today: string) =>
  (offer.sales_period?.end != null && today > offer.sales_period.end) ||
  (offer.purchase_deadline?.deadline_date != null &&
    today > offer.purchase_deadline.deadline_date);

/** 「2025-11-30」→「2025/11/30」 */
const slashDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return `${year}/${Number(month)}/${Number(day)}`;
};

/** 販売期間の表示（「販売期間: 2025/11/1〜2025/11/30」）。期間が無ければ null */
export const formatSalesPeriod = (period: LiftTicketOffer["sales_period"]) => {
  if (!period?.start && !period?.end) return null;
  return `販売期間: ${period.start ? slashDate(period.start) : ""}〜${
    period.end ? slashDate(period.end) : ""
  }`;
};

const hasUnconditionalStandardOffer = (
  data: LiftTicketData,
  product: LiftTicketProduct,
) =>
  data.offers.some(
    offer =>
      offer.product_id === product.id && isUnconditionalStandardOffer(offer),
  );

/**
 * その日が定休日・休業日なら、その根拠のカレンダーを返す。
 *
 * ★**営業していない日に料金を出してはいけない。** `hours_type: "closed"` は
 * 他の営業時間より優先する。「毎週火曜定休（12/30は営業）」は
 * `included_day_types: ["tuesday"]` ＋ `excluded_dates: ["2025-12-30"]`
 * で表されるので、
 * excluded_dates を持つ日は定休日に**一致しない**（例外的に営業する）。
 */
export const findClosedCalendar = (
  data: LiftTicketData,
  dateString: string,
) => {
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  for (const entry of data.operating_hours ?? []) {
    if (entry.hours_type !== "closed") continue;
    for (const calendarId of entry.calendar_ids ?? []) {
      const calendar = calendarById.get(calendarId);
      if (calendarMatchesDate(calendar, dateString)) return calendar;
    }
  }
  return null;
};

const toMinutes = (time?: string | null) => {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/**
 * その日に利用できる営業区間の合計時間。重なる区間は一度だけ数える。
 * 既定は日中。券の有効範囲や営業全体の上限を調べるときは区分を指定する。
 */
const operatingHoursOn = (
  data: LiftTicketData,
  dateString: string,
  hoursTypes: string[] = ["regular", "early_morning"],
) => {
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const matchesDate = (entry: { calendar_ids?: string[] }) =>
    (entry.calendar_ids ?? []).some(id =>
      calendarMatchesDate(calendarById.get(id), dateString),
    );
  if (findClosedCalendar(data, dateString)) return null;

  const intervals: Array<[number, number]> = [];
  for (const entry of data.operating_hours ?? []) {
    if (entry.hours_type == null || !hoursTypes.includes(entry.hours_type))
      continue;
    if (!matchesDate(entry)) continue;
    const start = toMinutes(entry.start_time);
    const end = toMinutes(entry.end_time);
    if (start == null || end == null || end <= start) continue;
    intervals.push([start, end]);
  }
  if (intervals.length === 0) return null;
  intervals.sort((left, right) => left[0] - right[0]);
  let total = 0;
  let [start, end] = intervals[0];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      total += end - start;
      [start, end] = [nextStart, nextEnd];
    }
  }
  return (total + end - start) / 60;
};

const allOperatingHoursOn = (data: LiftTicketData, dateString: string) =>
  // 夜間だけの既知の時間で、未掲載の日中営業時間まで制限しない。
  operatingHoursOn(data, dateString) == null
    ? null
    : operatingHoursOn(data, dateString, ["regular", "early_morning", "night"]);

/**
 * その日にナイター営業があるか。定休日・ナイター営業日でない日は false。
 * 「ナイター込み1日券」の解決に、この日にそもそもナイターがあるかを使う。
 */
export const hasNightOperatingOn = (
  data: LiftTicketData,
  dateString: string,
) => {
  if (findClosedCalendar(data, dateString)) return false;
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  return (data.operating_hours ?? []).some(
    entry =>
      entry.hours_type === "night" &&
      (entry.calendar_ids ?? []).some(id =>
        calendarMatchesDate(calendarById.get(id), dateString),
      ),
  );
};

/**
 * その券がナイター単独券か。
 *
 * 1日券のナイター込みもナイター単独券も covers_hours_types で表す。
 * ナイター単独券は fixed_time_window（例: 17:00〜21:00）かつ
 * covers_hours_types が ["night"] の商品として記録される。
 */
const isNightTicketProduct = (product: LiftTicketProduct) =>
  product.validity?.mode === "fixed_time_window" &&
  product.covers_hours_types?.includes("night") === true &&
  !product.covers_hours_types.includes("regular");

/**
 * その券で何時間滑れるか。
 * 券自体に時間が書かれていない1日券は営業時間から算出する。
 * 回数券・複数日に分けて使う券は「何時間滑れるか」の軸に載らないので null。
 */
export const skiableHoursOf = (
  product: LiftTicketProduct,
  data: LiftTicketData,
  dateString: string,
) => {
  const mode = product.validity?.mode;
  if (mode === "rides" || mode === "points" || mode === "hours_pool")
    return null;
  if (mode === "calendar_day" || mode === "consecutive_days") {
    const covers = product.covers_hours_types ?? ["regular", "early_morning"];
    if (
      covers.includes("regular") &&
      operatingHoursOn(data, dateString) == null
    )
      return null;
    return operatingHoursOn(data, dateString, covers);
  }
  return durationHours(product);
};

/**
 * 営業時間が分からない日の1日券か（滑れる時間を営業時間から出せない）。
 * ナイター専用の1日券は日中の時間指定に使えないので含めない
 */
const isUnknownHoursDayPass = (
  product: LiftTicketProduct,
  data: LiftTicketData,
  dateString: string,
) => {
  if (product.validity?.mode !== "calendar_day") return false;
  if (product.validity.days !== 1) return false;
  const covers = product.covers_hours_types ?? null;
  if (covers != null && !covers.includes("regular")) return false;
  return skiableHoursOf(product, data, dateString) == null;
};

/**
 * 長さの指定（1日・N時間・ナイター）に使える券の基本の候補。
 * 共通券・エリア限定券・誰でも買える料金の無い券をここで外す。
 * 利用単位（時間帯固定・回数券など）の判定は呼び出し側で行う。
 */
export const durationCandidateProducts = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
) => {
  // 付属物（温泉特典など）が付いていても普通のリフト券なので候補から外さない。
  // 外していたため「温泉特典付き9時間券」が7時間の要件で該当なしになっていた。
  // 共通券だけは別枠（画面の単独券／共通券の切り替えで扱う）。
  // ただし単独の1日券で同行者全員の料金が出せないスキー場（ヒラフ・斑尾・
  // 白馬コルチナは単独券なし、ダイナランドは大人以外が共通券のみ）では、
  // 共通券が実質の通常券なので候補に含める
  const audienceById = new Map(
    data.audiences.map(audience => [audience.id, audience]),
  );
  const coversParty = (product: LiftTicketProduct) =>
    input.party.every(group =>
      data.offers.some(
        offer =>
          offer.product_id === product.id &&
          isUnconditionalStandardOffer(offer) &&
          // 単独券が売られていない日（奥志賀の5/4〜5/5）は共通券を使う
          offerMatchesDate(data, offer, input.visitDate) &&
          (offer.audience_ids ?? []).some(audienceId => {
            const audience = audienceById.get(audienceId);
            return audience
              ? audienceMatchesGroup(audience, group, audienceById)
              : false;
          }),
      ),
    );
  // レンタル付きパックは通常の1日券の代わりにならない
  // （高鷲は単独の通常1日券がなく、パックがあると共通券が候補から外れていた）
  const hasSingleDayPass = data.products.some(
    product =>
      !isSharedLiftTicketProduct(product) &&
      !(product.included_items ?? []).some(item => item.type === "rental") &&
      product.validity?.days === 1 &&
      hasUnconditionalStandardOffer(data, product) &&
      coversParty(product),
  );
  const isExcludedShared = (product: LiftTicketProduct) =>
    hasSingleDayPass && isSharedLiftTicketProduct(product);
  // 「1日券」が「ゲート通過から連続8時間」のような時間券のスキー場（夏油高原）もある。
  // 8時間以上の時間券は1日券と同じく、エリア限定の安い券より優先する
  const isDayLikePass = (product: LiftTicketProduct) =>
    product.validity?.days === 1 ||
    (product.validity?.mode === "hours_from_first_use" &&
      (product.validity?.hours ?? 0) >= 8);
  const hasUnrestrictedDayPass = data.products.some(
    product =>
      !isExcludedShared(product) &&
      (product.area_ids?.length ?? 0) === 0 &&
      isDayLikePass(product) &&
      hasUnconditionalStandardOffer(data, product),
  );
  return data.products.filter(product => {
    if (isExcludedShared(product)) return false;
    // 利用エリアを指定していない検索に、初心者エリア限定の安い券を出さない。
    if (hasUnrestrictedDayPass && (product.area_ids?.length ?? 0) > 0)
      return false;
    return hasUnconditionalStandardOffer(data, product);
  });
};

/**
 * 「〇時間滑りたい」を満たす券のうち、**パーティ合計が最安**のものを選ぶ。
 *
 * 券種名を選ばせる代わりに滑る長さで選べるようにするための関数。
 * 「7時間」と入力されたら9時間券が候補になり、3〜6時間券は落ちる。
 */
export const selectCheapestProductForDuration = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  request: TicketDurationRequest,
) => {
  if (request.kind === "product") {
    return (
      data.products.find(product => product.id === request.productId) ?? null
    );
  }
  const operatingHours = allOperatingHoursOn(data, input.visitDate);
  if (
    request.kind === "hours" &&
    operatingHours != null &&
    request.hours > operatingHours
  )
    return null;
  const baseCandidates = new Set(
    durationCandidateProducts(data, input).map(product => product.id),
  );
  const candidates = data.products.filter(product => {
    if (!baseCandidates.has(product.id)) return false;
    // ★時間帯が固定された券（ゴゴイチ券など）は朝から滑りたい人の代表にしない。
    // 明示的に券種を選んだ場合だけ使える
    if (product.validity?.mode === "fixed_time_window") return false;
    if (request.kind === "day") {
      // ★「1日（ナイター無）」と「1日（ナイター込）」は別の券。
      // ナイターを含むかは covers_hours_types が表す（validity からは導出できない）
      const covers = product.covers_hours_types ?? null;
      const coversNight = covers?.includes("night") ?? null;
      if (request.withNight) {
        // ナイター込みが欲しいなら、ナイターを含むと明記された券だけ
        if (coversNight !== true) return false;
      } else if (coversNight === true && (covers?.length ?? 0) === 1) {
        // ナイター専用券は「1日（ナイター無）」の候補にしない
        return false;
      }
      const days = product.validity?.days ?? null;
      if (days === 1) return true;
      // 1日券が無いスキー場（めがひらは最長9時間券）では、
      // その日の営業時間を満たす最長の券で代替する
      const open = operatingHoursOn(data, input.visitDate);
      return (
        open != null &&
        (skiableHoursOf(product, data, input.visitDate) ?? 0) >= open
      );
    }
    if (request.kind === "days") {
      const days = product.validity?.days ?? null;
      if (request.days >= 2)
        return (
          product.validity?.mode === "consecutive_days" &&
          days != null &&
          days >= request.days
        );
      // 1日券が無いスキー場（めがひらは最長9時間券）では、
      // その日の営業時間を満たす最長の券で代替する
      const open = operatingHoursOn(data, input.visitDate);
      return (
        days === 1 ||
        (open != null &&
          (skiableHoursOf(product, data, input.visitDate) ?? 0) >= open)
      );
    }
    const hours = skiableHoursOf(product, data, input.visitDate);
    // ★1日券はその日の営業時間いっぱい使えるので、時間指定の要件は満たす。
    // 営業時間が未掲載でも候補から外さない（外すと「4時間」の要件で1日券が
    // 選ばれず、25時間券のような高い券になる）。営業時間不明は注意書きで伝える
    if (
      hours == null &&
      isUnknownHoursDayPass(product, data, input.visitDate)
    ) {
      return true;
    }
    return hours != null && hours >= request.hours;
  });
  if (candidates.length === 0) return null;

  const scored = candidates.map(product => {
    const result = calculateLiftTicket(
      data,
      { ...input, days: undefined },
      product.id,
    );
    return {
      product,
      total: result.payableTotal ?? Number.POSITIVE_INFINITY,
      hours:
        skiableHoursOf(product, data, input.visitDate) ??
        Number.POSITIVE_INFINITY,
    };
  });
  // 同額なら短い券（＝要件をぴったり満たすもの）を優先する
  scored.sort(
    (left, right) => left.total - right.total || left.hours - right.hours,
  );
  return scored[0]?.product ?? null;
};

export const selectPreferredDailyProduct = (
  data: LiftTicketData,
  preference: LiftTicketSearchInput["usePreference"],
) => {
  const products = getDailyLiftTicketProducts(data).filter(product =>
    hasUnconditionalStandardOffer(data, product),
  );
  if (products.length === 0) return null;

  const scoredProducts = products.map(product => {
    const hours = durationHours(product);
    if (preference === "half_day") {
      const score =
        hours == null
          ? product.validity?.mode === "calendar_day"
            ? 0
            : -1000
          : 1000 - Math.abs(hours - 4) * 100;
      return { product, score };
    }

    const score =
      product.validity?.mode === "calendar_day"
        ? 2000
        : hours == null
          ? -1000
          : hours * 100;
    return { product, score };
  });

  return scoredProducts.sort((left, right) => right.score - left.score)[0]
    ?.product;
};

/**
 * 画面の区分（TicketPartyCategory）→ 料金データの学校区分（school_levels）。
 *
 * ★**IDが違う。** 画面は `elementary` / `junior_high`、
 * 料金データは taxonomy の `elementary_school` / `junior_high_school`。
 * 直接 includes で突き合わせていたため**小学生の料金が一切引けていなかった**。
 * 大学生の区分は data 側が「大学生・大学院生」をまとめて持つことがあるので配列で対応する。
 */
const SCHOOL_LEVELS_BY_CATEGORY: Record<TicketPartyCategory, string[]> = {
  preschool: ["preschool"],
  elementary: ["elementary_school"],
  junior_high: ["junior_high_school"],
  high_school: ["high_school"],
  university: ["university", "graduate"],
  adult: [],
  disabled: [],
  other: [],
};

const matchesAge = (audience: LiftTicketAudience, age: number) =>
  (audience.age_min == null || age >= audience.age_min) &&
  (audience.age_max == null || age <= audience.age_max);

/**
 * 年齢未入力の小中高生は、通常の在学年齢として年齢制の料金に当てはめる。
 * 入力された年齢があればそちらを優先する（中学生12歳→小人など）。
 * 未就学児は無料と有料の境目をまたぐことが多いので年齢入力を求める。
 */
const DEFAULT_SCHOOL_AGE_RANGES: Partial<
  Record<TicketPartyCategory, readonly [number, number]>
> = {
  elementary: [7, 12],
  junior_high: [13, 15],
  high_school: [16, 18],
};

/** 年齢未入力の未就学児で、全年齢が同じ料金になるかを確かめる範囲 */
const PRESCHOOL_AGE_RANGE = [0, 6] as const;

const ageRangeOf = (group: TicketPartyGroup) =>
  group.age != null
    ? ([group.age, group.age] as const)
    : (DEFAULT_SCHOOL_AGE_RANGES[group.category] ?? null);

const containsAgeRange = (
  audience: LiftTicketAudience,
  [min, max]: readonly [number, number],
) =>
  (audience.age_min == null || min >= audience.age_min) &&
  (audience.age_max == null || max <= audience.age_max);

const overlapsAgeRange = (
  audience: LiftTicketAudience,
  [min, max]: readonly [number, number],
) =>
  (audience.age_min == null || max >= audience.age_min) &&
  (audience.age_max == null || min <= audience.age_max);

const hasAgeCondition = (audience: LiftTicketAudience) =>
  audience.age_min != null || audience.age_max != null;

const matchesSchool = (audience: LiftTicketAudience, group: TicketPartyGroup) =>
  SCHOOL_LEVELS_BY_CATEGORY[group.category].some(level =>
    audience.school_levels?.includes(level),
  );

const audienceDirectlyMatchesGroup = (
  audience: LiftTicketAudience,
  group: TicketPartyGroup,
): boolean => {
  if (audience.is_disability_qualified) return false;
  if ((audience.school_levels?.length ?? 0) > 0) {
    // 年齢だけで他の学年の料金を適用しない。年齢が公式の追加条件なら両方必要。
    return (
      matchesSchool(audience, group) &&
      (group.age == null || matchesAge(audience, group.age))
    );
  }
  const range = ageRangeOf(group);
  return (
    range != null &&
    hasAgeCondition(audience) &&
    containsAgeRange(audience, range)
  );
};

export const audienceMatchesGroup = (
  audience: LiftTicketAudience,
  group: TicketPartyGroup,
  audienceById: Map<string, LiftTicketAudience>,
): boolean => {
  if (group.category === "disabled") {
    // 専用料金も通常料金への戻しも、同じ年齢の基準区分を使う。
    const base = audience.is_disability_qualified
      ? audienceById.get(audience.base_audience_id ?? "")
      : audience;
    return (
      !!base &&
      !base.is_disability_qualified &&
      audienceMatchesGroup(
        base,
        { ...group, category: group.baseCategory ?? "adult" },
        audienceById,
      )
    );
  }
  if (audience.is_disability_qualified) return false;
  const others = [...audienceById.values()].filter(
    a => !a.is_disability_qualified,
  );
  const schoolMatches = others.filter(
    a => matchesSchool(a, group) && audienceDirectlyMatchesGroup(a, group),
  );
  if (schoolMatches.length > 0) return schoolMatches.includes(audience);
  if (audienceDirectlyMatchesGroup(audience, group)) return true;
  return (
    audience.is_default === true &&
    (group.age == null || matchesAge(audience, group.age)) &&
    !others.some(
      a => a.is_default !== true && audienceDirectlyMatchesGroup(a, group),
    )
  );
};

/** 年齢で料金が分かれる未就学児、通常の在学年齢が年齢区分をまたぐ学童は年齢入力が必要。 */
const needsAgeForGroup = (
  data: LiftTicketData,
  group: TicketPartyGroup,
): boolean => {
  if (group.category === "disabled")
    return needsAgeForGroup(data, {
      ...group,
      category: group.baseCategory ?? "adult",
    });
  if (
    group.age != null ||
    !["preschool", "elementary", "junior_high", "high_school"].includes(
      group.category,
    )
  )
    return false;
  const audiences = data.audiences.filter(a => !a.is_disability_qualified);
  const schoolMatches = audiences.filter(a => matchesSchool(a, group));
  if (schoolMatches.length > 0) {
    // 「4歳以上の未就学児」等を年齢なしで無料/有料のどちらかへ決めない。
    return (
      group.category === "preschool" && schoolMatches.some(hasAgeCondition)
    );
  }
  const ageAudiences = audiences.filter(
    a => a.is_default !== true && hasAgeCondition(a),
  );
  const range = DEFAULT_SCHOOL_AGE_RANGES[group.category];
  if (range) {
    // 例: 中学生13〜15歳がルスツの中人13〜18歳に収まれば年齢なしで決まる。
    return ageAudiences.some(
      a => overlapsAgeRange(a, range) && !containsAgeRange(a, range),
    );
  }
  return ageAudiences.some(
    a =>
      (a.age_min != null && a.age_min < 19) ||
      (a.age_max != null && a.age_max < 19),
  );
};

const offerMatchesDate = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  dateString: string,
) => {
  if (!periodContains(offer.use_period, dateString)) return false;
  const calendarIds = offer.calendar_ids ?? [];
  if (calendarIds.length === 0) return true;
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  return calendarIds.some(calendarId =>
    calendarMatchesDate(calendarById.get(calendarId), dateString),
  );
};

type ResolvedPrice = {
  amount: number | null;
  note: string | null;
};

const resolvePrice = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  dateString: string,
  depth = 0,
): ResolvedPrice => {
  const price = offer.price ?? {};
  if (depth > 5) {
    return { amount: null, note: "割引の参照関係を解決できません。" };
  }

  switch (priceModeOf(price)) {
    case "fixed":
    case "free":
      return {
        amount: price.amount ?? null,
        note: price.notes_ja ?? null,
      };
    case "derived_discount": {
      const baseOffer = data.offers.find(
        candidate => candidate.id === price.base_offer_id,
      );
      if (!baseOffer) {
        return { amount: null, note: "基準料金が見つかりません。" };
      }
      const basePrice = resolvePrice(data, baseOffer, dateString, depth + 1);
      const discountAmount = price.discount?.amount;
      const discountPercent = price.discount?.percent;
      if (
        basePrice.amount == null ||
        (discountAmount == null && discountPercent == null)
      ) {
        return { amount: null, note: "基準料金を解決できません。" };
      }
      const amount =
        discountAmount != null
          ? Math.max(0, basePrice.amount - discountAmount)
          : Math.max(
              0,
              Math.round(
                (basePrice.amount * (100 - (discountPercent ?? 0))) / 100,
              ),
            );
      return { amount, note: price.notes_ja ?? null };
    }
    case "range":
      return { amount: null, note: "公式料金が価格帯でのみ公表されています。" };
    case "live_dynamic":
      return {
        amount: null,
        note: "変動料金のため、購入時に公式サイトで確認が必要です。",
      };
    default:
      return { amount: null, note: "公式資料で金額を確定できません。" };
  }
};

// 何日にも分けて使う時間プール券（10時間券など）は1日券の代わりではない。
// 特別日の1日券料金を混ぜると、時間券の単価が1日券の額になってしまう
const isFullDayLike = (product: LiftTicketProduct) =>
  product.validity?.mode === "calendar_day" ||
  (product.validity?.mode !== "hours_pool" &&
    (durationHours(product) ?? 0) >= 6);

const includesRental = (product: LiftTicketProduct) =>
  (product.included_items ?? []).some(item => item.type === "rental");

/** 特定日・こどもデーの割引、または「20歳無料」のような年齢世代の料金 */
const isSpecialDayOrAgeGenerationOffer = (offer: LiftTicketOffer) =>
  offer.discount_reasons?.some(reason =>
    ["special_day", "kids_day"].includes(reason),
  ) || ageGenerationCondition(offer) != null;

const getAutomaticSpecialProductIds = (
  data: LiftTicketData,
  baseProduct: LiftTicketProduct,
  dateString: string,
) => {
  if (!isFullDayLike(baseProduct)) return [];
  const productById = new Map(
    data.products.map(product => [product.id, product]),
  );
  const withRental = includesRental(baseProduct);
  return (
    data.offers
      .filter(offer => offerMatchesDate(data, offer, dateString))
      // ナイター券など1日券に当たらない券の割引は、1日券の候補に混ぜない
      .filter(offer => {
        const product = productById.get(offer.product_id);
        if (product == null) return false;
        // レンタル付きのセット券と、リフト券だけの券を混ぜない
        // （レディースDAYの1日券をセット券の料金として出していた）
        if (includesRental(product) !== withRental) return false;
        const mode = product.validity?.mode;
        return mode == null || mode === "unknown" || isFullDayLike(product);
      })
      .filter(isSpecialDayOrAgeGenerationOffer)
      .map(offer => offer.product_id)
  );
};

/**
 * 出典番号を引くための対応表。**URLごとに1番号**にする
 * （同じページのHTMLとスクリーンショットは同じ出典）。
 */
export function buildReferences(data: LiftTicketData) {
  const numberByUrl = new Map<string, number>();
  const references: PriceReference[] = [];
  for (const source of data.sources ?? []) {
    const url = source.url;
    if (!url || numberByUrl.has(url)) continue;
    const number = references.length + 1;
    numberByUrl.set(url, number);
    references.push({ number, url, title: source.page_title ?? null });
  }
  const numberBySourceId = new Map<string, number>();
  for (const source of data.sources ?? []) {
    const number = source.url ? numberByUrl.get(source.url) : undefined;
    if (number != null) numberBySourceId.set(source.id, number);
  }
  return { references, numberBySourceId };
}

/** offer の料金記載場所 → 出典番号ごとの引用（出典リンクのハイライト用） */
export const sourceQuotesOf = (
  offer: { source_quotes?: LiftTicketSourceQuote[] },
  numberBySourceId: Map<string, number>,
) => {
  const quotes: Record<number, LiftTicketSourceQuote> = {};
  for (const quote of offer.source_quotes ?? []) {
    const number = numberBySourceId.get(quote.source_id);
    if (number != null && quotes[number] == null) quotes[number] = quote;
  }
  return Object.keys(quotes).length > 0 ? quotes : undefined;
};

/** offer の根拠資料 → 出典番号（料金表と同じ番号を使う） */
const sourceNumbersOf = (
  offer: LiftTicketOffer,
  numberBySourceId: Map<string, number>,
) =>
  [
    ...new Set(
      (offer.source_refs ?? [])
        .map(id => numberBySourceId.get(id))
        .filter((number): number is number => number != null),
    ),
  ].sort((left, right) => left - right);

/**
 * 「20才」「20歳」のような年齢名と、「2005年4月2日〜2006年4月1日生まれ」
 * のような年度生まれ条件が公式情報にそろっている割引を、年齢入力から適用する。
 *
 * 厳密な誕生日は入力されていないため、公式の生年月日範囲は必ず警告として返す。
 * 宿泊者・会員など、年齢以外の資格割引はここでは自動適用しない。
 */
const ageGenerationCondition = (offer: LiftTicketOffer) => {
  const ageText = [offer.name_ja, offer.official_label_ja]
    .filter(Boolean)
    .join(" ");
  const ageMatch = ageText.match(/(\d{1,3})\s*(?:才|歳)/);
  const nominalAge =
    offer.target_qualification?.nominal_age ??
    (ageMatch ? Number(ageMatch[1]) : null);
  if (nominalAge == null) return null;

  const qualificationText = [
    offer.target_qualification?.official_label_ja,
    offer.target_qualification?.description_ja,
  ]
    .filter(Boolean)
    .join(" ");
  const hasBirthDateRange =
    /\d{4}年\d{1,2}月\d{1,2}日.+\d{4}年\d{1,2}月\d{1,2}日.+生まれ/.test(
      qualificationText,
    );
  if (!hasBirthDateRange) return null;

  return {
    age: nominalAge,
    warnings: [
      offer.target_qualification?.official_label_ja,
      ...(offer.requirements ?? []).map(
        requirement => requirement.description_ja,
      ),
    ].filter((text): text is string => Boolean(text)),
  };
};

const automaticAgeGenerationWarnings = (
  offer: LiftTicketOffer,
  group: TicketPartyGroup,
) => {
  const condition = ageGenerationCondition(offer);
  if (group.age == null || condition?.age !== group.age) return null;
  return condition.warnings;
};

/**
 * 条件付き料金を使うための条件を短く並べる。
 * 出すのは「誰が対象か」「何を見せるか」「どう買うか」だけ。
 * 決済手段・発券手順などの長文は公式ページ（出典リンク）で確認してもらう
 */
const conditionalOfferConditions = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  visitDate: string,
  today: string,
) => {
  const reasons = offer.discount_reasons ?? [];
  const purchase = reasons.some(reason =>
    PURCHASE_METHOD_REASONS.includes(reason),
  )
    ? purchaseMethodOf(data, offer, visitDate, today)
    : null;
  const targetConditions = [
    offer.target_genders?.description_ja ??
      offer.target_genders?.official_label_ja,
    offer.target_qualification?.description_ja ??
      offer.target_qualification?.official_label_ja,
  ];
  return [
    ...targetConditions,
    ...(offer.requirements ?? []).map(requirement =>
      requirement.proof_ja &&
      !targetConditions.some(condition =>
        condition?.includes(requirement.proof_ja ?? ""),
      )
        ? `要提示: ${requirement.proof_ja}`
        : null,
    ),
    purchase?.note,
    purchase?.warning,
  ].filter(
    (condition, index, all): condition is string =>
      Boolean(condition) && all.indexOf(condition) === index,
  );
};

/**
 * 条件付き割引の見出しにする条件名（「女性」「メンバーズカードをお持ちの方」）。
 * target の description_ja は短い条件名として書く決まり。無ければ買い方、券名の順
 */
const conditionalOfferLabel = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  visitDate: string,
  today: string,
) => {
  const target =
    offer.target_genders?.description_ja ??
    offer.target_qualification?.description_ja;
  if (target) return target;
  const reasons = offer.discount_reasons ?? [];
  const purchase = reasons.some(reason =>
    PURCHASE_METHOD_REASONS.includes(reason),
  )
    ? purchaseMethodOf(data, offer, visitDate, today)
    : null;
  return purchase?.note ?? offer.name_ja;
};

/** 「2026-12-19」→「12/19」 */
const monthDay = (date: string) => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};

/**
 * Web・前売の券を買える最後の日。販売終了日・固定の締切日・
 * 「利用日の〇日前まで」のうち一番早い日。利用日当日まで買えるなら null
 */
export const lastPurchaseDateOf = (
  offer: Pick<LiftTicketOffer, "sales_period" | "purchase_deadline">,
  visitDate: string,
) => {
  const deadline = offer.purchase_deadline;
  const daysBefore = Math.max(
    deadline?.days_before_use ?? 0,
    deadline?.same_day_allowed === false ? 1 : 0,
  );
  const last = [
    addDays(visitDate, -daysBefore),
    offer.sales_period?.end,
    deadline?.deadline_date,
  ]
    .filter((date): date is string => Boolean(date))
    .reduce((earliest, date) => (date < earliest ? date : earliest));
  return last < visitDate ? last : null;
};

/**
 * Web・前売料金の買い方を短く表す。
 * 「Webで購入」、利用日より前に買う必要があれば「2/3までにWebで購入」と、
 * 販売開始前なら「12/19から販売開始」の注意を返す。
 * ★期限は1つの日付にまとめる（「利用日の3日前まで・11/30まで販売」と並べない）
 */
const purchaseMethodOf = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  visitDate: string,
  today: string,
) => {
  const online = (offer.discount_reasons ?? []).includes("online_purchase");
  const where = online ? "Webで" : "";
  const deadline = lastPurchaseDateOf(offer, visitDate);
  const note = deadline
    ? `${monthDay(deadline)}までに${where}購入`
    : `${where}購入`;
  const channelById = new Map(
    data.channels.map(channel => [channel.id, channel]),
  );
  const url =
    (offer.channel_ids ?? [])
      .map(channelId => channelById.get(channelId)?.url)
      .find((value): value is string => Boolean(value)) ?? null;
  const start = offer.sales_period?.start;
  const warning =
    start && start > today ? `${monthDay(start)}から販売開始です` : null;
  return { note, url, warning, deadline, online };
};

export const formatPartyGroupLabel = (group: TicketPartyGroup) => {
  const category =
    group.category === "disabled" && group.baseCategory
      ? `${TICKET_PARTY_CATEGORY_LABELS[group.category]}・${TICKET_PARTY_CATEGORY_LABELS[group.baseCategory]}`
      : TICKET_PARTY_CATEGORY_LABELS[group.category];
  return group.age == null ? category : `${category}（${group.age}歳）`;
};

const createUnresolvedLine = (
  group: TicketPartyGroup,
  product: LiftTicketProduct | null,
  note: string,
): TicketCalculationLine => ({
  sourceNumbers: [],
  groupId: group.id,
  groupLabel: formatPartyGroupLabel(group),
  count: group.count,
  audienceName: null,
  productName: product?.name_ja ?? null,
  offerName: null,
  unitAmount: null,
  subtotal: null,
  note,
});

type ResolvedOffer = {
  offer: LiftTicketOffer;
  price: ReturnType<typeof resolvePrice>;
};

const resolvedOfferSort = (left: ResolvedOffer, right: ResolvedOffer) => {
  const amountDifference =
    (left.price.amount ?? Number.POSITIVE_INFINITY) -
    (right.price.amount ?? Number.POSITIVE_INFINITY);
  if (amountDifference !== 0) return amountDifference;
  return (left.offer.discount_reasons?.length ?? 0) > 0 ? -1 : 1;
};

/**
 * 追加先の券を持っている前提で、追加券の offer から「追加先の券を買った人だけ」
 * という条件（prior_purchase と target_qualification）を外す。
 *
 * トップアップ5時間は「25時間券を購入した方のみ」なので単独では代表料金にしないが、
 * 25時間券と一緒に買う計算ではその条件を満たしている。
 */
const withHeldBaseProduct = (
  offer: LiftTicketOffer,
  product: LiftTicketProduct | undefined,
  heldProductIds: ReadonlySet<string>,
): LiftTicketOffer => {
  const reasons = offer.discount_reasons ?? [];
  if (
    !reasons.includes("prior_purchase") ||
    !product?.add_on_to_product_ids?.some(id => heldProductIds.has(id))
  ) {
    return offer;
  }
  return {
    ...offer,
    discount_reasons: reasons.filter(reason => reason !== "prior_purchase"),
    target_qualification: null,
  };
};

/**
 * 手数料がこの購入（商品・販売経路）にかかるか。商品と販売経路の両方を書いた
 * 手数料は両方に合うときだけ、どちらか片方だけ書いた手数料はその条件だけで判定する
 * （販売経路だけの手数料も対象。どちらも無い手数料は対象を決められないので外す）
 */
const feeAppliesTo = (
  fee: LiftTicketData["fees"][number],
  productId: string | null | undefined,
  channelIds: string[] | undefined,
) => {
  const products = fee.applies_to_product_ids ?? [];
  const channels = fee.channel_ids ?? [];
  if (products.length === 0 && channels.length === 0) return false;
  if (products.length > 0 && !(productId && products.includes(productId)))
    return false;
  // 窓口でもWebでも買える料金は、手数料のかからない経路で買えるので手数料を足さない。
  // 料金の販売経路がすべて手数料のかかる経路のときだけ足す
  if (channels.length > 0) {
    const offerChannels = channelIds ?? [];
    if (
      offerChannels.length === 0 ||
      !offerChannels.every(channelId => channels.includes(channelId))
    )
      return false;
  }
  return true;
};

/** 1人ぶんに均した手数料。1決済ごとの手数料は人数で割る（券の比較用） */
const feePerPerson = (
  data: LiftTicketData,
  productId: string,
  channelIds: string[] | undefined,
  partyCount: number,
) =>
  data.fees
    .filter(
      fee => fee.amount != null && feeAppliesTo(fee, productId, channelIds),
    )
    .reduce(
      (sum, fee) =>
        sum +
        (fee.charge_unit === "per_payment"
          ? (fee.amount ?? 0) / Math.max(1, partyCount)
          : (fee.amount ?? 0)),
      0,
    );

type GroupLineResult = {
  line: TicketCalculationLine;
  conditionalOffers: TicketConditionalOffer[];
};

/**
 * 年齢未入力の小中高生を、通常の在学年齢それぞれで計算し、全員同じ券・同じ額なら
 * その結果を年齢なしで返す。1人でも額や券が違う・決まらないなら null（年齢を聞く）。
 * 条件付き候補は全年齢に共通するものだけ残す。
 */
const settleWithoutAge = (
  group: TicketPartyGroup,
  calculateWithAge: (age: number) => GroupLineResult,
): GroupLineResult | null => {
  const category =
    group.category === "disabled"
      ? (group.baseCategory ?? "adult")
      : group.category;
  const range =
    category === "preschool"
      ? PRESCHOOL_AGE_RANGE
      : DEFAULT_SCHOOL_AGE_RANGES[category];
  if (range == null) return null;
  const results: GroupLineResult[] = [];
  for (let age = range[0]; age <= range[1]; age++) {
    results.push(calculateWithAge(age));
  }
  const [first] = results;
  if (
    first == null ||
    first.line.unitAmount == null ||
    results.some(
      result =>
        result.line.unitAmount !== first.line.unitAmount ||
        result.line.offerName !== first.line.offerName ||
        result.line.productName !== first.line.productName,
    )
  )
    return null;
  const commonConditionalOffers = first.conditionalOffers.filter(offer =>
    results.every(result =>
      result.conditionalOffers.some(other => other.id === offer.id),
    ),
  );
  return {
    line: { ...first.line, groupLabel: formatPartyGroupLabel(group) },
    conditionalOffers: commonConditionalOffers,
  };
};

const calculateGroupLine = (
  data: LiftTicketData,
  group: TicketPartyGroup,
  baseProduct: LiftTicketProduct,
  dateString: string,
  today: string,
  numberBySourceId: Map<string, number>,
  heldProductIds: ReadonlySet<string>,
  partyCount = 1,
): GroupLineResult => {
  if (
    group.category === "disabled" &&
    group.baseCategory == null &&
    group.age != null &&
    group.age < 19 &&
    data.audiences.some(a => (a.school_levels?.length ?? 0) > 0)
  ) {
    return {
      line: createUnresolvedLine(
        group,
        baseProduct,
        "障がい者の学校区分を選択してください。",
      ),
      conditionalOffers: [],
    };
  }
  const schoolGroup =
    group.category === "disabled"
      ? { ...group, category: group.baseCategory ?? "adult" }
      : group;
  const schoolAudiences = data.audiences.filter(
    a => !a.is_disability_qualified && matchesSchool(a, schoolGroup),
  );
  if (
    group.age != null &&
    schoolAudiences.length > 0 &&
    schoolAudiences.every(a => !matchesAge(a, group.age as number)) &&
    !(
      // 「4歳以上の未就学児」の下限未満には、明記された幼児無料を使える。
      // 学校区分の上限年齢を超えた人を別の年齢料金へ移すことはしない。
      (
        schoolAudiences.every(
          a => a.age_min != null && (group.age as number) < a.age_min,
        ) &&
        data.audiences.some(
          a =>
            !a.is_default &&
            !a.is_disability_qualified &&
            (a.school_levels?.length ?? 0) === 0 &&
            audienceDirectlyMatchesGroup(a, schoolGroup) &&
            data.offers.some(
              offer =>
                offer.product_id === baseProduct.id &&
                offer.audience_ids?.includes(a.id) &&
                isUnconditionalStandardOffer(offer),
            ),
        )
      )
    )
  ) {
    return {
      line: createUnresolvedLine(
        group,
        baseProduct,
        "学校区分と年齢が公式の対象条件に一致しません。公式の対象条件を確認してください。",
      ),
      conditionalOffers: [],
    };
  }
  // 学校区分にあり得ない年齢（高校生19歳など）は、データに年齢の上限が無くても
  // 金額を出さない。区分の料金か年齢の料金かを決められないので確認を促す（PB03）。
  // 学校区分の料金と、その年齢に合う年齢区分の料金（若者16〜22歳など）の両方が
  // あって料金が分かれるときだけ。年齢に合う年齢区分が無ければ従来どおり学校区分の料金
  if (
    schoolAudiences.length > 0 &&
    schoolAgeMismatchOf(group) &&
    data.audiences.some(
      a =>
        !a.is_default &&
        !a.is_disability_qualified &&
        (a.school_levels?.length ?? 0) === 0 &&
        hasAgeCondition(a) &&
        matchesAge(a, group.age as number),
    )
  ) {
    const category =
      group.category === "disabled"
        ? (group.baseCategory ?? "adult")
        : group.category;
    return {
      line: createUnresolvedLine(
        group,
        baseProduct,
        `年齢が${TICKET_PARTY_CATEGORY_LABELS[category]}の範囲と合いません。公式の対象条件を確認してください。`,
      ),
      conditionalOffers: [],
    };
  }
  if (needsAgeForGroup(data, group)) {
    // 施設に年齢区分があっても、この券・この日に在学年齢の誰でも同じ料金なら
    // 年齢を聞かない（若者割が平日1日券だけの施設で、高校生の土日券に年齢を求めていた）
    const settled = settleWithoutAge(group, age =>
      calculateGroupLine(
        data,
        { ...group, age },
        baseProduct,
        dateString,
        today,
        numberBySourceId,
        heldProductIds,
        partyCount,
      ),
    );
    if (settled) return settled;
    return {
      line: {
        ...createUnresolvedLine(
          group,
          baseProduct,
          "年齢によって料金が変わります。年齢を入力してください。",
        ),
        missingAge: true,
      },
      conditionalOffers: [],
    };
  }
  const allowedProductIds = new Set([
    baseProduct.id,
    ...getAutomaticSpecialProductIds(data, baseProduct, dateString),
  ]);
  const audienceById = new Map(
    data.audiences.map(audience => [audience.id, audience]),
  );
  const productById = new Map(
    data.products.map(product => [product.id, product]),
  );
  const offersMatching = (audiences: Map<string, LiftTicketAudience>) =>
    data.offers
      .map(offer =>
        withHeldBaseProduct(
          offer,
          productById.get(offer.product_id),
          heldProductIds,
        ),
      )
      .filter(offer => {
        if (!allowedProductIds.has(offer.product_id)) return false;
        // 特定日の割引があるので加えた別の券は、その割引の行だけ使う。通常料金まで
        // 混ぜると、温泉パック1日券を選んでも普通の1日券の額を返していた（美唄）
        if (
          offer.product_id !== baseProduct.id &&
          !isSpecialDayOrAgeGenerationOffer(offer)
        )
          return false;
        if (!offerMatchesDate(data, offer, dateString)) return false;
        // 今日の時点で買えない券（販売終了の早割など）は、計算にも候補にも出さない
        if (
          !isPurchasableOn(
            offer,
            dateString,
            today,
            isSoldOnVisitDay(data, offer),
          )
        ) {
          return false;
        }
        const audienceIds = offer.audience_ids ?? [];
        if (audienceIds.length === 0) return true;
        return audienceIds.some(audienceId => {
          const audience = audiences.get(audienceId);
          return audience
            ? audienceMatchesGroup(audience, group, audiences)
            : false;
        });
      });
  let matchingOffers = offersMatching(audienceById);
  // 子ども・学生には当てない（小学生の料金が共通券にしか無い施設で、単独券に
  // 大人料金を出さない）。年齢を入れた大人（18歳など）だけ
  // その区分の料金がナイター券にしか無い（「18歳ナイター無料」）ときだけ。
  // シニアやキャンペーン区分の料金が無い券を大人料金で埋めない
  const ownAudienceIds = [...audienceById.values()]
    .filter(audience => audienceMatchesGroup(audience, group, audienceById))
    .map(audience => audience.id);
  const onlyOnNightTickets =
    ownAudienceIds.length > 0 &&
    data.offers
      .filter(offer =>
        (offer.audience_ids ?? []).some(id => ownAudienceIds.includes(id)),
      )
      .every(offer => {
        const product = productById.get(offer.product_id);
        return product != null && isNightTicketProduct(product);
      });
  if (
    matchingOffers.length === 0 &&
    group.category === "adult" &&
    onlyOnNightTickets
  ) {
    // ★その券に、この人の区分（「18歳」など）の料金が1つも無いなら、その券では
    // 区分を分けていないので基準の区分（大人）の料金を使う。
    // 「18歳ナイター無料」がナイター券にだけあり、18歳の1日券が料金なしになっていた（PB19）
    const productAudienceIds = new Set(
      data.offers
        .filter(offer => allowedProductIds.has(offer.product_id))
        .flatMap(offer => offer.audience_ids ?? []),
    );
    const productAudiences = new Map(
      [...audienceById].filter(([id]) => productAudienceIds.has(id)),
    );
    if (productAudiences.size < audienceById.size)
      matchingOffers = offersMatching(productAudiences);
  }
  // 券ごとに人物区分を決める（CH17）。年齢だけで決まる区分（ヤング=22歳まで）の
  // 料金がこの券に無いときは、その券では区分を分けていないので基準の区分
  // （大人）の料金を使う。学校区分の料金（小学生など）は、共通券にしか無い施設
  // （ダイナランド）があるので、単独券に大人料金を出さない
  if (
    matchingOffers.length === 0 &&
    ownAudienceIds.length > 0 &&
    ["adult", "university", "high_school"].includes(group.category) &&
    // 「22歳まで」のように上限のある年齢区分だけ。シニア（60歳以上）や
    // キャンペーン区分の料金が無い券を大人料金で埋めない（公式照合の恐羅漢・札幌国際）
    ownAudienceIds.every(id => {
      const audience = audienceById.get(id);
      return (
        audience != null &&
        (audience.school_levels?.length ?? 0) === 0 &&
        audience.age_max != null
      );
    }) &&
    !onlyOnNightTickets
  ) {
    const productAudienceIds = new Set(
      data.offers
        .filter(offer => allowedProductIds.has(offer.product_id))
        .flatMap(offer => offer.audience_ids ?? []),
    );
    const productAudiences = new Map(
      [...audienceById].filter(([id]) => productAudienceIds.has(id)),
    );
    if (productAudiences.size > 0 && productAudiences.size < audienceById.size)
      matchingOffers = offersMatching(productAudiences);
  }
  const standardOffers = matchingOffers.filter(isUnconditionalStandardOffer);
  const resolvedStandardOffers = standardOffers
    .map(offer => ({
      offer,
      price: resolvePrice(data, offer, dateString),
    }))
    .sort(resolvedOfferSort);
  const bestStandardOffer = resolvedStandardOffers.find(
    candidate => candidate.price.amount != null,
  );
  // 今買える早割・WEB前売は、通常料金より安い場合だけ計算結果に使う
  // （同額なら窓口でそのまま買える通常料金のほうを見せる）
  // 比べるのは手数料込みの額（Web 5,800円＋手数料100円は窓口 5,900円と同額）
  const feeOfOffer = (offer: LiftTicketOffer) =>
    feePerPerson(data, offer.product_id, offer.channel_ids, partyCount);
  const bestStandardEffective =
    bestStandardOffer?.price.amount == null
      ? null
      : bestStandardOffer.price.amount + feeOfOffer(bestStandardOffer.offer);
  const cheaperPurchaseMethodOfferIds = new Set(
    matchingOffers
      .filter(isPurchaseMethodOffer)
      .filter(offer => {
        const amount = resolvePrice(data, offer, dateString).amount;
        return (
          amount != null &&
          (bestStandardEffective == null ||
            amount + feeOfOffer(offer) < bestStandardEffective)
        );
      })
      .map(offer => offer.id),
  );
  // 障がい者料金は障がい者として照会した人にそのまま使う。ただし「市民割」など
  // 割引の理由が別に付いた障がい者料金は、入力だけでは確定できないので条件付きで別掲する
  const isAutomaticDisabilityOffer = (offer: LiftTicketOffer) =>
    group.category === "disabled" &&
    (offer.discount_reasons?.length ?? 0) === 0 &&
    (offer.audience_ids ?? []).some(
      audienceId =>
        audienceById.get(audienceId)?.is_disability_qualified === true,
    );
  const automaticOffers = matchingOffers.filter(
    offer =>
      cheaperPurchaseMethodOfferIds.has(offer.id) ||
      isAutomaticallyApplicableCalendarOffer(offer) ||
      automaticAgeGenerationWarnings(offer, group) != null ||
      isAutomaticDisabilityOffer(offer),
  );
  const resolvedMainOffers = [...standardOffers, ...automaticOffers]
    .filter((offer, index, all) => all.indexOf(offer) === index)
    .map(offer => ({
      offer,
      price: resolvePrice(data, offer, dateString),
    }))
    .sort(resolvedOfferSort);
  const bestOffer = resolvedMainOffers.find(
    candidate => candidate.price.amount != null,
  );

  const appliedAmount = bestOffer?.price.amount ?? null;
  const conditionalOffers: TicketConditionalOffer[] = matchingOffers
    .filter(
      offer =>
        !isUnconditionalStandardOffer(offer) &&
        !isAutomaticallyApplicableCalendarOffer(offer) &&
        !cheaperPurchaseMethodOfferIds.has(offer.id) &&
        ageGenerationCondition(offer) == null &&
        !isAutomaticDisabilityOffer(offer),
    )
    .map(offer => ({
      offer,
      price: resolvePrice(data, offer, dateString),
    }))
    .filter(
      (
        candidate,
      ): candidate is ResolvedOffer & {
        price: { amount: number; note: string | null };
      } =>
        candidate.price.amount != null &&
        (appliedAmount == null || candidate.price.amount < appliedAmount),
    )
    .sort(resolvedOfferSort)
    .map(({ offer, price }) => ({
      id: `${group.id}:${offer.id}`,
      groupId: group.id,
      groupLabel: formatPartyGroupLabel(group),
      count: group.count,
      productName:
        productById.get(offer.product_id)?.name_ja ?? baseProduct.name_ja,
      offerName: offer.name_ja,
      unitAmount: price.amount,
      subtotal: price.amount * group.count,
      conditions: conditionalOfferConditions(data, offer, dateString, today),
      label: conditionalOfferLabel(data, offer, dateString, today),
      sourceNumbers: sourceNumbersOf(offer, numberBySourceId),
      sourceQuotes: sourceQuotesOf(offer, numberBySourceId),
    }));

  if (!bestOffer) {
    // 「区分が合わない」と「その日は対象外」は原因が違う。
    // 一括で「区分に一致する料金がありません」と出すと、
    // ナイター営業日以外のナイター券のように**日付が理由**のものを誤診する
    const forProduct = data.offers.filter(offer =>
      allowedProductIds.has(offer.product_id),
    );
    const audienceMatches = forProduct.filter(offer => {
      const audienceIds = offer.audience_ids ?? [];
      if (audienceIds.length === 0) return true;
      return audienceIds.some(audienceId => {
        const audience = audienceById.get(audienceId);
        return audience
          ? audienceMatchesGroup(audience, group, audienceById)
          : false;
      });
    });
    const note =
      matchingOffers.length > 0
        ? "条件なしで確定できる料金がありません。"
        : audienceMatches.length > 0
          ? "この日は対象外の券です。"
          : "公式の人物区分に一致する料金がありません。";
    return {
      line: createUnresolvedLine(group, baseProduct, note),
      conditionalOffers,
    };
  }

  const matchingAudience = (bestOffer.offer.audience_ids ?? [])
    .map(audienceId => audienceById.get(audienceId))
    .find(
      audience =>
        audience && audienceMatchesGroup(audience, group, audienceById),
    );
  const product = productById.get(bestOffer.offer.product_id) ?? baseProduct;
  const unitAmount = bestOffer.price.amount;
  const ageWarnings =
    automaticAgeGenerationWarnings(bestOffer.offer, group) ?? [];
  // 障がい者料金は、窓口で出す証明書だけを添える（手順の長文は出さない）
  // ★採用した料金に必要な証明（学生証・年齢確認書類・QRコードなど）は必ず出す。
  // 以前は障がい者料金だけに出していたため、ヤング・シニア・学生料金で
  // 証明が要ることが画面に出なかった（監査C16）
  const proofWarnings = (bestOffer.offer.requirements ?? [])
    .map(requirement => requirement.proof_ja)
    .filter((proof): proof is string => Boolean(proof))
    .map(proof => (/必要|提示|要/u.test(proof) ? proof : `${proof}が必要です`));
  // 早割・WEB前売は窓口では買えないので、買い方を1行で添える。
  // 決済手段・発券手順などの長文は公式ページ（出典）で確認してもらう
  const purchase = cheaperPurchaseMethodOfferIds.has(bestOffer.offer.id)
    ? purchaseMethodOf(data, bestOffer.offer, dateString, today)
    : null;
  const warnings = [
    ...new Set([
      ...ageWarnings,
      ...proofWarnings,
      ...(purchase?.warning ? [purchase.warning] : []),
    ]),
  ];
  const line: TicketCalculationLine = {
    sourceNumbers: sourceNumbersOf(bestOffer.offer, numberBySourceId),
    sourceQuotes: sourceQuotesOf(bestOffer.offer, numberBySourceId),
    groupId: group.id,
    groupLabel: formatPartyGroupLabel(group),
    count: group.count,
    audienceName: matchingAudience?.name_ja ?? null,
    productName: product.name_ja,
    productId: product.id,
    channelIds: bestOffer.offer.channel_ids ?? [],
    offerName: bestOffer.offer.name_ja,
    unitAmount,
    subtotal: unitAmount == null ? null : unitAmount * group.count,
    note: bestOffer.price.note,
    standardOfferName:
      bestOffer.offer.id === bestStandardOffer?.offer.id
        ? null
        : (bestStandardOffer?.offer.name_ja ?? null),
    standardUnitAmount:
      bestOffer.offer.id === bestStandardOffer?.offer.id
        ? null
        : (bestStandardOffer?.price.amount ?? null),
    standardSubtotal:
      bestOffer.offer.id === bestStandardOffer?.offer.id ||
      bestStandardOffer?.price.amount == null
        ? null
        : bestStandardOffer.price.amount * group.count,
    purchaseNote: purchase?.note ?? null,
    purchaseUrl: purchase?.url ?? null,
    purchaseDeadline: purchase?.deadline ?? null,
    purchaseOnline: purchase?.online ?? false,
    warnings,
  };

  return {
    line,
    conditionalOffers,
  };
};

/** その日・その券種に自動で当てられる同行者ルールか */
const isApplicablePartyRule = (
  data: LiftTicketData,
  rule: LiftTicketPartyRule,
  baseProduct: LiftTicketProduct,
  dateString: string,
  today: string,
  /** true のとき資格付き（県民割・同居の家族）も対象にする。条件付き候補の計算用 */
  includeQualified = false,
) => {
  // 宿泊者・女性限定などは人数構成だけでは確定できないので自動適用しない。
  // 資格付きは確定には使わず、条件付き候補としてだけ出す（includeQualified）
  if (rule.target_genders) return false;
  if (rule.target_qualification && !includeQualified) return false;
  const components = rule.components ?? [];
  if (components.length === 0) return false;
  // 券種を指定しているルールは、その券種を買うときだけ使う（親子パックは1日券）
  const productIds = components.flatMap(
    component => component.product_ids ?? [],
  );
  if (productIds.length > 0 && !productIds.includes(baseProduct.id)) {
    return false;
  }
  if (!periodContains(rule.use_period, dateString)) return false;
  if (!isPurchasableOn(rule, dateString, today, isSoldOnVisitDay(data, rule)))
    return false;
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const calendarIds = rule.calendar_ids ?? [];
  return (
    calendarIds.length === 0 ||
    calendarIds.some(calendarId =>
      calendarMatchesDate(calendarById.get(calendarId), dateString),
    )
  );
};

type PartyRuleApplication = {
  /** 行の添字 → このルール1回で使った人数 */
  consumed: Map<number, number>;
  total: number;
  /** 同じ人を個別に買った場合の合計 */
  individualTotal: number;
};

/**
 * 同行者ルールを1回だけ当てる。当てられない・個別購入より安くならないなら null。
 *
 * ★**「大人1名につき未就学児2名まで無料」の「大人」は資格の判定であって、
 * このルールで買う人ではない。** 比率指定（per_qualifying_count）を持つ
 * component より前の component は人数を数えるだけで消費しない
 * （scripts/lookup-price.mjs の applyRuleOnce と同じ規則）。
 */
const applyPartyRuleOnce = (
  rule: LiftTicketPartyRule,
  groups: TicketPartyGroup[],
  remaining: number[],
  unitAmounts: (number | null)[],
  matchesComponent: (componentIndex: number, groupIndex: number) => boolean,
): PartyRuleApplication | null => {
  const components = rule.components ?? [];
  const ratioIndex = components.findIndex(
    component => component.per_qualifying_count != null,
  );
  const left = [...remaining];
  const consumed = new Map<number, number>();
  let consumedCount = 0;
  // 比率の基準になる資格者の人数（資格者は消費しないので consumedCount とは別に数える）
  let qualifierCount = 0;
  let total = 0;
  let individualTotal = 0;
  const fixedTotal = components.find(
    component =>
      component.price_effect?.type === "fixed_total" &&
      component.price_effect.amount != null,
  )?.price_effect?.amount;

  for (const [componentIndex, component] of components.entries()) {
    const isQualifier = ratioIndex >= 0 && componentIndex < ratioIndex;
    // 無料の対象（保護者同伴の未就学児など）は、その人に通常料金が無くても当てる（P12・P13）
    const eligible = groups
      .map((_, groupIndex) => groupIndex)
      .filter(
        groupIndex =>
          (unitAmounts[groupIndex] != null ||
            (component.price_effect?.type === "free" && !isQualifier)) &&
          matchesComponent(componentIndex, groupIndex),
      );
    const pool = isQualifier ? groups.map(group => group.count) : left;
    const available = eligible.reduce(
      (sum, groupIndex) => sum + pool[groupIndex],
      0,
    );
    const min = component.min_count ?? 0;
    if (available < min) return null;
    let take = Math.min(component.max_count ?? available, available);
    if (component.per_qualifying_count != null) {
      take = Math.min(
        take,
        (qualifierCount + consumedCount) * component.per_qualifying_count,
      );
    }
    if (take <= 0 && min > 0) return null;
    if (isQualifier) {
      qualifierCount += take;
      continue;
    }

    const effect = component.price_effect;
    let rest = take;
    for (const groupIndex of eligible) {
      const used = Math.min(left[groupIndex], rest);
      if (used <= 0) continue;
      left[groupIndex] -= used;
      rest -= used;
      consumed.set(groupIndex, (consumed.get(groupIndex) ?? 0) + used);
      const unit = unitAmounts[groupIndex] ?? 0;
      individualTotal += unit * used;
      if (fixedTotal != null || effect?.type === "free") continue;
      if (effect?.type === "fixed_per_person") {
        total += (effect.amount ?? 0) * used;
      } else if (effect?.type === "discount_amount") {
        total += Math.max(0, unit - (effect.amount ?? 0)) * used;
      } else if (effect?.type === "discount_percent") {
        total +=
          Math.round((unit * (100 - (effect.percent ?? 0))) / 100) * used;
      } else {
        total += unit * used;
      }
    }
    consumedCount += take - rest;
  }

  if (consumedCount <= 0) return null;
  if (fixedTotal != null) total = fixedTotal;
  const freesUnpriced = [...consumed.keys()].some(
    groupIndex => unitAmounts[groupIndex] == null,
  );
  if (total >= individualTotal && !freesUnpriced) return null;
  return { consumed, total, individualTotal };
};

/**
 * セットの中身を「大人1名＋小学生1名 × 2」の形にする。
 * 中身の違うセットが混ざるときは種類ごとに並べる。
 */
const formatSetMembers = (setMembers: string[]) => {
  const countByMembers = new Map<string, number>();
  for (const members of setMembers) {
    countByMembers.set(members, (countByMembers.get(members) ?? 0) + 1);
  }
  return [...countByMembers]
    .map(([members, count]) => (count > 1 ? `${members} × ${count}` : members))
    .join("、");
};

/**
 * 1人ずつ計算した行に同行者ルール（親子パック等）を当てる。
 * ルールで買う人数を元の行から差し引き、ルールごとに1行へまとめる。
 * 個別に買うより安くなる場合だけ当てる。
 */
/**
 * 同行者ルールを何回ずつ当てるかを決める（割引額が最大になる組み合わせ）。
 *
 * - 排他グループ（exclusive_group_id）は1グループにつき1ルール・1回だけ
 * - 比率型（大人1名につき○名まで）は資格者全員分を1回で当て終えるので1回だけ
 * - 同じ割引額なら、データの先のルールを多く使う組み合わせを選ぶ（従来の結果を保つ）
 * 返す順序は当てる順。ルールごとにまとめて返す
 */
const planPartyRuleApplications = (
  rules: LiftTicketPartyRule[],
  groups: TicketPartyGroup[],
  remaining: number[],
  unitAmounts: (number | null)[],
  matcherOf: (
    rule: LiftTicketPartyRule,
  ) => (componentIndex: number, groupIndex: number) => boolean,
): Array<{ rule: LiftTicketPartyRule; count: number }> => {
  const matchers = rules.map(matcherOf);
  const onceOnly = rules.map(
    rule =>
      rule.exclusive_group_id != null ||
      (rule.components ?? []).some(
        component => component.per_qualifying_count != null,
      ),
  );
  type Best = { saving: number; steps: number[] };
  const memo = new Map<string, Best>();
  const search = (
    start: number,
    left: number[],
    usedExclusive: string[],
  ): Best => {
    const key = `${start}|${left.join(",")}|${usedExclusive.join(",")}`;
    const cached = memo.get(key);
    if (cached) return cached;
    let best: Best = { saving: 0, steps: [] };
    for (let index = start; index < rules.length; index += 1) {
      const rule = rules[index];
      if (
        rule.exclusive_group_id &&
        usedExclusive.includes(rule.exclusive_group_id)
      )
        continue;
      const application = applyPartyRuleOnce(
        rule,
        groups,
        left,
        unitAmounts,
        matchers[index],
      );
      if (!application) continue;
      const next = [...left];
      for (const [groupIndex, count] of application.consumed)
        next[groupIndex] -= count;
      const rest = search(
        onceOnly[index] ? index + 1 : index,
        next,
        rule.exclusive_group_id
          ? [...usedExclusive, rule.exclusive_group_id].sort()
          : usedExclusive,
      );
      // 通常料金の無い人を無料にできるルール（保護者同伴の未就学児無料）は、
      // 金額が下がらなくても当てる価値がある（料金を確定できる）
      const freedUnpriced = [...application.consumed].reduce(
        (sum, [groupIndex, count]) =>
          sum + (unitAmounts[groupIndex] == null ? count : 0),
        0,
      );
      const saving =
        application.individualTotal -
        application.total +
        freedUnpriced * 0.001 +
        rest.saving;
      if (saving > best.saving)
        best = { saving, steps: [index, ...rest.steps] };
    }
    memo.set(key, best);
    return best;
  };
  const { steps } = search(0, [...remaining], []);
  const planned: Array<{ rule: LiftTicketPartyRule; count: number }> = [];
  for (const index of steps) {
    const last = planned.at(-1);
    if (last && last.rule === rules[index]) last.count += 1;
    else planned.push({ rule: rules[index], count: 1 });
  }
  return planned;
};

const applyPartyRules = (
  data: LiftTicketData,
  groups: TicketPartyGroup[],
  lines: TicketCalculationLine[],
  baseProduct: LiftTicketProduct,
  dateString: string,
  today: string,
  numberBySourceId: Map<string, number>,
  includeQualified = false,
): TicketCalculationLine[] => {
  const audienceById = new Map(
    data.audiences.map(audience => [audience.id, audience]),
  );
  const channelById = new Map(
    data.channels.map(channel => [channel.id, channel]),
  );
  const remaining = lines.map(line => line.count);
  const unitAmounts = lines.map(line => line.unitAmount);
  const ruleLines: TicketCalculationLine[] = [];
  const matcherOf =
    (rule: LiftTicketPartyRule) =>
    (componentIndex: number, groupIndex: number) =>
      ((rule.components ?? [])[componentIndex].audience_ids ?? []).some(
        audienceId => {
          const audience = audienceById.get(audienceId);
          return audience
            ? audienceMatchesGroup(audience, groups[groupIndex], audienceById)
            : false;
        },
      );
  const applicableRules = (data.party_rules ?? []).filter(rule =>
    isApplicablePartyRule(
      data,
      rule,
      baseProduct,
      dateString,
      today,
      includeQualified,
    ),
  );
  // ★データの並び順に先頭から当てると、もっと安い組み合わせを逃す
  // （大人3＋小学生2で「大人2＋小2」を先に当てると 23,000円、
  // 「大人1＋小1」と「大人2＋小1」なら 22,500円）。適用回数を総当たりで決める
  const planned = planPartyRuleApplications(
    applicableRules,
    groups,
    remaining,
    unitAmounts,
    matcherOf,
  );

  for (const { rule, count: plannedCount } of planned) {
    const components = rule.components ?? [];
    const matchesComponent = matcherOf(rule);
    const consumed = new Map<number, number>();
    // 1セットごとの中身（「大人1名＋小学生1名」）。同じ区分を複数行に分けて
    // 入力しても（レンタルの有無など）区分名でまとめて数える
    const setMembers: string[] = [];
    let setCount = 0;
    let total = 0;
    let individualTotal = 0;
    const applicationLimit = plannedCount;
    for (let guard = 0; guard < applicationLimit; guard += 1) {
      const application = applyPartyRuleOnce(
        rule,
        groups,
        remaining,
        unitAmounts,
        matchesComponent,
      );
      if (!application) break;
      const countByLabel = new Map<string, number>();
      for (const [groupIndex, count] of [...application.consumed].sort(
        ([left], [right]) => left - right,
      )) {
        remaining[groupIndex] -= count;
        consumed.set(groupIndex, (consumed.get(groupIndex) ?? 0) + count);
        const label = formatPartyGroupLabel(groups[groupIndex]);
        countByLabel.set(label, (countByLabel.get(label) ?? 0) + count);
      }
      setMembers.push(
        [...countByLabel]
          .map(([label, count]) => `${label}${count}名`)
          .join("＋"),
      );
      setCount += 1;
      total += application.total;
      individualTotal += application.individualTotal;
      // 比率型（大人1名につき○名まで）は資格者全員分を1回で当て終えている。
      // 資格者は消費しないので、繰り返すと同じ大人で何度も無料にしてしまう
      if (components.some(component => component.per_qualifying_count != null))
        break;
    }
    if (setCount === 0) continue;

    const consumedGroups = [...consumed.entries()].sort(
      ([left], [right]) => left - right,
    );
    const purchaseUrl =
      (rule.channel_ids ?? [])
        .map(channelId => channelById.get(channelId)?.url)
        .find((url): url is string => Boolean(url)) ?? null;
    const salesStart = rule.sales_period?.start;
    const sourceNumbers = [
      ...new Set(
        (rule.source_refs ?? [])
          .map(id => numberBySourceId.get(id))
          .filter((number): number is number => number != null),
      ),
    ].sort((left, right) => left - right);
    ruleLines.push({
      sourceNumbers,
      sourceQuotes: sourceQuotesOf(rule, numberBySourceId),
      groupId: `party-rule:${rule.id}`,
      groupLabel: [
        ...new Set(
          consumedGroups.map(([groupIndex]) =>
            formatPartyGroupLabel(groups[groupIndex]),
          ),
        ),
      ].join("＋"),
      count: consumedGroups.reduce((sum, [, count]) => sum + count, 0),
      audienceName: null,
      productName: baseProduct.name_ja,
      offerName: `${rule.name_ja}${setCount > 1 ? ` × ${setCount}セット` : ""}`,
      unitAmount: total / setCount,
      subtotal: total,
      note: rule.description_ja ?? null,
      purchaseNote: `${purchaseUrl ? "Webで購入・" : ""}個別に買うと ¥${individualTotal.toLocaleString("ja-JP")}`,
      partySet: {
        // 「親子パック WEB（通常期間）」→「親子パック」。期間やチャネルは画面で別に分かる
        name: rule.name_ja
          .replace(/（[^）]*）$/u, "")
          .replace(/\s*WEB$/u, "")
          .trim(),
        members: formatSetMembers(setMembers),
        setCount,
      },
      purchaseUrl,
      productId: baseProduct.id,
      channelIds: rule.channel_ids ?? [],
      warnings:
        salesStart && salesStart > today
          ? [`${monthDay(salesStart)}から販売開始です`]
          : [],
    });
  }

  // 同伴が条件の無料（保護者同伴の未就学児無料）だけで料金が決まる人が、
  // 同伴者なしで入力されたら理由を出す（P12）
  const companionNote = (index: number) =>
    lines[index].unitAmount == null &&
    applicableRules.some(rule =>
      (rule.components ?? []).some(
        (component, componentIndex) =>
          component.price_effect?.type === "free" &&
          componentIndex > 0 &&
          matcherOf(rule)(componentIndex, index),
      ),
    )
      ? "保護者の同伴が必要です"
      : null;
  const withCompanionNotes = (target: TicketCalculationLine[]) =>
    target.map((line, index) => {
      const note = companionNote(index);
      return note
        ? { ...line, note: [line.note, note].filter(Boolean).join(" ") }
        : line;
    });
  if (ruleLines.length === 0) return withCompanionNotes(lines);
  const restLines = lines
    .map((line, index) => ({
      ...line,
      count: remaining[index],
      subtotal:
        line.unitAmount == null
          ? line.subtotal
          : line.unitAmount * remaining[index],
      standardSubtotal:
        line.standardUnitAmount == null
          ? line.standardSubtotal
          : line.standardUnitAmount * remaining[index],
    }))
    .filter(line => line.count > 0);
  return [...ruleLines, ...restLines];
};

export const calculateLiftTicket = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  explicitProductId?: string | null,
  /** すでに買う券。追加券（トップアップ）をその券に足す計算で使う */
  heldProductIds: ReadonlySet<string> = new Set(),
): TicketCalculationResult => {
  const activeGroups = input.party.filter(group => group.count > 0);
  const partyCount = activeGroups.reduce(
    (total, group) => total + group.count,
    0,
  );
  const emptyResult = (
    status: TicketCalculationResult["status"],
    notes: string[],
  ): TicketCalculationResult => ({
    status,
    visitDate: input.visitDate,
    seasonLabel: data.season.label_ja,
    productId: null,
    productName: null,
    lines: [],
    fees: [],
    ticketTotal: null,
    knownTicketTotal: 0,
    payableTotal: null,
    partyCount,
    conditionalOffers: [],
    conditionalOfferNames: [],
    notes,
    references: [],
  });

  if (!input.visitDate || partyCount === 0) {
    return emptyResult("unavailable", [
      "日付と1人以上の人数を入力してください。",
    ]);
  }
  if (!seasonContains(data, input.visitDate)) {
    return emptyResult("outside_season", [
      `${data.season.label_ja}の対象期間外です。`,
    ]);
  }
  // ★営業していない日に料金を出さない（定休日・休業日）
  const closedCalendar = findClosedCalendar(data, input.visitDate);
  if (closedCalendar) {
    return emptyResult("closed", [
      closedCalendar.official_label_ja ??
        `${closedCalendar.name_ja}のため営業していません。`,
    ]);
  }

  // explicitProductId の意味:
  //   string    … その券種で計算する
  //   null      … **要件に合う券が無かった**（呼び出し側が判定済み）。
  //               ここで別の券にフォールバックすると、希望と違う券の料金を
  //               あたかも答えのように出してしまう（実際にそうなっていた）
  //   undefined … 券種の指定なし。従来の「1日たっぷり/半日」から決める
  if (explicitProductId === null) {
    return emptyResult("unavailable", [
      "希望の条件を満たす券が公式料金データにありません。",
    ]);
  }
  const baseProduct = explicitProductId
    ? (data.products.find(product => product.id === explicitProductId) ?? null)
    : selectPreferredDailyProduct(data, input.usePreference);
  if (!baseProduct) {
    return emptyResult("unavailable", [
      "日帰り利用向けの券種を選べませんでした。",
    ]);
  }

  // 料金表と同じ出典番号を使う（同じページなら同じ番号）
  const { references, numberBySourceId } = buildReferences(data);
  const calculatedGroups = activeGroups.map(group =>
    calculateGroupLine(
      data,
      group,
      baseProduct,
      input.visitDate,
      input.today ?? getTodayInJapan(),
      numberBySourceId,
      heldProductIds,
      partyCount,
    ),
  );
  // 親子パックなど、同行者構成で安くなるセットを個別購入の代わりに当てる
  const lines = applyPartyRules(
    data,
    activeGroups,
    calculatedGroups.map(group => group.line),
    baseProduct,
    input.visitDate,
    input.today ?? getTodayInJapan(),
    numberBySourceId,
  );
  // 資格付きの同行者ルール（県民割・同居の家族）は確定には使わず、
  // 当てたら安くなるときだけ条件付き候補として金額と条件を出す
  const qualifiedRules = new Map(
    (data.party_rules ?? [])
      .filter(rule => rule.target_qualification)
      .map(rule => [`party-rule:${rule.id}`, rule]),
  );
  const partyRuleOffers: TicketConditionalOffer[] = [];
  if (qualifiedRules.size > 0) {
    const withQualified = applyPartyRules(
      data,
      activeGroups,
      calculatedGroups.map(group => group.line),
      baseProduct,
      input.visitDate,
      input.today ?? getTodayInJapan(),
      numberBySourceId,
      true,
    );
    const known = (target: TicketCalculationLine[]) =>
      target.reduce((total, line) => total + (line.subtotal ?? 0), 0);
    if (known(withQualified) < known(lines)) {
      for (const line of withQualified) {
        const rule = qualifiedRules.get(line.groupId);
        if (!rule || line.subtotal == null || line.unitAmount == null) continue;
        const target = rule.target_qualification;
        const condition = target?.official_label_ja ?? target?.description_ja;
        partyRuleOffers.push({
          id: line.groupId,
          groupId: line.groupId,
          groupLabel: line.groupLabel,
          count: line.count,
          productName: line.productName ?? baseProduct.name_ja,
          offerName: line.offerName ?? rule.name_ja,
          unitAmount: line.unitAmount,
          subtotal: line.subtotal,
          label: target?.description_ja ?? condition ?? rule.name_ja,
          conditions: condition ? [condition] : [],
          sourceNumbers: line.sourceNumbers,
          sourceQuotes: line.sourceQuotes,
        });
      }
    }
  }
  const conditionalOffers = [
    ...calculatedGroups.flatMap(group => group.conditionalOffers),
    ...partyRuleOffers,
  ];
  const isComplete = lines.every(line => line.subtotal != null);
  const knownTicketTotal = lines.reduce(
    (total, line) => total + (line.subtotal ?? 0),
    0,
  );
  const productIdOf = (line: TicketCalculationLine) =>
    line.productId ??
    data.products.find(product => product.name_ja === line.productName)?.id;
  // 手数料は課金の単位（1人・1枚・1決済）と、かかる購入（商品・販売経路）に
  // 合った回数だけ足す。fees に載っているのは返ってこない負担だけで、
  // 返金される保証金は「返却で返金」と書いて1決済・1枚の単位で数える
  const appliedFees = data.fees.flatMap(fee => {
    const matched = lines.filter(line =>
      feeAppliesTo(fee, productIdOf(line), line.channelIds),
    );
    if (matched.length === 0) return [];
    const unit = fee.charge_unit ?? "per_person";
    const units =
      unit === "per_payment"
        ? 1
        : matched.reduce((sum, line) => sum + line.count, 0);
    return [{ fee, unit, total: (fee.amount ?? 0) * units }];
  });
  const feeTotal = appliedFees.reduce((sum, applied) => sum + applied.total, 0);
  const UNIT_LABELS = {
    per_person: "1人あたり",
    per_ticket: "1枚あたり",
    per_payment: "1決済あたり",
  } as const;

  const notes: string[] = [];
  if (appliedFees.length > 0) {
    notes.push(
      `別途費用: ${appliedFees
        .map(({ fee, unit }) =>
          fee.amount == null
            ? fee.name_ja
            : `${fee.name_ja} ¥${fee.amount.toLocaleString("ja-JP")}（${UNIT_LABELS[unit]}）`,
        )
        .join("、")}`,
    );
  }
  // data_quality（unresolved_questions / human_review_required）は
  // **収集担当への申し送りなので画面には出さない**。利用者に「何を確認すべきか」を
  // 見せても行動につながらず、料金の読み取りを邪魔する

  return {
    status: isComplete ? "complete" : "partial",
    visitDate: input.visitDate,
    seasonLabel: data.season.label_ja,
    productId: baseProduct.id,
    productName: baseProduct.name_ja,
    lines,
    fees: appliedFees
      .filter(({ fee }) => fee.amount != null)
      .map(({ fee, unit, total }) => ({
        name: fee.name_ja,
        amount: fee.amount ?? 0,
        total,
        chargeUnit: unit,
      })),
    ticketTotal: isComplete ? knownTicketTotal : null,
    knownTicketTotal,
    payableTotal: isComplete ? knownTicketTotal + feeTotal : null,
    partyCount,
    conditionalOffers,
    conditionalOfferNames: Array.from(
      new Set(conditionalOffers.map(offer => offer.offerName)),
    ),
    notes,
    // 表示する行の根拠だけを載せる（引用していないページを並べても混乱する）
    references: references.filter(
      reference =>
        lines.some(line => line.sourceNumbers.includes(reference.number)) ||
        conditionalOffers.some(offer =>
          offer.sourceNumbers.includes(reference.number),
        ),
    ),
  };
};

const appendResultNote = (
  result: TicketCalculationResult,
  note: string,
): TicketCalculationResult => ({
  ...result,
  notes: [...result.notes, note],
});

/**
 * 1日券とナイター単独券、2つの計算結果を1つに合算する。
 * それぞれの人物区分ごとの行をそのまま並べる（ナイター側の行は区別できるよう
 * groupLabel に「（ナイター）」を付ける）。
 */
const mergeDayAndNightResults = (
  dayResult: TicketCalculationResult,
  nightResult: TicketCalculationResult,
): TicketCalculationResult => {
  const isComplete =
    dayResult.status === "complete" && nightResult.status === "complete";
  const lines: TicketCalculationLine[] = [
    ...dayResult.lines,
    ...nightResult.lines.map(line => ({
      ...line,
      groupId: `${line.groupId}__night`,
      groupLabel: `${line.groupLabel}（ナイター）`,
    })),
  ];
  const references = [...dayResult.references, ...nightResult.references]
    .filter(
      (reference, index, all) =>
        all.findIndex(other => other.number === reference.number) === index,
    )
    .sort((left, right) => left.number - right.number);

  return {
    status: isComplete ? "complete" : "partial",
    visitDate: dayResult.visitDate,
    seasonLabel: dayResult.seasonLabel,
    productId: dayResult.productId,
    productName: [dayResult.productName, nightResult.productName]
      .filter(Boolean)
      .join("＋"),
    lines,
    fees: [...dayResult.fees, ...nightResult.fees],
    ticketTotal:
      dayResult.ticketTotal != null && nightResult.ticketTotal != null
        ? dayResult.ticketTotal + nightResult.ticketTotal
        : null,
    knownTicketTotal: dayResult.knownTicketTotal + nightResult.knownTicketTotal,
    payableTotal:
      dayResult.payableTotal != null && nightResult.payableTotal != null
        ? dayResult.payableTotal + nightResult.payableTotal
        : null,
    partyCount: dayResult.partyCount,
    conditionalOffers: [
      ...dayResult.conditionalOffers,
      ...nightResult.conditionalOffers.map(offer => ({
        ...offer,
        id: `${offer.id}__night`,
        groupId: `${offer.groupId}__night`,
        groupLabel: `${offer.groupLabel}（ナイター）`,
      })),
    ],
    conditionalOfferNames: Array.from(
      new Set([
        ...dayResult.conditionalOfferNames,
        ...nightResult.conditionalOfferNames,
      ]),
    ),
    notes: Array.from(new Set([...dayResult.notes, ...nightResult.notes])),
    references,
  };
};

/**
 * 「1日（ナイター込）」の結果を組み立てる。
 *
 * ★**この日にナイター営業が無ければ「1日（ナイター無）」と同じ結果を返し、
 * ナイター営業が無い旨を明示する。** ナイターを希望しているのに黙って
 * ナイター無しの料金だけ出すと、営業していないのか単に安いのか区別できない。
 *
 * ナイター営業がある場合の解決順（references/data-model.md 準拠）:
 *   1. ナイターを含む1日券（covers_hours_types に night を含む）があればそれを使う
 *   2. 無ければ 1日券 ＋ ナイター単独券を合算する
 *   3. ナイター単独券の料金も公式資料に無ければ、1日券のみの結果に理由を添えて返す
 *      （推測で料金を作らない）
 */
export const calculateDayPassResult = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
): TicketCalculationResult => {
  const dateString = input.visitDate;
  const dayOnlyProduct = selectCheapestProductForDuration(data, input, {
    kind: "day",
    withNight: false,
  });
  const dayOnlyResult = () =>
    calculateLiftTicket(data, input, dayOnlyProduct?.id ?? null);

  if (!hasNightOperatingOn(data, dateString)) {
    return appendResultNote(
      dayOnlyResult(),
      "この日はナイター営業がありません。",
    );
  }

  // ① ナイターを含む1日券
  const nightInclusiveProduct = selectCheapestProductForDuration(data, input, {
    kind: "day",
    withNight: true,
  });
  if (nightInclusiveProduct) {
    return calculateLiftTicket(data, input, nightInclusiveProduct.id);
  }

  // 1日券自体が無いスキー場では、ナイター単独券を合算する土台が無い
  // （最長時間券で代替する既存のロジックに任せる）
  if (!dayOnlyProduct) {
    return dayOnlyResult();
  }

  // ② 1日券 ＋ ナイター単独券
  const nightOnlyProduct = data.products.find(
    product =>
      isNightTicketProduct(product) &&
      hasUnconditionalStandardOffer(data, product),
  );
  if (!nightOnlyProduct) {
    return appendResultNote(
      dayOnlyResult(),
      "ナイター単独券の料金が公式資料に記載されていないため、1日券のみの料金です。",
    );
  }

  const dayResult = calculateLiftTicket(data, input, dayOnlyProduct.id);
  const nightResult = calculateLiftTicket(data, input, nightOnlyProduct.id);
  // ③ ナイター単独券はあっても金額が確定できない場合も、推測せず1日券のみにする
  if (nightResult.payableTotal == null) {
    return appendResultNote(
      dayResult,
      "ナイター単独券の金額が確定できないため、1日券のみの料金です。",
    );
  }
  return mergeDayAndNightResults(dayResult, nightResult);
};

export const calculateLiftTicketForSeasons = (
  seasons: LiftTicketData[],
  input: LiftTicketSearchInput,
  explicitProductId?: string | null,
) => {
  const season =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;
  if (!season) return null;
  // 一覧・比較も詳細の料金タブと同じ計算にする。日の計画が1件なら、その日の
  // 結果をそのまま返す（券は計画の長さから選ぶ。「1日」なら1日券）。
  // 以前は days を無視して券を点数で選び、サホロで25時間券が出ていた
  if (explicitProductId === undefined && input.days?.length === 1) {
    return calculateLiftTicketPlan(season, input).days[0].result;
  }
  return calculateLiftTicket(season, input, explicitProductId);
};

export const formatLiftTicketPrice = (price: LiftTicketPrice | undefined) => {
  const mode = priceModeOf(price);
  if (mode === "free") return "無料";
  if (["fixed", "derived_discount"].includes(mode) && price?.amount != null) {
    return `¥${price.amount.toLocaleString("ja-JP")}`;
  }
  if (mode === "range" && price?.range) {
    const minimum =
      price.range.min == null
        ? ""
        : `¥${price.range.min.toLocaleString("ja-JP")}`;
    const maximum =
      price.range.max == null
        ? ""
        : `¥${price.range.max.toLocaleString("ja-JP")}`;
    return `${minimum}〜${maximum}`;
  }
  if (mode === "live_dynamic") return "変動料金";
  return "要確認";
};

/** 次の日の日付。日を追加するときの既定値に使う */
export const nextDateOf = (dateString: string) =>
  dateString ? addDays(dateString, 1) : "";

/** 連続した日付のかたまりに分ける（連続2日券は連続した日にしか使えない） */
const consecutiveRuns = (dates: string[]) => {
  const sorted = [...new Set(dates)].filter(Boolean).sort();
  const runs: string[][] = [];
  for (const date of sorted) {
    const current = runs[runs.length - 1];
    if (current && addDays(current[current.length - 1], 1) === date) {
      current.push(date);
    } else {
      runs.push([date]);
    }
  }
  return runs;
};

export type TicketPlanDay = {
  plan: TicketDayPlan;
  result: TicketCalculationResult;
  /** 一番上・時間帯固定・1時間短い案・1枚で滑れる最長（durationOptions.ts） */
  options?: TicketDurationOptions;
};

export type TicketPlanMultiDay = {
  /**
   * consecutive_days … 連続N日券（連続した日のかたまりに使う）
   * hours_pool      … 25時間券のように日をまたいで時間を分けて使う券
   *                    （全日の滑走時間の合計でまかなう）
   * ticket_set      … 「1日券5枚セット」のように、1枚が1人1日分で、日・人数を
   *                    問わず使える券（selectable_days）。のべ人日で枚数を数える
   */
  kind: "consecutive_days" | "hours_pool" | "ticket_set";
  productId: string;
  productName: string;
  days: number;
  dates: string[];
  /** 1人あたりの枚数（時間の合計が券の時間を超えるなら複数枚） */
  ticketCount: number;
  /** hours_pool のとき、全日で滑る時間の合計 */
  requiredHours: number | null;
  total: number;
  /**
   * その券を使わず1日ずつ買った場合の合計（比較用）。
   * 1日ずつでは買えない日がある（その日の条件に合う券が無い）なら null
   */
  perDayTotal: number | null;
  /** その券の料金の出典番号（日ごとの結果と同じ番号） */
  sourceNumbers: number[];
  /** その券1枚ぶんの内訳（誰がいくらか・Web購入の条件などの注意） */
  lines: TicketCalculationLine[];
  /**
   * hours_pool のとき、足りない時間を足す追加券（トップアップ5時間など）。
   * 買う日ごとに1件（日によって料金が違うため）。追加券を使わなければ空
   */
  addOns: TicketPlanAddOn[];
  /**
   * この券（と追加券）そのものの料金。total は計画全体の合計
   * （この券でまかなわない日の料金を含む）なので、券の枠にはこちらを出す
   */
  ticketTotal: number;
  /**
   * 条件を満たせば券の枠より安くなる案（会員の2日券、木曜だけ
   * レディースDAYを使って1日ずつ買う、など）。金額は利用者区分ごと
   */
  conditionalOffers: TicketPlanConditionalOffer[];
  /** ticket_set のとき、セットの枚数とまかなうのべ人日 */
  ticketSet?: { ticketsPerSet: number; coveredPersonDays: number };
  /** 利用者に伝える事項（25時間券で「10時間残ります」など） */
  notes?: string[];
  /**
   * consecutive_days のとき、使う連続日券ごとの内訳（「2日券」1/18〜19、
   * 「2日券」1/20〜21）。1枚だけなら1件
   */
  segments?: Array<{
    dates: string[];
    productId: string;
    productName: string;
    total: number;
  }>;
};

export type TicketPlanConditionalOffer = TicketConditionalOffer & {
  /**
   * 1日ずつ買う案のとき、日ごとの内訳（割引を使わない日は通常の券）。
   * 複数日券そのものの割引なら null
   */
  days: Array<{ date: string; label: string; subtotal: number }> | null;
};

export type TicketPlanAddOn = {
  productId: string;
  productName: string;
  /** 買う日（その日の料金で買う） */
  date: string;
  /** 1人あたりの枚数 */
  ticketCount: number;
  total: number;
  sourceNumbers: number[];
  /** 追加券1枚ぶんの内訳 */
  lines: TicketCalculationLine[];
};

export type TicketPlanResult = {
  days: TicketPlanDay[];
  /** 採用した案と同額の別の案（3日券と25時間券が同額など）。上の案と比べてもらう */
  multiDayAlternatives?: TicketPlanMultiDay[];
  /** 1日ずつ買った合計（営業していない日は 0 として扱わず null にする） */
  perDayTotal: number | null;
  /** 複数日券を使ったほうが安い場合の代替案 */
  multiDay: TicketPlanMultiDay | null;
  /** 採用した最安の合計 */
  total: number | null;
  references: PriceReference[];
};

/** 年齢を入力しないと料金が決まらない利用者（入力欄の id）。ナイター側の行も元の利用者に戻す */
export const ageRequiredGroupIdsOf = (plan: TicketPlanResult) => [
  ...new Set(
    [
      ...plan.days.flatMap(day => day.result.lines),
      ...(plan.multiDay?.lines ?? []),
    ]
      .filter(line => line.missingAge)
      .map(line => line.groupId.replace(/__night$/u, "")),
  ),
];

/**
 * その日に何時間滑るか。「1日（ナイター無）」は営業時間から出す。
 * ナイター込みは日中とナイターの時間を足す根拠が無いので null（時間券で比べない）
 */
const plannedHoursOf = (data: LiftTicketData, plan: TicketDayPlan) => {
  if (plan.duration.kind === "hours") {
    // 仕様S7: 営業より長い指定は営業時間全体として扱う（「1日」と同じ時間）
    const open = allOperatingHoursOn(data, plan.date);
    return open != null
      ? Math.min(plan.duration.hours, open)
      : plan.duration.hours;
  }
  if (plan.duration.kind === "night" || plan.duration.withNight) return null;
  return operatingHoursOn(data, plan.date);
};

/**
 * 25時間券のような「日をまたいで時間を分けて使う券」で全日をまかなう案。
 *
 * ★**日ごとの最安だけを見ると、この券は絶対に選ばれない。**
 * 1日だけ見れば5時間券のほうが安いが、5時間×4日なら25時間券1枚で足りる。
 * 全日の滑走時間を合計し、足りる枚数（1人あたり）で料金を出す。
 * 複数人で時間を分けて使えない券が多いので、枚数は1人あたりで数える
 * （calculateLiftTicket がパーティ全員分を合計する）。
 *
 * ★**追加券（add_on_to_product_ids）があれば「25時間券×M＋追加券×N」も比べる。**
 * 30時間なら25時間券2枚より、25時間券1枚＋トップアップ5時間1枚のほうが安い。
 * 追加券は、それが要る日までのどの利用日にも買えるので、そのうち最安の日の
 * 料金を当てる（春料金の日に買えば安い）。
 */
const selectHoursPoolPlanFor = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  plans: TicketDayPlan[],
  perDayTotal: number | null,
): TicketPlanMultiDay | null => {
  if (plans.length === 0 || plans.some(plan => !plan.date)) return null;
  const hours = plans.map(plan => plannedHoursOf(data, plan));
  if (hours.some(value => value == null)) return null;
  const days = plans
    .map((plan, index) => ({ date: plan.date, hours: hours[index] ?? 0 }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const sortedDates = days.map(day => day.date);
  const requiredHours = days.reduce((sum, day) => sum + day.hours, 0);

  /** 滑った時間の合計が hoursUsed を超える最初の日（その日までに券が要る） */
  const dayIndexExceeding = (hoursUsed: number) => {
    let cumulative = 0;
    for (const [index, day] of days.entries()) {
      cumulative += day.hours;
      if (cumulative > hoursUsed) return index;
    }
    return days.length - 1;
  };

  let best: TicketPlanMultiDay | null = null;
  for (const product of data.products) {
    if (product.validity?.mode !== "hours_pool") continue;
    // 追加券（トップアップ）は追加先の券と一緒にだけ使う。単独の券にしない
    if ((product.add_on_to_product_ids?.length ?? 0) > 0) continue;
    const maxDays = product.validity.days;
    if (maxDays != null && new Set(sortedDates).size > maxDays) continue;
    const poolHours = product.validity.hours ?? null;
    if (poolHours == null || poolHours <= 0) continue;
    if (isSharedLiftTicketProduct(product)) continue;
    if (!hasUnconditionalStandardOffer(data, product)) continue;
    // どの日にも使える券でなければ全日をまかなえない
    const results = sortedDates.map(date =>
      calculateLiftTicket(
        data,
        { ...input, visitDate: date, days: undefined },
        product.id,
      ),
    );
    if (results.some(result => result.payableTotal == null)) continue;
    // 買うのは初日より前なので、初日の料金で買う
    const unitTotal = results[0].payableTotal ?? 0;
    const maxTicketCount = Math.ceil(requiredHours / poolHours);
    const held = new Set([product.id]);
    const addOnProducts = data.products.filter(
      addOn =>
        addOn.add_on_to_product_ids?.includes(product.id) &&
        addOn.validity?.mode === "hours_pool" &&
        (addOn.validity.hours ?? 0) > 0,
    );
    // 追加券の日ごとの料金（買えない日は null）
    const addOnResultCache = new Map<string, TicketCalculationResult>();
    const addOnResultOn = (addOn: LiftTicketProduct, date: string) => {
      const key = `${addOn.id}:${date}`;
      const cached = addOnResultCache.get(key);
      if (cached) return cached;
      const result = calculateLiftTicket(
        data,
        { ...input, visitDate: date, days: undefined },
        addOn.id,
        held,
      );
      addOnResultCache.set(key, result);
      return result;
    };

    /**
     * 足りない時間を追加券でまかなう。n枚目は、それが要る日までの
     * 利用日のうち最安の日に買う。どこでも買えない枚があれば null
     */
    const addOnsFor = (
      addOn: LiftTicketProduct,
      baseHours: number,
      shortHours: number,
    ): TicketPlanAddOn[] | null => {
      const addOnHours = addOn.validity?.hours ?? 0;
      const count = Math.ceil(shortHours / addOnHours);
      const byDate = new Map<string, TicketPlanAddOn>();
      for (let index = 0; index < count; index++) {
        const neededBy = dayIndexExceeding(baseHours + index * addOnHours);
        const cheapest = sortedDates
          .slice(0, neededBy + 1)
          .map(date => ({ date, result: addOnResultOn(addOn, date) }))
          .filter(({ result }) => result.payableTotal != null)
          .sort(
            (left, right) =>
              (left.result.payableTotal ?? 0) -
                (right.result.payableTotal ?? 0) ||
              left.date.localeCompare(right.date),
          )[0];
        if (!cheapest) return null;
        const unit = cheapest.result.payableTotal ?? 0;
        const existing = byDate.get(cheapest.date);
        if (existing) {
          existing.ticketCount += 1;
          existing.total += unit;
          continue;
        }
        byDate.set(cheapest.date, {
          productId: addOn.id,
          productName: addOn.official_label_ja ?? addOn.name_ja,
          date: cheapest.date,
          ticketCount: 1,
          total: unit,
          sourceNumbers: resultSourceNumbersOf(cheapest.result),
          lines: cheapest.result.lines,
        });
      }
      return [...byDate.values()].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
    };

    for (let ticketCount = 1; ticketCount <= maxTicketCount; ticketCount++) {
      const shortHours = requiredHours - ticketCount * poolHours;
      const options: Array<LiftTicketProduct | null> =
        shortHours > 0 ? addOnProducts : [null];
      for (const addOn of options) {
        const addOns = addOn
          ? addOnsFor(addOn, ticketCount * poolHours, shortHours)
          : [];
        if (addOns == null) continue;
        const coveredHours =
          ticketCount * poolHours +
          addOns.reduce(
            (sum, item) =>
              sum +
              item.ticketCount *
                (data.products.find(p => p.id === item.productId)?.validity
                  ?.hours ?? 0),
            0,
          );
        const leftover = coveredHours - requiredHours;
        const candidate: TicketPlanMultiDay = {
          kind: "hours_pool",
          notes: leftover > 0 ? [`${formatHoursLeft(leftover)}残ります`] : [],
          productId: product.id,
          productName: product.official_label_ja ?? product.name_ja,
          days: plans.length,
          dates: sortedDates,
          ticketCount,
          requiredHours,
          total:
            unitTotal * ticketCount +
            addOns.reduce((sum, item) => sum + item.total, 0),
          perDayTotal,
          sourceNumbers: [
            ...new Set([
              ...resultSourceNumbersOf(results[0]),
              ...addOns.flatMap(item => item.sourceNumbers),
            ]),
          ].sort((left, right) => left - right),
          lines: results[0].lines,
          addOns,
          ticketTotal: 0,
          // 追加券を足す案は、券の割引だけを比べても金額が合わないので出さない
          conditionalOffers:
            addOns.length === 0
              ? results[0].conditionalOffers.map(offer => ({
                  ...offer,
                  subtotal: offer.subtotal * ticketCount,
                  days: null,
                }))
              : [],
        };
        candidate.ticketTotal = candidate.total;
        if (best == null || candidate.total < best.total) best = candidate;
      }
    }
  }
  return best;
};

/**
 * 「1日券5枚セット」のように、1枚が1人1日分で、どの日・何人でも使える券
 * （selectable_days）を使う案。
 *
 * ★のべ人日（日ごとの人数の合計）で枚数を数える。5日×1名も、1日×5名も、
 * 2名×3日も同じ「5人日」。セットの枚数は1セットずつ増やし、まかなう日は
 * 通常の合計が高い日から選ぶ（日の途中だけセット券にはしない）。
 * セット券で買える人（全員が同じ料金で買える日）だけが対象で、子供が混ざる日は
 * 通常の券で買う。
 */
const selectTicketSetPlan = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  days: TicketPlanDay[],
  perDayTotal: number | null,
): TicketPlanMultiDay | null => {
  if (perDayTotal == null || days.length === 0) return null;
  let best: TicketPlanMultiDay | null = null;
  for (const product of data.products) {
    if (product.validity?.mode !== "selectable_days") continue;
    const ticketsPerSet = product.validity.days ?? 0;
    if (ticketsPerSet <= 0 || isSharedLiftTicketProduct(product)) continue;

    // 全員がこのセット券で買える日だけが候補
    const units: Array<{
      day: TicketPlanDay;
      result: TicketCalculationResult;
      people: number;
      unit: number;
      regular: number;
    }> = [];
    for (const day of days) {
      const regular = day.result.payableTotal;
      if (regular == null) continue;
      const result = calculateLiftTicket(
        data,
        { ...input, visitDate: day.plan.date, days: undefined },
        product.id,
      );
      const unit = result.lines[0]?.unitAmount;
      if (
        result.payableTotal == null ||
        unit == null ||
        result.lines.some(line => line.unitAmount !== unit)
      )
        continue;
      units.push({
        day,
        result,
        people: result.lines.reduce((sum, line) => sum + line.count, 0),
        unit,
        regular,
      });
    }
    if (units.length === 0) continue;
    const setPrice = units[0].unit;
    const usable = units
      .filter(item => item.unit === setPrice)
      .sort((left, right) => right.regular - left.regular);
    const personDays = usable.reduce((sum, item) => sum + item.people, 0);

    for (
      let setCount = 1;
      setCount <= Math.ceil(personDays / ticketsPerSet);
      setCount++
    ) {
      let remaining = ticketsPerSet * setCount;
      const covered: typeof usable = [];
      for (const item of usable) {
        if (item.people > remaining) continue;
        covered.push(item);
        remaining -= item.people;
      }
      if (covered.length === 0) continue;
      const total =
        perDayTotal -
        covered.reduce((sum, item) => sum + item.regular, 0) +
        setPrice * setCount;
      if (best != null && best.total <= total) continue;
      const coveredDates = covered
        .map(item => item.day.plan.date)
        .sort((left, right) => left.localeCompare(right));
      const base = covered[0].result.lines[0];
      best = {
        kind: "ticket_set",
        productId: product.id,
        productName: product.official_label_ja ?? product.name_ja,
        days: coveredDates.length,
        dates: coveredDates,
        ticketCount: setCount,
        requiredHours: null,
        total,
        perDayTotal,
        sourceNumbers: [
          ...new Set(
            covered.flatMap(item => resultSourceNumbersOf(item.result)),
          ),
        ].sort((left, right) => left - right),
        lines: [
          { ...base, count: 1, unitAmount: setPrice, subtotal: setPrice },
        ],
        addOns: [],
        ticketTotal: setPrice * setCount,
        conditionalOffers: [],
        ticketSet: {
          ticketsPerSet,
          coveredPersonDays: covered.reduce(
            (sum, item) => sum + item.people,
            0,
          ),
        },
      };
    }
  }
  return best;
};

/**
 * 25時間券でまかなう日の組み合わせを変えて、計画全体が最安になる案を選ぶ。
 *
 * ★**全日をまかなう案だけを見ない。** ルスツのように日中の営業時間が
 * 公式に無いと「1日」の日は何時間滑るか分からず、全日の合計時間が出せない。
 * その日は1日券で買い、時間が分かる日（「5時間」「10時間」）だけを
 * 25時間券でまかなう案も比べる。10時間の日だけ1日券にしたほうが安いこともある。
 * 25時間券でまかなわない日は、その日の最安（dayTotals）で買う。
 */
const MAX_POOL_SUBSET_DAYS = 8;

const selectHoursPoolPlan = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  plans: TicketDayPlan[],
  perDayTotal: number | null,
  dayTotals: Array<number | null>,
): TicketPlanMultiDay | null => {
  const known = plans
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => plan.date && plannedHoursOf(data, plan) != null);
  if (known.length === 0) return null;
  // 日数が多いと組み合わせが爆発するので、そのときは時間が分かる日すべてだけを試す
  const subsets: number[][] =
    known.length > MAX_POOL_SUBSET_DAYS
      ? [known.map(({ index }) => index)]
      : Array.from({ length: (1 << known.length) - 1 }, (_, mask) =>
          known
            .filter((_, bit) => ((mask + 1) >> bit) & 1)
            .map(({ index }) => index),
        );
  let best: TicketPlanMultiDay | null = null;
  for (const subset of subsets) {
    const others = plans
      .map((_, index) => index)
      .filter(index => !subset.includes(index));
    if (others.some(index => dayTotals[index] == null)) continue;
    const othersTotal = others.reduce(
      (sum, index) => sum + (dayTotals[index] ?? 0),
      0,
    );
    const pooled = selectHoursPoolPlanFor(
      data,
      input,
      subset.map(index => plans[index]),
      perDayTotal,
    );
    if (!pooled) continue;
    const candidate = { ...pooled, total: pooled.total + othersTotal };
    if (best == null || candidate.total < best.total) best = candidate;
  }
  return best;
};

/**
 * 複数日券でまかなう日を、条件付きの割引を使って1日ずつ買う案。
 *
 * ★**複数日券を採用すると、その日の割引（レディースDAYなど）が画面から消える。**
 * 木曜だけ女性2,000円になるなら、2日券10,500円より「2,000円＋金曜5,500円」が
 * 安い。割引ごとに、使える日はその割引、ほかの日は通常の券で買った合計を出し、
 * その利用者区分の複数日券の料金より安いものだけを返す。
 */
const perDayConditionalOffersFor = (
  multiDay: TicketPlanMultiDay,
  days: TicketPlanDay[],
): TicketPlanConditionalOffer[] => {
  const covered = days
    .filter(day => multiDay.dates.includes(day.plan.date))
    .sort((left, right) => left.plan.date.localeCompare(right.plan.date));
  const keyOf = (offer: TicketConditionalOffer) =>
    JSON.stringify([offer.groupId, offer.offerName, offer.conditions]);
  const multiDayGroupTotal = (groupId: string) => {
    const lineTotal = (lines: TicketCalculationLine[], count: number) => {
      const line = lines.find(item => item.groupId === groupId);
      return line?.subtotal == null ? 0 : line.subtotal * count;
    };
    return (
      lineTotal(multiDay.lines, multiDay.ticketCount) +
      multiDay.addOns.reduce(
        (sum, addOn) => sum + lineTotal(addOn.lines, addOn.ticketCount),
        0,
      )
    );
  };

  const firstByKey = new Map<string, TicketConditionalOffer>();
  for (const day of covered) {
    for (const offer of day.result.conditionalOffers) {
      if (!firstByKey.has(keyOf(offer))) firstByKey.set(keyOf(offer), offer);
    }
  }

  const offers: TicketPlanConditionalOffer[] = [];
  for (const [key, first] of firstByKey) {
    const breakdown: Array<{ date: string; label: string; subtotal: number }> =
      [];
    const sourceNumbers = new Set<number>();
    let complete = true;
    for (const day of covered) {
      const offer = day.result.conditionalOffers.find(
        item => keyOf(item) === key,
      );
      if (offer) {
        breakdown.push({
          date: day.plan.date,
          label: offer.offerName,
          subtotal: offer.subtotal,
        });
        for (const number of offer.sourceNumbers) sourceNumbers.add(number);
        continue;
      }
      const line = day.result.lines.find(
        item => item.groupId === first.groupId,
      );
      if (line?.subtotal == null) {
        complete = false;
        break;
      }
      breakdown.push({
        date: day.plan.date,
        label: line.offerName ?? line.productName ?? "通常の券",
        subtotal: line.subtotal,
      });
      for (const number of line.sourceNumbers) sourceNumbers.add(number);
    }
    if (!complete) continue;
    const subtotal = breakdown.reduce((sum, item) => sum + item.subtotal, 0);
    if (subtotal >= multiDayGroupTotal(first.groupId)) continue;
    offers.push({
      ...first,
      id: `per-day:${key}`,
      productName: "1日ずつ購入",
      unitAmount: subtotal / first.count,
      subtotal,
      sourceNumbers: [...sourceNumbers].sort((left, right) => left - right),
      days: breakdown,
    });
  }
  return offers;
};

/** 計算結果の料金行が拠っている出典番号 */
const formatHoursLeft = (hours: number) =>
  `${Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10}時間`;

const resultSourceNumbersOf = (result: TicketCalculationResult) =>
  [...new Set(result.lines.flatMap(line => line.sourceNumbers))].sort(
    (left, right) => left - right,
  );

/**
 * 日ごとの計画からリフト券の合計を出す。
 *
 * ★**2日以上滑るときは「連続2日券」と「1日券×2」を比べる。**
 * 連続2日券は連続した日にしか使えないので、日付が飛んでいる場合は候補にしない。
 * 複数日券が無いスキー場（めがひら）では自動的に1日ずつの合計になる。
 * 25時間券のように日をまたいで時間を分けて使う券は、全日の滑走時間の合計で
 * 比べる（selectHoursPoolPlan）。
 */
export const calculateLiftTicketPlan = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
): TicketPlanResult => {
  const plans = input.days ?? [];
  const days: TicketPlanDay[] = plans.map(plan => {
    const dayInput = { ...input, visitDate: plan.date, days: undefined };
    const options = calculateDurationOptions(
      data,
      input,
      plan.date,
      plan.duration,
    );
    if (options.primary)
      return { plan, result: options.primary.result, options };
    // 要件に合う券が無い・休業日などは、理由付きで料金なしにする（別の券で代用しない）
    const base = calculateLiftTicket(data, dayInput, null);
    return {
      plan,
      options,
      result: {
        ...base,
        status: base.status === "unavailable" ? options.status : base.status,
        notes: [...new Set([...options.notes, ...base.notes])],
      },
    };
  });

  // ★定休日・営業期間外の日は「料金なし」と示し、合計には含めない
  // （以前は1日でも休業日があると合計全体が出なかった。L09・PB27）
  const isClosedDay = (day: TicketPlanDay) =>
    day.result.status === "closed" || day.result.status === "outside_season";
  const openDays = days.filter(day => !isClosedDay(day));
  const priced = openDays.filter(day => day.result.payableTotal != null);
  const perDayTotal =
    priced.length === openDays.length && openDays.length > 0
      ? priced.reduce((sum, day) => sum + (day.result.payableTotal ?? 0), 0)
      : null;
  const openPlans = openDays.map(day => day.plan);

  // 複数日券。連続した日のかたまりごとに、短い連続日券への分け方も含めて最安を探す
  // （4日なら「2日券×2」、5日なら「3日券＋2日券」。監査C12）。
  // 離れたかたまり（1/18〜19と1/21〜22）もそれぞれ分けて合計する
  let multiDay: TicketPlanMultiDay | null = null;
  if (days.length >= 2 && perDayTotal != null) {
    type Segment = {
      dates: string[];
      productId: string;
      productName: string;
      result: TicketCalculationResult;
    };
    const chosen: Segment[] = [];
    let saving = 0;
    const dayTotalOf = (date: string) =>
      days.find(day => day.plan.date === date)?.result.payableTotal ?? 0;
    for (const run of consecutiveRuns(openPlans.map(plan => plan.date))) {
      if (run.length < 2) continue;
      // best[i] = run[0..i) の最安。from[i] = 最後のかたまり
      const best: number[] = [0];
      const from: Array<{ start: number; segment: Segment | null }> = [
        { start: 0, segment: null },
      ];
      for (let end = 1; end <= run.length; end += 1) {
        best[end] = best[end - 1] + dayTotalOf(run[end - 1]);
        from[end] = { start: end - 1, segment: null };
        for (let start = 0; start <= end - 2; start += 1) {
          const length = end - start;
          const segmentInput = {
            ...input,
            visitDate: run[start],
            days: undefined,
          };
          const product = selectCheapestProductForDuration(data, segmentInput, {
            kind: "days",
            days: length,
          });
          if (!product || (product.validity?.days ?? 0) !== length) continue;
          const result = calculateLiftTicket(data, segmentInput, product.id);
          if (result.payableTotal == null) continue;
          const cost = best[start] + result.payableTotal;
          if (cost < best[end]) {
            best[end] = cost;
            from[end] = {
              start,
              segment: {
                dates: run.slice(start, end),
                productId: product.id,
                productName: product.official_label_ja ?? product.name_ja,
                result,
              },
            };
          }
        }
      }
      const runPerDay = run.reduce((sum, date) => sum + dayTotalOf(date), 0);
      if (best[run.length] >= runPerDay) continue;
      saving += runPerDay - best[run.length];
      const segments: Segment[] = [];
      for (let end = run.length; end > 0; end = from[end].start)
        if (from[end].segment) segments.unshift(from[end].segment as Segment);
      chosen.push(...segments);
    }
    if (chosen.length > 0) {
      const ticketTotal = chosen.reduce(
        (sum, segment) => sum + (segment.result.payableTotal ?? 0),
        0,
      );
      const names = chosen.map(segment => segment.productName);
      const sameName = names.every(name => name === names[0]);
      multiDay = {
        kind: "consecutive_days",
        productId: chosen[0].productId,
        productName: sameName
          ? `${names[0]}${chosen.length > 1 ? `×${chosen.length}` : ""}`
          : names.join("＋"),
        days: chosen.reduce((sum, segment) => sum + segment.dates.length, 0),
        dates: chosen.flatMap(segment => segment.dates),
        ticketCount: chosen.length,
        requiredHours: null,
        total: perDayTotal - saving,
        perDayTotal,
        sourceNumbers: [
          ...new Set(
            chosen.flatMap(segment => resultSourceNumbersOf(segment.result)),
          ),
        ],
        lines: chosen.flatMap(segment => segment.result.lines),
        addOns: [],
        ticketTotal,
        conditionalOffers: chosen.flatMap(segment =>
          segment.result.conditionalOffers.map(offer => ({
            ...offer,
            days: null,
          })),
        ),
        // 料金の期間をまたぐ連続日券は、初日の期間の料金で計算する（L11。公式の確認が必要）
        notes: chosen.some(segment =>
          segment.dates.some(
            date => dayTotalOf(date) !== dayTotalOf(segment.dates[0]),
          ),
        )
          ? ["期間をまたぎます（料金は初日の期間で計算しています）"]
          : [],
        segments: chosen.map(segment => ({
          dates: segment.dates,
          productId: segment.productId,
          productName: segment.productName,
          total: segment.result.payableTotal ?? 0,
        })),
      };
    }
  }

  const pooled = selectHoursPoolPlan(
    data,
    input,
    openPlans,
    perDayTotal,
    openDays.map(day => day.result.payableTotal),
  );
  const multiDayAlternatives: TicketPlanMultiDay[] = [];
  if (
    pooled != null &&
    (multiDay == null || pooled.total < multiDay.total) &&
    (perDayTotal == null || pooled.total < perDayTotal)
  ) {
    multiDay = pooled;
  } else if (
    pooled != null &&
    multiDay != null &&
    pooled.total === multiDay.total
  ) {
    // 同額なら連続日券を上にし、時間を使い切る券は別の案として残す（T05）
    multiDayAlternatives.push(pooled);
  }

  const ticketSet = selectTicketSetPlan(data, input, openDays, perDayTotal);
  if (
    ticketSet != null &&
    (multiDay == null || ticketSet.total < multiDay.total) &&
    (perDayTotal == null || ticketSet.total < perDayTotal)
  ) {
    multiDay = ticketSet;
  }

  if (multiDay != null && multiDay.kind !== "ticket_set") {
    // 同じ割引で複数日券のほうが安い（同額）なら、1日ずつ買う案は並べない
    const ticketOffers = multiDay.conditionalOffers;
    const perDayOffers = perDayConditionalOffersFor(multiDay, days).filter(
      offer =>
        !ticketOffers.some(
          ticketOffer =>
            ticketOffer.groupId === offer.groupId &&
            ticketOffer.offerName === offer.offerName &&
            ticketOffer.subtotal <= offer.subtotal,
        ),
    );
    multiDay = {
      ...multiDay,
      conditionalOffers: [...ticketOffers, ...perDayOffers],
    };
  }

  const total = multiDay != null ? multiDay.total : perDayTotal;

  // 表示する料金の根拠だけを載せる。複数日券は日ごとの結果に含まれないので足す
  const usedNumbers = new Set([
    ...days.flatMap(day => [
      ...resultSourceNumbersOf(day.result),
      ...day.result.conditionalOffers.flatMap(offer => offer.sourceNumbers),
    ]),
    ...(multiDay?.sourceNumbers ?? []),
    ...(multiDay?.conditionalOffers.flatMap(offer => offer.sourceNumbers) ??
      []),
  ]);
  const references = buildReferences(data).references.filter(reference =>
    usedNumbers.has(reference.number),
  );

  return {
    days,
    perDayTotal,
    multiDay,
    multiDayAlternatives,
    total,
    references,
  };
};
