export const TICKET_PARTY_CATEGORIES = [
  "preschool",
  "elementary",
  "junior_high",
  "high_school",
  "university",
  "adult",
  "disabled",
  "other",
] as const;

export type TicketPartyCategory = (typeof TICKET_PARTY_CATEGORIES)[number];

export type TicketPartyGroup = {
  id: string;
  category: TicketPartyCategory;
  age: number | null;
  count: number;
};

export type TicketUsePreference = "full_day" | "half_day";

/**
 * 「どれくらい滑るか」の要件。
 * 券種名を選ばせるのではなく**滑る長さ**を入力してもらい、
 * それを満たす券の中から最安を出す（「7時間」なら9時間券が候補になる）。
 *
 * - `day`: 1日券。ナイターを含むかで別の券になるので `withNight` で区別する
 * - `hours`: N時間以上滑れる券
 * - `days`: 複数日券（連続2日券など）の探索に使う内部用
 * - `product`: 券種を直接指定する内部用
 */
export type TicketDurationRequest =
  | { kind: "day"; withNight: boolean }
  | { kind: "hours"; hours: number }
  | { kind: "days"; days: number }
  | { kind: "product"; productId: string };

/** 画面で選べるのは「1日（ナイター無/込）」と「N時間」の3択 */
export type TicketDayDuration =
  | { kind: "day"; withNight: boolean }
  | { kind: "hours"; hours: number };

/**
 * 1日ぶんの計画。
 * ★**2日以上滑る場合、連続して滑るのか別の日に滑るのかで使える券が変わる**
 * （連続2日券は連続した日にしか使えない）。だから日付を並べて持つ。
 */
export type TicketDayPlan = {
  id: string;
  date: string;
  duration: TicketDayDuration;
};

export type LiftTicketSearchInput = {
  /** 1日目の日付。他画面（絞り込み・比較）が単日の計算に使う */
  visitDate: string;
  usePreference: TicketUsePreference;
  /** 日ごとの計画。指定があれば複数日の計算に使う */
  days?: TicketDayPlan[];
  party: TicketPartyGroup[];
};

export type LiftTicketAudience = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  school_levels?: string[];
  /** 障がい者本人・対象介護者向け料金を検索する人物区分 */
  is_disability_qualified?: boolean;
  /** 資格料金が無い場合に使う通常人物区分 */
  base_audience_id?: string | null;
  is_default?: boolean;
  notes_ja?: string | null;
};

export type LiftTicketCalendar = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  included_day_types?: string[];
  included_dates?: string[];
  included_date_ranges?: Array<{ start: string; end: string }>;
  excluded_dates?: string[];
  excluded_date_ranges?: Array<{ start: string; end: string }>;
  notes_ja?: string | null;
};

export type LiftTicketValidity = {
  mode?: string;
  hours?: number | null;
  days?: number | null;
  rides?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  /** 分割して使える券をいつまでに使い切るか（公式表記のまま）。当日券には書かない */
  usable_within_ja?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketProduct = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  validity?: LiftTicketValidity;
  area_ids?: string[];
  /** この券の営業区分（1日券・複数日券・fixed_time_window に設定） */
  covers_hours_types?: string[] | null;
  included_items?: Array<{
    type?: string;
    name_ja: string;
    description_ja?: string | null;
    notes_ja?: string | null;
  }>;
  shared_with_resorts?: Array<{
    /** 相手スキー場の SkiResort.id。マスタに無い場合のみ null */
    resort_id?: string | null;
    name_ja?: string;
  }>;
  notes_ja?: string | null;
};

/**
 * 「当日券・回数券」か「セット券・共通券」かの区別。
 * かつて product_type という分類フィールドで判定していたが、
 * 付属物 (included_items) と共通券 (shared_with_resorts) から導出できるため廃止した。
 */
export const isDailyLiftTicketProduct = (product?: LiftTicketProduct) =>
  (product?.included_items?.length ?? 0) === 0 &&
  (product?.shared_with_resorts?.length ?? 0) === 0;

/**
 * その券が共通券か（他のスキー場でも使えるか）。
 * 苗場とかぐらのように単独券と共通券の両方を売るスキー場があるため、
 * 画面では単独券／共通券を選ばせる。**分類ラベルは持たない** —
 * shared_with_resorts が空かどうかで決まる。
 */
export const isSharedLiftTicketProduct = (product?: LiftTicketProduct) =>
  (product?.shared_with_resorts?.length ?? 0) > 0;

/** 画面に出す「共通券で滑れる相手スキー場」の一覧（重複を除く） */
export const sharedResortsOf = (products: LiftTicketProduct[]) => {
  const seen = new Map<string, { resortId: string | null; nameJa: string }>();
  for (const product of products) {
    for (const partner of product.shared_with_resorts ?? []) {
      const key = partner.resort_id ?? partner.name_ja ?? "";
      if (key === "" || seen.has(key)) continue;
      seen.set(key, {
        resortId: partner.resort_id ?? null,
        nameJa: partner.name_ja ?? key,
      });
    }
  }
  return [...seen.values()];
};

export type LiftTicketChannel = {
  id: string;
  name_ja: string;
  url?: string | null;
  purchase_deadline_ja?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketPeriod = {
  start?: string | null;
  end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  deadline_ja?: string | null;
  notes_ja?: string | null;
};

/**
 * offerの対象者を絞り込む条件。機械的に判定できるのは性別だけ (target_genders) で、
 * 地域住民・宿泊者・会員などは照会の入力から判定できないため、分類せず
 * 公式表記のまま target_qualification に置く。
 * どちらかが設定されているofferは「誰でも買える」わけではないので代表価格にしない。
 */
export type LiftTicketTarget = {
  official_label_ja?: string | null;
  description_ja?: string | null;
  /**
   * 「20才」等の年度生まれキャンペーンを年齢検索へ結び付ける名目年齢。
   * 厳密な対象判定は official_label_ja の生年月日範囲を警告して利用者に委ねる。
   */
  nominal_age?: number | null;
  genders?: string[];
  notes_ja?: string | null;
};

export type LiftTicketPrice = {
  currency?: string;
  amount?: number | null;
  base_offer_id?: string | null;
  /** 金額か割合かの判別子は持たない。どちらか一方だけを設定する */
  discount?: {
    amount?: number | null;
    percent?: number | null;
  };
  range?: {
    min?: number | null;
    max?: number | null;
  } | null;
  live_lookup_required?: boolean;
  live_lookup_url?: string | null;
  observed_amount?: number | null;
  notes_ja?: string | null;
};

/**
 * 料金の種類を、どのフィールドが埋まっているかから決める。
 * かつて price.mode という分類フィールドがあったが、実データ290件で例外なく
 * 導出でき、しかも「mode: free なのに amount: 500」のような内部矛盾を
 * 書けてしまう穴だった。導出にすればその矛盾は構造的に書けない。
 */
export const priceModeOf = (price?: LiftTicketPrice) => {
  // date_table は廃止（1 offer = 1 金額。日付で変わるならカレンダーごとに offer を分ける）
  if (price?.live_lookup_required === true) return "live_dynamic";
  if (price?.base_offer_id != null) return "derived_discount";
  if (price?.range != null) return "range";
  if (price?.amount === 0) return "free";
  if (typeof price?.amount === "number") return "fixed";
  return "unknown";
};

export type LiftTicketOffer = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  discount_reasons?: string[];
  product_id: string;
  audience_ids?: string[];
  calendar_ids?: string[];
  channel_ids?: string[];
  target_genders?: LiftTicketTarget | null;
  target_qualification?: LiftTicketTarget | null;
  sales_period?: LiftTicketPeriod | null;
  use_period?: LiftTicketPeriod | null;
  /** 期限の表し方を分類するラベルは持たない */
  purchase_deadline?: {
    /** true=当日購入可 / false=前日以前 / null=公式に記載なし */
    same_day_allowed?: boolean | null;
    /** 利用日の何日前までに買う必要があるか（1日単位）。当日内の分単位の期限は含めない */
    days_before_use?: number | null;
    /** 「〇月〇日まで販売」のような利用日と無関係な固定期限 */
    deadline_date?: string | null;
    official_text_ja?: string | null;
  } | null;
  price?: LiftTicketPrice;
  requirements?: Array<{
    description_ja?: string;
    /** 提示・持参が必要なものを公式表記のまま（種類の分類ラベルは持たない） */
    proof_ja?: string | null;
  }>;
  /** 根拠資料（sources[].id）。画面の出典番号 [1] [2] に使う */
  source_refs?: string[];
  notes_ja?: string | null;
};

export type LiftTicketFee = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  /** 返ってこない負担額。返金される保証金は fees に記録しないのでフラグを持たない */
  amount?: number | null;
  currency?: string;
  applies_to_product_ids?: string[];
  notes_ja?: string | null;
};

export type LiftTicketSource = {
  id: string;
  url?: string | null;
  /** 取得時のページタイトル。出典のホバー表示に使う */
  page_title?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketData = {
  schema_version: string;
  // スキー場の名称・都道府県・公式サイトURLは SkiResort マスタが正本なので持たない
  resort: {
    id: string;
  };
  season: {
    id: string;
    label_ja: string;
    start_date?: string | null;
    end_date?: string | null;
    notes_ja?: string | null;
  };
  sources?: LiftTicketSource[];
  /** 営業時間・ナイター・定休日。1日券が何時間滑れるかの算出元 */
  operating_hours?: Array<{
    id: string;
    hours_type?: string;
    calendar_ids?: string[];
    start_time?: string | null;
    end_time?: string | null;
  }>;
  audiences: LiftTicketAudience[];
  calendars: LiftTicketCalendar[];
  products: LiftTicketProduct[];
  channels: LiftTicketChannel[];
  offers: LiftTicketOffer[];
  party_rules: Array<{
    id: string;
    name_ja: string;
    official_label_ja?: string | null;
    description_ja?: string | null;
  }>;
  fees: LiftTicketFee[];
  calculation_policy?: {
    currency?: string;
    tax_included?: boolean | null;
    best_price_hint_ja?: string | null;
    notes_ja?: string | null;
  };
  data_quality: {
    /** complete（そのまま使える）/ needs_review（人間の確認が必要）/ failed（取得できず） */
    status: "complete" | "needs_review" | "failed";
    last_verified_at?: string | null;
    unresolved_questions?: Array<{
      id: string;
      question_ja: string;
      related_ids?: string[];
    }>;
    /** 何を・なぜ・どこを見れば確認できるかを必ず書く（confidence ラベルの代替） */
    human_review_required?: Array<{
      what_ja: string;
      why_ja: string;
      where_ja: string;
      related_ids?: string[];
    }>;
    notes_ja?: string | null;
  };
};

export type PriceReference = {
  number: number;
  url: string;
  /** 取得時のページタイトル。ホバー表示に使う */
  title: string | null;
};

export type TicketCalculationLine = {
  groupId: string;
  groupLabel: string;
  count: number;
  audienceName: string | null;
  productName: string | null;
  offerName: string | null;
  unitAmount: number | null;
  subtotal: number | null;
  note: string | null;
  /** 年齢世代割引などを自動適用した場合の、割引前の通常料金 */
  standardOfferName?: string | null;
  standardUnitAmount?: number | null;
  standardSubtotal?: number | null;
  /** 自動適用した料金について、利用者が確認すべき条件 */
  warnings?: string[];
  /** 出典番号（画面の [1] 表示用）。料金表と同じ番号を使う */
  sourceNumbers: number[];
};

export type TicketConditionalOffer = {
  id: string;
  groupId: string;
  groupLabel: string;
  count: number;
  productName: string;
  offerName: string;
  unitAmount: number;
  subtotal: number;
  /** 宿泊・会員・購入期限など、照会入力だけでは確定できない適用条件 */
  conditions: string[];
  sourceNumbers: number[];
};

export type TicketCalculationFee = {
  name: string;
  amount: number;
  /** 人数分の合計。返ってこない負担だけが fees に載る */
  total: number;
};

export type TicketCalculationResult = {
  status: "complete" | "partial" | "unavailable" | "outside_season" | "closed";
  visitDate: string;
  seasonLabel: string;
  productId: string | null;
  productName: string | null;
  lines: TicketCalculationLine[];
  fees: TicketCalculationFee[];
  ticketTotal: number | null;
  knownTicketTotal: number;
  /** 実質負担（券の合計 ＋ 返ってこない追加費用） */
  payableTotal: number | null;
  partyCount: number;
  conditionalOffers: TicketConditionalOffer[];
  /** @deprecated 表示互換用。詳細は conditionalOffers を使う */
  conditionalOfferNames: string[];
  notes: string[];
  /** 料金の根拠。計算結果カードの [1] と一覧に使う */
  references: PriceReference[];
};
