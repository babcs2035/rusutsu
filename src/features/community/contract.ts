import { z } from "zod";
import type { AnonymousChallenge } from "@/features/corrections/anonymousCheck";

export const ENTRY_KINDS = {
  COURSE: "コース",
  MOGUL: "コブ",
  ITEM: "パーク",
  LIFT: "リフト",
} as const;
export const POST_KINDS = ENTRY_KINDS;
export const MAX_REPORT_ENTRIES = 40;
export const SNOW_QUALITIES = [
  "パウダー（軽い）",
  "パウダー（重い）",
  "柔らかめ",
  "硬め",
  "アイスバーン",
  "湿り雪",
  "ザラメ",
  "シャバ雪",
] as const;
export const COURSE_CONDITIONS = [
  "荒れている",
  "雪が薄い",
  "コブあり",
  "アイテムあり",
] as const;
export const ITEM_TYPES = [
  "キッカー",
  "レール",
  "ボックス",
  "ハーフパイプ",
  "ウォール",
  "ヒップ・スパイン",
  "バンク",
  "ウェーブ",
  "その他",
] as const;
export const MOGUL_SNOW = ["柔らかい", "硬い", "アイスバーン"] as const;
export const idSchema = z.string().min(1).max(200);
export const observedOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value <= new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    );
  }, "現地確認日を確認してください。");
export const reportEntrySchema = z
  .strictObject({
    clientKey: z.string().uuid(),
    kind: z.enum(["COURSE", "LIFT", "MOGUL", "ITEM"]),
    courseId: idSchema.nullable().default(null),
    liftId: idSchema.nullable().default(null),
    body: z.string().trim().max(4000).default(""),
    snowQualities: z
      .array(z.enum([...SNOW_QUALITIES, ...MOGUL_SNOW]))
      .max(8)
      .default([]),
    conditions: z.array(z.enum(COURSE_CONDITIONS)).max(4).default([]),
    crowding: z.enum(["空いている", "普通", "混雑"]).nullable().default(null),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    present: z.boolean().nullable().default(null),
    itemType: z.enum(ITEM_TYPES).nullable().default(null),
    size: z.string().trim().max(100).nullable().default(null),
    waitMinutes: z.number().int().min(0).max(240).nullable().default(null),
  })
  .superRefine((entry, ctx) => {
    const fail = (message: string, field: string) =>
      ctx.addIssue({ code: "custom", message, path: [field] });
    if (entry.kind === "COURSE" && !entry.courseId)
      fail("コースを選択してください。", "courseId");
    if (entry.kind === "LIFT" && !entry.liftId)
      fail("リフトを選択してください。", "liftId");
    if (entry.kind !== "LIFT" && entry.liftId)
      fail("リフトはリフト項目で指定してください。", "liftId");
    if (entry.kind === "LIFT" && entry.courseId)
      fail("リフト項目にコースは指定できません。", "courseId");
    const point = entry.kind === "MOGUL" || entry.kind === "ITEM";
    if (
      point &&
      (entry.latitude == null ||
        entry.longitude == null ||
        entry.present == null)
    )
      fail("地図上の場所と状態を選択してください。", "latitude");
    if (
      !point &&
      (entry.latitude != null ||
        entry.longitude != null ||
        entry.present != null)
    )
      fail("場所と有無はコブ・パークの項目で指定してください。", "latitude");
    if (entry.kind === "ITEM" && !entry.itemType)
      fail("パークの種類を選択してください。", "itemType");
    if (entry.kind !== "ITEM" && (entry.itemType || entry.size))
      fail("設備の種類とサイズはパークの項目で指定してください。", "itemType");
    if (entry.kind !== "LIFT" && entry.waitMinutes != null)
      fail("待ち時間はリフトの項目で指定してください。", "waitMinutes");
    if (
      point &&
      (entry.rating != null || entry.crowding || entry.conditions.length)
    )
      fail(
        "評価・混雑・コース状態はコースかリフトの項目で指定してください。",
        "rating",
      );
    if (
      entry.kind === "LIFT" &&
      (entry.snowQualities.length || entry.conditions.length)
    )
      fail(
        "雪質・コース状態はコースの項目で指定してください。",
        "snowQualities",
      );
    const allowed =
      entry.kind === "MOGUL"
        ? MOGUL_SNOW
        : entry.kind === "COURSE"
          ? SNOW_QUALITIES
          : [];
    if (
      entry.snowQualities.some(
        value => !(allowed as readonly string[]).includes(value),
      )
    )
      fail("雪質の選択を確認してください。", "snowQualities");
  });
export const reportDraftSchema = z
  .strictObject({
    observedOn: observedOnSchema,
    body: z.string().trim().max(4000).default(""),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    entries: z.array(reportEntrySchema).max(MAX_REPORT_ENTRIES),
  })
  .superRefine((report, ctx) => {
    if (!report.body && !report.entries.length)
      ctx.addIssue({
        code: "custom",
        message:
          "感想を入力するか、コース・リフト・コブ・パークの項目を追加してください。",
        path: ["body"],
      });
    if (
      new Set(report.entries.map(entry => entry.clientKey)).size !==
      report.entries.length
    )
      ctx.addIssue({
        code: "custom",
        message: "項目の識別子が重複しています。",
        path: ["entries"],
      });
    const targets = report.entries
      .filter(entry => entry.kind === "COURSE" || entry.kind === "LIFT")
      .map(entry => `${entry.kind}:${entry.courseId ?? entry.liftId}`);
    if (new Set(targets).size !== targets.length)
      ctx.addIssue({
        code: "custom",
        message: "同じコース・リフトは1つの項目にまとめてください。",
        path: ["entries"],
      });
  });
export type ReportEntryDraft = z.infer<typeof reportEntrySchema>;
export type ReportDraft = z.infer<typeof reportDraftSchema>;
export type CourseOption = {
  id: string;
  name: string;
  coordinates: number[][];
  lines: number[][][];
};
export type LiftOption = CourseOption;
export type CommunityMapData = {
  name: string;
  center: [number, number];
  courses: CourseOption[];
  lifts: LiftOption[];
};
export type PublicPhoto = { id: string; width: number; height: number };
export type PublicAuthor = { id: string; publicName: string };
export type PublicReportEntry = ReportEntryDraft & {
  id: string;
  targetName: string;
};
export type PublicPost = Omit<ReportDraft, "entries"> & {
  id: string;
  resortId: string;
  resortName: string;
  version: number;
  author: PublicAuthor;
  createdAt: string;
  updatedAt: string;
  entries: PublicReportEntry[];
  photos: PublicPhoto[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
};
export type PublicMapEntry = {
  id: string;
  postId: string;
  kind: "MOGUL" | "ITEM";
  observedOn: string;
  body: string;
  latitude: number;
  longitude: number;
  present: boolean;
  itemType: string | null;
  size: string | null;
  targetName: string;
  author: PublicAuthor;
};
export type PublicComment = {
  id: string;
  body: string;
  author: PublicAuthor;
  createdAt: string;
  version: number;
};
export type RatingSummary = {
  courseId: string | null;
  average: number;
  count: number;
};
export type FeedInput = {
  resortId: string;
  courseId?: string;
  liftId?: string;
  kind?: keyof typeof ENTRY_KINDS;
  from?: string;
  to?: string;
  sort?: "created" | "observed";
  authorId?: string;
  cursor?: string;
};
export type CommunityAccount = {
  id: string;
  publicName: string | null;
  nameMode: "GOOGLE" | "NICKNAME" | "ANONYMOUS" | null;
  googleName: string | null;
  suspended: boolean;
};
export type CommunityNotificationDto = {
  id: string;
  postId: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
};
export type ActionResult<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; error: string; challenge?: AnonymousChallenge };

export function latestRatings(
  posts: Array<{
    authorId: string;
    courseId: string | null;
    rating: number | null;
    createdAt: Date | string;
    id: string;
  }>,
): RatingSummary[] {
  const latest = new Map<string, (typeof posts)[number]>();
  for (const post of [...posts].sort(
    (a, b) =>
      +new Date(b.createdAt) - +new Date(a.createdAt) ||
      b.id.localeCompare(a.id),
  )) {
    if (post.rating == null) continue;
    const key = JSON.stringify([post.authorId, post.courseId]);
    if (!latest.has(key)) latest.set(key, post);
  }
  const groups = new Map<string | null, number[]>();
  for (const post of latest.values())
    groups.set(post.courseId, [
      ...(groups.get(post.courseId) ?? []),
      post.rating as number,
    ]);
  return [...groups].map(([courseId, values]) => ({
    courseId,
    average: values.reduce((a, b) => a + b, 0) / values.length,
    count: values.length,
  }));
}
