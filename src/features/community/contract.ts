import { z } from "zod";
import type { AnonymousChallenge } from "@/features/corrections/anonymousCheck";

export const POST_KINDS = {
  REPORT: "滑走レポート",
  MOGUL: "コブ",
  ITEM: "パーク",
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
export const postDraftSchema = z
  .strictObject({
    kind: z.enum(["REPORT", "MOGUL", "ITEM"]),
    courseId: idSchema.nullable().default(null),
    observedOn: observedOnSchema,
    body: z.string().trim().max(4000).default(""),
    snowQualities: z
      .array(z.enum([...SNOW_QUALITIES, ...MOGUL_SNOW]))
      .max(8)
      .default([]),
    conditions: z.array(z.enum(COURSE_CONDITIONS)).max(4).default([]),
    crowding: z.enum(["空いている", "普通", "混雑"]).nullable().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    present: z.boolean().nullable().optional(),
    itemType: z.enum(ITEM_TYPES).nullable().optional(),
    size: z.string().trim().max(100).nullable().optional(),
    parentId: idSchema.nullable().optional(),
  })
  .superRefine((post, ctx) => {
    if (
      post.kind !== "REPORT" &&
      (post.latitude == null || post.longitude == null || post.present == null)
    )
      ctx.addIssue({
        code: "custom",
        message: "地図上の位置と状態を指定してください。",
      });
    if (post.kind === "ITEM" && !post.itemType)
      ctx.addIssue({
        code: "custom",
        message: "アイテムの種類を選んでください。",
      });
    if (
      post.kind === "REPORT" &&
      (post.latitude != null || post.longitude != null || post.parentId)
    )
      ctx.addIssue({
        code: "custom",
        message: "滑走レポートには位置や追加報告を指定できません。",
      });
    if (
      post.kind !== "REPORT" &&
      (post.rating != null || post.crowding || post.conditions.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "評価・混雑・コース状態は滑走レポートで指定してください。",
      });
    const allowed =
      post.kind === "MOGUL"
        ? MOGUL_SNOW
        : post.kind === "REPORT"
          ? SNOW_QUALITIES
          : [];
    if (
      post.snowQualities.some(
        value => !(allowed as readonly string[]).includes(value),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "雪質の選択を確認してください。",
      });
  });
export type PostDraft = z.infer<typeof postDraftSchema>;
export type CourseOption = {
  id: string;
  name: string;
  coordinates: number[][];
};
export type PublicPhoto = { id: string; width: number; height: number };
export type PublicAuthor = { id: string; publicName: string };
export type PublicPost = PostDraft & {
  id: string;
  resortId: string;
  version: number;
  author: PublicAuthor;
  createdAt: string;
  updatedAt: string;
  photos: PublicPhoto[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
  courseName: string | null;
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
  kind?: keyof typeof POST_KINDS;
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
