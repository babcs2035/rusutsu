import type {
  LiftTicketAudience,
  LiftTicketCalendar,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketPartyRule,
  LiftTicketPrice,
  LiftTicketProduct,
  LiftTicketSearchInput,
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
const addDays = (dateString: string, numberOfDays: number) => {
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

const calendarMatchesDate = (
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

const periodContains = (
  period: { start?: string | null; end?: string | null } | null | undefined,
  dateString: string,
) => {
  if (!period) return true;
  if (period.start && dateString < period.start) return false;
  if (period.end && dateString > period.end) return false;
  return true;
};

const seasonContains = (data: LiftTicketData, dateString: string) =>
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
 * 照会日（today）から利用日までの間に、その利用日の分を買える日があるか。
 *
 * ★**販売期間は利用日ではなく購入する日と比べる。** 「11/30まで販売の早割」は
 * 1月に滑る分でも11/30を過ぎたら買えない。販売期間外・販売期限切れ・
 * 「利用日の〇日前まで」を過ぎた券は、計算にも候補にも出さない。
 *
 * ★**販売開始前の券も、利用日までに販売が始まるなら買える。**
 * 「12/19から販売開始」のWeb券は、9月に照会しても12/24に滑る分は
 * 12/19〜12/24の間に買える。今日だけで判定すると、販売開始前の時期に
 * 照会した利用者にWeb料金が一切出なくなる。
 */
const isPurchasableOn = (
  offer: Pick<LiftTicketOffer, "sales_period" | "purchase_deadline">,
  visitDate: string,
  today: string,
) => {
  const sales = offer.sales_period;
  const deadline = offer.purchase_deadline;
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
 * その日の営業時間（分）。1日券が何時間滑れるかは営業時間で決まる。
 * ナイターは含めない（1日券にナイターが付くかは covers_hours_types が表す）。
 */
const operatingHoursOn = (data: LiftTicketData, dateString: string) => {
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const matchesDate = (entry: { calendar_ids?: string[] }) =>
    (entry.calendar_ids ?? []).some(id =>
      calendarMatchesDate(calendarById.get(id), dateString),
    );
  if (findClosedCalendar(data, dateString)) return null;

  let best: number | null = null;
  for (const entry of data.operating_hours ?? []) {
    if (entry.hours_type === "closed" || entry.hours_type === "night") continue;
    if (!matchesDate(entry)) continue;
    const start = toMinutes(entry.start_time);
    const end = toMinutes(entry.end_time);
    if (start == null || end == null) continue;
    const span = (end - start) / 60;
    if (best == null || span > best) best = span;
  }
  return best;
};

/**
 * その日にナイター営業があるか。定休日・ナイター営業日でない日は false。
 * 「ナイター込み1日券」の解決に、この日にそもそもナイターがあるかを使う。
 */
const hasNightOperatingOn = (data: LiftTicketData, dateString: string) => {
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
    return operatingHoursOn(data, dateString);
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
  return operatingHoursOn(data, dateString) == null;
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
  // 付属物（温泉特典など）が付いていても普通のリフト券なので候補から外さない。
  // 外していたため「温泉特典付き9時間券」が7時間の要件で該当なしになっていた。
  // 共通券だけは別枠（画面の単独券／共通券の切り替えで扱う）
  const candidates = data.products.filter(product => {
    if (isSharedLiftTicketProduct(product)) return false;
    if (!hasUnconditionalStandardOffer(data, product)) return false;
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
      if (request.days >= 2) return days != null && days >= request.days;
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

/**
 * 学校区分ごとの年齢（年齢が未入力のとき、年齢だけで決まる区分に当てるのに使う）。
 * 中学生は1年の春に12歳の人がいるが、ほとんどの期間は13〜15歳なのでそちらで判定する
 */
const TYPICAL_AGES_BY_CATEGORY: Partial<
  Record<TicketPartyCategory, [number, number]>
> = {
  elementary: [6, 12],
  junior_high: [13, 15],
  high_school: [16, 18],
};

/**
 * その人物区分の料金をこの利用者が買えるか。
 *
 * ★**どの区分にも当てはまらない人は、基準区分（is_default）の料金を買う。**
 * 基準区分の名前はスキー場ごとに違う（「大人」「おとな」「一般」…）ので、
 * 名前では探さない。名前で探していたため、基準区分が「一般」の札幌国際では
 * 大人・大学生・学校区分なしの誰にも料金が出なかった。
 * ただし基準区分に年齢範囲があり、入力された年齢が範囲外なら使わない
 * （「大人（19〜64歳）」に70歳を当てはめない）。
 */
const audienceMatchesGroup = (
  audience: LiftTicketAudience,
  group: TicketPartyGroup,
  audienceById: Map<string, LiftTicketAudience>,
): boolean => {
  if (audienceDirectlyMatchesGroup(audience, group, audienceById)) return true;
  if (audience.is_default !== true || group.category === "disabled") {
    return false;
  }
  const hasAgeRange = audience.age_min != null || audience.age_max != null;
  if (
    group.age != null &&
    hasAgeRange &&
    ((audience.age_min != null && group.age < audience.age_min) ||
      (audience.age_max != null && group.age > audience.age_max))
  ) {
    return false;
  }
  // 基準区分以外のどの区分にも当てはまらないときだけ、基準区分に回す
  return ![...audienceById.values()].some(
    other =>
      other.id !== audience.id &&
      other.is_default !== true &&
      audienceDirectlyMatchesGroup(other, group, audienceById),
  );
};

/** 年齢・学校区分・公式表記から、その区分に直接当てはまるか（基準区分への回し込みは含めない） */
const audienceDirectlyMatchesGroup = (
  audience: LiftTicketAudience,
  group: TicketPartyGroup,
  audienceById: Map<string, LiftTicketAudience>,
): boolean => {
  if (group.category === "disabled") {
    if (audience.is_disability_qualified === true) {
      const baseAudience = audience.base_audience_id
        ? audienceById.get(audience.base_audience_id)
        : null;
      return baseAudience
        ? audienceMatchesGroup(
            baseAudience,
            { ...group, category: "adult" },
            audienceById,
          )
        : true;
    }
    return audience.is_default === true;
  }
  if (audience.is_disability_qualified === true) return false;

  const schoolLevels = audience.school_levels ?? [];
  const label = [
    audience.id,
    audience.name_ja,
    audience.official_label_ja ?? "",
  ].join(" ");
  const hasAgeRange = audience.age_min != null || audience.age_max != null;
  const ageMatches =
    group.age != null &&
    hasAgeRange &&
    (audience.age_min == null || group.age >= audience.age_min) &&
    (audience.age_max == null || group.age <= audience.age_max);

  if (ageMatches) return true;
  if (group.category === "other") return false;
  const wanted = SCHOOL_LEVELS_BY_CATEGORY[group.category];
  if (wanted.length > 0 && wanted.some(level => schoolLevels.includes(level))) {
    return true;
  }
  // ★**学校区分を持たず年齢だけで決まる区分**（ルスツの「小人 4〜12歳」）に、
  // 年齢未入力の「小学生」を当てる。その学校区分の年齢がすべて入る区分だけに当てる
  // （当てないと基準区分＝大人の料金になり、小学生が大人料金で計算される）
  const typicalAges = TYPICAL_AGES_BY_CATEGORY[group.category];
  if (
    group.age == null &&
    typicalAges &&
    schoolLevels.length === 0 &&
    audience.is_default !== true &&
    hasAgeRange &&
    (audience.age_min == null || audience.age_min <= typicalAges[0]) &&
    (audience.age_max == null || typicalAges[1] <= audience.age_max) &&
    // 上限・下限の片方しかない区分（「60歳以上」）には当てない
    audience.age_min != null &&
    audience.age_max != null
  ) {
    return true;
  }
  if (group.category === "adult") {
    return /大人|adult/iu.test(label);
  }
  if (
    ["junior_high", "high_school", "university"].includes(group.category) &&
    /中学生以上/u.test(label)
  ) {
    return true;
  }
  return false;
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

const isFullDayLike = (product: LiftTicketProduct) =>
  product.validity?.mode === "calendar_day" ||
  (durationHours(product) ?? 0) >= 6;

const getAutomaticSpecialProductIds = (
  data: LiftTicketData,
  baseProduct: LiftTicketProduct,
  dateString: string,
) => {
  if (!isFullDayLike(baseProduct)) return [];
  return data.offers
    .filter(offer => offerMatchesDate(data, offer, dateString))
    .filter(
      offer =>
        offer.discount_reasons?.some(reason =>
          ["special_day", "kids_day"].includes(reason),
        ) || ageGenerationCondition(offer) != null,
    )
    .map(offer => offer.product_id);
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
  return [
    offer.target_genders?.description_ja ??
      offer.target_genders?.official_label_ja,
    offer.target_qualification?.description_ja ??
      offer.target_qualification?.official_label_ja,
    ...(offer.requirements ?? []).map(requirement =>
      requirement.proof_ja ? `要提示: ${requirement.proof_ja}` : null,
    ),
    purchase?.note,
    purchase?.warning,
  ].filter(
    (condition, index, all): condition is string =>
      Boolean(condition) && all.indexOf(condition) === index,
  );
};

/** 「2026-12-19」→「12/19」 */
const monthDay = (date: string) => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};

/**
 * Web・前売料金の買い方を短く表す。
 * 「Webで購入（当日購入可）」「Webで事前購入（利用日の3日前まで・11/30まで販売）」と、
 * 販売開始前なら「12/19から販売開始」の注意だけを返す
 */
const purchaseMethodOf = (
  data: LiftTicketData,
  offer: LiftTicketOffer,
  visitDate: string,
  today: string,
) => {
  const deadline = offer.purchase_deadline;
  const online = (offer.discount_reasons ?? []).includes("online_purchase");
  const where = online ? "Webで" : "";
  const daysBefore = Math.max(
    deadline?.days_before_use ?? 0,
    deadline?.same_day_allowed === false ? 1 : 0,
  );
  // 早割のように利用日より前に販売が終わる券は、いつまでに買うかが要る
  const end = offer.sales_period?.end;
  const limits = [
    daysBefore > 0
      ? `利用日の${daysBefore === 1 ? "前日" : `${daysBefore}日前`}まで`
      : deadline?.same_day_allowed === true
        ? "当日購入可"
        : null,
    end && end < visitDate ? `${monthDay(end)}まで販売` : null,
  ].filter((limit): limit is string => Boolean(limit));
  const verb = daysBefore > 0 ? "事前購入" : "購入";
  const note = `${where}${verb}${limits.length > 0 ? `（${limits.join("・")}）` : ""}`;
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
  return { note, url, warning };
};

const formatPartyGroupLabel = (group: TicketPartyGroup) => {
  const category = TICKET_PARTY_CATEGORY_LABELS[group.category];
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

const calculateGroupLine = (
  data: LiftTicketData,
  group: TicketPartyGroup,
  baseProduct: LiftTicketProduct,
  dateString: string,
  today: string,
  numberBySourceId: Map<string, number>,
  heldProductIds: ReadonlySet<string>,
) => {
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
  const matchingOffers = data.offers
    .map(offer =>
      withHeldBaseProduct(
        offer,
        productById.get(offer.product_id),
        heldProductIds,
      ),
    )
    .filter(offer => {
      if (!allowedProductIds.has(offer.product_id)) return false;
      if (!offerMatchesDate(data, offer, dateString)) return false;
      // 今日の時点で買えない券（販売終了の早割など）は、計算にも候補にも出さない
      if (!isPurchasableOn(offer, dateString, today)) return false;
      const audienceIds = offer.audience_ids ?? [];
      if (audienceIds.length === 0) return true;
      return audienceIds.some(audienceId => {
        const audience = audienceById.get(audienceId);
        return audience
          ? audienceMatchesGroup(audience, group, audienceById)
          : false;
      });
    });
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
  const cheaperPurchaseMethodOfferIds = new Set(
    matchingOffers
      .filter(isPurchaseMethodOffer)
      .filter(offer => {
        const amount = resolvePrice(data, offer, dateString).amount;
        return (
          amount != null &&
          (bestStandardOffer?.price.amount == null ||
            amount < bestStandardOffer.price.amount)
        );
      })
      .map(offer => offer.id),
  );
  const automaticOffers = matchingOffers.filter(
    offer =>
      cheaperPurchaseMethodOfferIds.has(offer.id) ||
      isAutomaticallyApplicableCalendarOffer(offer) ||
      automaticAgeGenerationWarnings(offer, group) != null ||
      (group.category === "disabled" &&
        (offer.audience_ids ?? []).some(
          audienceId =>
            audienceById.get(audienceId)?.is_disability_qualified === true,
        )),
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
        !(
          group.category === "disabled" &&
          (offer.audience_ids ?? []).some(
            audienceId =>
              audienceById.get(audienceId)?.is_disability_qualified === true,
          )
        ),
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
      sourceNumbers: sourceNumbersOf(offer, numberBySourceId),
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
  const disabilityWarnings =
    group.category === "disabled" &&
    (bestOffer.offer.audience_ids ?? []).some(
      audienceId =>
        audienceById.get(audienceId)?.is_disability_qualified === true,
    )
      ? (bestOffer.offer.requirements ?? [])
          .map(requirement => requirement.proof_ja)
          .filter((proof): proof is string => Boolean(proof))
      : [];
  // 早割・WEB前売は窓口では買えないので、買い方を1行で添える。
  // 決済手段・発券手順などの長文は公式ページ（出典）で確認してもらう
  const purchase = cheaperPurchaseMethodOfferIds.has(bestOffer.offer.id)
    ? purchaseMethodOf(data, bestOffer.offer, dateString, today)
    : null;
  const warnings = [
    ...new Set([
      ...ageWarnings,
      ...disabilityWarnings,
      ...(purchase?.warning ? [purchase.warning] : []),
    ]),
  ];
  const line: TicketCalculationLine = {
    sourceNumbers: sourceNumbersOf(bestOffer.offer, numberBySourceId),
    groupId: group.id,
    groupLabel: formatPartyGroupLabel(group),
    count: group.count,
    audienceName: matchingAudience?.name_ja ?? null,
    productName: product.name_ja,
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
) => {
  // 宿泊者・女性限定などは人数構成だけでは確定できないので自動適用しない
  if (rule.target_qualification || rule.target_genders) return false;
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
  if (!isPurchasableOn(rule, dateString, today)) return false;
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
  let total = 0;
  let individualTotal = 0;
  const fixedTotal = components.find(
    component =>
      component.price_effect?.type === "fixed_total" &&
      component.price_effect.amount != null,
  )?.price_effect?.amount;

  for (const [componentIndex, component] of components.entries()) {
    const isQualifier = ratioIndex >= 0 && componentIndex < ratioIndex;
    const eligible = groups
      .map((_, groupIndex) => groupIndex)
      .filter(
        groupIndex =>
          unitAmounts[groupIndex] != null &&
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
      take = Math.min(take, consumedCount * component.per_qualifying_count);
    }
    if (take <= 0 && min > 0) return null;
    if (isQualifier) continue;

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
  if (total >= individualTotal) return null;
  return { consumed, total, individualTotal };
};

/**
 * 1人ずつ計算した行に同行者ルール（親子パック等）を当てる。
 * ルールで買う人数を元の行から差し引き、ルールごとに1行へまとめる。
 * 個別に買うより安くなる場合だけ当てる。
 */
const applyPartyRules = (
  data: LiftTicketData,
  groups: TicketPartyGroup[],
  lines: TicketCalculationLine[],
  baseProduct: LiftTicketProduct,
  dateString: string,
  today: string,
  numberBySourceId: Map<string, number>,
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

  for (const rule of data.party_rules ?? []) {
    if (!isApplicablePartyRule(data, rule, baseProduct, dateString, today)) {
      continue;
    }
    const components = rule.components ?? [];
    const matchesComponent = (componentIndex: number, groupIndex: number) =>
      (components[componentIndex].audience_ids ?? []).some(audienceId => {
        const audience = audienceById.get(audienceId);
        return audience
          ? audienceMatchesGroup(audience, groups[groupIndex], audienceById)
          : false;
      });
    const consumed = new Map<number, number>();
    let setCount = 0;
    let total = 0;
    let individualTotal = 0;
    // 人数が残る限り繰り返す（親子2組なら親子パック2セット）
    for (let guard = 0; guard < 100; guard += 1) {
      const application = applyPartyRuleOnce(
        rule,
        groups,
        remaining,
        unitAmounts,
        matchesComponent,
      );
      if (!application) break;
      for (const [groupIndex, count] of application.consumed) {
        remaining[groupIndex] -= count;
        consumed.set(groupIndex, (consumed.get(groupIndex) ?? 0) + count);
      }
      setCount += 1;
      total += application.total;
      individualTotal += application.individualTotal;
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
      groupId: `party-rule:${rule.id}`,
      groupLabel: consumedGroups
        .map(([groupIndex]) => formatPartyGroupLabel(groups[groupIndex]))
        .join("＋"),
      count: consumedGroups.reduce((sum, [, count]) => sum + count, 0),
      audienceName: null,
      productName: baseProduct.name_ja,
      offerName: `${rule.name_ja}${setCount > 1 ? ` × ${setCount}セット` : ""}`,
      unitAmount: total / setCount,
      subtotal: total,
      note: rule.description_ja ?? null,
      purchaseNote: `${purchaseUrl ? "Webで購入・" : ""}個別に買うと ¥${individualTotal.toLocaleString("ja-JP")}`,
      purchaseUrl,
      warnings:
        salesStart && salesStart > today
          ? [`${monthDay(salesStart)}から販売開始です`]
          : [],
    });
  }

  if (ruleLines.length === 0) return lines;
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
  const conditionalOffers = calculatedGroups.flatMap(
    group => group.conditionalOffers,
  );
  const isComplete = lines.every(line => line.subtotal != null);
  const knownTicketTotal = lines.reduce(
    (total, line) => total + (line.subtotal ?? 0),
    0,
  );
  const productIds = new Set(
    lines
      .map(
        line =>
          data.products.find(product => product.name_ja === line.productName)
            ?.id,
      )
      .filter((productId): productId is string => Boolean(productId)),
  );
  const applicableFees = data.fees.filter(fee =>
    fee.applies_to_product_ids?.some(productId => productIds.has(productId)),
  );
  // fees に載っているのは「返ってこない追加負担」だけ（返金される保証金は
  // そもそも記録しない）。券の合計に足せばそれが実質負担になる
  const feeTotal = applicableFees.reduce(
    (sum, fee) => sum + (fee.amount ?? 0) * partyCount,
    0,
  );

  const notes: string[] = [];
  if (applicableFees.length > 0) {
    notes.push(
      `別途費用: ${applicableFees
        .map(fee =>
          fee.amount == null
            ? fee.name_ja
            : `${fee.name_ja} ¥${fee.amount.toLocaleString("ja-JP")}`,
        )
        .join("、")}（人数あたりか券あたりか不明な場合は合計に含めていません）`,
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
    fees: applicableFees
      .filter(fee => fee.amount != null)
      .map(fee => ({
        name: fee.name_ja,
        amount: fee.amount ?? 0,
        total: (fee.amount ?? 0) * partyCount,
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
    notes: Array.from(
      new Set([
        ...dayResult.notes,
        ...nightResult.notes,
        "ナイター込みの1日券が無いため、1日券とナイター券の合算です。",
      ]),
    ),
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
  const season = selectLiftTicketSeason(seasons, input.visitDate);
  if (season) {
    return calculateLiftTicket(season, input, explicitProductId);
  }
  if (seasons.length === 0) return null;
  return calculateLiftTicket(seasons[0], input, explicitProductId);
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
};

export type TicketPlanMultiDay = {
  /**
   * consecutive_days … 連続N日券（連続した日のかたまりに使う）
   * hours_pool      … 25時間券のように日をまたいで時間を分けて使う券
   *                    （全日の滑走時間の合計でまかなう）
   */
  kind: "consecutive_days" | "hours_pool";
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
  /** 1日ずつ買った合計（営業していない日は 0 として扱わず null にする） */
  perDayTotal: number | null;
  /** 複数日券を使ったほうが安い場合の代替案 */
  multiDay: TicketPlanMultiDay | null;
  /** 採用した最安の合計 */
  total: number | null;
  references: PriceReference[];
};

/**
 * その日に何時間滑るか。「1日（ナイター無）」は営業時間から出す。
 * ナイター込みは日中とナイターの時間を足す根拠が無いので null（時間券で比べない）
 */
const plannedHoursOf = (data: LiftTicketData, plan: TicketDayPlan) => {
  if (plan.duration.kind === "hours") return plan.duration.hours;
  if (plan.duration.withNight) return null;
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
        const candidate: TicketPlanMultiDay = {
          kind: "hours_pool",
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
        };
        candidate.ticketTotal = candidate.total;
        if (best == null || candidate.total < best.total) best = candidate;
      }
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

/** 計算結果の料金行が拠っている出典番号 */
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
  const days: TicketPlanDay[] = plans.map(plan => ({
    plan,
    result: (() => {
      const dayInput = { ...input, visitDate: plan.date, days: undefined };
      // 「1日（ナイター込）」はナイターの有無・単独券の要否で分岐が要るので専用の関数に任せる
      if (plan.duration.kind === "day" && plan.duration.withNight) {
        return calculateDayPassResult(data, dayInput);
      }
      const product = selectCheapestProductForDuration(
        data,
        dayInput,
        plan.duration,
      );
      // 要件に合う券が無ければ null を渡す（別の券で代用させない）
      const result = calculateLiftTicket(data, dayInput, product?.id ?? null);
      return result;
    })(),
  }));

  const priced = days.filter(day => day.result.payableTotal != null);
  const perDayTotal =
    priced.length === days.length && days.length > 0
      ? priced.reduce((sum, day) => sum + (day.result.payableTotal ?? 0), 0)
      : null;

  // 複数日券。連続した日のかたまりごとに、日数がぴったり一致する券を探す
  let multiDay: TicketPlanMultiDay | null = null;
  if (days.length >= 2 && perDayTotal != null) {
    for (const run of consecutiveRuns(plans.map(plan => plan.date))) {
      if (run.length < 2) continue;
      const runInput = { ...input, visitDate: run[0], days: undefined };
      const product = selectCheapestProductForDuration(data, runInput, {
        kind: "days",
        days: run.length,
      });
      if (!product) continue;
      const result = calculateLiftTicket(data, runInput, product.id);
      if (result.payableTotal == null) continue;
      // そのかたまりを1日ずつ買った場合の合計と比べる
      const runPerDay = days
        .filter(day => run.includes(day.plan.date))
        .reduce((sum, day) => sum + (day.result.payableTotal ?? 0), 0);
      if (result.payableTotal >= runPerDay) continue;
      const candidate: TicketPlanMultiDay = {
        kind: "consecutive_days",
        productId: product.id,
        productName: product.official_label_ja ?? product.name_ja,
        days: run.length,
        dates: run,
        ticketCount: 1,
        requiredHours: null,
        total: result.payableTotal + (perDayTotal - runPerDay),
        perDayTotal,
        sourceNumbers: resultSourceNumbersOf(result),
        lines: result.lines,
        addOns: [],
        ticketTotal: result.payableTotal,
      };
      if (multiDay == null || candidate.total < multiDay.total) {
        multiDay = candidate;
      }
    }
  }

  const pooled = selectHoursPoolPlan(
    data,
    input,
    plans,
    perDayTotal,
    days.map(day => day.result.payableTotal),
  );
  if (
    pooled != null &&
    (multiDay == null || pooled.total < multiDay.total) &&
    (perDayTotal == null || pooled.total < perDayTotal)
  ) {
    multiDay = pooled;
  }

  const total = multiDay != null ? multiDay.total : perDayTotal;

  // 表示する料金の根拠だけを載せる。複数日券は日ごとの結果に含まれないので足す
  const usedNumbers = new Set([
    ...days.flatMap(day => [
      ...resultSourceNumbersOf(day.result),
      ...day.result.conditionalOffers.flatMap(offer => offer.sourceNumbers),
    ]),
    ...(multiDay?.sourceNumbers ?? []),
  ]);
  const references = buildReferences(data).references.filter(reference =>
    usedNumbers.has(reference.number),
  );

  return { days, perDayTotal, multiDay, total, references };
};
