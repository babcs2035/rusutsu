import type {
  LiftTicketAudience,
  LiftTicketCalendar,
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketProduct,
  PriceReference,
} from "../types";
import { isSharedLiftTicketProduct, priceModeOf } from "../types";

export type { PriceReference };

import {
  buildReferences,
  formatLiftTicketPrice,
  formatSalesPeriod,
  getTodayInJapan,
  isSalesEnded,
} from "./calculateLiftTicket";

/**
 * リフト券の料金表を組み立てる。
 *
 * スキー場の公式サイトにあるような表（縦=券種、横=人物区分）を、
 * **スキー場ごとの特別扱いを一切せずに**データから導く。
 *
 * 設計:
 * - 1行 = 1券種（product）。同じ券種の中で日付によって料金が違う場合は
 *   セルに日付区分ごとの金額を並べる（画面では日付区分ごとの小行に展開する）。
 * - 1列 = 1人物区分（大人・子供・シニア…）。
 * - **誰でも買える料金は「通常料金」**。Web購入・前売のように買い方だけで
 *   安くなる料金も誰でも買えるので通常料金に入れ、窓口料金と同じセルにまとめる。
 * - 会員・宿泊者・障がい者手帳などの資格が要る料金、特定日のイベント料金、
 *   販売期間が限られた早割は**別の表**にする（通常料金と並べると
 *   「誰でもその値段で買える」と誤読される）。
 * - 購入方法・期限・対象者の長い説明は載せない。詳細は出典リンクの公式ページで見てもらう。
 *
 * 1 offer が1金額を持つ前提に依存している（`price.date_table` は廃止済み）。
 * offer が日付別の金額表を内包していると、この関数は金額を読み落とす。
 */

/** 買い方だけで安くなる料金の目印（「Web」「前売」）。窓口でそのまま買える料金は null */
export type PurchaseTag = "Web" | "前売";

/** セル内の1行。日付で料金が変わる券は「平日：6,300円」のように複数行になる */
export type PriceEntry = {
  offerId: string;
  /** 日付区分の名前。日付で変わらないなら null */
  calendarLabel: string | null;
  /** 日付区分の期間（「12/19〜3/14」）。期間で決まらない区分（平日など）は null */
  calendarPeriod: string | null;
  amount: number | null;
  text: string;
  /** Web・前売で安くなった料金なら、その買い方 */
  purchaseTag: PurchaseTag | null;
  /** Web料金を出したときの、窓口で買った場合の金額（高い場合だけ） */
  counterAmount: number | null;
  /** 出典の番号（本文の [1] 表示用）。references の index+1 */
  sourceNumbers: number[];
};

export type PriceCell = {
  entries: PriceEntry[];
};

export type PriceRow = {
  key: string;
  /** 主ラベル。通常料金の表では券種名、割引の表では割引名 */
  label: string;
  /** 補助ラベル。割引の表では対象の券種名 */
  subLabel: string | null;
  /** 券種の補足（「13:00〜17:00のみ」など、券の中身が分かる最小限） */
  conditions: string[];
  /** 割引の表で、販売期間が限られる場合だけ出す注記 */
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
  audiences: Array<{ id: string; label: string; ageLabel: string | null }>;
  rows: PriceRow[];
};

export type LiftTicketPriceTables = {
  base: PriceTable;
  discount: PriceTable;
  references: PriceReference[];
};

/**
 * 列見出しの補足（「19〜64歳」）。見出し自体は短い name_ja にする。
 * 学校区分で決まる区分（こども・中高生など）は年齢を併記しない
 */
const ageLabelOf = (audience: LiftTicketAudience) => {
  if ((audience.school_levels ?? []).length > 0) return null;
  const min = audience.age_min ?? null;
  const max = audience.age_max ?? null;
  if (min != null && max != null) return `${min}〜${max}歳`;
  if (min != null) return `${min}歳〜`;
  if (max != null) return `〜${max}歳`;
  return null;
};

/**
 * 「9時間券（平日）」「9時間券／平日」からカレンダー名の接尾辞を落とす。
 * カレンダーごとに offer を分けた結果、券種名に日付区分が混ざるため。
 */
const stripCalendarSuffix = (label: string, calendarNames: string[]) => {
  // 「一日券（障がい者本人・大人・平日）」のように括弧の中に並んでいる場合は、
  // 日付区分の部分だけを落とす（「平日」と書いた行に特定日の金額も並ぶため）
  const inner = label.match(/^(.*)（([^（）]*)）$/u);
  if (inner) {
    const parts = inner[2].split("・");
    const kept = parts.filter(part => !calendarNames.includes(part));
    if (kept.length > 0 && kept.length < parts.length) {
      return `${inner[1]}（${kept.join("・")}）`;
    }
  }
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

/** 買い方だけで安くなる割引の理由。誰でも買えるので通常料金として扱う */
const PURCHASE_METHOD_REASONS = ["online_purchase", "advance_purchase"];

/**
 * 販売期間が利用期間より先に終わる券（早割）か。
 * Web券にも「シーズン終わりまで販売」と販売期間が書かれることがあるので、
 * 販売期間があるだけでは早割にしない。
 */
const isLimitedSaleOffer = (offer: LiftTicketOffer, data: LiftTicketData) => {
  const salesEnd = offer.sales_period?.end;
  if (!salesEnd) return false;
  const useEnd = offer.use_period?.end ?? data.season.end_date;
  return useEnd == null || salesEnd < useEnd;
};

/**
 * Web・前売のように**買い方だけ**で安くなる、誰でも買える料金か。
 * 早割は「いつでも買える通常料金」ではないので含めない。
 */
const isOpenPurchaseOffer = (offer: LiftTicketOffer, data: LiftTicketData) => {
  const reasons = offer.discount_reasons ?? [];
  return (
    reasons.length > 0 &&
    reasons.every(reason => PURCHASE_METHOD_REASONS.includes(reason)) &&
    offer.target_qualification == null &&
    offer.target_genders == null &&
    !isLimitedSaleOffer(offer, data)
  );
};

const purchaseTagOf = (
  offer: LiftTicketOffer,
  data: LiftTicketData,
): PurchaseTag | null => {
  if (!isOpenPurchaseOffer(offer, data)) return null;
  return (offer.discount_reasons ?? []).includes("online_purchase")
    ? "Web"
    : "前売";
};

/**
 * 同じ種類の offer をまとめるキー。
 *
 * **購入経路は区別しない**（窓口とWebは同じ券の買い方違いなので
 * 同じ行・同じセルにまとめ、安いほうを出す）。
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
    offer.target_qualification?.official_label_ja ?? "",
    (offer.target_genders?.genders ?? []).join("+"),
    isDiscount ? discountLabelOf(offer, calendarNames) : "",
  ].join("|");

/** 割引名から日付区分の接尾辞を落としたもの（グループ識別と行ラベルに使う） */
const discountLabelOf = (offer: LiftTicketOffer, calendarNames: string[]) =>
  stripCalendarSuffix(offer.official_label_ja ?? offer.name_ja, calendarNames);

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
 * 日付区分の期間。「レギュラーシーズン」だけでは何月か分からないので添える。
 * 期間1つだけで決まる区分に限る（平日・土日のような曜日の区分は名前で分かる）
 */
const calendarPeriodOf = (calendar: LiftTicketCalendar | undefined) => {
  const ranges = calendar?.included_date_ranges ?? [];
  if (ranges.length !== 1) return null;
  if ((calendar?.included_day_types ?? []).length > 0) return null;
  return `${shortDate(ranges[0].start)}〜${shortDate(ranges[0].end)}`;
};

/**
 * 表示用のラベルを選ぶ。
 *
 * `name_ja`（整理した名前）と `official_label_ja`（公式表記そのまま）の
 * どちらが名前として読めるかはデータによって違う
 * （「広島ドラゴンフライズ応援デー」は official 側が短く、
 * 「こどもデー（毎週土曜日）」は name 側が短い）。**短いほうを見出しにする**
 * — 見出しに一文が入ると表が読めなくなる。
 */
const displayLabelOf = (offer: LiftTicketOffer, calendarNames: string[]) => {
  const name = stripCalendarSuffix(offer.name_ja, calendarNames);
  const official = offer.official_label_ja
    ? stripCalendarSuffix(offer.official_label_ja, calendarNames)
    : null;
  return official && official.length <= name.length ? official : name;
};

const shorterOf = (left?: string | null, right?: string | null) => {
  if (!left) return right ?? null;
  if (!right) return left;
  return right.length < left.length ? right : left;
};

/** 券の中身が分かる最小限の補足（時間帯が決まっている券だけ） */
const productConditionsOf = (product: LiftTicketProduct | undefined) => {
  const validity = product?.validity;
  if (
    validity?.mode === "fixed_time_window" &&
    validity.start_time &&
    validity.end_time
  ) {
    return [`${validity.start_time}〜${validity.end_time}`];
  }
  return [];
};

const cellTextOf = (amount: number | null, fallback: string) =>
  amount == null ? fallback : `${amount.toLocaleString("ja-JP")}円`;

/** 同じ日付区分の中で、誰でも買える一番安い料金を選ぶ（同額なら窓口を優先） */
const pickCheapest = (
  candidates: Array<{ offer: LiftTicketOffer; amount: number | null }>,
  data: LiftTicketData,
) =>
  [...candidates].sort((left, right) => {
    if (left.amount == null) return 1;
    if (right.amount == null) return -1;
    if (left.amount !== right.amount) return left.amount - right.amount;
    return (
      Number(purchaseTagOf(left.offer, data) != null) -
      Number(purchaseTagOf(right.offer, data) != null)
    );
  })[0];

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
  const audienceById = new Map(
    data.audiences.map(audience => [audience.id, audience]),
  );
  // 障がい者料金は「大人」「小人」の列に入れる（行名で障がい者料金と分かる）。
  // 専用の列を足すと、割引の表が大人・ハンディキャップ（大人）…と横に倍になる
  const columnIdOf = (audienceId: string) => {
    const audience = audienceById.get(audienceId);
    return audience?.is_disability_qualified === true &&
      audience.base_audience_id &&
      audienceById.has(audience.base_audience_id)
      ? audience.base_audience_id
      : audienceId;
  };
  // 割引の行名に残った人物区分（「一日券（障がい者本人・大人）」の「大人」）は
  // 列見出しと重なるうえ、大人以外の列の金額にも付くので落とす
  const audienceNames = data.audiences.map(audience => audience.name_ja);
  const columnIdsOf = (offer: LiftTicketOffer) =>
    (offer.audience_ids ?? []).map(columnIdOf);

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
      shorterOf(product?.name_ja, product?.official_label_ja) ?? first.name_ja,
      calendarNames,
    );
    const label = isDiscount
      ? displayLabelOf(first, [...calendarNames, ...audienceNames])
      : productLabel;
    // 割引の表で見出しが券種名と同じだと、何の条件の料金か分からない
    // （「宿泊者専用 苗場エリア1日券」の公式表記は「苗場エリア1日券」）。
    // 対象者の表記が短ければ添える。一文の説明は公式ページで見てもらう
    const qualification =
      first.target_qualification?.official_label_ja ??
      first.target_genders?.official_label_ja ??
      null;
    const qualificationNote =
      isDiscount &&
      label === productLabel &&
      qualification &&
      qualification.length <= 24
        ? qualification
        : null;

    const audienceIds = [...new Set(groupOffers.flatMap(columnIdsOf))];

    const cells = new Map<string, PriceCell>();
    for (const audienceId of audienceIds) {
      const forAudience = groupOffers.filter(offer =>
        columnIdsOf(offer).includes(audienceId),
      );
      if (forAudience.length === 0) continue;

      // 日付区分ごとにまとめ、窓口とWebのうち安いほうを1つ出す
      const byCalendar = new Map<string, LiftTicketOffer[]>();
      for (const offer of forAudience) {
        const calendarKey = [...(offer.calendar_ids ?? [])].sort().join("+");
        const list = byCalendar.get(calendarKey) ?? [];
        list.push(offer);
        byCalendar.set(calendarKey, list);
      }
      // ★同じ券種で日付によって料金が変わる場合は、行を分けずに
      // **1つのセルに「平日：6,300円 / 土日：6,800円」と並べる**
      const showCalendar = byCalendar.size > 1;
      const entries: PriceEntry[] = [...byCalendar.values()].map(
        calendarOffers => {
          const candidates = calendarOffers.map(offer => ({
            offer,
            amount: resolveAmount(offer, offerById).amount,
          }));
          const chosen = pickCheapest(candidates, data);
          const resolved = resolveAmount(chosen.offer, offerById);
          const purchaseTag = purchaseTagOf(chosen.offer, data);
          const counterAmounts = candidates
            .filter(
              candidate =>
                purchaseTagOf(candidate.offer, data) == null &&
                candidate.amount != null,
            )
            .map(candidate => candidate.amount as number);
          const counterAmount =
            purchaseTag != null &&
            counterAmounts.length > 0 &&
            resolved.amount != null &&
            Math.min(...counterAmounts) > resolved.amount
              ? Math.min(...counterAmounts)
              : null;
          const calendars = (chosen.offer.calendar_ids ?? [])
            .map(id => calendarById.get(id))
            .filter(calendar => calendar != null);
          return {
            offerId: chosen.offer.id,
            calendarLabel: showCalendar
              ? calendars.map(calendar => calendar.name_ja).join("・") || null
              : null,
            calendarPeriod:
              showCalendar && calendars.length === 1
                ? calendarPeriodOf(calendars[0])
                : null,
            amount: resolved.amount,
            text: cellTextOf(resolved.amount, resolved.fallback),
            purchaseTag,
            counterAmount,
            sourceNumbers: [
              ...new Set(
                calendarOffers
                  .flatMap(offer => offer.source_refs ?? [])
                  .map(id => numberBySourceId.get(id))
                  .filter((n): n is number => n != null),
              ),
            ].sort((a, b) => a - b),
          };
        },
      );
      cells.set(audienceId, { entries });
      usedAudiences.add(audienceId);
    }
    if (cells.size === 0) continue;

    // 全区分で金額が同じならセルを結合する（回数券は大人・子供同額）
    const signatures = [...cells.values()].map(cell =>
      cell.entries
        .map(
          entry =>
            `${entry.calendarLabel ?? ""}:${entry.amount}:${entry.purchaseTag}:${entry.counterAmount}`,
        )
        .join("|"),
    );
    const spansAllAudiences =
      cells.size === audienceIds.length &&
      cells.size > 1 &&
      new Set(signatures).size === 1;

    // 早割だけは「いつまで買えるか」が分からないと使えないので販売期間を添える
    const salesPeriod = isLimitedSaleOffer(first, data)
      ? formatSalesPeriod(first.sales_period)
      : null;

    rows.push({
      key,
      label,
      subLabel: isDiscount && productLabel !== label ? productLabel : null,
      conditions: [
        ...(qualificationNote ? [qualificationNote] : []),
        ...productConditionsOf(product),
      ],
      notes: salesPeriod ? [salesPeriod] : [],
      cells,
      spansAllAudiences,
    });
  }

  const audiences = data.audiences
    .filter(audience => usedAudiences.has(audience.id))
    .map(audience => ({
      id: audience.id,
      label: shorterOf(audience.name_ja, audience.official_label_ja) ?? "",
      ageLabel: ageLabelOf(audience),
    }));

  return { audiences, rows };
}

export function buildLiftTicketPriceTables(
  data: LiftTicketData,
  options: {
    scope: "single" | "shared";
    /** 照会日。省略時は日本時間の今日 */
    today?: string;
  },
): LiftTicketPriceTables {
  const productById = new Map(
    data.products.map(product => [product.id, product]),
  );
  const audienceById = new Map(
    data.audiences.map(audience => [audience.id, audience]),
  );
  const calendarNames = data.calendars.map(calendar => calendar.name_ja);

  const today = options.today ?? getTodayInJapan();
  const inScope = data.offers.filter(offer => {
    // 販売が終わった券（早割など）はもう買えないので表に一切出さない
    if (isSalesEnded(offer, today)) return false;
    const shared = isSharedLiftTicketProduct(productById.get(offer.product_id));
    return options.scope === "shared" ? shared : !shared;
  });

  // 通常料金 = **誰でもその値段で買える**もの（窓口料金とWeb・前売料金）。
  // 資格が要るもの（会員・宿泊者・道民割・レディースデー・障がい者手帳）、
  // 特定日のイベント料金、販売期間が限られた早割は条件付きなので別の表にする
  const isConditional = (offer: LiftTicketOffer) =>
    (offer.audience_ids ?? []).some(
      id => audienceById.get(id)?.is_disability_qualified === true,
    ) ||
    offer.target_qualification != null ||
    offer.target_genders != null ||
    ((offer.discount_reasons?.length ?? 0) > 0 &&
      !isOpenPurchaseOffer(offer, data));

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
