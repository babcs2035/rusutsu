import type { CourseDetail, TileLayerId } from "./types";

export const DRAFT_STORAGE_PREFIX = "rusutsu-slope-draft:";
export const TUTORIAL_SEEN_STORAGE_KEY = "rusutsu-slope-tutorial-seen";

export const LEVEL_OPTIONS = [
  "初級",
  "初中級",
  "中級",
  "中上級",
  "上級",
] as const;

export const PISTE_OPTIONS = ["○", "△", "×", ""] as const;
export const BINARY_OPTIONS = ["○", "×", ""] as const;

export const REQUIRED_COURSE_FIELDS = [
  "name",
  "level",
  "morning",
  "night",
  "searchWord",
] as const;

export type RequiredCourseField = (typeof REQUIRED_COURSE_FIELDS)[number];

export const REQUIRED_COURSE_FIELD_LABELS: Record<RequiredCourseField, string> =
  {
    name: "コース名",
    level: "難易度",
    morning: "早朝",
    night: "ナイター",
    searchWord: "検索ワード",
  };

export const COURSE_DETAIL_LABELS: Record<keyof CourseDetail, string> = {
  level: "難易度",
  distance: "滑走距離（m）",
  avg: "平均斜度（°）",
  max: "最大斜度（°）",
  piste: "圧雪",
  morning: "早朝営業",
  night: "ナイター営業",
  image: "画像URL",
  searchWord: "検索ワード",
};

export const PISTE_DESCRIPTIONS: Record<string, string> = {
  "○": "常に圧雪",
  "△": "一部圧雪（コース幅の半分が圧雪・半分が非圧雪のようなイメージ）",
  "×": "未圧雪",
  "": "不明・未入力",
};

// 日本周辺の妥当な座標範囲（これを外れたら警告）
export const JAPAN_BOUNDS = {
  minLng: 122,
  maxLng: 154,
  minLat: 20,
  maxLat: 46,
};

export const UNNAMED_PREFIX = "無名";

export const RESORT_INITIAL_ZOOM = 14;

export const TILE_LAYERS: Record<
  Exclude<TileLayerId, "googleSatellite" | "googleHybrid">,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  gsiPale: {
    label: "地理院地図",
    url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
    maxZoom: 18,
  },
  gsiPhoto: {
    label: "地理院写真",
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
    maxZoom: 18,
  },
  osm: {
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

export const GOOGLE_TILE_LAYERS: Record<
  "googleSatellite" | "googleHybrid",
  { label: string; mapType: "satellite"; layerTypes?: string[] }
> = {
  googleSatellite: { label: "Google 衛星", mapType: "satellite" },
  googleHybrid: {
    label: "Google ハイブリッド",
    mapType: "satellite",
    layerTypes: ["layerRoadmap"],
  },
};

export const TILE_LAYER_ORDER: TileLayerId[] = [
  "gsiPale",
  "gsiPhoto",
  "osm",
  "googleSatellite",
  "googleHybrid",
];
