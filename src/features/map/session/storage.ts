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
const filtersSchema = z.object({
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
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
    selectedFeature:
      validId && validId === saved.selectedResortId
        ? saved.selectedFeature
        : null,
    mobileContentTab:
      explicit && explicit !== saved.selectedResortId
        ? "map"
        : saved.mobileContentTab,
  };
}
