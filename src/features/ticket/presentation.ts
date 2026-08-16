/**
 * 画面表示のための情報だけを置く。
 *
 * ★**構造・必須・enumの中身はここに書かない。** それらは schema と
 * taxonomy.json が正本で、`server/schemaSpec.ts` が読み取って渡してくる。
 * ここにあるのは「日本語の見出し」「どのタブに出すか」「どのID参照が
 * どのコレクションを指すか」といった、schemaから決められない表示上の都合だけ。
 *
 * ここに載っていないキーは**キー名のまま表示される**（隠したり捨てたりしない）。
 * schema にフィールドが増えても編集できる状態を保つためで、
 * 訳語を足すのは後追いでよい。
 */

export type TicketSectionKind = "object" | "array";

export type TicketSection = {
  /** ルートJSONのキー。overview は複数キーをまとめた仮想セクション */
  id: string;
  title: string;
  kind: TicketSectionKind;
  /** overview のように複数のルートキーを1画面に出す場合に使う */
  keys: string[];
  description: string;
};

export const TICKET_SECTIONS: TicketSection[] = [
  {
    id: "overview",
    title: "概要",
    kind: "object",
    keys: [
      "schema_version",
      "taxonomy_version",
      "resort",
      "season",
      "calculation_policy",
    ],
    description:
      "スキー場ID・シーズン・料金計算全体の方針。1スキー場 × 1シーズン × 1ファイル。",
  },
  {
    id: "sources",
    title: "保存資料",
    kind: "array",
    keys: ["sources"],
    description:
      "料金の根拠。ここの id を各項目の source_refs から参照する。url と path は必須。",
  },
  {
    id: "audiences",
    title: "人物区分",
    kind: "array",
    keys: ["audiences"],
    description:
      "年齢・学校区分で決まる料金表の行。is_default はちょうど1件（どの条件にも当てはまらない人が買う区分）。性別・地域条件はここに入れない。",
  },
  {
    id: "calendars",
    title: "適用日",
    kind: "array",
    keys: ["calendars"],
    description:
      "平日・土日祝・年末年始・特定日などの日付集合。weekday は年末年始を飲み込むため、年末年始は別カレンダーで明示し、平日側の除外とペアにする。",
  },
  {
    id: "operating_hours",
    title: "営業時間",
    kind: "array",
    keys: ["operating_hours"],
    description:
      "その日の営業時間・ナイター・定休日。1日券が何時間滑れるかの算出元でもある。",
  },
  {
    id: "areas",
    title: "エリア",
    kind: "array",
    keys: ["areas"],
    description:
      "券の利用可能範囲。公式資料に範囲の記載が無ければ空のままにする。",
  },
  {
    id: "products",
    title: "券種",
    kind: "array",
    keys: ["products"],
    description:
      "料金以前の券の種類。validity が唯一の分類軸。付帯品は included_items、共通券は shared_with_resorts で表す。",
  },
  {
    id: "channels",
    title: "購入経路",
    kind: "array",
    keys: ["channels"],
    description:
      "その料金をどこで買えるか。オンライン割引の offer が参照する経路には url が必要。",
  },
  {
    id: "offers",
    title: "料金",
    kind: "array",
    keys: ["offers"],
    description:
      "誰が・どの券を・いつ使い・どこで買い・いくらか。1つの offer は1つの金額を持つ（日付で変わるならカレンダーごとに分ける）。",
  },
  {
    id: "party_rules",
    title: "同行者ルール",
    kind: "array",
    keys: ["party_rules"],
    description:
      "ファミリーパック・団体料金・同伴者無料など、同行者構成で変わる料金。",
  },
  {
    id: "fees",
    title: "追加費用",
    kind: "array",
    keys: ["fees"],
    description:
      "券とは別に払う「返ってこない負担」だけ。返金される保証金・紛失時の再発行手数料は記録しない。",
  },
  {
    id: "data_quality",
    title: "データ品質",
    kind: "object",
    keys: ["data_quality"],
    description:
      "human_review_required が1件でもあれば status を complete にできない。確認事項は「何を・なぜ・どこを見れば」の3点セットで書く。",
  },
];

/** キー名 → 日本語の見出し。無いキーはキー名のまま表示する */
export const KEY_LABELS: Record<string, string> = {
  schema_version: "スキーマ版",
  taxonomy_version: "taxonomy版",
  resort: "スキー場",
  season: "シーズン",
  sources: "保存資料",
  audiences: "人物区分",
  calendars: "適用日",
  operating_hours: "営業時間",
  areas: "エリア",
  products: "券種",
  channels: "購入経路",
  offers: "料金",
  party_rules: "同行者ルール",
  fees: "追加費用",
  calculation_policy: "計算方針",
  data_quality: "データ品質",

  id: "ID",
  name_ja: "名称",
  official_label_ja: "公式表記",
  description_ja: "説明",
  notes_ja: "備考",
  source_refs: "根拠資料",
  url: "URL",
  path: "保存パス",
  label_ja: "表示名",
  start: "開始日",
  end: "終了日",
  start_date: "開始日",
  end_date: "終了日",
  start_time: "開始時刻",
  end_time: "終了時刻",

  requested_url: "リクエストURL",
  final_url: "最終URL",
  page_title: "ページタイトル",
  http_status: "HTTPステータス",
  captured_at: "取得時刻",
  content_type: "Content-Type",
  content_hash: "内容ハッシュ",
  linked_from_source_id: "リンク元資料",
  user_specified: "ユーザー指定URL",
  capture_success: "取得成功",

  age_min: "年齢下限",
  age_max: "年齢上限",
  age_basis_ja: "年齢の基準",
  school_levels: "学校区分",
  allow_age_overlap: "年齢の重複を許可",
  is_default: "既定区分（1件だけ）",
  is_disability_qualified: "障がい者資格の区分",
  base_audience_id: "資格料金が無い場合の区分",

  included_day_types: "対象の曜日・区分",
  included_dates: "対象日（明示）",
  included_date_ranges: "対象期間",
  excluded_dates: "除外日",
  excluded_date_ranges: "除外期間",

  hours_type: "営業区分",
  calendar_ids: "適用日",
  lifts: "リフト別の運行時間",
  operating: "運行する",

  validity: "有効範囲",
  mode: "有効範囲の種別",
  hours: "時間数",
  days: "日数",
  points: "ポイント数",
  rides: "回数",
  usable_within_ja: "使い切り期限（公式表記）",
  area_ids: "利用可能エリア",
  included_items: "付帯サービス",
  type: "種別",
  value_amount: "相当額",
  shared_with_resorts: "共通券の相手スキー場",
  resort_id: "相手スキー場ID",
  covers_hours_types: "カバーする営業区分",

  location_ja: "場所",
  purchase_deadline_ja: "購入期限（公式表記）",

  discount_reasons: "割引理由",
  product_id: "券種",
  audience_ids: "人物区分",
  channel_ids: "購入経路",
  target_genders: "性別の絞り込み",
  genders: "対象の性別",
  target_qualification: "資格の絞り込み",
  sales_period: "販売期間",
  use_period: "利用期間",
  deadline_ja: "期限（公式表記）",
  purchase_deadline: "購入期限",
  same_day_allowed: "当日購入可",
  days_before_use: "利用日の何日前まで",
  deadline_date: "固定の販売期限",
  official_text_ja: "公式表記",
  price: "料金",
  currency: "通貨",
  amount: "金額",
  base_offer_id: "基準となる料金",
  discount: "割引",
  percent: "割引率(%)",
  range: "金額の幅",
  min: "下限",
  max: "上限",
  live_lookup_required: "変動価格（要照会）",
  live_lookup_url: "照会URL",
  observed_at: "観測時刻",
  observed_amount: "観測金額",
  requirements: "必要な手続き・持ち物",
  proof_ja: "提示・持参するもの",
  stacking: "他割引との併用",
  stackable_with_other_discounts: "併用可否",

  components: "構成員",
  role_ja: "役割",
  product_ids: "券種",
  offer_ids: "料金",
  min_count: "最少人数",
  max_count: "最多人数",
  per_qualifying_count: "対象者1人あたりの人数",
  price_effect: "料金への効き方",

  applies_to_product_ids: "対象の券種",
  applies_to_channel_ids: "対象の購入経路",

  tax_included: "税込",
  stacking_default: "併用可否の既定値",
  best_price_hint_ja: "最安提示のヒント",

  status: "状態",
  generated_at: "生成時刻",
  last_verified_at: "最終確認時刻",
  unresolved_questions: "未解決事項",
  question_ja: "内容",
  related_ids: "関連ID",
  illegible_items: "判読不能箇所",
  related_offer_ids: "関係する料金",
  human_review_required: "人間による確認が必要",
  what_ja: "何を確認するか",
  why_ja: "なぜ確定できなかったか",
  where_ja: "どこを見れば確認できるか",
};

export const labelOf = (key: string): string => KEY_LABELS[key] ?? key;

/**
 * ID参照フィールド → 参照先。
 * ★ID参照は**必ず既存項目からの選択**にする。自由入力にすると
 * 存在しないIDを書けてしまい、coverage / taxonomy チェックが落ちるJSONを
 * 人手で作ることになる。
 */
export const ID_REF_TARGETS: Record<string, string> = {
  source_refs: "sources",
  linked_from_source_id: "sources",
  audience_ids: "audiences",
  base_audience_id: "audiences",
  calendar_ids: "calendars",
  channel_ids: "channels",
  applies_to_channel_ids: "channels",
  product_id: "products",
  product_ids: "products",
  applies_to_product_ids: "products",
  base_offer_id: "offers",
  offer_ids: "offers",
  related_offer_ids: "offers",
  area_ids: "areas",
  // related_ids は offer / audience / product などを横断して指す
  related_ids: "any",
};

/** 複数行で入力させる文章フィールド */
export const MULTILINE_KEYS = new Set([
  "notes_ja",
  "description_ja",
  "question_ja",
  "what_ja",
  "why_ja",
  "where_ja",
  "best_price_hint_ja",
  "age_basis_ja",
  "official_text_ja",
  "deadline_ja",
  "purchase_deadline_ja",
  "usable_within_ja",
  "proof_ja",
]);

/** 折りたたみ時の見出しに使うキー（先に見つかったものを使う） */
export const ITEM_TITLE_KEYS = [
  "name_ja",
  "what_ja",
  "question_ja",
  "role_ja",
  "description_ja",
  "id",
];
