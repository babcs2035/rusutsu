import { z } from "zod";
import {
  type CommunityAccount,
  type CommunityMapData,
  type CommunityNotificationDto,
  idSchema,
  mapEntriesInputSchema,
  observedOnSchema,
  type PublicComment,
  type PublicMapEntry,
  type PublicPost,
  reportDraftSchema,
  reportEntrySchema,
} from "@/features/community/contract";

export const COMMUNITY_API_PATH = "/api/internal/v1/community";
export const MAX_COMMAND_JSON_BYTES = 1024 * 1024;
export const MAX_MULTIPART_BYTES = 8 * 1024 * 1024 + 1024 * 1024;

const versionSchema = z.number().int().positive();
const operationKeySchema = z.string().uuid();
const modeSchema = z.enum(["GOOGLE", "NICKNAME", "ANONYMOUS"]);
const reportReasonSchema = z.enum([
  "不適切な内容",
  "迷惑行為",
  "個人情報",
  "その他",
]);
const anonymousProofSchema = z
  .strictObject({
    token: z.string().min(1).max(2000),
    nonce: z.string().min(1).max(32),
  })
  .optional();

const feedInputSchema = z.strictObject({
  resortId: idSchema,
  courseId: idSchema.optional(),
  liftId: idSchema.optional(),
  kind: z.enum(["COURSE", "MOGUL", "ITEM", "LIFT"]).optional(),
  from: observedOnSchema.optional(),
  to: observedOnSchema.optional(),
  sort: z.enum(["created", "observed"]).optional(),
  authorId: idSchema.optional(),
  cursor: idSchema.optional(),
});
const publishInputSchema = z.strictObject({
  resortId: idSchema,
  report: reportDraftSchema,
  idempotencyKey: operationKeySchema,
});
const updateInputSchema = z.strictObject({
  postId: idSchema,
  version: versionSchema,
  report: reportDraftSchema,
  removePhotoIds: z.array(idSchema).max(6),
});
const commandSchemaBase = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("courses"), resortId: idSchema }),
  z.strictObject({ operation: z.literal("feed"), input: feedInputSchema }),
  z.strictObject({
    operation: z.literal("mapEntries"),
    input: mapEntriesInputSchema,
  }),
  z.strictObject({ operation: z.literal("mapSummary"), resortId: idSchema }),
  z.strictObject({ operation: z.literal("account") }),
  z.strictObject({
    operation: z.literal("profile"),
    mode: modeSchema,
    nickname: z.string().max(40),
  }),
  z.strictObject({
    operation: z.literal("publish"),
    input: publishInputSchema,
  }),
  z.strictObject({ operation: z.literal("update"), input: updateInputSchema }),
  z.strictObject({
    operation: z.literal("deletePost"),
    postId: idSchema,
    version: versionSchema,
  }),
  z.strictObject({ operation: z.literal("detail"), postId: idSchema }),
  z.strictObject({
    operation: z.literal("like"),
    postId: idSchema,
    liked: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal("comment"),
    postId: idSchema,
    body: z.string().trim().min(1).max(2000),
    operationKey: operationKeySchema,
    commentId: idSchema.optional(),
    version: versionSchema.optional(),
  }),
  z.strictObject({
    operation: z.literal("deleteComment"),
    commentId: idSchema,
    version: versionSchema,
  }),
  z.strictObject({
    operation: z.literal("report"),
    targetKind: z.enum(["POST", "COMMENT"]),
    targetId: idSchema,
    reason: reportReasonSchema,
    body: z.string().trim().max(2000),
    proof: anonymousProofSchema,
  }),
  z.strictObject({ operation: z.literal("publicProfile"), userId: idSchema }),
  z.strictObject({ operation: z.literal("notifications") }),
  z.strictObject({ operation: z.literal("readNotifications") }),
  z.strictObject({
    operation: z.literal("deleteAccount"),
    confirm: z.literal("削除"),
  }),
  z.strictObject({
    operation: z.literal("photo"),
    photoId: idSchema,
    size: z.enum(["thumb", "map"]).optional(),
  }),
]);

export const commandSchema = commandSchemaBase;
export type CommunityCommand = z.infer<typeof commandSchema>;

export const requestSchema = z.strictObject({
  command: commandSchema,
  googleAccountId: z.string().min(1).max(200).nullable(),
  anonymousIdentity: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

const emptySchema = z.strictObject({});
const courseOptionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  coordinates: z.array(z.array(z.number())),
  lines: z.array(z.array(z.array(z.number()))),
});
const accountSchema: z.ZodType<CommunityAccount> = z.strictObject({
  id: z.string(),
  publicName: z.string().nullable(),
  nameMode: modeSchema.nullable(),
  googleName: z.string().nullable(),
  suspended: z.boolean(),
});
const mapDataSchema: z.ZodType<CommunityMapData> = z.strictObject({
  name: z.string(),
  center: z.tuple([z.number(), z.number()]),
  courses: z.array(courseOptionSchema),
  lifts: z.array(courseOptionSchema),
});
const authorSchema = z.strictObject({ id: z.string(), publicName: z.string() });
const photoSchema = z.strictObject({
  id: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
const publicReportEntrySchema = reportEntrySchema.safeExtend({
  id: z.string(),
  targetName: z.string(),
  photos: z.array(photoSchema),
});
const postSchema: z.ZodType<PublicPost> = z.strictObject({
  observedOn: z.string(),
  observedTime: z.string(),
  entries: z.array(publicReportEntrySchema),
  id: z.string(),
  resortId: z.string(),
  resortName: z.string(),
  version: z.number().int(),
  author: authorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  liked: z.boolean(),
});
const commentSchema: z.ZodType<PublicComment> = z.strictObject({
  id: z.string(),
  body: z.string(),
  author: authorSchema,
  createdAt: z.string(),
  version: z.number().int(),
});
const mapEntrySchema: z.ZodType<PublicMapEntry> = z.strictObject({
  id: z.string(),
  postId: z.string(),
  kind: z.enum(["COURSE", "LIFT", "MOGUL", "ITEM"]),
  observedOn: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  courseId: z.string().nullable(),
  liftId: z.string().nullable(),
  targetName: z.string(),
  photo: photoSchema.nullable(),
  photoCount: z.number().int().nonnegative(),
});
const notificationSchema: z.ZodType<CommunityNotificationDto> = z.strictObject({
  id: z.string(),
  postId: z.string(),
  kind: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const successPayloadSchemas = {
  courses: mapDataSchema,
  feed: z.strictObject({
    posts: z.array(postSchema),
    viewerId: z.string().nullable(),
    nextCursor: z.string().nullable(),
  }),
  mapEntries: z.strictObject({
    entries: z.array(mapEntrySchema),
    nextCursor: z.string().nullable(),
  }),
  mapSummary: z.strictObject({
    total: z.number().int().nonnegative(),
    latestObservedOn: z.string().nullable(),
  }),
  account: accountSchema.nullable(),
  profile: accountSchema,
  publish: z.strictObject({
    id: z.string(),
    version: z.number().int().optional(),
  }),
  update: z.strictObject({ id: z.string() }),
  deletePost: emptySchema,
  detail: z.strictObject({
    post: postSchema,
    comments: z.array(commentSchema),
    viewerId: z.string().nullable(),
  }),
  like: emptySchema,
  comment: z.strictObject({ id: z.string() }),
  deleteComment: emptySchema,
  report: emptySchema,
  publicProfile: z.strictObject({
    author: authorSchema,
    posts: z.array(postSchema),
  }),
  notifications: z.strictObject({
    notifications: z.array(notificationSchema),
    unreadCount: z.number().int(),
  }),
  readNotifications: emptySchema,
  deleteAccount: emptySchema,
} satisfies Record<Exclude<CommunityCommand["operation"], "photo">, z.ZodType>;

export type CommunitySuccessPayloads = {
  [K in keyof typeof successPayloadSchemas]: z.infer<
    (typeof successPayloadSchemas)[K]
  >;
};
export type CommunityActionResponse<K extends keyof CommunitySuccessPayloads> =
  | { ok: true; data: CommunitySuccessPayloads[K] }
  | {
      ok: false;
      error: string;
      challenge?: { token: string; difficulty: number };
    };
