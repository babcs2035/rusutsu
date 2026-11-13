import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  type ActionResult,
  type CommunityMapData,
  type DayReports,
  EXISTENCE_REACTIONS,
  type FeedInput,
  idSchema,
  type MapEntriesInput,
  mapEntriesInputSchema,
  type OwnPost,
  observedOnSchema,
  REACTION_KINDS,
  type ReportDraft,
  type ReportEntryDraft,
  reactionKindsFor,
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
  reactionActor,
  readFeed,
  readMapEntries,
  readMapSummary,
  readReactions,
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
          resortIds: z.array(idSchema).max(20).optional(),
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
  actorId: string | null,
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
    // The composer updates community data without refreshing the app layout.
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
    const actor = await reactionActor();
    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: "VISIBLE" },
      include: publicPostInclude,
    });
    if (!post) throw new Error("投稿が見つかりません。");
    return {
      post: (await serializePosts([post], actor?.key ?? null))[0],
      viewerId: actor?.userId ?? null,
    };
  });
}
/**
 * リアクションを付ける・外す。ログインなしでも押せる。
 * 「まだあった」と「なかった」はどちらか片方だけ残す。
 */
export async function setPostReaction(
  postId: string,
  kind: string,
  active: boolean,
  proof?: AnonymousProof,
) {
  return result(async () => {
    idSchema.parse(postId);
    const reaction = z.enum(REACTION_KINDS).parse(kind);
    z.boolean().parse(active);
    const actor = await reactionActor(true);
    if (!actor) throw new Error("リアクションを保存できませんでした。");
    if (actor.userId) await consumeWriteLimit("reaction", actor.userId, 100);
    else await limitAnonymous("community-reaction", 30, proof);
    await prisma.$transaction(async tx => {
      if (actor.userId) await writableUser(tx, actor.userId, false);
      const post = await tx.communityPost.findFirst({
        where: { id: postId, status: "VISIBLE" },
        select: {
          authorId: true,
          entries: { select: { kind: true }, orderBy: { position: "asc" } },
        },
      });
      if (!post) throw new Error("投稿が見つかりません。");
      if (
        !reactionKindsFor(
          post.entries[0]?.kind as ReportEntryDraft["kind"] | undefined,
        ).includes(reaction)
      )
        throw new Error("この投稿には付けられないリアクションです。");
      const dedupeKey = `reaction:${postId}:${reaction}:${actor.key}`;
      if (!active) {
        await tx.communityReaction.deleteMany({
          where: { postId, actorKey: actor.key, kind: reaction },
        });
        await tx.communityNotification.deleteMany({ where: { dedupeKey } });
        return;
      }
      const opposite = EXISTENCE_REACTIONS.includes(reaction)
        ? EXISTENCE_REACTIONS.find(value => value !== reaction)
        : undefined;
      if (opposite) {
        await tx.communityReaction.deleteMany({
          where: { postId, actorKey: actor.key, kind: opposite },
        });
        await tx.communityNotification.deleteMany({
          where: { dedupeKey: `reaction:${postId}:${opposite}:${actor.key}` },
        });
      }
      await tx.communityReaction.upsert({
        where: {
          postId_actorKey_kind: { postId, actorKey: actor.key, kind: reaction },
        },
        create: {
          postId,
          actorKey: actor.key,
          userId: actor.userId,
          kind: reaction,
        },
        update: {},
      });
      await notify(
        tx,
        post.authorId,
        actor.userId,
        postId,
        reaction,
        dedupeKey,
      );
    });
    const entries = await prisma.communityEntry.findMany({
      where: { postId },
      select: { kind: true },
      orderBy: { position: "asc" },
    });
    return {
      reactions:
        (await readReactions([{ id: postId, entries }], actor.key)).get(
          postId,
        ) ?? [],
    };
  });
}
/** 自分の投稿の一覧。確認のため非表示になっている投稿も本人には出す。 */
export async function getMyPosts(cursor?: string) {
  return result(async () => {
    const id = await requireUserId();
    if (cursor !== undefined) idSchema.parse(cursor);
    const rows = await prisma.communityPost.findMany({
      where: { authorId: id },
      include: publicPostInclude,
      orderBy: [
        { observedOn: "desc" },
        { observedTime: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    const posts = await serializePosts(page, `u:${id}`);
    return {
      posts: posts.map(
        (post, index): OwnPost => ({
          ...post,
          status: page[index].status === "HIDDEN" ? "HIDDEN" : "VISIBLE",
        }),
      ),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }, "投稿を読み込めませんでした。時間を置いて再度お試しください。");
}
/** 1人が1日（滑走日）に投稿したレポート。SNSで共有するページに使う。 */
export async function getDayReports(authorId: string, observedOn: string) {
  return result(async (): Promise<DayReports> => {
    idSchema.parse(authorId);
    observedOnSchema.parse(observedOn);
    const actor = await reactionActor();
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, publicName: true },
    });
    if (!author) throw new Error("投稿が見つかりません。");
    const rows = await prisma.communityPost.findMany({
      where: { authorId, observedOn, status: "VISIBLE" },
      include: publicPostInclude,
      orderBy: [{ observedTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    return {
      author: { id: author.id, publicName: author.publicName ?? "匿名" },
      observedOn,
      posts: await serializePosts(rows, actor?.key ?? null),
      viewerId: actor?.userId ?? null,
    };
  }, "投稿を読み込めませんでした。時間を置いて再度お試しください。");
}
export async function reportCommunityContent(
  targetId: string,
  reason: string,
  body: string,
  proof?: AnonymousProof,
) {
  return result(async () => {
    const report = z
      .strictObject({
        targetId: idSchema,
        reason: z.enum(["不適切な内容", "迷惑行為", "個人情報", "その他"]),
        body: z.string().trim().max(2000),
      })
      .parse({ targetId, reason, body });
    await limitAnonymous("community-report", 10, proof);
    const found = await prisma.communityPost.findFirst({
      where: { id: targetId, status: "VISIBLE" },
      select: { id: true },
    });
    if (!found) throw new Error("対象が見つかりません。");
    await prisma.communityReport.create({
      data: { ...report, targetKind: "POST" },
    });
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
      posts: await serializePosts(rows, (await reactionActor())?.key ?? null),
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
      await tx.communityModerationJob.deleteMany({
        where: {
          targetKind: "POST",
          targetId: { in: posts.map(row => row.id) },
        },
      });
      // 本人が押したリアクションの通知は、受け取った人が別のユーザーでも消す
      await tx.communityNotification.deleteMany({
        where: { dedupeKey: { endsWith: `:u:${id}` } },
      });
      await tx.user.delete({ where: { id } });
    });
    refresh();
    return {};
  });
}
