import type {
  LiftTicketAudience,
  LiftTicketCalendar,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketPrice,
  LiftTicketProduct,
  LiftTicketSearchInput,
  TicketCalculationLine,
  TicketCalculationResult,
  TicketPartyCategory,
  TicketPartyGroup,
} from "../types";

export const TICKET_PARTY_CATEGORY_LABELS: Record<TicketPartyCategory, string> =
  {
    preschool: "未就学児",
    elementary: "小学生",
    junior_high: "中学生",
    high_school: "高校生",
    university: "大学・専門学生",
    adult: "大人",
    other: "学校区分なし",
  };

export const DEFAULT_LIFT_TICKET_SEARCH_INPUT: LiftTicketSearchInput = {
  visitDate: "",
  usePreference: "full_day",
  party: [
    {
      id: "default-adult",
      category: "adult",
      age: 30,
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
    isSaturday: weekday === 6,
    isSunday: weekday === 0,
    isPublicHoliday: holidayName !== null,
    isWeekday: weekday >= 1 && weekday <= 5 && holidayName === null,
  };
};

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
    default:
      return false;
  }
};

const getCalendarMatchLevel = (
  calendar: LiftTicketCalendar | undefined,
  dateString: string,
) => {
  if (!calendar) return null;
  if (calendar.excluded_dates?.includes(dateString)) return null;
  if (calendar.dates?.includes(dateString)) return 3;
  if (
    calendar.date_ranges?.some(
      range => range.start <= dateString && dateString <= range.end,
    )
  ) {
    return 2;
  }
  if (
    calendar.day_types?.some(dayType => dayTypeMatches(dayType, dateString))
  ) {
    return 1;
  }
  return null;
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

const isDailyProduct = (product: LiftTicketProduct) =>
  product.product_type !== "shared_pass" && product.product_type !== "package";

export const getDailyLiftTicketProducts = (data: LiftTicketData) =>
  data.products.filter(isDailyProduct);

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

const hasUnconditionalStandardOffer = (
  data: LiftTicketData,
  product: LiftTicketProduct,
) =>
  data.offers.some(
    offer =>
      offer.product_id === product.id &&
      offer.offer_type === "standard" &&
      (offer.eligibility_conditions?.length ?? 0) === 0,
  );

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

const audienceMatchesGroup = (
  audience: LiftTicketAudience,
  group: TicketPartyGroup,
) => {
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
  if (group.category !== "adult" && schoolLevels.includes(group.category)) {
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
  return calendarIds.some(
    calendarId =>
      getCalendarMatchLevel(calendarById.get(calendarId), dateString) != null,
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

  switch (price.mode) {
    case "fixed":
    case "free":
      return {
        amount: price.mode === "free" ? 0 : (price.amount ?? null),
        note: price.notes_ja ?? null,
      };
    case "date_table": {
      const calendarById = new Map(
        data.calendars.map(calendar => [calendar.id, calendar]),
      );
      let bestMatch:
        | { level: number; amount: number | null | undefined }
        | undefined;
      for (const row of price.date_table ?? []) {
        let level: number | null = null;
        if (row.dates?.includes(dateString)) {
          level = 5;
        } else if (
          row.start &&
          row.end &&
          row.start <= dateString &&
          dateString <= row.end
        ) {
          level = 4;
        } else if (row.calendar_id) {
          level = getCalendarMatchLevel(
            calendarById.get(row.calendar_id),
            dateString,
          );
        }
        if (level != null && (!bestMatch || level > bestMatch.level)) {
          bestMatch = { level, amount: row.amount };
        }
      }
      return {
        amount: bestMatch?.amount ?? null,
        note: bestMatch
          ? (price.notes_ja ?? null)
          : "該当日の料金がありません。",
      };
    }
    case "derived_discount": {
      const baseOffer = data.offers.find(
        candidate => candidate.id === price.base_offer_id,
      );
      if (!baseOffer) {
        return { amount: null, note: "基準料金が見つかりません。" };
      }
      const basePrice = resolvePrice(data, baseOffer, dateString, depth + 1);
      if (
        basePrice.amount == null ||
        !price.discount ||
        price.discount.value == null
      ) {
        return { amount: null, note: "基準料金を解決できません。" };
      }
      const amount =
        price.discount.type === "percent"
          ? Math.max(
              0,
              Math.round(
                (basePrice.amount * (100 - price.discount.value)) / 100,
              ),
            )
          : Math.max(0, basePrice.amount - price.discount.value);
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
    .filter(offer =>
      offer.discount_reasons?.some(reason =>
        ["special_day", "kids_day"].includes(reason),
      ),
    )
    .filter(offer => (offer.eligibility_conditions?.length ?? 0) === 0)
    .map(offer => offer.product_id);
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

const calculateGroupLine = (
  data: LiftTicketData,
  group: TicketPartyGroup,
  baseProduct: LiftTicketProduct,
  dateString: string,
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
  const matchingOffers = data.offers.filter(offer => {
    if (!allowedProductIds.has(offer.product_id)) return false;
    if (!offerMatchesDate(data, offer, dateString)) return false;
    const audienceIds = offer.audience_ids ?? [];
    if (audienceIds.length === 0) return true;
    return audienceIds.some(audienceId => {
      const audience = audienceById.get(audienceId);
      return audience ? audienceMatchesGroup(audience, group) : false;
    });
  });
  const unconditionalOffers = matchingOffers.filter(
    offer => (offer.eligibility_conditions?.length ?? 0) === 0,
  );
  const resolvedOffers = unconditionalOffers
    .map(offer => ({
      offer,
      price: resolvePrice(data, offer, dateString),
    }))
    .sort((left, right) => {
      const amountDifference =
        (left.price.amount ?? Number.POSITIVE_INFINITY) -
        (right.price.amount ?? Number.POSITIVE_INFINITY);
      if (amountDifference !== 0) return amountDifference;
      return left.offer.offer_type === "discounted" ? -1 : 1;
    });
  const bestOffer = resolvedOffers.find(
    candidate => candidate.price.amount != null,
  );

  if (!bestOffer) {
    const hasAudienceMatch = matchingOffers.length > 0;
    return {
      line: createUnresolvedLine(
        group,
        baseProduct,
        hasAudienceMatch
          ? "条件なしで確定できる料金がありません。"
          : "公式の人物区分に一致する料金がありません。",
      ),
      conditionalOfferNames: matchingOffers
        .filter(offer => (offer.eligibility_conditions?.length ?? 0) > 0)
        .map(offer => offer.name_ja),
    };
  }

  const matchingAudience = (bestOffer.offer.audience_ids ?? [])
    .map(audienceId => audienceById.get(audienceId))
    .find(audience => audience && audienceMatchesGroup(audience, group));
  const product = productById.get(bestOffer.offer.product_id) ?? baseProduct;
  const unitAmount = bestOffer.price.amount;
  const line: TicketCalculationLine = {
    groupId: group.id,
    groupLabel: formatPartyGroupLabel(group),
    count: group.count,
    audienceName: matchingAudience?.name_ja ?? null,
    productName: product.name_ja,
    offerName: bestOffer.offer.name_ja,
    unitAmount,
    subtotal: unitAmount == null ? null : unitAmount * group.count,
    note: bestOffer.price.note,
  };

  return {
    line,
    conditionalOfferNames: matchingOffers
      .filter(offer => (offer.eligibility_conditions?.length ?? 0) > 0)
      .map(offer => offer.name_ja),
  };
};

export const calculateLiftTicket = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  explicitProductId?: string | null,
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
    conditionalOfferNames: [],
    notes,
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

  const baseProduct = explicitProductId
    ? (data.products.find(product => product.id === explicitProductId) ?? null)
    : selectPreferredDailyProduct(data, input.usePreference);
  if (!baseProduct) {
    return emptyResult("unavailable", [
      "日帰り利用向けの券種を選べませんでした。",
    ]);
  }

  const calculatedGroups = activeGroups.map(group =>
    calculateGroupLine(data, group, baseProduct, input.visitDate),
  );
  const lines = calculatedGroups.map(group => group.line);
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
  if (data.data_quality.status !== "complete") {
    notes.push(`データ品質: ${data.data_quality.status}`);
  }

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
        refundable: fee.refundable ?? null,
        total: fee.amount ?? 0,
      })),
    ticketTotal: isComplete ? knownTicketTotal : null,
    knownTicketTotal,
    payableTotal: isComplete ? knownTicketTotal : null,
    partyCount,
    conditionalOfferNames: Array.from(
      new Set(calculatedGroups.flatMap(group => group.conditionalOfferNames)),
    ),
    notes,
  };
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
  if (price?.mode === "free") return "無料";
  if (
    ["fixed", "derived_discount"].includes(price?.mode ?? "") &&
    price?.amount != null
  ) {
    return `¥${price.amount.toLocaleString("ja-JP")}`;
  }
  if (price?.mode === "range" && price.range) {
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
  if (price?.mode === "live_dynamic") return "変動料金";
  if (price?.mode === "date_table") return "日付別";
  return "要確認";
};
