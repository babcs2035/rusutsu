import type { LngLat } from "@/features/slope/types";

export type { LngLat };

// lift_detail 由来の詳細情報。編集中はすべて文字列で保持し、
// 保存時に数値化できるものは数値へ戻す（既存データの形式に合わせる）
export type LiftDetail = {
  speed: string;
  type: string;
  hood: string;
  capacity: string;
  distance: string;
  vertical: string;
  top: string;
  bottom: string;
  footrest: string;
  towers: string;
  oilShield: string;
  maker: string;
  year: string;
  note: string;
  searchWord: string;
  link: string;
  morning: string;
  night: string;
};

export type LiftDetailKey = keyof LiftDetail;

// lift_detail のエントリをどうやって対応付けたか
export type DetailMatchMethod = "name" | "manual";

export type EditorLift = {
  id: string;
  // 読み込み時点の lift_before ファイル内でのインデックス（新規追加リフトは -1）
  sourceIndex: number;
  // このセッションで新規追加したリフト
  isNew?: boolean;
  // 既存リフトの削除予定。下書きでも削除状態を維持するため配列には残す
  isDeleted?: boolean;
  name: string;
  // OSM 由来の @id。ユーザーは変更しない
  osmId: string | null;
  // 現在の所属スキー場（編集対象）
  skiId: string;
  coordinates: LngLat[];
  // 中間駅の位置（無い場合は null）
  midstation: LngLat | null;
  // 読み込んだ properties.midstation の生の値。
  // 未変更のまま保存するときは（標高値付き配列などを壊さないよう）これを書き戻す
  midstationRaw: unknown;
  detail: LiftDetail;
  // name / @id / 詳細フィールド以外の元 properties（aerialway も含めそのまま保存へ引き継ぐ）
  extras: Record<string, unknown>;
  // lift_detail との結合情報
  detailMatch: {
    method: DetailMatchMethod;
    detailName: string;
    // 結合元エントリの lift_detail 配列内インデックス
    entryIndex: number;
    // lift_detail 側から取り込まれた値（確認画面用）
    mergedFields: Partial<LiftDetail>;
  } | null;
  // 読み込み時点の状態（変更差分・取り消し用）
  original: {
    skiId: string;
    name: string;
    coordinates: LngLat[];
    midstation: LngLat | null;
    detail: LiftDetail;
  };
};

export type LiftDetailEntry = Record<string, unknown> & {
  resort?: string;
  name?: string;
};

export type LiftBeforeFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

export type LiftBeforeGeojson = {
  type: "FeatureCollection";
  features: LiftBeforeFeature[];
};

export type LiftSourceData = {
  geojson: LiftBeforeGeojson | null;
  details: LiftDetailEntry[] | null;
  // 読み込み時のファイル内容ハッシュ。保存時に競合検出へ使う
  fileHash: string | null;
};

export type ResortOption = {
  id: string;
  nameJa: string;
  // 検索ワードの先頭に使う名前（地図表示用の省略名を優先）
  searchName: string;
  nameEn: string;
  prefecture: string;
  latitude: number;
  longitude: number;
  hasLiftBefore: boolean;
  // lift_confirmed.json 由来。確認済みにした日時（未確認なら null）
  confirmedAt: string | null;
  // false の場合、id が DB の SkiResort に存在しない
  // （shiga-kogen-central のような意図的な仮 ID で、lift_before だけが存在する）
  isKnownResort: boolean;
};

export type EditStep =
  | "select"
  | "assign"
  | "geometry"
  | "details"
  | "links"
  | "confirm";

// スキー場全体の参考リンク（lift_before/lift_detail とは別に SkiResortLinks.json へ保存）
// description は「スクールブログ」など、URLだけでは用途が分かりにくい場合にのみ付ける
export type ResortLink = {
  url: string;
  description?: string;
};

// 各項目とも複数リンクを持ちうるため配列で保持する
export type ResortLinks = {
  officialSiteUrls: ResortLink[];
  mapUrls: ResortLink[];
  skiSchoolUrls: ResortLink[];
  snowboardSchoolUrls: ResortLink[];
  skiResortInfoUrls: ResortLink[];
  espeYukiUrls: ResortLink[];
  gelandePlusTubeUrls: ResortLink[];
  youtubeUrls: ResortLink[];
  lineUrls: ResortLink[];
  xUrls: ResortLink[];
  threadsUrls: ResortLink[];
  instagramUrls: ResortLink[];
  facebookUrls: ResortLink[];
};

// 保存時にサーバーへ送る 1 リフト分のデータ
export type SaveLiftPayload = {
  targetSkiId: string;
  properties: Record<string, unknown>;
  coordinates: LngLat[];
};

export type SaveRequest = {
  resortId: string;
  // loadLiftSourceData が返したハッシュ。ファイルが書き換わっていたら保存を中止する
  fileHash: string | null;
  lifts: SaveLiftPayload[];
};

export type SaveResult =
  | { ok: true; writtenFiles: string[] }
  | { ok: false; errors: string[] };

export type LiftEditDraft = {
  version: 1;
  resortId: string;
  fileHash: string | null;
  lifts: EditorLift[];
  updatedAt: string;
  savedToServerAt: string | null;
};

export type DraftSummary = {
  resortId: string;
  updatedAt: string;
  liftCount: number;
};
