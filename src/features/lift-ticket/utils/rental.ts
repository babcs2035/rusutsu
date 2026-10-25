import type {
  LiftTicketAudience,
  LiftTicketData,
  LiftTicketProduct,
  LiftTicketRental,
  LiftTicketSearchInput,
  LiftTicketSourceQuote,
  PriceReference,
  TicketDayPlan,
  TicketPartyGroup,
  TicketRentalItem,
  TicketRentalRequest,
  TicketRentalSport,
} from "../types";
import { TICKET_RENTAL_SPORTS } from "../types";
import {
  addDays,
  audienceMatchesGroup,
  buildReferences,
  calendarMatchesDate,
  formatPartyGroupLabel,
  getTodayInJapan,
  isPurchasableOn,
  periodContains,
  seasonContains,
  sourceQuotesOf,
} from "./calculateLiftTicket";

export const TICKET_RENTAL_ITEM_LABELS: Record<TicketRentalItem, string> = {
  skis: "板",
  ski_boots: "ブーツ",
  poles: "ストック",
  snowboard: "板",
  snowboard_boots: "ブーツ",
  wear: "ウェア",
  helmet: "ヘルメット",
  goggles: "ゴーグル",
  gloves: "グローブ",
};

export const TICKET_RENTAL_SPORT_LABELS: Record<TicketRentalSport, string> = {
  ski: "スキー",
  snowboard: "ボード",
};

/** 種目ごとに選べる用具（画面の並び順） */
export const TICKET_RENTAL_ITEMS_BY_SPORT: Record<
  TicketRentalSport,
  TicketRentalItem[]
> = {
  ski: ["skis", "ski_boots", "poles", "wear", "helmet", "goggles", "gloves"],
  snowboard: [
    "snowboard",
    "snowboard_boots",
    "wear",
    "helmet",
    "goggles",
    "gloves",
  ],
};

/** 種目を選んだときに最初からチェックする用具（板・ブーツ・ストック） */
export const DEFAULT_TICKET_RENTAL_ITEMS: Record<
  TicketRentalSport,
  TicketRentalItem[]
> = {
  ski: ["skis", "ski_boots", "poles"],
  snowboard: ["snowboard", "snowboard_boots"],
};

/** データ側のセットのラベルが含む用具 */
const SET_ITEMS: Record<string, TicketRentalItem[]> = {
  ski_set: ["skis", "ski_boots", "poles"],
  snowboard_set: ["snowboard", "snowboard_boots"],
};

/** 種目に合わない用具（スキーなのにボードの板など）を除いた、借りる物 */
export const rentalItemsOf = (
  request: TicketRentalRequest | null | undefined,
) =>
  request
    ? TICKET_RENTAL_ITEMS_BY_SPORT[request.sport].filter(item =>
        request.items.includes(item),
      )
    : [];

/** 入力欄に出す短い要約（「スキー3点＋ウェア」「ボード板のみ」） */
export const formatRentalRequest = (
  request: TicketRentalRequest | null | undefined,
) => {
  const items = rentalItemsOf(request);
  if (!request || items.length === 0) return "なし";
  const sport = TICKET_RENTAL_SPORT_LABELS[request.sport];
  const base = DEFAULT_TICKET_RENTAL_ITEMS[request.sport];
  const hasBase = base.every(item => items.includes(item));
  const extras = items
    .filter(item => !hasBase || !base.includes(item))
    .map(item => TICKET_RENTAL_ITEM_LABELS[item]);
  if (hasBase) {
    const setLabel = request.sport === "ski" ? "スキー3点" : "ボード2点";
    return [setLabel, ...extras].join("＋");
  }
  const gearExtras = items.some(item => base.includes(item));
  return gearExtras ? `${sport}${extras.join("＋")}` : extras.join("＋");
};

const coveredItemsOf = (rental: LiftTicketRental) =>
  new Set(
    rental.items.flatMap(item => SET_ITEMS[item] ?? [item as TicketRentalItem]),
  );

/** セット券に含まれていても、リフト券＋レンタルの代わりとして比べてよい付帯サービス */
const BUNDLE_COMPATIBLE_ITEM_TYPES = [
  "rental",
  "meal",
  "voucher",
  "bath",
  "parking",
];

/**
 * リフト券とレンタルをまとめて売るセット券か（1日券で、レンタル以外の
 * 付帯がレッスン・内容不明でないもの）。レッスン付きなどは別物なので比べない。
 */
export const isRentalBundleProduct = (product: LiftTicketProduct) => {
  const items = product.included_items ?? [];
  return (
    product.validity?.mode === "calendar_day" &&
    (product.add_on_to_product_ids?.length ?? 0) === 0 &&
    items.some(item => item.type === "rental") &&
    items.every(item =>
      BUNDLE_COMPATIBLE_ITEM_TYPES.includes(item.type ?? "unknown"),
    )
  );
};

/**
 * セット券がまかなう用具。データには用具の構造がなく公式表記だけなので、
 * 表記から読む（「レンタルセット」「スキー3点」「ブーツ＋スキー・ストック」は板・
 * ブーツ・ストック、「ウェア」はウェア）。ヘルメット・ゴーグル・グローブは
 * 表記が無ければ含めない。種目が片方しか書かれていなければ、その種目だけ
 */
export const bundleCoveredItemsOf = (
  product: LiftTicketProduct,
  sport: TicketRentalSport,
): Set<TicketRentalItem> => {
  const text = (product.included_items ?? [])
    .filter(item => item.type === "rental")
    .map(item =>
      [item.name_ja, item.description_ja]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    )
    .join(" ");
  const covered = new Set<TicketRentalItem>();
  const skiOnly = /スキー/.test(text) && !/ボード|スノボ/.test(text);
  const boardOnly = /ボード|スノボ/.test(text) && !/スキー/.test(text);
  if (
    /レンタルセット|オールセット|スキー|ボード|スノボ|ブーツ|板|ストック/.test(
      text,
    ) &&
    !(sport === "ski" && boardOnly) &&
    !(sport === "snowboard" && skiOnly)
  ) {
    for (const item of DEFAULT_TICKET_RENTAL_ITEMS[sport]) covered.add(item);
  }
  if (/ウェア|オールセット/.test(text)) covered.add("wear");
  return covered;
};

/**
 * レンタルの対象者を決める。券の区分（audiences）とレンタル専用の区分
 * （rental_audiences）のうち、**レンタルが参照している区分だけ**で判定する。
 * 券にしか無い区分（シニア等）まで候補に入れると、レンタルの料金が引けなくなる
 */
const rentalAudienceMatcher = (data: LiftTicketData) => {
  const referenced = new Set(
    (data.rentals ?? []).flatMap(rental => rental.audience_ids ?? []),
  );
  const audienceById = new Map<string, LiftTicketAudience>(
    [...data.audiences, ...(data.rental_audiences ?? [])]
      .filter(audience => referenced.has(audience.id))
      .map(audience => [audience.id, audience]),
  );
  return (rental: LiftTicketRental, group: TicketPartyGroup) =>
    (rental.audience_ids ?? []).some(id => {
      const audience = audienceById.get(id);
      return !!audience && audienceMatchesGroup(audience, group, audienceById);
    });
};

/** その日の滑る長さに使える貸出期間か */
const fitsDuration = (
  rental: LiftTicketRental,
  duration: TicketDayPlan["duration"],
) => {
  const { mode, hours } = rental.duration;
  if (mode === "day") return true;
  if (duration.kind !== "hours") return false;
  if (mode === "hours") return hours != null && hours >= duration.hours;
  // 半日の時間数が公式に無ければ、4時間以下の滑走にだけ当てる
  if (mode === "half_day") return duration.hours <= (hours ?? 4);
  return false;
};

const availableOn = (
  data: LiftTicketData,
  rental: LiftTicketRental,
  date: string,
  today: string,
) => {
  if (rental.price.amount == null) return false;
  if (rental.target_qualification) return false;
  if (!periodContains(rental.use_period, date)) return false;
  if (!isPurchasableOn(rental, date, today)) return false;
  const calendarIds = rental.calendar_ids ?? [];
  if (calendarIds.length === 0) return true;
  return calendarIds.some(id =>
    calendarMatchesDate(
      data.calendars.find(calendar => calendar.id === id),
      date,
    ),
  );
};

type RentalOption = {
  rental: LiftTicketRental;
  /** その期間を借りる1人ぶんの金額 */
  amount: number;
  /** 借りる回数（1日ずつ借りる料金を2日ぶん、など） */
  times: number;
  /** 「以降1日＋5,000円」のような追加日料金を足す場合、その料金と日数 */
  extra?: { rental: LiftTicketRental; amount: number; times: number };
};

const costOf = (option: RentalOption) =>
  option.amount * option.times +
  (option.extra ? option.extra.amount * option.extra.times : 0);

/**
 * 借りる物がそろう、いちばん安い組み合わせ。
 * セット（板・ブーツ・ストック）と単品を比べる。用具は最大9種類なので、
 * そろった用具の組み合わせ（ビット）ごとの最安を順に詰めていく
 */
const cheapestCover = (
  required: TicketRentalItem[],
  options: RentalOption[],
): RentalOption[] | null => {
  if (required.length === 0) return [];
  const full = (1 << required.length) - 1;
  const maskOf = (option: RentalOption) => {
    const covered = coveredItemsOf(option.rental);
    return required.reduce(
      (mask, item, bit) => (covered.has(item) ? mask | (1 << bit) : mask),
      0,
    );
  };
  const useful = options
    .map(option => ({ option, mask: maskOf(option) }))
    .filter(({ mask }) => mask !== 0);
  const best: Array<{ cost: number; picks: RentalOption[] } | null> =
    Array.from({ length: full + 1 }, () => null);
  best[0] = { cost: 0, picks: [] };
  for (let mask = 0; mask <= full; mask++) {
    const current = best[mask];
    if (!current) continue;
    for (const { option, mask: optionMask } of useful) {
      const next = mask | optionMask;
      if (next === mask) continue;
      const cost = current.cost + costOf(option);
      const existing = best[next];
      if (!existing || cost < existing.cost) {
        best[next] = { cost, picks: [...current.picks, option] };
      }
    }
  }
  return best[full]?.picks ?? null;
};

export type TicketRentalPick = {
  rentalId: string;
  name: string;
  shopName: string | null;
  /** 1人1回ぶんの金額 */
  unitAmount: number;
  /** 払う回数（1日料金を3日ぶんなら3。「2日間」の料金は1） */
  times: number;
  /** 「2日間」のように1回で複数日を借りる料金か */
  multiDay: boolean;
  /** 借りる日（複数日料金なら期間の日付すべて） */
  dates: string[];
  purchaseNote: string | null;
  sourceNumbers: number[];
  sourceQuotes?: Record<number, LiftTicketSourceQuote>;
};

export type TicketRentalLine = {
  groupId: string;
  groupLabel: string;
  count: number;
  /** 借りる物の要約（「スキー3点＋ウェア」） */
  requestLabel: string;
  picks: TicketRentalPick[];
  /** 1人ぶん（全日） */
  unitTotal: number | null;
  subtotal: number | null;
  note: string | null;
};

export type TicketRentalResult = {
  /**
   * none          … 誰も借りない
   * not_collected … このスキー場のレンタル料金を集めていない
   * complete      … 全員の料金が出た
   * partial       … 一部の人・日の料金が出ない
   */
  status: "none" | "not_collected" | "complete" | "partial";
  lines: TicketRentalLine[];
  total: number | null;
  knownTotal: number;
  references: PriceReference[];
};

const PRESCHOOL_AGES = [0, 1, 2, 3, 4, 5, 6];

/** 連続した日付のかたまりに分ける（2日間の料金は連続した日にしか使えない） */
const consecutiveRuns = (plans: TicketDayPlan[]) => {
  const sorted = [...plans]
    .filter(plan => plan.date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const runs: TicketDayPlan[][] = [];
  for (const plan of sorted) {
    const current = runs[runs.length - 1];
    const last = current?.[current.length - 1];
    if (current && last && addDays(last.date, 1) === plan.date) {
      current.push(plan);
    } else {
      runs.push([plan]);
    }
  }
  return runs;
};

const totalOf = (picks: RentalOption[]) =>
  picks.reduce((sum, pick) => sum + costOf(pick), 0);

/** 1回で借りられる日数（1日料金は1、「3日間」は3）。それ以外は null */
const baseDaysOf = (rental: LiftTicketRental) =>
  rental.duration.mode === "day"
    ? 1
    : rental.duration.mode === "days"
      ? (rental.duration.days ?? null)
      : null;

const sameItems = (left: LiftTicketRental, right: LiftTicketRental) =>
  [...left.items].sort().join(",") === [...right.items].sort().join(",");

/**
 * レンタル料金の合計。利用者ごとに、借りる物がそろう最安の組み合わせを日ごとに出し、
 * 連続した日は「2日間」の料金で借りたほうが安ければそちらを使う。
 * 宿泊者限定など入力で判定できない料金は使わない（公式の条件を確かめてもらう）
 */
export const calculateRentalPlan = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
): TicketRentalResult => {
  const renters = input.party.filter(
    group => group.count > 0 && rentalItemsOf(group.rental).length > 0,
  );
  const empty = { lines: [], total: null, knownTotal: 0, references: [] };
  if (renters.length === 0) return { status: "none", ...empty };
  const rentals = data.rentals ?? [];
  if (rentals.length === 0) return { status: "not_collected", ...empty };

  const today = input.today ?? getTodayInJapan();
  const plans: TicketDayPlan[] =
    input.days && input.days.length > 0
      ? input.days
      : [
          {
            id: "day-1",
            date: input.visitDate,
            duration: { kind: "day", withNight: false },
          },
        ];
  const matchesAudience = rentalAudienceMatcher(data);
  const { references, numberBySourceId } = buildReferences(data);
  const channelById = new Map(
    data.channels.map(channel => [channel.id, channel]),
  );

  // 誰でも借りられるショップが1つだけなら、ショップ名は毎行に出さない
  const showsShopName =
    new Set(
      rentals
        .filter(rental => !rental.target_qualification)
        .map(rental => rental.shop_name_ja ?? ""),
    ).size > 1;

  const toPick = (option: RentalOption, dates: string[]): TicketRentalPick => {
    const { rental } = option;
    const channel = (rental.channel_ids ?? [])
      .map(id => channelById.get(id))
      .find(Boolean);
    const deadline = rental.purchase_deadline?.official_text_ja;
    return {
      rentalId: rental.id,
      name: (() => {
        const name = rental.official_label_ja ?? rental.name_ja;
        // 基準の料金と同じ名前で並ぶと区別できないので、追加日料金だと分かるようにする
        return rental.duration.mode === "extra_day" && !/以降|追加/.test(name)
          ? `${name}（追加日）`
          : name;
      })(),
      shopName: showsShopName ? (rental.shop_name_ja ?? null) : null,
      unitAmount: option.amount,
      times: option.times,
      multiDay: rental.duration.mode === "days" || option.extra != null,
      dates,
      purchaseNote: channel
        ? [channel.name_ja, deadline].filter(Boolean).join("・")
        : null,
      sourceQuotes: sourceQuotesOf(rental, numberBySourceId),
      sourceNumbers: [
        ...new Set(
          (rental.source_refs ?? [])
            .map(id => numberBySourceId.get(id))
            .filter((number): number is number => number != null),
        ),
      ].sort((left, right) => left - right),
    };
  };

  const lines: TicketRentalLine[] = renters.map(group => {
    const required = rentalItemsOf(group.rental);
    // ★**年齢未入力の未就学児は0〜6歳のどの年齢でも同じ区分になる料金だけを使う。**
    // 券は無料・有料の境目があるので年齢を求めるが、レンタルの「12歳以下」等は
    // 年齢なしで決まる。0〜6歳の途中で料金が分かれるときだけ年齢を求める
    const effectiveCategory =
      group.category === "disabled" ? group.baseCategory : group.category;
    const variants =
      effectiveCategory === "preschool" && group.age == null
        ? PRESCHOOL_AGES.map(age => ({ ...group, age }))
        : [group];
    const candidates = rentals.filter(rental =>
      variants.every(variant => matchesAudience(rental, variant)),
    );
    const base = {
      groupId: group.id,
      groupLabel: formatPartyGroupLabel(group),
      count: group.count,
      requestLabel: formatRentalRequest(group.rental),
    };
    const unresolved = (note: string): TicketRentalLine => ({
      ...base,
      picks: [],
      unitTotal: null,
      subtotal: null,
      note,
    });
    if (plans.some(plan => !plan.date || !seasonContains(data, plan.date))) {
      return unresolved("収録シーズン外の日はレンタル料金を出せません");
    }
    if (
      variants.length > 1 &&
      candidates.length === 0 &&
      rentals.some(rental =>
        variants.some(variant => matchesAudience(rental, variant)),
      )
    ) {
      return unresolved(
        "年齢でレンタル料金が変わります。年齢を入力してください",
      );
    }

    /** 1日ぶんの最安（借りられない日は null） */
    const dayCover = (plan: TicketDayPlan) =>
      cheapestCover(
        required,
        candidates
          .filter(
            rental =>
              fitsDuration(rental, plan.duration) &&
              availableOn(data, rental, plan.date, today),
          )
          .map(rental => ({
            rental,
            amount: rental.price.amount ?? 0,
            times: 1,
          })),
      );

    const picks: TicketRentalPick[] = [];
    for (const run of consecutiveRuns(plans)) {
      const perDay = run.map(plan => dayCover(plan));
      if (perDay.some(cover => cover == null)) {
        return unresolved("借りる物のレンタル料金が公式資料にありません");
      }
      const perDayTotal = perDay.reduce(
        (sum, cover) => sum + totalOf(cover ?? []),
        0,
      );
      // 「2日間」の料金と、毎日借りられる1日料金を組み合わせた案
      const dates = run.map(plan => plan.date);
      const multiDay =
        run.length >= 2
          ? cheapestCover(required, [
              ...candidates
                .filter(
                  rental =>
                    rental.duration.mode === "days" &&
                    rental.duration.days === run.length &&
                    availableOn(data, rental, run[0].date, today),
                )
                .map(rental => ({
                  rental,
                  amount: rental.price.amount ?? 0,
                  times: 1,
                })),
              // 「1日＋以降1日追加」「5日間＋6日目以降1日ごと」
              ...candidates.flatMap(base => {
                const baseDays = baseDaysOf(base);
                if (
                  baseDays == null ||
                  baseDays >= run.length ||
                  !availableOn(data, base, run[0].date, today)
                ) {
                  return [];
                }
                return candidates
                  .filter(
                    extra =>
                      extra.duration.mode === "extra_day" &&
                      (extra.duration.after_days ?? 1) === baseDays &&
                      sameItems(base, extra) &&
                      availableOn(data, extra, run[0].date, today),
                  )
                  .map(extra => ({
                    rental: base,
                    amount: base.price.amount ?? 0,
                    times: 1,
                    extra: {
                      rental: extra,
                      amount: extra.price.amount ?? 0,
                      times: run.length - baseDays,
                    },
                  }));
              }),
              ...candidates
                .filter(
                  rental =>
                    rental.duration.mode === "day" &&
                    run.every(plan =>
                      availableOn(data, rental, plan.date, today),
                    ),
                )
                // 日によって料金が違う1日料金は混ぜない（1日ずつの案で比べる）
                .map(rental => ({
                  rental,
                  amount: rental.price.amount ?? 0,
                  times: run.length,
                })),
            ])
          : null;
      if (
        multiDay?.some(
          option =>
            option.rental.duration.mode === "days" || option.extra != null,
        ) &&
        totalOf(multiDay) < perDayTotal
      ) {
        for (const option of multiDay) {
          picks.push(toPick(option, dates));
          if (option.extra) picks.push(toPick(option.extra, dates));
        }
        continue;
      }
      perDay.forEach((cover, index) => {
        for (const option of cover ?? []) {
          picks.push(toPick(option, [run[index].date]));
        }
      });
    }

    // 同じ料金を日ごとに並べない（「スキーセット ¥5,000 × 3日」にまとめる）。
    // 「2日間」の料金はそれだけで期間ぶんなのでまとめない
    const merged: TicketRentalPick[] = [];
    for (const pick of picks) {
      const same = merged.find(
        item =>
          item.rentalId === pick.rentalId &&
          item.unitAmount === pick.unitAmount &&
          !item.multiDay &&
          !pick.multiDay,
      );
      if (same) {
        same.times += pick.times;
        same.dates = [...new Set([...same.dates, ...pick.dates])].sort();
        continue;
      }
      merged.push({ ...pick, dates: [...pick.dates] });
    }
    const unitTotal = merged.reduce(
      (sum, pick) => sum + pick.unitAmount * pick.times,
      0,
    );
    return {
      ...base,
      picks: merged,
      unitTotal,
      subtotal: unitTotal * group.count,
      note: null,
    };
  });

  const knownTotal = lines.reduce((sum, line) => sum + (line.subtotal ?? 0), 0);
  const complete = lines.every(line => line.subtotal != null);
  const usedNumbers = new Set(
    lines.flatMap(line => line.picks.flatMap(pick => pick.sourceNumbers)),
  );
  return {
    status: complete ? "complete" : "partial",
    lines,
    total: complete ? knownTotal : null,
    knownTotal,
    references: references.filter(reference =>
      usedNumbers.has(reference.number),
    ),
  };
};

export type TicketRentalOptions = {
  /** 借りられる種目（スキー・ボード） */
  sports: TicketRentalSport[];
  /** 種目ごとに選べる用具（料金表にある物だけ） */
  itemsBySport: Record<TicketRentalSport, TicketRentalItem[]>;
};

/**
 * 検索条件では特定のスキー場を選んでいないため、選択できるレンタル用具を
 * 共通で表示する。各スキー場の料金計算では実際の登録内容に照合する。
 */
export const SEARCH_RENTAL_OPTIONS: TicketRentalOptions = {
  sports: [...TICKET_RENTAL_SPORTS],
  itemsBySport: TICKET_RENTAL_ITEMS_BY_SPORT,
};

/**
 * そのスキー場で借りられる物。誰でも借りられる料金（宿泊者限定などを除く）に
 * 含まれる用具だけを選択肢にする（料金表に無い物を選ばせて「未確定」にしない）。
 * レンタル料金を集めていなければ null
 */
export const rentalOptionsOf = (
  data: LiftTicketData,
): TicketRentalOptions | null => {
  const available = new Set<string>();
  for (const rental of data.rentals ?? []) {
    if (rental.target_qualification || rental.price.amount == null) continue;
    for (const item of coveredItemsOf(rental)) available.add(item);
  }
  // 単品のレンタル料金が無いスキー場でも、セット券で借りられる物は選べる
  for (const product of data.products) {
    if (!isRentalBundleProduct(product)) continue;
    for (const sport of TICKET_RENTAL_SPORTS) {
      for (const item of bundleCoveredItemsOf(product, sport)) {
        available.add(item);
      }
    }
  }
  const itemsBySport = Object.fromEntries(
    TICKET_RENTAL_SPORTS.map(sport => [
      sport,
      TICKET_RENTAL_ITEMS_BY_SPORT[sport].filter(item => available.has(item)),
    ]),
  ) as Record<TicketRentalSport, TicketRentalItem[]>;
  // 板かブーツが借りられる種目だけを選択肢にする（ウェアだけでは種目が決まらない）
  const sports = TICKET_RENTAL_SPORTS.filter(sport =>
    DEFAULT_TICKET_RENTAL_ITEMS[sport].some(item => available.has(item)),
  );
  return sports.length > 0 ? { sports, itemsBySport } : null;
};

/** 「あり」にしたときの最初の選択（その種目の板・ブーツ・ストックのうち借りられる物） */
export const defaultRentalRequestOf = (
  options: TicketRentalOptions,
  sport: TicketRentalSport = options.sports[0],
  keep: TicketRentalItem[] = [],
): TicketRentalRequest => {
  const available = options.itemsBySport[sport];
  const gear = [
    ...DEFAULT_TICKET_RENTAL_ITEMS.ski,
    ...DEFAULT_TICKET_RENTAL_ITEMS.snowboard,
  ];
  return {
    sport,
    items: available.filter(
      item =>
        DEFAULT_TICKET_RENTAL_ITEMS[sport].includes(item) ||
        // 種目を変えても、ウェア・小物は選び直さなくてよいよう引き継ぐ
        (keep.includes(item) && !gear.includes(item)),
    ),
  };
};
