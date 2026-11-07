/**
 * 「1日」「1日＋ナイター」「ナイター」「N時間」の指定から、券の選択肢を出す。
 *
 * 仕様: docs/plans/lift-ticket-duration-test-cases.md の S1〜S13。
 *
 * - 一番上（primary）: 時間帯の決まっていない券（1日券・時間券、またはその日の
 *   範囲をすべて含む組み合わせ）で要件を満たす最安。無ければ時間帯固定券の最安
 * - 時間帯が決まっていてもよければ（timeRestricted）: 午前券・午後券・ナイター券など
 *   時間帯が決まった券で要件を満たし、一番上より安いもの
 * - 1時間短くてもよければ（shorter）: 要件より最大1時間短いが一番上より安いもの
 * - 1枚で滑れる最長（longestSingle）: 1日＋ナイターで2枚に分けたときだけ
 *
 * データは調べたままの形を前提にする。1日券が無ければ最長の時間券を「1日」に使い、
 * 営業時間が不明なら 8:00〜17:00（ナイターがあればその開始まで）と仮定する。
 */
import type {
  LiftTicketData,
  LiftTicketProduct,
  LiftTicketSearchInput,
  TicketCalculationLine,
  TicketCalculationResult,
  TicketDayDuration,
} from "../types";
import {
  calculateLiftTicket,
  calendarMatchesDate,
  durationCandidateProducts,
  findClosedCalendar,
  seasonContains,
} from "./calculateLiftTicket";

type Interval = [number, number];

/** 「1日」「N時間」の範囲に含める営業区分（早朝営業は含めない: S11） */
const DAY_TYPES = ["regular"];
const ASSUMED_OPEN = 8 * 60;
const ASSUMED_CLOSE = 17 * 60;
const EPSILON = 1e-6;
/** 金額が確定しない券の並び順用の加算 */
const UNPRICED = 10_000_000;

export type TicketDurationOption = {
  productIds: string[];
  productName: string;
  /** パーティ全員の合計（返ってこない手数料を含む） */
  total: number;
  /** この券でその日に滑れる時間（要件の範囲の中で） */
  hours: number;
  /** 時間帯が決まった券なら利用時間（"8:30〜12:30"） */
  windowLabel: string | null;
  timeRestricted: boolean;
  /** この券を使うときの注記（共通券に切り替えた日・ICカード保証金） */
  extraNotes: string[];
  /** 券に付いている物（食事券・温泉入浴など。レンタルを除く）。券名の横に出す（S15） */
  includedItems: string[];
  result: TicketCalculationResult;
};

export type TicketDurationOptions = {
  status: TicketCalculationResult["status"];
  primary: TicketDurationOption | null;
  timeRestricted: TicketDurationOption[];
  shorter: TicketDurationOption[];
  longestSingle: TicketDurationOption | null;
  /**
   * 食事券・温泉付きなど、付いている物がある券で要件を満たすもの（一番上より高くても出す）。
   * 「食事券1,000円分付き 5,500円」のように付いている物と比べてもらう（S15）
   */
  withIncludedItems: TicketDurationOption[];
  notes: string[];
  /** その日の営業時間が不明で 8:00〜17:00 と仮定したか */
  assumedHours: boolean;
};

const toMinutes = (time?: string | null) => {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const formatTime = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

export const formatHours = (hours: number) =>
  `${Number.isInteger(hours) ? hours : Math.round(hours * 100) / 100}時間`;

const mergeIntervals = (intervals: Interval[]): Interval[] => {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
};

/**
 * 15分以内の休止（日中とナイターの間の整備など）はつながっているとみなす。
 * 16:50〜17:00の10分休止で8時間券が「7時間50分」になり使えない、を防ぐ。
 * 30分以上の休止（16:30〜17:00）や1時間の運休（音威富士の16:30〜17:30）は数えない（S3）
 */
const BRIDGE_MINUTES = 15;
const bridge = (intervals: Interval[]): Interval[] => {
  const merged: Interval[] = [];
  for (const [start, end] of mergeIntervals(intervals)) {
    const last = merged.at(-1);
    if (last && start - last[1] <= BRIDGE_MINUTES)
      last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
};

const measure = (intervals: Interval[]) =>
  mergeIntervals(intervals).reduce((sum, [start, end]) => sum + end - start, 0);

const intersect = (left: Interval[], right: Interval[]): Interval[] => {
  const result: Interval[] = [];
  for (const [a, b] of mergeIntervals(left))
    for (const [c, d] of mergeIntervals(right)) {
      const start = Math.max(a, c);
      const end = Math.min(b, d);
      if (end > start) result.push([start, end]);
    }
  return mergeIntervals(result);
};

/** その日の営業区間（区分ごと）。通常営業が不明なら仮定の区間を返す */
export const operatingSegmentsOn = (data: LiftTicketData, date: string) => {
  const calendarById = new Map(data.calendars.map(c => [c.id, c]));
  const matches = (calendarIds?: string[]) =>
    (calendarIds ?? []).length === 0 ||
    (calendarIds ?? []).some(id =>
      calendarMatchesDate(calendarById.get(id), date),
    );
  const byType = new Map<string, Interval[]>();
  let hasUnknown = false;
  for (const entry of data.operating_hours ?? []) {
    const type = entry.hours_type ?? "unknown";
    if (type === "closed") continue;
    if (!matches(entry.calendar_ids)) continue;
    const start = toMinutes(entry.start_time);
    const end = toMinutes(entry.end_time);
    if (start == null || end == null || end <= start) {
      if (type === "unknown" || type === "regular") hasUnknown = true;
      continue;
    }
    byType.set(type, [...(byType.get(type) ?? []), [start, end]]);
  }
  for (const [type, intervals] of byType)
    byType.set(type, mergeIntervals(intervals));
  let assumed = false;
  // 通常営業の区分が無く早朝営業だけが記録された日（7:00〜16:30を早朝区分で
  // 書いた施設）は、その区間をその日の営業として扱う
  if (!byType.has("regular") && byType.has("early_morning") && !hasUnknown) {
    byType.set("regular", byType.get("early_morning") ?? []);
  }
  if (!byType.has("regular")) {
    // S8: 通常営業の時刻が不明なら 8:00〜17:00。ナイターがあれば終了をナイター開始にそろえる
    const nightStart = byType.get("night")?.[0]?.[0];
    const close =
      nightStart != null ? Math.min(ASSUMED_CLOSE, nightStart) : ASSUMED_CLOSE;
    byType.set("regular", [[ASSUMED_OPEN, close]]);
    assumed = true;
  }
  return { byType, assumed };
};

type Coverage =
  | { kind: "fixed"; intervals: Interval[] }
  | { kind: "flexible"; length: number; allowed: Interval[] };

/** 券がその日に使える範囲 */
const coverageOf = (
  product: LiftTicketProduct,
  segments: Map<string, Interval[]>,
): Coverage | null => {
  const validity = product.validity ?? {};
  const typesOf = (fallback: string[]) =>
    product.covers_hours_types && product.covers_hours_types.length > 0
      ? product.covers_hours_types
      : fallback;
  const segmentsOf = (types: string[]) =>
    mergeIntervals(types.flatMap(type => segments.get(type) ?? []));
  if (
    validity.mode === "calendar_day" ||
    validity.mode === "consecutive_days" ||
    validity.mode === "selectable_days"
  ) {
    return { kind: "fixed", intervals: segmentsOf(typesOf(DAY_TYPES)) };
  }
  if (validity.mode === "hours_from_first_use" && validity.hours != null) {
    // S9: 時間帯の制限が書かれていなければナイターにも使える
    return {
      kind: "flexible",
      length: validity.hours * 60,
      allowed: segmentsOf(typesOf(["regular", "night"])),
    };
  }
  if (validity.mode === "fixed_time_window") {
    const regular = segments.get("regular") ?? [];
    const all = segmentsOf(["regular", "night"]);
    const start = toMinutes(validity.start_time) ?? regular[0]?.[0] ?? null;
    const end = toMinutes(validity.end_time) ?? regular.at(-1)?.[1] ?? null;
    if (start == null || end == null) return null;
    return { kind: "fixed", intervals: intersect([[start, end]], all) };
  }
  return null;
};

const breakpointsOf = (intervals: Interval[]) => intervals.flat();

/** 組み合わせた券で、範囲 scope の中に滑れる時間の最大（分）。required があればそれを覆えるかも見る */
const bestCoverage = (coverages: Coverage[], scope: Interval[]) => {
  const fixed = mergeIntervals(
    coverages.flatMap(c => (c.kind === "fixed" ? c.intervals : [])),
  );
  const flexible = coverages.filter(
    (c): c is Extract<Coverage, { kind: "flexible" }> => c.kind === "flexible",
  );
  const bridgedScope = bridge(scope);
  const usable = (window: Interval[]) =>
    intersect(bridge(window), bridgedScope);
  if (flexible.length === 0) return usable(fixed);
  const placements = (cov: (typeof flexible)[number]) => {
    const points = breakpointsOf(intersect(cov.allowed, scope));
    const starts = new Set<number>();
    for (const point of points) {
      starts.add(point);
      starts.add(point - cov.length);
    }
    return [...starts].map(
      start =>
        intersect(
          [[start, start + cov.length]],
          bridge(cov.allowed),
        ) as Interval[],
    );
  };
  let best: Interval[] = usable(fixed);
  const first = placements(flexible[0]);
  const second = flexible[1] ? placements(flexible[1]) : [[]];
  for (const a of first)
    for (const b of second) {
      const covered = usable([...fixed, ...a, ...(b as Interval[])]);
      if (measure(covered) > measure(best)) best = covered;
    }
  return best;
};

const isFlexibleProduct = (product: LiftTicketProduct) => {
  const mode = product.validity?.mode;
  return (
    mode === "calendar_day" ||
    mode === "consecutive_days" ||
    mode === "selectable_days" ||
    mode === "hours_from_first_use"
  );
};

/** 券の名目の長さ（時間券は時間、1日券などは24時間とみなす） */
const nominalHours = (products: LiftTicketProduct[]) =>
  products.reduce((sum, product) => {
    const validity = product.validity;
    if (validity?.mode === "hours_from_first_use")
      return sum + (validity.hours ?? 24);
    if (validity?.mode === "fixed_time_window") {
      const start = toMinutes(validity.start_time);
      const end = toMinutes(validity.end_time);
      return sum + (start != null && end != null ? (end - start) / 60 : 24);
    }
    return sum + 24;
  }, 0);

const labelOf = (product: LiftTicketProduct) =>
  product.official_label_ja ?? product.name_ja;

const mergeResults = (
  results: TicketCalculationResult[],
  productIds: string[],
  productName: string,
): TicketCalculationResult => {
  if (results.length === 1) return results[0];
  const sum = (values: Array<number | null>) =>
    values.some(value => value == null)
      ? null
      : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const references = results
    .flatMap(result => result.references)
    .filter(
      (reference, index, all) =>
        all.findIndex(other => other.number === reference.number) === index,
    );
  const lines: TicketCalculationLine[] = results.flatMap((result, index) =>
    result.lines.map(line =>
      index === 0 ? line : { ...line, groupId: `${line.groupId}__${index}` },
    ),
  );
  return {
    ...results[0],
    productId: productIds[0],
    productName,
    lines,
    fees: results.flatMap(result => result.fees),
    ticketTotal: sum(results.map(result => result.ticketTotal)),
    knownTicketTotal: results.reduce(
      (total, result) => total + result.knownTicketTotal,
      0,
    ),
    payableTotal: sum(results.map(result => result.payableTotal)),
    conditionalOffers: results.flatMap(result => result.conditionalOffers),
    conditionalOfferNames: results.flatMap(
      result => result.conditionalOfferNames,
    ),
    notes: [...new Set(results.flatMap(result => result.notes))],
    references,
  };
};

const windowLabelOf = (intervals: Interval[]) =>
  mergeIntervals(intervals)
    .map(([start, end]) => `${formatTime(start)}〜${formatTime(end)}`)
    .join("、");

/** 時間帯固定券1枚なら券の利用時間（13:00〜21:00）、それ以外は実際に滑れる区間 */
const comboWindowLabel = (
  products: LiftTicketProduct[],
  covered: Interval[],
) => {
  const validity = products.length === 1 ? products[0].validity : null;
  const start = toMinutes(validity?.start_time);
  const end = toMinutes(validity?.end_time);
  if (validity?.mode === "fixed_time_window" && start != null && end != null) {
    const [first] = mergeIntervals(covered);
    const last = mergeIntervals(covered).at(-1);
    return `${formatTime(Math.max(start, first?.[0] ?? start))}〜${formatTime(Math.min(end, last?.[1] ?? end))}`;
  }
  return windowLabelOf(covered);
};

const operatingNote = (scope: Interval[]) =>
  `この日の営業は${formatHours(measure(scope) / 60)}（${windowLabelOf(scope)}）です`;

/** 券ごとの注記（共通券に切り替えた日・ICカード保証金） */
const optionNotes = (
  products: LiftTicketProduct[],
  result: TicketCalculationResult,
): string[] => [
  // SP01: 単独券が売られていない日に共通券を使うとき
  ...(products.some(product => (product.shared_with_resorts?.length ?? 0) > 0)
    ? ["この日は単独券の販売がありません"]
    : []),
  // W10: 返金される保証金は、返却で戻ることと、手持ちのカードなら不要なことを添える
  ...(result.fees.some(fee => /保証金|デポジット/u.test(fee.name))
    ? ["ICカード保証金は返却で返金されます", "お持ちのカードを使えば不要です"]
    : []),
];

const unavailableOptions = (
  status: TicketCalculationResult["status"],
  notes: string[],
  assumedHours = false,
): TicketDurationOptions => ({
  status,
  primary: null,
  timeRestricted: [],
  shorter: [],
  longestSingle: null,
  withIncludedItems: [],
  notes,
  assumedHours,
});

/**
 * その日の指定に対する券の選択肢。
 * 料金は calculateLiftTicket（人物区分・同行者ルール・手数料込み）で出す。
 */
export const calculateDurationOptions = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  date: string,
  duration: TicketDayDuration,
): TicketDurationOptions => {
  const dayInput: LiftTicketSearchInput = {
    ...input,
    visitDate: date,
    days: undefined,
  };
  if (!seasonContains(data, date)) {
    const result = calculateLiftTicket(data, dayInput, null);
    return unavailableOptions("outside_season", result.notes);
  }
  const closed = findClosedCalendar(data, date);
  if (closed) {
    const result = calculateLiftTicket(data, dayInput, null);
    return unavailableOptions("closed", result.notes);
  }

  const { byType, assumed } = operatingSegmentsOn(data, date);
  const regular = byType.get("regular") ?? [];
  const night = byType.get("night") ?? [];
  const notes: string[] = [];
  if (assumed) notes.push("営業時間不明のため8:00〜17:00と仮定");

  const wantsNight =
    duration.kind === "night" ||
    (duration.kind === "day" && duration.withNight);
  if (wantsNight && night.length === 0) {
    notes.push("この日はナイター営業がありません");
    if (duration.kind === "night")
      return unavailableOptions("unavailable", notes, assumed);
  }

  /** 要件の範囲（S3: N時間はナイターも含む） */
  const scope: Interval[] =
    duration.kind === "night"
      ? night
      : duration.kind === "day" && !duration.withNight
        ? regular
        : mergeIntervals([...regular, ...night]);
  const scopeMinutes = measure(bridge(scope));
  /** 必要な時間（分）。範囲全体を覆う指定は範囲の長さ */
  let required = duration.kind === "hours" ? duration.hours * 60 : scopeMinutes;
  if (duration.kind === "hours" && required > scopeMinutes + EPSILON) {
    // S7: その日の営業より長い指定は、営業時間全体の結果を出す
    notes.push(operatingNote(scope));
    required = scopeMinutes;
  }

  // 候補: 回数券・ポイント券・時間を使い切る券は使わない（S13）
  const candidates = durationCandidateProducts(data, dayInput).filter(
    product => coverageOf(product, byType) != null,
  );
  const priceCache = new Map<string, TicketCalculationResult | null>();
  const priceOf = (product: LiftTicketProduct) => {
    if (!priceCache.has(product.id)) {
      const result = calculateLiftTicket(data, dayInput, product.id);
      // 年齢の入力が必要な人がいると金額は確定しないが、券は選べる（partial）。
      // その日に売っていない券（unavailable）だけを外す
      priceCache.set(
        product.id,
        result.status === "complete" || result.status === "partial"
          ? result
          : null,
      );
    }
    return priceCache.get(product.id) ?? null;
  };
  const sellable = candidates.filter(product => priceOf(product) != null);

  type Combo = {
    products: LiftTicketProduct[];
    covered: Interval[];
    total: number;
    restricted: boolean;
  };
  const combos: Combo[] = [];
  const addCombo = (products: LiftTicketProduct[]) => {
    const coverages = products.map(product => coverageOf(product, byType));
    if (coverages.some(coverage => coverage == null)) return;
    const covered = bestCoverage(coverages as Coverage[], scope);
    const results = products.map(product => priceOf(product));
    if (results.some(result => result == null)) return;
    // 金額が確定しない券は、確定した券より後ろに並べる
    const total = results.reduce(
      (sum, result) =>
        sum +
        (result?.payableTotal ?? (result?.knownTicketTotal ?? 0) + UNPRICED),
      0,
    );
    // 2枚目が滑れる時間を増やさない組み合わせ（ナイターの無い日のナイター券など）は作らない
    if (products.length > 1) {
      const alone = Math.max(
        ...products.map(product =>
          measure(
            bestCoverage([coverageOf(product, byType) as Coverage], scope),
          ),
        ),
      );
      if (measure(covered) <= alone + EPSILON) return;
    }
    // 仕様S1: 「1日」は1日券か1枚の時間券。時間券2枚で1日を作らない
    if (
      products.length > 1 &&
      duration.kind === "day" &&
      !duration.withNight &&
      products.every(
        product => product.validity?.mode === "hours_from_first_use",
      )
    )
      return;
    const coversScope = measure(covered) >= scopeMinutes - EPSILON;
    // その日の通常営業をすべて含む時間帯固定券（音威富士の水曜の午後券）は、
    // 1日券と同じく時間帯の決まっていない券として扱う
    const coversRegular =
      regular.length > 0 &&
      measure(intersect(bridge(covered), bridge(regular))) >=
        measure(bridge(regular)) - EPSILON;
    combos.push({
      products,
      covered,
      total,
      restricted: !(
        products.every(isFlexibleProduct) ||
        coversScope ||
        coversRegular
      ),
    });
  };
  // 追加券（＋ナイター券など）は追加先の券と一緒にだけ使う
  const isAddOn = (product: LiftTicketProduct) =>
    (product.add_on_to_product_ids?.length ?? 0) > 0;
  for (const product of sellable) if (!isAddOn(product)) addCombo([product]);
  // S10: 1枚で足りなければ2枚まで組み合わせる
  for (let i = 0; i < sellable.length; i++)
    for (let j = i; j < sellable.length; j++) {
      const a = sellable[i];
      const b = sellable[j];
      if (isAddOn(a) && isAddOn(b)) continue;
      if (isAddOn(a) && !a.add_on_to_product_ids?.includes(b.id)) continue;
      if (isAddOn(b) && !b.add_on_to_product_ids?.includes(a.id)) continue;
      if (a.id === b.id && a.validity?.mode !== "hours_from_first_use")
        continue;
      addCombo([a, b]);
    }

  const toOption = (combo: Combo): TicketDurationOption => {
    const productName = combo.products.map(labelOf).join("＋");
    const productIds = combo.products.map(product => product.id);
    const result = mergeResults(
      combo.products.map(
        product => priceOf(product) as TicketCalculationResult,
      ),
      productIds,
      productName,
    );
    return {
      productIds,
      productName,
      total: combo.total >= UNPRICED ? Number.NaN : combo.total,
      hours: measure(combo.covered) / 60,
      windowLabel: combo.restricted
        ? comboWindowLabel(combo.products, combo.covered)
        : null,
      timeRestricted: combo.restricted,
      extraNotes: optionNotes(combo.products, result),
      includedItems: combo.products.flatMap(product =>
        (product.included_items ?? [])
          .filter(item => item.type !== "rental")
          .map(item => item.name_ja),
      ),
      result: {
        ...result,
        notes: [
          ...new Set([
            ...notes,
            ...optionNotes(combo.products, result),
            ...result.notes,
          ]),
        ],
      },
    };
  };

  /** 同じ券を2枚にした組み合わせより、1枚のほうを優先して並べる */
  // 同額なら、1枚・時間帯の決まっていない券・要件に近い長さの券の順
  const byPrice = (a: Combo, b: Combo) =>
    a.total - b.total ||
    a.products.length - b.products.length ||
    Number(a.restricted) - Number(b.restricted) ||
    (duration.kind === "hours"
      ? nominalHours(a.products) - nominalHours(b.products)
      : 0);
  const meets = (combo: Combo) => measure(combo.covered) >= required - EPSILON;
  const qualifying = combos.filter(meets).sort(byPrice);
  const fullyCovering = (combo: Combo) =>
    measure(combo.covered) >= scopeMinutes - EPSILON;

  let primaryCombo: Combo | null =
    qualifying.find(combo => !combo.restricted) ?? qualifying[0] ?? null;

  // S1: 「1日」で1日券などが無ければ、いちばん長い時間券を出す
  if (primaryCombo == null && duration.kind === "day" && !duration.withNight) {
    const singles = combos
      .filter(combo => combo.products.length === 1 && !combo.restricted)
      .sort(
        (a, b) => measure(b.covered) - measure(a.covered) || a.total - b.total,
      );
    primaryCombo = singles[0] ?? null;
    if (primaryCombo && !fullyCovering(primaryCombo))
      notes.push(operatingNote(scope));
  }

  if (primaryCombo == null)
    return unavailableOptions(
      "unavailable",
      [...notes, "希望の条件を満たす券が公式料金データにありません。"],
      assumed,
    );
  const primary = primaryCombo;
  const sameProducts = (a: Combo, b: Combo) =>
    a.products.map(p => p.id).join("+") === b.products.map(p => p.id).join("+");

  const timeRestricted =
    duration.kind === "hours" || duration.kind === "day"
      ? dedupe(
          qualifying.filter(
            combo =>
              combo.restricted &&
              combo !== primary &&
              combo.total < primary.total &&
              !sameProducts(combo, primary),
          ),
        )
      : [];

  // S5: 1時間短くてもよければ（N時間と「1日」だけ）
  const shorterFloor = required - 60;
  const shorter =
    duration.kind === "hours" ||
    (duration.kind === "day" && !duration.withNight)
      ? dedupe(
          combos
            .filter(
              combo =>
                !meets(combo) &&
                measure(combo.covered) >= shorterFloor - EPSILON &&
                combo.total < primary.total &&
                !timeRestricted.includes(combo),
            )
            .sort(
              (a, b) =>
                measure(b.covered) - measure(a.covered) || a.total - b.total,
            ),
        )
      : [];

  // S6: 1日＋ナイターで2枚に分けたときは、1枚で滑れる最長の券も出す
  let longestSingle: Combo | null = null;
  if (wantsNight && duration.kind === "day" && primary.products.length > 1) {
    longestSingle =
      combos
        .filter(combo => combo.products.length === 1)
        .sort(
          (a, b) =>
            measure(b.covered) - measure(a.covered) || a.total - b.total,
        )[0] ?? null;
    if (longestSingle && fullyCovering(longestSingle)) longestSingle = null;
  }

  return {
    status: "complete",
    primary: toOption(primary),
    timeRestricted: timeRestricted.map(toOption),
    shorter: shorter.map(toOption),
    longestSingle: longestSingle ? toOption(longestSingle) : null,
    withIncludedItems: dedupe(
      qualifying.filter(
        combo =>
          combo !== primary &&
          combo.products.length === 1 &&
          (combo.products[0].included_items ?? []).some(
            item => item.type !== "rental",
          ) &&
          // レンタル付きのセットは、レンタルとの比較（セット券の枠）で扱う
          !(combo.products[0].included_items ?? []).some(
            item => item.type === "rental",
          ),
      ),
    ).map(toOption),
    notes,
    assumedHours: assumed,
  };

  function dedupe(list: Combo[]) {
    const seen = new Set<string>();
    return list.filter(combo => {
      const key = combo.products.map(p => p.id).join("+");
      if (seen.has(key)) return false;
      seen.add(key);
      // 2枚の組み合わせは、同じ券1枚より高いなら出さない
      return true;
    });
  }
};
