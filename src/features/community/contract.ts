import { z } from "zod";
import type { AnonymousChallenge } from "@/features/corrections/anonymousCheck";

export const ENTRY_KINDS = {
  COURSE: "コース",
  MOGUL: "コブ",
  ITEM: "パーク",
  LIFT: "リフト",
} as const;
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
// 現地で見たコース・リフトの状況。クローラーの営業状況とは別に持つ。
export const COURSE_STATUSES = ["オープン", "積雪不足", "クローズ"] as const;
export const LIFT_STATUSES = ["オープン", "減速中", "クローズ"] as const;
export const CROWDING = ["空いている", "普通", "混雑"] as const;
export const LIFT_SPEED_LEVELS = ["速い", "普通", "遅い"] as const;
export const MOGUL_DEPTHS = ["浅い", "普通", "深い"] as const;
// バンク・ウェーブなど大きさを言い表しにくいものはサイズ欄を出さない。
export const SIZED_ITEM_TYPES: readonly string[] = [
  "キッカー",
  "レール",
  "ボックス",
  "ハーフパイプ",
  "ウォール",
  "ヒップ・スパイン",
];
export const idSchema = z.string().min(1).max(200);
export const observedTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻を確認してください。");
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
  }, "日付を確認してください。");
// 1回の投稿は1項目。項目ごとに使う欄だけを受け付け、ほかの種類の欄は空にさせる。
export const reportEntrySchema = z
  .strictObject({
    clientKey: z.string().uuid(),
    kind: z.enum(["COURSE", "LIFT", "MOGUL", "ITEM"]),
    courseId: idSchema.nullable().default(null),
    liftId: idSchema.nullable().default(null),
    body: z.string().trim().max(4000).default(""),
    snowQualities: z.array(z.enum(SNOW_QUALITIES)).max(8).default([]),
    status: z
      .enum([...COURSE_STATUSES, ...LIFT_STATUSES])
      .nullable()
      .default(null),
    crowding: z.enum(CROWDING).nullable().default(null),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    itemType: z.enum(ITEM_TYPES).nullable().default(null),
    size: z.string().trim().max(100).nullable().default(null),
    waitMinutes: z.number().int().min(0).max(240).nullable().default(null),
    // m/s。索道の運転速度は高速リフトでも6m/s前後に収まる。
    liftSpeed: z
      .number()
      .min(0.1, "速度は0.1〜12m/sで入力してください。")
      .max(12, "速度は0.1〜12m/sで入力してください。")
      .nullable()
      .default(null),
    liftSpeedLevel: z.enum(LIFT_SPEED_LEVELS).nullable().default(null),
    depth: z.enum(MOGUL_DEPTHS).nullable().default(null),
  })
  .superRefine((entry, ctx) => {
    const fail = (message: string, field: string) =>
      ctx.addIssue({ code: "custom", message, path: [field] });
    const point = entry.kind === "MOGUL" || entry.kind === "ITEM";
    if (entry.kind === "COURSE" && !entry.courseId)
      fail("コースを選択してください。", "courseId");
    if (entry.kind === "LIFT" && !entry.liftId)
      fail("リフトを選択してください。", "liftId");
    if (entry.kind !== "LIFT" && entry.liftId)
      fail("リフトはリフトの項目で指定してください。", "liftId");
    if (entry.kind === "LIFT" && entry.courseId)
      fail("リフトの項目にコースは指定できません。", "courseId");
    if ((entry.latitude == null) !== (entry.longitude == null))
      fail("場所を確認してください。", "latitude");
    if (point && entry.latitude == null)
      fail("地図で場所を指定してください。", "latitude");
    const statuses: readonly string[] =
      entry.kind === "COURSE"
        ? COURSE_STATUSES
        : entry.kind === "LIFT"
          ? LIFT_STATUSES
          : [];
    if (statuses.length && !entry.status)
      fail("状況を選択してください。", "status");
    if (entry.status && !statuses.includes(entry.status))
      fail("状況の選択を確認してください。", "status");
    if (entry.kind === "ITEM" && !entry.itemType)
      fail("アイテムを選択してください。", "itemType");
    if (entry.kind !== "ITEM" && (entry.itemType || entry.size))
      fail("アイテムとサイズはパークの項目で指定してください。", "itemType");
    if (
      entry.kind !== "LIFT" &&
      (entry.waitMinutes != null ||
        entry.liftSpeed != null ||
        entry.liftSpeedLevel)
    )
      fail("待ち時間と速度はリフトの項目で指定してください。", "waitMinutes");
    if (entry.kind === "LIFT" && entry.snowQualities.length)
      fail("雪質はリフトの項目では指定できません。", "snowQualities");
    if (entry.kind !== "COURSE" && entry.crowding)
      fail("混雑状況はコースの項目で指定してください。", "crowding");
    if (entry.kind !== "MOGUL" && entry.depth)
      fail("深さはコブの項目で指定してください。", "depth");
  });
export const reportDraftSchema = z.strictObject({
  observedOn: observedOnSchema,
  observedTime: observedTimeSchema,
  entries: z.tuple([reportEntrySchema]),
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
export type ReportMapTarget =
  | { kind: "COURSE" | "LIFT"; id: string }
  | { kind: "POINT"; coordinates: [number, number]; courseId: string | null };
export type PublicAuthor = { id: string; publicName: string };
export type PublicReportEntry = ReportEntryDraft & {
  id: string;
  targetName: string;
  photos: PublicPhoto[];
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
