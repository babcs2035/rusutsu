import type {
  LiftTicketAudience,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketProduct,
  PriceReference,
} from "../types";
import { isSharedLiftTicketProduct, priceModeOf } from "../types";

export type { PriceReference };

import { buildReferences, formatLiftTicketPrice } from "./calculateLiftTicket";

/**
 * リフト券の料金表を組み立てる。
 *
 * スキー場の公式サイトにあるような表（縦=券種、横=人物区分）を、
 * **スキー場ごとの特別扱いを一切せずに**データから導く。
 *
 * 設計:
 * - 1行 = 1券種（product）。ただし**同じ券種の中で日付によって料金が違う場合は
 *   カレンダーごとに行を分ける**（「9時間券 平日」「9時間券 土日」）。
 *   料金が日付で変わらない券種は1行のまま。
 * - 1列 = 1人物区分（大人・子供・シニア…）。
 * - **基本料金と割引料金は別の表**にする（割引は条件付きで、通常料金と並べると
 *   「誰でもその値段で買える」と誤読される）。
 *
 * 1 offer が1金額を持つ前提に依存している（`price.date_table` は廃止済み）。
 * offer が日付別の金額表を内包していると、この関数は金額を読み落とす。
 */

/** セル内の1行。日付で料金が変わる券は「平日：6,300円」のように複数行になる */
export type PriceEntry = {
  offerId: string;
  /** 日付区分の名前。日付で変わらないなら null */
  calendarLabel: string | null;
  amount: number | null;
  text: string;
  /** 出典の番号（本文の [1] 表示用）。references の index+1 */
  sourceNumbers: number[];
};

export type PriceCell = {
  entries: PriceEntry[];
};

export type PriceRow = {
  key: string;
  /** 主ラベル。基本料金の表では券種名、割引の表では割引名 */
  label: string;
  /** 補助ラベル。割引の表では対象の券種名 */
  subLabel: string | null;
  /** 券種の補足（「平日13時〜17時のみ」「年末年始は利用不可」など） */
  conditions: string[];
  /** 購入方法・期限・対象者など、行の下に小さく出す注記 */
  notes: string[];
  cells: Map<string, PriceCell>;
  /**
   * 全区分で金額が同じなら true。公式サイトの料金表と同じく、
   * 大人と子供のセルを結合して1つの金額として見せる
   */
  spansAllAudiences: boolean;
};

export type PriceTable = {
  /** 表の列（この表に実際に金額があった人物区分だけ） */
  audiences: Array<{ id: string; label: string }>;
  rows: PriceRow[];
};

export type LiftTicketPriceTables = {
  base: PriceTable;
  discount: PriceTable;
  references: PriceReference[];
};

const audienceLabel = (audience: LiftTicketAudience) =>
  audience.official_label_ja ?? audience.name_ja;

/**
 * 「9時間券（平日）」「9時間券／平日」からカレンダー名の接尾辞を落とす。
 * カレンダーごとに offer を分けた結果、券種名に日付区分が混ざるため。
 */
const stripCalendarSuffix = (label: string, calendarNames: string[]) => {
  for (const name of calendarNames) {
    for (const suffix of [
      `（${name}）`,
      `(${name})`,
      `／${name}`,
      `/${name}`,
    ]) {
      if (label.endsWith(suffix)) return label.slice(0, -suffix.length);
    }
  }
  return label;
};

/**
 * 同じ種類の offer をまとめるキー。
 * 券種・購入経路・対象の絞り込みが同じものを1グループにし、
 * カレンダーだけが違うものは行の分割で表す。
 *
 * 割引の表では**割引名も識別に使う**。同じ券種・同じ割引理由でも
 * 「サンフレッチェ応援デー」と「ドラゴンフライズ応援デー」は別のキャンペーンで、
 * まとめると片方の名前がもう片方の行に付いてしまう（実際にそうなった）。
 */
const groupKeyOf = (
  offer: LiftTicketOffer,
  calendarNames: string[],
  isDiscount: boolean,
) =>
  [
    offer.product_id,
    [...(offer.channel_ids ?? [])].sort().join("+"),
    offer.target_qualification?.official_label_ja ?? "",
    (offer.target_genders?.genders ?? []).join("+"),
    isDiscount ? discountLabelOf(offer, calendarNames) : "",
  ].join("|");

/** 割引名から日付区分の接尾辞を落としたもの（グループ識別と行ラベルに使う） */
const discountLabelOf = (offer: LiftTicketOffer, calendarNames: string[]) =>
  stripCalendarSuffix(offer.official_label_ja ?? offer.name_ja, calendarNames);

const rowNotesOf = (offer: LiftTicketOffer, data: LiftTicketData) => {
  const notes: string[] = [];
  const channels = (offer.channel_ids ?? [])
    .map(id => data.channels.find(channel => channel.id === id)?.name_ja)
    .filter((label): label is string => Boolean(label));
  if (channels.length > 0) notes.push(channels.join("・"));
  const qualification = offer.target_qualification?.official_label_ja;
  if (qualification) notes.push(qualification);
  const genders = offer.target_genders?.official_label_ja;
  if (genders) notes.push(genders);
  const deadline = offer.purchase_deadline?.official_text_ja;
  if (deadline) notes.push(deadline);
  return notes;
};

/**
 * 表に出す金額。「通常料金から1,000円引き」のような差額指定は、
 * 基準 offer の金額から計算して**確定額として見せる**
 * （利用者に「要確認」と出しても意味が無い）。
 */
const resolveAmount = (
  offer: LiftTicketOffer,
  offerById: Map<string, LiftTicketOffer>,
): { amount: number | null; fallback: string } => {
  const price = offer.price;
  if (priceModeOf(price) === "derived_discount") {
    const base = price?.base_offer_id
      ? offerById.get(price.base_offer_id)
      : undefined;
    const baseAmount = base?.price?.amount ?? null;
    if (baseAmount != null) {
      if (price?.discount?.amount != null) {
        return {
          amount: Math.max(0, baseAmount - price.discount.amount),
          fallback: "要確認",
        };
      }
      if (price?.discount?.percent != null) {
        return {
          amount: Math.max(
            0,
            Math.round((baseAmount * (100 - price.discount.percent)) / 100),
          ),
          fallback: "要確認",
        };
      }
    }
  }
  return {
    amount: priceModeOf(price) === "free" ? 0 : (price?.amount ?? null),
    fallback: formatLiftTicketPrice(price),
  };
};

/** 「2025-12-29」→「12/29」 */
const shortDate = (date: string) => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};

/**
 * 日付の一覧を読める形にする。連続する3日以上は範囲にまとめる
 * （「12/29・12/30・12/31・1/1・1/2・1/3」より「12/29〜1/3」が読みやすい）。
 */
const formatDateList = (dates: string[]) => {
  const sorted = [...new Set(dates)].sort();
  const parts: string[] = [];
  let runStart = 0;
  const dayNumber = (date: string) =>
    Date.parse(`${date}T12:00:00Z`) / 86400000;
  for (let i = 1; i <= sorted.length; i += 1) {
    const isBreak =
      i === sorted.length ||
      dayNumber(sorted[i]) - dayNumber(sorted[i - 1]) !== 1;
    if (!isBreak) continue;
    const runLength = i - runStart;
    if (runLength >= 3) {
      parts.push(`${shortDate(sorted[runStart])}〜${shortDate(sorted[i - 1])}`);
    } else {
      for (let j = runStart; j < i; j += 1) parts.push(shortDate(sorted[j]));
    }
    runStart = i;
  }
  return parts.join("・");
};

const formatDateRange = (range: { start: string; end: string }) =>
  `${shortDate(range.start)}〜${shortDate(range.end)}`;

/**
 * 表示用のラベルを選ぶ。
 *
 * `name_ja`（整理した名前）と `official_label_ja`（公式表記そのまま）の
 * どちらが名前として読めるかはデータによって違う
 * （「広島ドラゴンフライズ応援デー」は official 側が短く、
 * 「こどもデー（毎週土曜日）」は name 側が短い）。
 * **短いほうを見出しにし、長いほうは公式表記として下に添える**
 * — 見出しに一文が入ると表が読めなくなる。
 */
const displayLabelOf = (
  offer: LiftTicketOffer,
  calendarNames: string[],
): { label: string; officialNote: string | null } => {
  const name = stripCalendarSuffix(offer.name_ja, calendarNames);
  const official = offer.official_label_ja
    ? stripCalendarSuffix(offer.official_label_ja, calendarNames)
    : null;
  if (!official) return { label: name, officialNote: null };
  if (official.length <= name.length) {
    // 公式表記のほうが短い＝見出しに使える。隠れるのは自分で付けた名前なので添えない
    return { label: official, officialNote: null };
  }
  // 公式表記が一文で長い場合だけ、見出しは短い名前にして公式表記を下に添える
  return {
    label: name,
    officialNote: official.length > name.length + 8 ? official : null,
  };
};

/** 券種そのものの利用条件（時間帯固定・利用不可期間など） */
const productConditionsOf = (product: LiftTicketProduct | undefined) => {
  const conditions: string[] = [];
  const validity = product?.validity;
  if (
    validity?.mode === "fixed_time_window" &&
    validity.start_time &&
    validity.end_time
  ) {
    conditions.push(`${validity.start_time}〜${validity.end_time}のみ`);
  }
  if (validity?.usable_within_ja) conditions.push(validity.usable_within_ja);
  return conditions;
};

/** その料金が使える日・使えない日。キャンペーン割引は対象日が分からないと使えない */
const calendarConditionsOf = (
  offers: LiftTicketOffer[],
  data: LiftTicketData,
) => {
  const conditions: string[] = [];
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const calendarIds = [
    ...new Set(offers.flatMap(offer => offer.calendar_ids ?? [])),
  ];
  const calendars = calendarIds
    .map(id => calendarById.get(id))
    .filter(calendar => calendar != null);
  const coveredByAnotherCalendar = (
    excludedById: string,
    dateOrRange: string | { start: string; end: string },
  ) =>
    calendars.some(calendar => {
      if (calendar.id === excludedById) return false;
      if (typeof dateOrRange === "string") {
        return (
          calendar.included_dates?.includes(dateOrRange) === true ||
          calendar.included_date_ranges?.some(
            range => range.start <= dateOrRange && dateOrRange <= range.end,
          ) === true
        );
      }
      return (
        calendar.included_date_ranges?.some(
          range =>
            range.start <= dateOrRange.start && dateOrRange.end <= range.end,
        ) === true
      );
    });
  const seen = new Set<string>();
  for (const offer of offers) {
    for (const calendarId of offer.calendar_ids ?? []) {
      if (seen.has(calendarId)) continue;
      seen.add(calendarId);
      const calendar = calendarById.get(calendarId);
      if (!calendar) continue;
      if ((calendar.included_dates ?? []).length > 0) {
        conditions.push(
          `対象日 ${formatDateList(calendar.included_dates ?? [])}`,
        );
      }
      const unavailableDates = (calendar.excluded_dates ?? []).filter(
        date => !coveredByAnotherCalendar(calendar.id, date),
      );
      if (unavailableDates.length > 0) {
        conditions.push(`${formatDateList(unavailableDates)}は利用不可`);
      }
      for (const range of calendar.excluded_date_ranges ?? []) {
        if (coveredByAnotherCalendar(calendar.id, range)) continue;
        conditions.push(`${formatDateRange(range)}は利用不可`);
      }
    }
  }
  return conditions;
};

const cellTextOf = (amount: number | null, fallback: string) =>
  amount == null ? fallback : `${amount.toLocaleString("ja-JP")}円`;

function buildTable(
  data: LiftTicketData,
  offers: LiftTicketOffer[],
  calendarNames: string[],
  isDiscount: boolean,
  numberBySourceId: Map<string, number>,
): PriceTable {
  const productById = new Map(
    data.products.map(product => [product.id, product]),
  );
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const offerById = new Map(data.offers.map(offer => [offer.id, offer]));

  const groups = new Map<string, LiftTicketOffer[]>();
  for (const offer of offers) {
    const key = groupKeyOf(offer, calendarNames, isDiscount);
    const list = groups.get(key) ?? [];
    list.push(offer);
    groups.set(key, list);
  }

  const rows: PriceRow[] = [];
  const usedAudiences = new Set<string>();

  for (const [key, groupOffers] of groups) {
    const first = groupOffers[0];
    const product = productById.get(first.product_id);
    // 行は券種なので**券種名を使う**。offer名には人物区分や日付が混ざるため
    // （「9時間券（大人・平日）」を行名にすると列と重複して読みにくい）
    const productLabel = stripCalendarSuffix(
      product?.official_label_ja ?? product?.name_ja ?? first.name_ja,
      calendarNames,
    );
    const display = displayLabelOf(first, calendarNames);
    const label = isDiscount ? display.label : productLabel;

    const audienceIds = [
      ...new Set(groupOffers.flatMap(offer => offer.audience_ids ?? [])),
    ];

    const cells = new Map<string, PriceCell>();
    for (const audienceId of audienceIds) {
      const forAudience = groupOffers.filter(offer =>
        (offer.audience_ids ?? []).includes(audienceId),
      );
      if (forAudience.length === 0) continue;
      // ★同じ券種で日付によって料金が変わる場合は、行を分けずに
      // **1つのセルに「平日：6,300円 / 土日：6,800円」と並べる**
      // （公式サイトの料金表と同じ見え方。行を分けると日付で変わらない区分の
      // 金額が繰り返され、どこが違うのか読み取りにくい）
      const showCalendar = forAudience.length > 1;
      const entries: PriceEntry[] = forAudience.map(offer => {
        const resolved = resolveAmount(offer, offerById);
        const calendarLabel = showCalendar
          ? (offer.calendar_ids ?? [])
              .map(id => calendarById.get(id)?.name_ja)
              .filter(Boolean)
              .join("・") || null
          : null;
        return {
          offerId: offer.id,
          calendarLabel,
          amount: resolved.amount,
          text: cellTextOf(resolved.amount, resolved.fallback),
          sourceNumbers: [
            ...new Set(
              (offer.source_refs ?? [])
                .map(id => numberBySourceId.get(id))
                .filter((n): n is number => n != null),
            ),
          ].sort((a, b) => a - b),
        };
      });
      cells.set(audienceId, { entries });
      usedAudiences.add(audienceId);
    }
    if (cells.size === 0) continue;

    // 全区分で金額が同じならセルを結合する（回数券は大人・子供同額）
    const signatures = [...cells.values()].map(cell =>
      cell.entries
        .map(entry => `${entry.calendarLabel ?? ""}:${entry.amount}`)
        .join("|"),
    );
    const spansAllAudiences =
      cells.size === audienceIds.length &&
      cells.size > 1 &&
      new Set(signatures).size === 1;

    rows.push({
      key,
      label,
      subLabel: isDiscount ? productLabel : null,
      conditions: [
        ...productConditionsOf(product),
        ...calendarConditionsOf(groupOffers, data),
        ...(isDiscount && display.officialNote
          ? [`公式表記: ${display.officialNote}`]
          : []),
      ],
      notes: rowNotesOf(first, data),
      cells,
      spansAllAudiences,
    });
  }

  const audiences = data.audiences
    .filter(audience => usedAudiences.has(audience.id))
    .map(audience => ({ id: audience.id, label: audienceLabel(audience) }));

  return { audiences, rows };
}

export function buildLiftTicketPriceTables(
  data: LiftTicketData,
  options: { scope: "single" | "shared" },
): LiftTicketPriceTables {
  const productById = new Map(
    data.products.map(product => [product.id, product]),
  );
  const calendarNames = data.calendars.map(calendar => calendar.name_ja);

  const inScope = data.offers.filter(offer => {
    const shared = isSharedLiftTicketProduct(productById.get(offer.product_id));
    return options.scope === "shared" ? shared : !shared;
  });

  // 基本料金 = **誰でもその値段で買える**もの。割引理由が付いているもの、
  // 対象者が絞られているもの（道民割・レディースデー・保護者同伴の未就学児無料）は
  // 条件付きなので別の表にする。同じ表に並べると「誰でもその値段で買える」と誤読される
  const isConditional = (offer: LiftTicketOffer) =>
    (offer.discount_reasons?.length ?? 0) > 0 ||
    offer.target_qualification != null ||
    offer.target_genders != null;

  const { references, numberBySourceId } = buildReferences(data);

  return {
    base: buildTable(
      data,
      inScope.filter(offer => !isConditional(offer)),
      calendarNames,
      false,
      numberBySourceId,
    ),
    discount: buildTable(
      data,
      inScope.filter(isConditional),
      calendarNames,
      true,
      numberBySourceId,
    ),
    references,
  };
}
