import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  type ActionResult,
  type CommunityMapData,
  type FeedInput,
  idSchema,
  type MapEntriesInput,
  mapEntriesInputSchema,
  observedOnSchema,
  type ReportDraft,
  reportDraftSchema,
} from "@/features/community/contract";
import { reportLocationError } from "@/features/community/location";
import type { AnonymousProof } from "@/features/corrections/anonymousCheck";
import { prisma } from "@/lib/prisma";
import { drainModerationJobs } from "@/server/community/moderation";
import { readReportPhotos } from "@/server/community/photos";
import {
  AnonymousChallengeError,
  consumeWriteLimit,
  limitAnonymous,
} from "@/server/community/rateLimit";
import {
  accountDto,
  courseOptions,
  publicPostInclude,
  readFeed,
  readMapEntries,
  readMapSummary,
  requireUserId,
  serializePosts,
  type Tx,
  viewerId,
  writableUser,
} from "@/server/community/repository";

async function result<T>(
  operation: () => Promise<T>,
  fallback = "保存できませんでした。少し待ってからお試しください。",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof AnonymousChallengeError)
      return { ok: false, error: error.message, challenge: error.challenge };
    if (
      !(error instanceof z.ZodError) &&
      !(error instanceof Error && !("code" in error))
    ) {
      const technicalError = error as { code?: unknown; name?: unknown } | null;
      console.error("Community action failed", {
        name:
          typeof technicalError?.name === "string"
            ? technicalError.name
            : "UnknownError",
        code:
          typeof technicalError?.code === "string"
            ? technicalError.code
            : undefined,
      });
    }
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "入力を確認してください。")
          : error instanceof Error && !("code" in error)
            ? error.message
            : fallback,
    };
  }
}
const refresh = () => revalidatePath("/", "layout");
const operationKeySchema = z.string().uuid();
const versionSchema = z.number().int().positive();

export async function getCommunityCourses(resortId: string) {
  return result(
    () => courseOptions(idSchema.parse(resortId)),
    "投稿画面の地図情報を読み込めませんでした。時間を置いて再度お試しください。",
  );
}
export async function getCommunityFeed(input: FeedInput) {
  return result(() =>
    readFeed(
      z
        .strictObject({
          resortId: idSchema,
          courseId: idSchema.optional(),
          liftId: idSchema.optional(),
          kind: z.enum(["COURSE", "LIFT", "MOGUL", "ITEM"]).optional(),
          from: observedOnSchema.optional(),
          to: observedOnSchema.optional(),
          sort: z.enum(["created", "observed"]).optional(),
          authorId: idSchema.optional(),
          cursor: idSchema.optional(),
        })
        .parse(input),
    ),
  );
}
export async function getCommunityMapEntries(input: MapEntriesInput) {
  return result(() => readMapEntries(mapEntriesInputSchema.parse(input)));
}
export async function getCommunityMapSummary(resortId: string) {
  return result(() => readMapSummary(idSchema.parse(resortId)));
}
export async function getCommunityAccount() {
  return result(async () => {
    const id = await viewerId();
    const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
    return user ? accountDto(user) : null;
  }, "アカウント情報を読み込めませんでした。時間を置いて再度お試しください。");
}
export async function saveCommunityProfile(
  mode: "GOOGLE" | "NICKNAME" | "ANONYMOUS",
  nickname: string,
) {
  return result(async () => {
    const id = await requireUserId();
    const selected = z.enum(["GOOGLE", "NICKNAME", "ANONYMOUS"]).parse(mode);
    const name = z.string().trim().max(40).parse(nickname);
    await consumeWriteLimit("profile", id, 20);
    return prisma.$transaction(async tx => {
      const user = await writableUser(tx, id, false);
      const publicName =
        selected === "ANONYMOUS"
          ? "匿名"
          : selected === "GOOGLE"
            ? (user.name?.trim().slice(0, 40) ?? "")
            : name;
      if (!publicName) throw new Error("公開名を入力してください。");
      return accountDto(
        await tx.user.update({
          where: { id },
          data: { publicName, nameMode: selected },
        }),
      );
    });
  });
}

async function queueModeration(
  tx: Tx,
  targetKind: string,
  targetId: string,
  targetVersion: number,
) {
  await tx.communityModerationJob.create({
    data: { targetKind, targetId, targetVersion },
  });
}
async function notify(
  tx: Tx,
  userId: string,
  actorId: string,
  postId: string,
  kind: string,
  dedupeKey: string,
) {
  if (userId === actorId) return;
  await tx.communityNotification.upsert({
    where: { dedupeKey },
    create: { userId, postId, kind, dedupeKey },
    update: {},
  });
}
function prepareEntry(report: ReportDraft, options: CommunityMapData) {
  const [entry] = report.entries;
  if (entry.longitude != null && entry.latitude != null) {
    const locationError = reportLocationError(
      [entry.longitude, entry.latitude],
      options,
    );
    if (locationError) throw new Error(locationError);
  }
  const course = entry.courseId
    ? options.courses.find(item => item.id === entry.courseId)
    : null;
  const lift = entry.liftId
    ? options.lifts.find(item => item.id === entry.liftId)
    : null;
  if (entry.courseId && !course)
    throw new Error("このスキー場のコースを選択してください。");
  if (entry.liftId && !lift)
    throw new Error("このスキー場のリフトを選択してください。");
  return {
    ...entry,
    position: 0,
    targetName: (
      course?.name ??
      lift?.name ??
      (entry.kind === "MOGUL" ? "コブ" : "パーク")
    ).slice(0, 500),
  };
}

export async function publishReport(input: unknown, photos: FormData) {
  return result(async () => {
    const id = await requireUserId();
    const batch = z
      .strictObject({
        resortId: idSchema,
        report: reportDraftSchema,
        idempotencyKey: operationKeySchema,
      })
      .parse(input);
    const prior = await prisma.communityPost.findUnique({
      where: {
        authorId_submissionKey: {
          authorId: id,
          submissionKey: batch.idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (prior) return prior;
    await consumeWriteLimit("post", id, 30);
    const options = await courseOptions(batch.resortId);
    const entry = prepareEntry(batch.report, options);
    const normalized = await readReportPhotos(photos, entry.clientKey);
    const saved = await prisma.$transaction(
      async tx => {
        await writableUser(tx, id);
        const existing = await tx.communityPost.findUnique({
          where: {
            authorId_submissionKey: {
              authorId: id,
              submissionKey: batch.idempotencyKey,
            },
          },
          select: { id: true },
        });
        if (existing) return existing;
        if (
          !(await tx.skiResort.findFirst({
            where: { id: batch.resortId, isActive: true },
            select: { id: true },
          }))
        )
          throw new Error("スキー場が見つかりません。");
        const post = await tx.communityPost.create({
          data: {
            observedOn: batch.report.observedOn,
            observedTime: batch.report.observedTime,
            resortId: batch.resortId,
            authorId: id,
            submissionKey: batch.idempotencyKey,
            entries: { create: entry },
          },
          select: {
            id: true,
            version: true,
            entries: { select: { id: true } },
          },
        });
        if (normalized.length)
          await tx.contributionPhoto.createMany({
            data: normalized.map(photo => ({
              ...photo,
              postId: post.id,
              ownerId: id,
              entryId: post.entries[0].id,
            })),
          });
        await queueModeration(tx, "POST", post.id, post.version);
        return { id: post.id };
      },
      { timeout: 20000 },
    );
    refresh();
    after(() => drainModerationJobs());
    return saved;
  });
}

export async function updateReport(
  postId: string,
  version: number,
  input: unknown,
  photos: FormData,
  removePhotoIds: string[],
) {
  return result(async () => {
    const id = await requireUserId();
    idSchema.parse(postId);
    versionSchema.parse(version);
    const report = reportDraftSchema.parse(input);
    const remove = z.array(idSchema).max(6).parse(removePhotoIds);
    await consumeWriteLimit("post-edit", id);
    const current = await prisma.communityPost.findUnique({
      where: { id: postId },
    });
    if (
      !current ||
      current.authorId !== id ||
      current.version !== version ||
      current.status !== "VISIBLE"
    )
      throw new Error("レポートが更新されたか、編集できません。");
    const options = await courseOptions(current.resortId);
    const entry = prepareEntry(report, options);
    const uploaded = await readReportPhotos(photos, entry.clientKey);
    await prisma.$transaction(async tx => {
      await writableUser(tx, id);
      const retained = await tx.contributionPhoto.count({
        where: { postId, id: { notIn: remove } },
      });
      if (retained + uploaded.length > 1)
        throw new Error("写真は1件の投稿で1枚までです。");
      const updated = await tx.communityPost.updateMany({
        where: { id: postId, authorId: id, version, status: "VISIBLE" },
        data: {
          observedOn: report.observedOn,
          observedTime: report.observedTime,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new Error("レポートが更新されたか、編集できません。");
      if (remove.length)
        await tx.contributionPhoto.deleteMany({
          where: { postId, id: { in: remove } },
        });
      // 1投稿1項目なので、項目は作り直さずに書き換えて写真の紐づけを保つ
      const saved = await tx.communityEntry.update({
        where: { postId_position: { postId, position: 0 } },
        data: entry,
        select: { id: true },
      });
      if (uploaded.length)
        await tx.contributionPhoto.createMany({
          data: uploaded.map(photo => ({
            ...photo,
            postId,
            ownerId: id,
            entryId: saved.id,
          })),
        });
      await queueModeration(tx, "POST", postId, version + 1);
    });
    refresh();
    after(() => drainModerationJobs());
    return { id: postId };
  });
}
export async function deletePost(postId: string, version: number) {
  return result(async () => {
    const id = await requireUserId();
    idSchema.parse(postId);
    versionSchema.parse(version);
    await prisma.$transaction(async tx => {
      // Suspended accounts can still remove their own content.
      const removed = await tx.communityPost.deleteMany({
        where: { id: postId, authorId: id, version },
      });
      if (removed.count !== 1)
        throw new Error("投稿が更新されたか、削除できません。");
      await tx.communityModerationJob.deleteMany({
        where: { targetKind: "POST", targetId: postId },
      });
    });
    refresh();
    return {};
  });
}
export async function getPostDetail(postId: string) {
  return result(async () => {
    idSchema.parse(postId);
    const id = await viewerId();
    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: "VISIBLE" },
      include: publicPostInclude,
    });
    if (!post) throw new Error("投稿が見つかりません。");
    const comments = await prisma.communityComment.findMany({
      where: { postId, status: "VISIBLE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      include: { author: { select: { id: true, publicName: true } } },
    });
    return {
      post: (await serializePosts([post], id))[0],
      comments: comments.map(row => ({
        id: row.id,
        body: row.body,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        author: {
          id: row.authorId,
          publicName: row.author.publicName ?? "匿名",
        },
      })),
      viewerId: id,
    };
  });
}
export async function setPostLike(postId: string, liked: boolean) {
  return result(async () => {
    const id = await requireUserId();
    idSchema.parse(postId);
    z.boolean().parse(liked);
    await consumeWriteLimit("like", id, 100);
    await prisma.$transaction(async tx => {
      await writableUser(tx, id);
      const post = await tx.communityPost.findFirst({
        where: { id: postId, status: "VISIBLE" },
      });
      if (!post) throw new Error("投稿が見つかりません。");
      if (liked) {
        await tx.communityLike.upsert({
          where: { postId_userId: { postId, userId: id } },
          create: { postId, userId: id },
          update: {},
        });
        await notify(
          tx,
          post.authorId,
          id,
          postId,
          "LIKE",
          `like:${postId}:${id}`,
        );
      } else {
        await tx.communityLike.deleteMany({ where: { postId, userId: id } });
        await tx.communityNotification.deleteMany({
          where: { dedupeKey: `like:${postId}:${id}` },
        });
      }
    });
    refresh();
    return {};
  });
}
export async function saveComment(
  postId: string,
  body: string,
  operationKey: string,
  commentId?: string,
  version?: number,
) {
  return result(async () => {
    const id = await requireUserId();
    idSchema.parse(postId);
    operationKeySchema.parse(operationKey);
    const text = z.string().trim().min(1).max(2000).parse(body);
    if (commentId) {
      idSchema.parse(commentId);
      versionSchema.parse(version);
    }
    await consumeWriteLimit("comment", id, 40);
    const saved = await prisma.$transaction(async tx => {
      await writableUser(tx, id);
      const post = await tx.communityPost.findFirst({
        where: { id: postId, status: "VISIBLE" },
      });
      if (!post) throw new Error("投稿が見つかりません。");
      let savedId: string;
      let savedVersion: number;
      if (commentId) {
        const changed = await tx.communityComment.updateMany({
          where: {
            id: commentId,
            postId,
            authorId: id,
            version,
            status: "VISIBLE",
          },
          data: { body: text, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new Error("コメントが更新されたか、編集できません。");
        savedId = commentId;
        savedVersion = (version as number) + 1;
      } else {
        const existing = await tx.communityComment.findUnique({
          where: { authorId_operationKey: { authorId: id, operationKey } },
        });
        if (existing) return { id: existing.id };
        const comment = await tx.communityComment.create({
          data: { postId, authorId: id, body: text, operationKey },
        });
        savedId = comment.id;
        savedVersion = comment.version;
        await notify(
          tx,
          post.authorId,
          id,
          postId,
          "COMMENT",
          `comment:${savedId}`,
        );
      }
      await queueModeration(tx, "COMMENT", savedId, savedVersion);
      return { id: savedId };
    });
    refresh();
    after(() => drainModerationJobs());
    return saved;
  });
}
export async function deleteComment(commentId: string, version: number) {
  return result(async () => {
    const id = await requireUserId();
    idSchema.parse(commentId);
    versionSchema.parse(version);
    await prisma.$transaction(async tx => {
      const removed = await tx.communityComment.deleteMany({
        where: { id: commentId, authorId: id, version },
      });
      if (removed.count !== 1)
        throw new Error("コメントが更新されたか、削除できません。");
      await tx.communityNotification.deleteMany({
        where: { dedupeKey: `comment:${commentId}` },
      });
      await tx.communityModerationJob.deleteMany({
        where: { targetKind: "COMMENT", targetId: commentId },
      });
    });
    refresh();
    return {};
  });
}
export async function reportCommunityContent(
  targetKind: "POST" | "COMMENT",
  targetId: string,
  reason: string,
  body: string,
  proof?: AnonymousProof,
) {
  return result(async () => {
    const report = z
      .strictObject({
        targetKind: z.enum(["POST", "COMMENT"]),
        targetId: idSchema,
        reason: z.enum(["不適切な内容", "迷惑行為", "個人情報", "その他"]),
        body: z.string().trim().max(2000),
      })
      .parse({ targetKind, targetId, reason, body });
    await limitAnonymous("community-report", 10, proof);
    const found =
      targetKind === "POST"
        ? await prisma.communityPost.findFirst({
            where: { id: targetId, status: "VISIBLE" },
            select: { id: true },
          })
        : await prisma.communityComment.findFirst({
            where: {
              id: targetId,
              status: "VISIBLE",
              post: { status: "VISIBLE" },
            },
            select: { id: true },
          });
    if (!found) throw new Error("対象が見つかりません。");
    await prisma.communityReport.create({ data: report });
    return {};
  });
}
export async function getPublicProfile(userId: string) {
  return result(async () => {
    idSchema.parse(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, publicName: true },
    });
    if (!user) throw new Error("プロフィールが見つかりません。");
    const rows = await prisma.communityPost.findMany({
      where: { authorId: userId, status: "VISIBLE" },
      include: publicPostInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return {
      author: { id: user.id, publicName: user.publicName ?? "匿名" },
      posts: await serializePosts(rows, await viewerId()),
    };
  });
}
export async function getNotifications() {
  return result(async () => {
    const id = await requireUserId();
    const where = { userId: id, post: { status: "VISIBLE" } };
    const [rows, unreadCount] = await Promise.all([
      prisma.communityNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.communityNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      notifications: rows.map(row => ({
        id: row.id,
        postId: row.postId,
        kind: row.kind,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount,
    };
  });
}
export async function markNotificationsRead() {
  return result(async () => {
    const id = await requireUserId();
    await prisma.communityNotification.updateMany({
      where: { userId: id, readAt: null },
      data: { readAt: new Date() },
    });
    return {};
  });
}
export async function deleteCommunityAccount(confirm: "削除") {
  return result(async () => {
    if (confirm !== "削除")
      throw new Error("確認欄に「削除」と入力してください。");
    const id = await requireUserId();
    await prisma.$transaction(async tx => {
      const posts = await tx.communityPost.findMany({
        where: { authorId: id },
        select: { id: true },
      });
      const comments = await tx.communityComment.findMany({
        where: { authorId: id },
        select: { id: true },
      });
      await tx.communityModerationJob.deleteMany({
        where: {
          OR: [
            { targetKind: "POST", targetId: { in: posts.map(row => row.id) } },
            {
              targetKind: "COMMENT",
              targetId: { in: comments.map(row => row.id) },
            },
          ],
        },
      });
      // Remove actor notifications even when the recipient is another user.
      await tx.communityNotification.deleteMany({
        where: {
          OR: [
            { dedupeKey: { in: comments.map(row => `comment:${row.id}`) } },
            { dedupeKey: { endsWith: `:${id}` } },
          ],
        },
      });
      await tx.user.delete({ where: { id } });
    });
    refresh();
    return {};
  });
}
