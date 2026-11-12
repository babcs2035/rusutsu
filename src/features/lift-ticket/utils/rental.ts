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
  purchaseQuoteOf,
  seasonContains,
  sourceQuotesOf,
} from "./calculateLiftTicket";
import {
  calculateDurationOptions,
  formatHours,
  operatingSegmentsOn,
} from "./durationOptions";

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

/**
 * ウェア上下（wear）は上（wear_top）と下（wear_bottom）の両方を含む。
 * 上下セットが無く上・下が別料金の施設では、上＋下で「ウェア」を借りる（R09）
 */
const WEAR_HALVES = ["wear_top", "wear_bottom"];
const coveredItemsOf = (rental: LiftTicketRental) =>
  new Set<string>(
    rental.items.flatMap(item =>
      item === "wear"
        ? ["wear", ...WEAR_HALVES]
        : item === "snowboard_set"
          ? [...(SET_ITEMS[item] ?? []), "snowboard_bindings"]
          : (SET_ITEMS[item] ?? [item]),
    ),
  );

/**
 * 計算で揃える物。ウェアは上・下に分け、ビンディングが別料金の施設では
 * ボード板にビンディングを足す（R16）
 */
const requiredItemsOf = (data: LiftTicketData, items: TicketRentalItem[]) => {
  const rentals = data.rentals ?? [];
  const separateBindings = rentals.some(
    rental =>
      rental.items.length === 1 && rental.items[0] === "snowboard_bindings",
  );
  return items.flatMap<string>(item =>
    item === "wear"
      ? WEAR_HALVES
      : item === "snowboard" && separateBindings
        ? ["snowboard", "snowboard_bindings"]
        : [item],
  );
};

/** セット券に含まれていても、リフト券＋レンタルの代わりとして比べてよい付帯サービス */
const BUNDLE_COMPATIBLE_ITEM_TYPES = [
  "rental",
  "meal",
  "voucher",
  "bath",
  "parking",
];

/** セット券として比べる券の有効期間（1日券・N時間券・連続N日券） */
const BUNDLE_VALIDITY_MODES = [
  "calendar_day",
  "hours_from_first_use",
  "consecutive_days",
];

/**
 * リフト券とレンタルをまとめて売るセット券か（1日券・時間券・連続日券で、レンタル以外の
 * 付帯がレッスン・内容不明でないもの）。レッスン付きなどは別物なので比べない。
 */
export const isRentalBundleProduct = (product: LiftTicketProduct) => {
  const items = product.included_items ?? [];
  return (
    BUNDLE_VALIDITY_MODES.includes(product.validity?.mode ?? "") &&
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
  const covered = new Set<TicketRentalItem>();
  const rentalEntries = (product.included_items ?? []).filter(
    item => item.type === "rental",
  );
  // 用具が構造化されていれば、名称は読まずにそれを使う
  const structured = rentalEntries.flatMap(item => item.rental_items ?? []);
  if (structured.length > 0) {
    for (const item of structured) {
      if (TICKET_RENTAL_ITEMS_BY_SPORT[sport].includes(item)) covered.add(item);
    }
    return covered;
  }
  const text = rentalEntries
    .map(item =>
      [item.name_ja, item.description_ja]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    )
    .join(" ");
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
const toMinutesOrNull = (time?: string | null) => {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

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

/**
 * 身長・学年の書類など、入力（年齢・学校区分）では判定できない資格で決まる
 * 子ども料金（「身長130cm以下」）。小学生・未就学児の条件付き候補にだけ使う（CH20）。
 * 確定には使わない（availableOn が資格付きを外す）
 */
const rentalQualifiedChildMatcher = (data: LiftTicketData) => {
  const audienceById = new Map<string, LiftTicketAudience>(
    [...data.audiences, ...(data.rental_audiences ?? [])].map(audience => [
      audience.id,
      audience,
    ]),
  );
  return (rental: LiftTicketRental, group: TicketPartyGroup) => {
    const category =
      group.category === "disabled" ? group.baseCategory : group.category;
    if (!rental.target_qualification) return false;
    if (category !== "elementary" && category !== "preschool") return false;
    const audiences = (rental.audience_ids ?? []).map(id =>
      audienceById.get(id),
    );
    return (
      audiences.length > 0 &&
      audiences.every(
        audience =>
          audience != null &&
          audience.is_default !== true &&
          !audience.is_disability_qualified &&
          (audience.school_levels?.length ?? 0) === 0 &&
          audience.age_min == null &&
          audience.age_max == null,
      )
    );
  };
};

/**
 * 選んだリフト券の時間帯。
 * unknown … 希望に合う券が無く、時間帯が決まらない
 * known   … 券が決まった。start は時間帯券（午後券など）の開始（分）。朝から使う券は null
 */
type TicketWindow =
  | { kind: "unknown" }
  | { kind: "known"; start: number | null };

/**
 * 選んだリフト券の時間帯（windowLabel「13:00〜16:30」の開始時刻）を読む。
 * 一番上の券（primary）を使う。ただし「午後」の希望（usePreference: half_day）のときは、
 * 時間帯の決まった券（午後券など）があればその最安を使い、無ければ午後に使う前提で
 * 時間帯は決めない（unknown）
 */
const ticketWindowOf = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  plan: TicketDayPlan,
): TicketWindow => {
  if (plan.duration.kind !== "hours") return { kind: "unknown" };
  const options = calculateDurationOptions(
    data,
    input,
    plan.date,
    plan.duration,
  );
  const restricted = [options.primary, ...options.timeRestricted]
    .filter(option => option?.timeRestricted)
    .sort((left, right) => (left?.total ?? 0) - (right?.total ?? 0))[0];
  // 「午後」の希望で時間帯券が無いときは、午後に使う前提（朝から使う券とは決めつけない）
  if (input.usePreference === "half_day" && !restricted) {
    return { kind: "unknown" };
  }
  const chosen =
    input.usePreference === "half_day" ? restricted : options.primary;
  if (!chosen) return { kind: "unknown" };
  const match = chosen.timeRestricted
    ? /^(\d{1,2}:\d{2})/.exec(chosen.windowLabel ?? "")
    : null;
  return { kind: "known", start: toMinutesOrNull(match?.[1]) };
};

/** その日の滑る長さに使える貸出期間か */
const fitsDuration = (
  rental: LiftTicketRental,
  duration: TicketDayPlan["duration"],
  ticketWindow: () => TicketWindow = () => ({ kind: "unknown" }),
) => {
  const { mode, hours } = rental.duration;
  // ナイター用のレンタル（17:00〜など）は「ナイター」にだけ使う
  if (mode === "night") return duration.kind === "night";
  if (mode === "day") return true;
  if (duration.kind !== "hours") return false;
  if (mode === "hours") return hours != null && hours >= duration.hours;

  if (mode === "half_day") {
    // 開始時刻のある半日料金（13:00〜）は、選んだリフト券がその時刻以降の
    // 時間帯券（午後券）のときだけ使う。朝から使う時間券では1日料金（RT01・RT02）。
    // 券が決まらない（希望に合う券が無い）ときは、券で判断できないので従来どおり
    const rentalStart = toMinutesOrNull(rental.duration.start_time);
    if (rentalStart != null) {
      const window = ticketWindow();
      if (
        window.kind === "known" &&
        (window.start == null || window.start < rentalStart)
      ) {
        return false;
      }
    }
    // 半日の時間数が公式に無ければ、4時間以下の滑走にだけ当てる
    return duration.hours <= (hours ?? 4);
  }
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
  required: string[],
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
  /** Webで予約・購入する料金の購入ページ（商品ページがあればそれ、無ければ販売経路のURL） */
  purchaseUrl?: string | null;
  /** 購入ページの中で、この料金が書かれている場所 */
  purchaseQuote?: LiftTicketSourceQuote | null;
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
  /** このスキー場で借りられない用具の要約（「ゴーグル」）。合計には含めない */
  missingLabel: string | null;
  /**
   * この人の区分には貸出が無い用具（ほかの区分にはある。小人のウェアなど）。
   * 合計には含めず「貸出なし」と添える
   */
  unavailableLabel?: string | null;
  /** 利用者に確認してもらう事項（日中のレンタルが夜も使えるか など） */
  warnings?: string[];
  /** 資格が要る安い料金（「宿泊者限定」なら1人ぶん 3,000円）。合計には含めない */
  conditional?: Array<{ label: string; unitTotal: number }>;
  /**
   * 日中のレンタルが夜も使えるか分からない日に、夜の分を借り足す場合の候補
   * （合計には含めない）
   */
  nightAddOns?: Array<{
    date: string;
    picks: TicketRentalPick[];
    unitTotal: number;
  }>;
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
  /**
   * 選んだのにこのスキー場で借りられない用具の要約（利用者ごと、重複なし）。
   * 料金表にもセット券にも無い物で、合計には含めずに「＋ゴーグル」と添える
   */
  missingLabels: string[];
  /** 区分によって貸出が無い用具（「小人1名のウェア」）。合計には含めない */
  unavailableLabels?: string[];
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
  if (renters.length === 0) {
    return { status: "none", ...empty, missingLabels: [] };
  }
  const options = rentalOptionsOf(data);
  const missingOf = (group: TicketPartyGroup) =>
    missingRentalItemsOf(options, group.rental);
  const missingLabelOf = (group: TicketPartyGroup) => {
    const missing = missingOf(group);
    return group.rental && missing.length > 0
      ? formatRentalRequest({ sport: group.rental.sport, items: missing })
      : null;
  };
  const missingLabels = [
    ...new Set(
      renters
        .map(missingLabelOf)
        .filter((label): label is string => label != null),
    ),
  ];
  const rentals = data.rentals ?? [];
  if (rentals.length === 0) {
    return { status: "not_collected", ...empty, missingLabels };
  }

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
  // リフト券の時間帯は人ごと・店舗ごとに変わらないので、日ごとに1回だけ求める
  const windowCache = new Map<TicketDayPlan, TicketWindow>();
  const windowOf = (plan: TicketDayPlan) => {
    const cached = windowCache.get(plan);
    if (cached) return cached;
    const window = ticketWindowOf(data, input, plan);
    windowCache.set(plan, window);
    return window;
  };
  const matchesQualifiedChild = rentalQualifiedChildMatcher(data);
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
    const purchaseUrl =
      rental.purchase_url ||
      ((rental.channel_ids ?? [])
        .map(id => channelById.get(id)?.url)
        .find((url): url is string => Boolean(url)) ??
        null);
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
      purchaseUrl,
      purchaseQuote: purchaseQuoteOf(data, rental, purchaseUrl),
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
    // 借りられない用具は料金を探さず、合計の横に「＋ゴーグル」と添える
    const missing = missingOf(group);
    // 料金が書かれていないレンタルしか無い用具（RT12）
    const unpricedOnly = rentalItemsOf(group.rental).filter(
      item =>
        missing.includes(item) &&
        rentals.some(
          rental =>
            rental.price.amount == null && coveredItemsOf(rental).has(item),
        ),
    );
    // ★**年齢未入力の未就学児は0〜6歳のどの年齢でも同じ区分になる料金だけを使う。**
    // 券は無料・有料の境目があるので年齢を求めるが、レンタルの「12歳以下」等は
    // 年齢なしで決まる。0〜6歳の途中で料金が分かれるときだけ年齢を求める
    const effectiveCategory =
      group.category === "disabled" ? group.baseCategory : group.category;
    const variants =
      effectiveCategory === "preschool" && group.age == null
        ? PRESCHOOL_AGES.map(age => ({ ...group, age }))
        : [group];
    const allCandidates = rentals.filter(rental =>
      variants.every(
        variant =>
          matchesAudience(rental, variant) ||
          matchesQualifiedChild(rental, variant),
      ),
    );
    // ★**この人の区分には貸出が無い用具（大人用だけある小人のウェアなど）は合計から外し、
    // 「貸出なし」と添える。**区分に合うレンタルがひとつも無いときは、年齢の入力待ち等の
    // 別の理由なので外さない
    const coversForGroup = (item: TicketRentalItem) =>
      requiredItemsOf(data, [item]).every(part =>
        allCandidates.some(rental => coveredItemsOf(rental).has(part)),
      );
    const unavailable =
      allCandidates.length === 0
        ? []
        : rentalItemsOf(group.rental).filter(
            item => !missing.includes(item) && !coversForGroup(item),
          );
    const required = requiredItemsOf(
      data,
      rentalItemsOf(group.rental).filter(
        item => !missing.includes(item) && !unavailable.includes(item),
      ),
    );
    // ★1人は全日程で1つの店舗から借りる。店舗をまたいで板とブーツを組み合わせたり、
    // 別の店舗の延長料金を足したりしない（監査C08）。店舗ごとに計算して最安を選ぶ
    const shopNames = [
      ...new Set(allCandidates.map(rental => rental.shop_name_ja ?? "")),
    ];
    const lineForShop = (candidates: LiftTicketRental[]): TicketRentalLine => {
      const base = {
        groupId: group.id,
        groupLabel: formatPartyGroupLabel(group),
        count: group.count,
        requestLabel: formatRentalRequest(group.rental),
        missingLabel: missingLabelOf(group),
        unavailableLabel:
          group.rental && unavailable.length > 0
            ? formatRentalRequest({
                sport: group.rental.sport,
                items: unavailable,
              })
            : null,
      };
      if (required.length === 0 && unpricedOnly.length > 0) {
        return {
          ...base,
          picks: [],
          unitTotal: null,
          subtotal: null,
          note: "レンタル料金が公式資料に書かれていません",
        };
      }
      if (required.length === 0) {
        return { ...base, picks: [], unitTotal: 0, subtotal: 0, note: null };
      }
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

      const nightExtras: Array<{ plan: TicketDayPlan; cover: RentalOption[] }> =
        [];
      const lineWarnings: string[] = [];
      /** 1日ぶんの最安（借りられない日は null） */
      const dayCover = (plan: TicketDayPlan): RentalOption[] | null => {
        const window = () => windowOf(plan);
        const normal = cheapestCover(
          required,
          candidates
            .filter(
              rental =>
                fitsDuration(rental, plan.duration, window) &&
                availableOn(data, rental, plan.date, today),
            )
            .map(rental => ({
              rental,
              amount: rental.price.amount ?? 0,
              times: 1,
            })),
        );
        if (normal || plan.duration.kind !== "day") return normal;
        // リフト券のS1と同じ: 1日料金が無ければ、いちばん長い時間料金を1日に使う（RT05・RT06）
        const hourly = candidates.filter(
          rental =>
            rental.duration.mode === "hours" &&
            availableOn(data, rental, plan.date, today),
        );
        if (hourly.length === 0) return null;
        const longestHours = Math.max(
          ...hourly.map(rental => rental.duration.hours ?? 0),
        );
        const cover = cheapestCover(
          required,
          hourly
            .filter(rental => (rental.duration.hours ?? 0) === longestHours)
            .map(rental => ({
              rental,
              amount: rental.price.amount ?? 0,
              times: 1,
            })),
        );
        const regular =
          operatingSegmentsOn(data, plan.date).byType.get("regular") ?? [];
        const minutes = regular.reduce(
          (sum, [start, end]) => sum + end - start,
          0,
        );
        if (cover && longestHours * 60 < minutes) {
          const hm = (value: number) =>
            `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
          const label = regular
            .map(([start, end]) => `${hm(start)}〜${hm(end)}`)
            .join("、");
          lineWarnings.push(
            `この日の営業は${formatHours(minutes / 60)}（${label}）です`,
          );
        }
        return cover;
      };

      // 「1日＋ナイター」の日に、日中のレンタルが夜も使えるか（B12）。
      // データの終了時刻（duration.end_time）がナイター終了以降なら使える、
      // ナイター開始以前なら夜はナイター用を借り足す、記録が無ければ確認を促す
      const nightCover = (plan: TicketDayPlan) =>
        cheapestCover(
          required,
          candidates
            .filter(
              rental =>
                rental.duration.mode === "night" &&
                availableOn(data, rental, plan.date, today),
            )
            .map(rental => ({
              rental,
              amount: rental.price.amount ?? 0,
              times: 1,
            })),
        );

      const dayAndNightCover = (plan: TicketDayPlan) => {
        const day = dayCover(plan);
        if (
          day == null ||
          plan.duration.kind !== "day" ||
          !plan.duration.withNight
        )
          return day;
        const night = operatingSegmentsOn(data, plan.date).byType.get("night");
        if (!night || night.length === 0) return day;
        const nightStart = night[0][0];
        const nightEnd = night.at(-1)?.[1] ?? nightStart;
        /** 夜まで使える（true）／使えない（false）／不明（null） */
        const lastsNight = (rental: LiftTicketRental): boolean | null => {
          if (rental.usable_at_night === true) return true;
          if (rental.usable_at_night === false) return false;
          const end = toMinutesOrNull(rental.duration.end_time);
          if (end == null) return null;
          if (end >= nightEnd) return true;
          if (end <= nightStart) return false;
          return null;
        };
        // 「1日＋ナイター」料金のように、1枚で夜まで使える1日料金だけの最安
        const window = () => windowOf(plan);
        const allDay = cheapestCover(
          required,
          candidates
            .filter(
              rental =>
                lastsNight(rental) === true &&
                fitsDuration(rental, plan.duration, window) &&
                availableOn(data, rental, plan.date, today),
            )
            .map(rental => ({
              rental,
              amount: rental.price.amount ?? 0,
              times: 1,
            })),
        );
        const states = day.map(option => lastsNight(option.rental));
        if (states.every(state => state === true)) return day;
        const extra = nightCover(plan);
        if (states.some(state => state === false)) {
          // 日中のレンタルは夜に使えないと分かっている。夜の分を借り足す案と、
          // 夜まで使える1日料金の案の安いほう
          const withExtra = extra ? [...day, ...extra] : null;
          if (allDay && (!withExtra || totalOf(allDay) <= totalOf(withExtra)))
            return allDay;
          return withExtra ?? day;
        }
        if (allDay && extra && totalOf(allDay) <= totalOf([...day, ...extra]))
          return allDay;
        lineWarnings.push(
          "日中のレンタルが夜も使えるかは公式で確認してください",
        );
        if (extra) nightExtras.push({ plan, cover: extra });
        return day;
      };

      const picks: TicketRentalPick[] = [];
      for (const run of consecutiveRuns(plans)) {
        const perDay = run.map(plan => dayAndNightCover(plan));
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
      // 開始時刻の書かれていない半日料金は、午前・午後を店舗で確かめてもらう（RT04）
      if (
        merged.some(pick => {
          const rental = rentals.find(item => item.id === pick.rentalId);
          return (
            rental?.duration.mode === "half_day" && !rental.duration.start_time
          );
        })
      )
        lineWarnings.push("午前・午後の指定は店舗で確認してください");
      // 開始時刻の決まった半日料金を使ったら、その時刻を添える（朝から滑るなら使えない）
      for (const pick of merged) {
        const rental = rentals.find(item => item.id === pick.rentalId);
        if (rental?.duration.mode === "half_day" && rental.duration.start_time)
          lineWarnings.push(
            `${rental.duration.start_time.replace(/^0/u, "")}からの料金です`,
          );
      }
      // 宿泊者・県民・クーポンなど資格が要る料金は確定には使わず、条件付き候補に出す（RT08）
      const conditional = [
        ...new Set(
          candidates
            .filter(
              rental =>
                rental.target_qualification && rental.price.amount != null,
            )
            .map(
              rental =>
                rental.target_qualification?.official_label_ja ?? "条件付き",
            ),
        ),
      ]
        .map(label => {
          const cover = cheapestCover(
            required,
            candidates
              .filter(
                rental =>
                  fitsDuration(rental, plans[0].duration, () =>
                    windowOf(plans[0]),
                  ) &&
                  rental.price.amount != null &&
                  (!rental.target_qualification ||
                    rental.target_qualification.official_label_ja === label),
              )
              .map(rental => ({
                rental,
                amount: rental.price.amount ?? 0,
                times: 1,
              })),
          );
          return cover
            ? { label, unitTotal: totalOf(cover) * plans.length }
            : null;
        })
        .filter(
          (item): item is { label: string; unitTotal: number } =>
            item != null && item.unitTotal < unitTotal,
        );
      return {
        ...base,
        picks: merged,
        unitTotal,
        subtotal: unitTotal * group.count,
        note: null,
        warnings: [...new Set(lineWarnings)],
        conditional,
        nightAddOns: nightExtras.map(({ plan, cover }) => ({
          date: plan.date,
          picks: cover.map(option => toPick(option, [plan.date])),
          unitTotal: totalOf(cover),
        })),
      };
    };
    const perShop = (shopNames.length > 0 ? shopNames : [""]).map(shop =>
      lineForShop(
        allCandidates.filter(rental => (rental.shop_name_ja ?? "") === shop),
      ),
    );
    const priced = perShop
      .filter(line => line.subtotal != null)
      .sort((left, right) => (left.subtotal ?? 0) - (right.subtotal ?? 0));
    return priced[0] ?? perShop[0];
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
    missingLabels,
    unavailableLabels: [
      ...new Set(
        lines
          .filter(line => line.unavailableLabel)
          .map(line => `${line.groupLabel}の${line.unavailableLabel}`),
      ),
    ],
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
  if (WEAR_HALVES.every(item => available.has(item))) available.add("wear");
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

/**
 * 選んだ用具のうち、このスキー場で借りられない物（料金表にもセット券にも無い物）。
 * レンタル料金を集めていないスキー場（options が null）では選んだ物すべて
 */
export const missingRentalItemsOf = (
  options: TicketRentalOptions | null,
  request: TicketRentalRequest | null | undefined,
) =>
  request
    ? rentalItemsOf(request).filter(
        item => !options?.itemsBySport[request.sport].includes(item),
      )
    : [];

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
