/**
 * 料金データの「構造の特徴」を取り出す（仕様書の Y 節）。
 *
 * 架空スキー場（spec/fixtures）と実在施設の両方にこの同じ関数をかけ、
 * 実在施設にあって架空ケースに無い特徴を警告する。金額は見ない。
 * 特徴名は「分野:内容」の文字列。新しい構造が出たら、ここに判定を足し、
 * 架空スキー場を作ってテストする。
 */
import type { LiftTicketData, LiftTicketProduct } from "../types";

const toMinutes = (time?: string | null) => {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** スキーマで想定している値。これ以外が出たら「新しい構造」 */
export const KNOWN_VALUES = {
  validityMode: [
    "calendar_day",
    "consecutive_days",
    "selectable_days",
    "hours_from_first_use",
    "fixed_time_window",
    "hours_pool",
    "rides",
    "points",
    "unknown",
  ],
  hoursType: ["regular", "night", "early_morning", "closed", "unknown"],
  rentalMode: [
    "day",
    "days",
    "extra_day",
    "half_day",
    "hours",
    "night",
    "unknown",
  ],
  priceEffect: [
    "fixed_total",
    "fixed_per_person",
    "free",
    "discount_amount",
    "discount_percent",
  ],
};

/**
 * 割引の理由を、計算上の扱いでまとめる。
 * - purchase: 買い方だけで誰でも使える（Web・前売・早割）→ 買えれば料金にする
 * - automatic: 日付と人物区分で決まる（特別日・こどもの日）→ 自動で当てる
 * - conditional: 入力から確かめられない資格（会員・地元・宿泊者・クーポン等）→ 条件付き候補
 */
const reasonCategory = (reason: string) =>
  ["online_purchase", "advance_purchase", "prior_purchase"].includes(reason)
    ? "purchase"
    : ["special_day", "kids_day"].includes(reason)
      ? "automatic"
      : "conditional";

const isDayPass = (product: LiftTicketProduct) =>
  product.validity?.mode === "calendar_day" &&
  product.validity.days === 1 &&
  !(product.included_items ?? []).some(item => item.type === "rental");

export const structureFeaturesOf = (data: LiftTicketData): Set<string> => {
  const features = new Set<string>();
  const add = (feature: string) => features.add(feature);

  // 営業時間
  const hours = data.operating_hours ?? [];
  const regular = hours.filter(entry => entry.hours_type === "regular");
  const night = hours.filter(entry => entry.hours_type === "night");
  const calendarById = new Map(data.calendars.map(c => [c.id, c]));
  for (const entry of hours) {
    const type = entry.hours_type ?? "unknown";
    if (!KNOWN_VALUES.hoursType.includes(type)) add(`new:hours_type:${type}`);
  }
  const regularTimed = regular.filter(e => e.start_time && e.end_time);
  if (regularTimed.length === 0) add("hours:regular-unknown");
  else add("hours:regular-known");
  if (
    new Set(regularTimed.map(e => `${e.start_time}-${e.end_time}`)).size > 1
  ) {
    const byDayType = regularTimed.some(e =>
      (e.calendar_ids ?? []).some(id =>
        (calendarById.get(id)?.included_day_types ?? []).some(t =>
          [
            "weekday",
            "saturday",
            "sunday",
            "public_holiday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
          ].includes(t),
        ),
      ),
    );
    add(byDayType ? "hours:varies-by-weekday" : "hours:varies-by-period");
  }
  if (night.length > 0) {
    add("hours:night");
    const nightCalendars = night.flatMap(e => e.calendar_ids ?? []);
    const limited = nightCalendars.some(id => {
      const calendar = calendarById.get(id);
      return (
        calendar != null &&
        !(calendar.included_day_types ?? []).includes("all") &&
        ((calendar.included_dates?.length ?? 0) > 0 ||
          (calendar.included_day_types ?? []).length > 0)
      );
    });
    if (limited) add("hours:night-limited-days");
    const regularEnd = Math.max(
      ...regularTimed.map(e => toMinutes(e.end_time) ?? 0),
      0,
    );
    const nightStart = Math.min(
      ...night.map(e => toMinutes(e.start_time) ?? 24 * 60),
    );
    if (regularEnd > 0 && nightStart - regularEnd > 30)
      add("hours:gap-over-30m");
    if (regularTimed.length === 0) add("hours:night-without-regular-time");
  }
  if (hours.some(e => e.hours_type === "early_morning"))
    add("hours:early-morning");
  const closed = hours.filter(e => e.hours_type === "closed");
  if (closed.length > 0) {
    add("hours:closed-days");
    if (
      closed.some(e =>
        (e.calendar_ids ?? []).some(
          id => (calendarById.get(id)?.excluded_dates?.length ?? 0) > 0,
        ),
      )
    )
      add("hours:closed-with-exceptions");
  }

  // 券
  const products = data.products;
  if (!products.some(isDayPass)) add("ticket:no-day-pass");
  for (const product of products) {
    const validity = product.validity ?? {};
    const mode = validity.mode ?? "unknown";
    if (!KNOWN_VALUES.validityMode.includes(mode))
      add(`new:validity_mode:${mode}`);
    add(`ticket:mode:${mode}`);
    const covers = product.covers_hours_types ?? [];
    if (isDayPass(product) && covers.includes("night"))
      add("ticket:day-pass-includes-night");
    if ((product.area_ids?.length ?? 0) > 0) add("ticket:area-limited");
    if ((product.shared_with_resorts?.length ?? 0) > 0) add("ticket:shared");
    if ((product.add_on_to_product_ids?.length ?? 0) > 0) add("ticket:add-on");
    for (const item of product.included_items ?? [])
      add(
        item.type === "rental"
          ? "ticket:includes:rental"
          : "ticket:includes:non-rental",
      );
    if (mode === "fixed_time_window") {
      const start = toMinutes(validity.start_time);
      const end = toMinutes(validity.end_time);
      if (start == null || end == null) add("window:relative-open-or-close");
      if (covers.includes("early_morning")) add("window:early");
      else if (covers.includes("night") && covers.includes("regular"))
        add("window:day-to-night");
      else if (covers.length === 1 && covers[0] === "night") {
        // 夕方から夜（15:00〜21:00 など）は日中にもまたがる
        add(
          start != null && start < 16 * 60
            ? "window:day-to-night"
            : "window:night",
        );
      } else if (start != null && start < 11 * 60) add("window:morning");
      else add("window:afternoon");
    }
    if (mode === "hours_from_first_use" && covers.length > 0)
      add("ticket:hours-limited-to-period");
  }
  // 同じ日に1日券より安い長時間券（期間限定の9時間券など）
  if (
    products.some(p => p.validity?.mode === "hours_from_first_use") &&
    products.some(isDayPass)
  )
    add("ticket:hours-and-day-pass");

  // 料金の条件
  for (const offer of data.offers) {
    for (const reason of offer.discount_reasons ?? [])
      add(`offer:reason:${reasonCategory(reason)}`);
    const channels = offer.channel_ids ?? [];
    if (channels.some(id => data.channels.find(c => c.id === id)?.url != null))
      add("offer:channel-web");
    const deadline = offer.purchase_deadline;
    if (deadline?.days_before_use != null) add("offer:deadline-days-before");
    if (deadline?.deadline_date != null) add("offer:deadline-fixed-date");
    if (deadline?.same_day_allowed === false)
      add("offer:deadline-not-same-day");
    if (offer.sales_period?.start || offer.sales_period?.end)
      add("offer:sales-period");
    if ((offer.requirements ?? []).some(r => r.proof_ja))
      add("offer:proof-required");
    if (offer.target_qualification) add("offer:qualification");
    if (offer.target_genders) add("offer:gender");
    if (offer.price?.base_offer_id) add("offer:derived-discount");
    if (offer.price?.amount === 0) add("offer:free");
  }

  // 人物区分
  const schoolAge: Record<string, [number, number]> = {
    elementary_school: [7, 12],
    junior_high_school: [13, 15],
    high_school: [16, 18],
  };
  for (const audience of data.audiences) {
    if (audience.is_disability_qualified) {
      add("audience:disability");
      continue;
    }
    if ((audience.school_levels?.length ?? 0) > 0) add("audience:school-based");
    const min = audience.age_min;
    const max = audience.age_max;
    if (min == null && max == null) continue;
    if ((audience.school_levels?.length ?? 0) === 0) add("audience:age-based");
    if (min != null && min >= 55) add("audience:senior");
    if (max != null && max >= 19 && max <= 29) add("audience:young");
    // 学校の年齢範囲をまたぐ境界（12歳未満など）
    for (const [lo, hi] of Object.values(schoolAge)) {
      if (max != null && max >= lo && max < hi)
        add("audience:age-straddles-school");
      if (min != null && min > lo && min <= hi)
        add("audience:age-straddles-school");
    }
  }

  // 同行者ルール
  for (const rule of data.party_rules) {
    if (rule.exclusive_group_id) add("party:exclusive-group");
    if ((rule.calendar_ids ?? []).length > 0) add("party:calendar-limited");
    if ((rule.channel_ids ?? []).length > 0) add("party:channel-limited");
    if (rule.target_qualification) add("party:qualification");
    for (const component of rule.components ?? []) {
      const type = component.price_effect?.type;
      if (type) {
        if (!KNOWN_VALUES.priceEffect.includes(type))
          add(`new:price_effect:${type}`);
        add(`party:effect:${type}`);
      }
      if (component.per_qualifying_count != null) add("party:per-qualifying");
      const limited = component.product_ids ?? [];
      if (limited.length > 0) {
        add("party:product-limited");
        const limitedProducts = products.filter(p => limited.includes(p.id));
        if (
          limitedProducts.some(p =>
            (p.included_items ?? []).some(item => item.type === "rental"),
          )
        )
          add("party:includes-rental");
        if (
          limitedProducts.some(
            p =>
              p.validity?.mode === "consecutive_days" &&
              (p.validity.days ?? 1) > 1,
          )
        )
          add("party:multi-day");
      }
    }
  }

  // レンタル
  const rentals = data.rentals ?? [];
  const shops = new Set(rentals.map(r => r.shop_name_ja ?? ""));
  if (shops.size > 1) add("rental:multiple-shops");
  if ((data.rental_audiences?.length ?? 0) > 0) add("rental:own-audiences");
  for (const rental of rentals) {
    const mode = rental.duration.mode;
    if (!KNOWN_VALUES.rentalMode.includes(mode)) add(`new:rental_mode:${mode}`);
    add(`rental:mode:${mode}`);
    if (mode === "half_day" && rental.duration.start_time)
      add("rental:half-day-start-time");
    if (rental.items.length > 1) add("rental:bundle-of-items");
    for (const item of rental.items) add(`rental:item:${item}`);
    if (rental.grade_ja) add("rental:grade");
    if ((rental.channel_ids?.length ?? 0) > 0) add("rental:channel");
    if (rental.target_qualification) add("rental:qualification");
    if (rental.purchase_deadline) add("rental:deadline");
  }

  // 手数料
  if (data.fees.length > 0) add("fee:exists");

  // 組み合わせ（仕様書 Y: 営業時間の型×券の型、ナイター×1日券、同行者×レンタル）
  const has = (feature: string) => features.has(feature);
  if (has("hours:night") && has("ticket:no-day-pass"))
    add("combo:night+no-day-pass");
  if (has("hours:regular-unknown") && has("ticket:mode:fixed_time_window"))
    add("combo:unknown-hours+fixed-window");
  if (has("hours:varies-by-weekday") && has("ticket:mode:fixed_time_window"))
    add("combo:weekday-hours+fixed-window");
  if (has("hours:night") && has("ticket:add-on")) add("combo:night+add-on");
  if (has("party:includes-rental") && rentals.length > 0)
    add("combo:party-rule+rental");
  if (has("ticket:mode:hours_pool") && has("ticket:mode:consecutive_days"))
    add("combo:hours-pool+multi-day");
  return features;
};

/**
 * 収集時に直すべきデータの書き方（PB29 など）。計算ではなく保存前の検証で防ぐ。
 * - カレンダーに「全日」と日付・期間を併記すると、期間限定の料金が全日に効く
 */
export const dataWarningsOf = (data: LiftTicketData): string[] =>
  data.calendars
    .filter(
      calendar =>
        (calendar.included_day_types ?? []).includes("all") &&
        ((calendar.included_dates?.length ?? 0) > 0 ||
          (calendar.included_date_ranges?.length ?? 0) > 0),
    )
    .map(
      calendar =>
        `${calendar.id}: 「全日」と日付・期間が併記されています（期間限定の料金が全日に効きます）`,
    );
