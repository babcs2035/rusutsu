import type { LiftDetailKey, ResortLinks } from "./types";

export const LIFT_TUTORIAL_SEEN_STORAGE_KEY = "rusutsu-lift-tutorial-seen";

export const DRAFT_STORAGE_PREFIX = "rusutsu-lift-draft:";

export const SPEED_OPTIONS = ["高速", "低速", ""] as const;
export const TYPE_OPTIONS = [
  "リフト",
  "ゴンドラ",
  "ロープウェイ",
  "コンビ",
  "ケーブルカー",
  "シュレップ",
  "ロープトゥ",
  "",
] as const;
export const MARK_OPTIONS = ["○", "×", ""] as const;
export const BUSINESS_HOURS_MARK_OPTIONS = ["○", "×", "?", ""] as const;
export const MAKER_OPTIONS = [
  "日本ケーブル",
  "安全索道",
  "東京索道",
  "JFE",
  "三菱重工業",
  "",
] as const;

// 保存時に数値へ戻すフィールド（既存 lift_detail の型に合わせる）
export const NUMERIC_DETAIL_KEYS: LiftDetailKey[] = [
  "capacity",
  "distance",
  "vertical",
  "towers",
  "year",
  "top",
  "bottom",
];

// lift_detail 側を優先して結合する詳細フィールドの一覧
export const DETAIL_KEYS: LiftDetailKey[] = [
  "speed",
  "type",
  "hood",
  "capacity",
  "distance",
  "vertical",
  "top",
  "bottom",
  "footrest",
  "towers",
  "oilShield",
  "maker",
  "year",
  "note",
  "searchWord",
  "link",
  "morning",
  "night",
];

export const DETAIL_LABELS: Record<LiftDetailKey, string> = {
  speed: "速度",
  type: "種類",
  hood: "フード",
  capacity: "定員（人）",
  distance: "距離（m）",
  vertical: "標高差（m）",
  top: "山頂駅",
  bottom: "山麓駅",
  footrest: "フットレスト",
  towers: "支柱数",
  oilShield: "オイルシールド",
  maker: "メーカー",
  year: "設置年",
  note: "備考",
  searchWord: "検索ワード",
  link: "リンク",
  morning: "早朝営業",
  night: "ナイター営業",
};

// 手順4を終える前に入力状況を確認する項目。
// 空欄のままでも、警告を確認したうえで次へ進むことはできる。
export const REQUIRED_DETAIL_KEYS = [
  "type",
  "speed",
  "capacity",
  "distance",
  "hood",
  "morning",
  "night",
  "searchWord",
] as const satisfies readonly LiftDetailKey[];

// コース入力と同じ地図・同じズーム基準なので、値はあちらを正とする
export { RESORT_INITIAL_ZOOM } from "@/features/slope/constants";

// 表示・入力順。読み込み・保存側もこの一覧を正とする
export const RESORT_LINK_KEYS: Array<keyof ResortLinks> = [
  "officialSiteUrls",
  "mapUrls",
  "skiSchoolUrls",
  "snowboardSchoolUrls",
  "skiResortInfoUrls",
  "espeYukiUrls",
  "gelandePlusTubeUrls",
  "youtubeUrls",
  "lineUrls",
  "xUrls",
  "threadsUrls",
  "instagramUrls",
  "facebookUrls",
];

export const EMPTY_RESORT_LINKS: ResortLinks = {
  officialSiteUrls: [],
  mapUrls: [],
  skiSchoolUrls: [],
  snowboardSchoolUrls: [],
  skiResortInfoUrls: [],
  espeYukiUrls: [],
  gelandePlusTubeUrls: [],
  youtubeUrls: [],
  lineUrls: [],
  xUrls: [],
  threadsUrls: [],
  instagramUrls: [],
  facebookUrls: [],
};

export const RESORT_LINK_LABELS: Record<keyof ResortLinks, string> = {
  officialSiteUrls: "公式サイト",
  mapUrls: "マップ",
  skiSchoolUrls: "スキースクール",
  snowboardSchoolUrls: "スノーボードスクール",
  skiResortInfoUrls: "スキー場情報局",
  espeYukiUrls: "えすぺゆき",
  gelandePlusTubeUrls: "ゲレンデ+.tube",
  youtubeUrls: "YouTube公式アカウント",
  lineUrls: "公式LINE",
  xUrls: "X",
  threadsUrls: "Threads",
  instagramUrls: "Instagram",
  facebookUrls: "Facebook",
};
