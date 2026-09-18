import { z } from "zod";
import { TICKET_PARTY_CATEGORIES } from "@/features/lift-ticket/types";

const id = z.string().min(1).max(200);
export const featureSchema = z.object({
  kind: z.enum(["course", "lift"]),
  id,
});
export const viewportSchema = z.object({
  center: z.object({
    lat: z.number().min(-85).max(85),
    lng: z.number().min(-180).max(180),
  }),
  zoom: z.number().min(4).max(17),
  bearing: z.number().min(-180).max(180).default(0),
});
const duration = z.union([
  z.object({ kind: z.literal("day"), withNight: z.boolean() }),
  z.object({ kind: z.literal("hours"), hours: z.number().positive().max(24) }),
]);
const numeric = z.number().nonnegative().nullable();
export const filtersSchema = z.object({
  keyword: z.string().max(500),
  prefectures: z.array(z.string()).max(47),
  status: z.boolean(),
  yukiMagi: z.boolean(),
  beginnerFriendly: z.boolean(),
  minVertical: numeric,
  minBaseElevation: numeric,
  maxBaseElevation: numeric,
  minTopElevation: numeric,
  maxTopElevation: numeric,
  minCourses: numeric,
  minLifts: numeric,
  liftTicket: z.object({
    visitDate: z.string(),
    usePreference: z.enum(["full_day", "half_day"]),
    days: z
      .array(z.object({ id, date: z.string(), duration }))
      .max(31)
      .optional(),
    party: z
      .array(
        z.object({
          id,
          category: z.enum(TICKET_PARTY_CATEGORIES),
          age: numeric,
          count: z.number().int().nonnegative(),
        }),
      )
      .max(100),
  }),
});
export const homeSessionSchema = z.object({
  version: z.literal(1),
  selectedResortId: id.nullable(),
  selectedFeature: featureSchema.nullable(),
  mobileContentTab: z.enum(["info", "map"]),
  filters: filtersSchema,
  mobileDraftFilters: filtersSchema.optional(),
  isMobileFilterOverlayOpen: z.boolean().optional(),
  selectedCompareIds: z.array(id).max(100).optional(),
  isCompareOpen: z.boolean().optional(),
  selectedElevationProfilePoint: z
    .object({
      courseGroupId: id,
      courseName: z.string(),
      coordinate: z.union([
        z.tuple([z.number(), z.number()]),
        z.tuple([z.number(), z.number(), z.number()]),
      ]),
      distance: z.number(),
      elevation: z.number(),
      slope: z.number().nullable(),
    })
    .nullable()
    .optional(),
  mobileSearchReturn: z
    .object({
      mobileContentTab: z.enum(["info", "map"]),
      isListSheetOpen: z.boolean(),
      listSheetSnapPoint: z.union([z.number(), z.string(), z.null()]),
      selectedResortId: id.nullable(),
      isCompareOpen: z.boolean(),
    })
    .nullable()
    .optional(),
  hasSearched: z.boolean(),
  isFilterEditorOpen: z.boolean(),
  isListSheetOpen: z.boolean(),
  listSheetSnapPoint: z.union([
    z.number().min(0).max(1),
    z.string().max(30),
    z.null(),
  ]),
});
export type HomeSession = z.infer<typeof homeSessionSchema>;
export const mapSessionSchema = z.object({
  version: z.literal(1),
  viewport: viewportSchema.nullable(),
  tileVariant: z.enum(["pale", "photo"]),
  courseColorMode: z.enum(["difficulty", "slope"]),
  showOpenOnly: z.boolean(),
});
export const HOME_SESSION_KEY = "rusutsu:home:v1";
export const mapSessionKey = (resortId: string | null) =>
  `rusutsu:map:v1:${resortId ?? "overview"}`;

export function readStorage<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存が禁止・容量超過でも地図の操作は続けられる。
  }
}

export function resolveHomeSession(
  saved: HomeSession | null,
  url: URL,
  resortIds: Set<string>,
): HomeSession | null {
  if (!saved) return null;
  const explicit = url.searchParams.get("resort");
  const selectedResortId = explicit ?? saved.selectedResortId;
  const validId =
    selectedResortId && resortIds.has(selectedResortId)
      ? selectedResortId
      : null;
  return {
    ...saved,
    selectedResortId: validId,
    isMobileFilterOverlayOpen:
      explicit && explicit !== saved.selectedResortId
        ? false
        : saved.isMobileFilterOverlayOpen,
    selectedFeature:
      validId && validId === saved.selectedResortId
        ? saved.selectedFeature
        : null,
    mobileContentTab:
      explicit && explicit !== saved.selectedResortId
        ? "info"
        : saved.mobileContentTab,
  };
}

// opener から複製される sessionStorage も、新規ナビゲーションでは採用しない。
// reload / 履歴復帰は同じタブのセッションとして扱う。時間制限は設けない。
let initialized = false;
const isScreenKey = (key: string) =>
  /^rusutsu:(home|map|expanded|detail|scroll|panel):v1(?::|$)/.test(key);
export function initializeTabSession() {
  if (initialized) return;
  initialized = true;
  try {
    for (const key of Object.keys(localStorage)) {
      if (isScreenKey(key)) localStorage.removeItem(key);
    }
  } catch {
    /* 他用途の下書きは触らない。 */
  }
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "navigate") {
      for (const key of Object.keys(sessionStorage)) {
        if (isScreenKey(key)) sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* 保存禁止でも通常表示する。 */
  }
}

export const RESORT_HISTORY_KEY = `${HOME_SESSION_KEY}:resorts`;
const historySchema = z.array(id).max(2);

/** ホームは履歴に数えない。同じスキー場を再訪したら最新へ移す。 */
export function retainResortSession(resortId: string | null) {
  const previous = readStorage(RESORT_HISTORY_KEY, historySchema) ?? [];
  const retained = resortId
    ? [resortId, ...previous.filter(value => value !== resortId)].slice(0, 2)
    : previous;
  writeStorage(RESORT_HISTORY_KEY, retained);
  try {
    for (const key of Object.keys(sessionStorage)) {
      const owner = screenResortId(key);
      if (owner && !retained.includes(owner)) sessionStorage.removeItem(key);
    }
  } catch {
    /* 保存禁止でも操作は続ける。 */
  }
  return retained;
}

function screenResortId(key: string) {
  const normalized = key.replace(/^rusutsu:scroll:v1:/, "");
  const match = /^rusutsu:(?:map|expanded|detail|panel):v1:([^:]+)/.exec(
    normalized,
  );
  return match && !["overview", "null", "loading"].includes(match[1])
    ? match[1]
    : null;
}
