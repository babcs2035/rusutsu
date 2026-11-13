import "server-only";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import {
  type CommunityAccount,
  type CommunityMapData,
  type CommunityMapSummary,
  type FeedInput,
  type MapEntriesInput,
  type PostReaction,
  type PublicMapEntry,
  type PublicPost,
  type ReactionKind,
  type ReportEntryDraft,
  reactionKindsFor,
} from "@/features/community/contract";
import { communityMapData } from "@/features/community/mapData";
import { todayInJapan } from "@/features/community/mapOverlay";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { prisma } from "@/lib/prisma";
import { readSkiResortById } from "@/lib/skiResortData";
import { internalCommunityActor } from "./actorContext";
import { reactionIdentity } from "./rateLimit";

export type Tx = Prisma.TransactionClient;
export async function viewerId() {
  const internal = internalCommunityActor();
  if (internal) return internal.userId;
  const session = await auth();
  return session?.user?.id ?? null;
}
export async function requireUserId() {
  const id = await viewerId();
  if (!id) throw new Error("Googleでログインしてから投稿してください。");
  return id;
}
/**
 * リアクションを押した人の区別。ログイン中はユーザー、そうでなければ
 * ブラウザごとの識別子。読むだけのときは識別子を新しく作らない。
 */
export async function reactionActor(create = false) {
  const userId = await viewerId();
  if (userId) return { key: `u:${userId}`, userId };
  const identity = await reactionIdentity(create);
  return identity ? { key: `a:${identity}`, userId: null } : null;
}
export async function writableUser(tx: Tx, id: string, needsProfile = true) {
  // Lock the account until commit, including against a racing suspension or
  // account deletion. JWT claims are never a source of current permissions.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id } });
  if (!user || user.suspendedAt)
    throw new Error("このアカウントでは投稿できません。");
  if (needsProfile && (!user.publicName || !user.nameMode))
    throw new Error("はじめに公開名を設定してください。");
  return user;
}
export const publicPostInclude = {
  author: { select: { id: true, publicName: true } },
  resort: { select: { nameJa: true } },
  entries: {
    orderBy: { position: "asc" as const },
    include: {
      photos: {
        select: { id: true, width: true, height: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
} satisfies Prisma.CommunityPostInclude;
type IncludedPost = Prisma.CommunityPostGetPayload<{
  include: typeof publicPostInclude;
}>;

export async function courseOptions(
  resortId: string,
): Promise<CommunityMapData> {
  const resort = await readSkiResortById(resortId);
  if (!resort) throw new Error("スキー場が見つかりません。");
  const data = await getFinalizedResortMapData(resort.id);
  return communityMapData(
    resort.nameJa,
    [resort.longitude, resort.latitude],
    data,
  );
}

export function accountDto(user: {
  id: string;
  publicName: string | null;
  nameMode: string | null;
  name: string | null;
  suspendedAt: Date | null;
}): CommunityAccount {
  return {
    id: user.id,
    publicName: user.publicName,
    nameMode: user.nameMode as CommunityAccount["nameMode"],
    googleName: user.name,
    suspended: !!user.suspendedAt,
  };
}

/** 投稿ごとに、付けられるリアクションを0件のものも含めて画面の順に並べる。 */
export async function readReactions(
  posts: { id: string; entries: { kind: string }[] }[],
  actorKey: string | null,
) {
  const postIds = posts.map(post => post.id);
  const [counts, mine] = postIds.length
    ? await Promise.all([
        prisma.communityReaction.groupBy({
          by: ["postId", "kind"],
          where: { postId: { in: postIds } },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
        actorKey
          ? prisma.communityReaction.findMany({
              where: { actorKey, postId: { in: postIds } },
              select: { postId: true, kind: true },
            })
          : [],
      ])
    : [[], []];
  const countByKey = new Map(
    counts.map(row => [`${row.postId}:${row.kind}`, row]),
  );
  const mineKeys = new Set(mine.map(row => `${row.postId}:${row.kind}`));
  return new Map(
    posts.map(post => [
      post.id,
      reactionKindsFor(
        post.entries[0]?.kind as ReportEntryDraft["kind"] | undefined,
      ).map((kind: ReactionKind): PostReaction => {
        const row = countByKey.get(`${post.id}:${kind}`);
        return {
          kind,
          count: row?._count._all ?? 0,
          latestAt: row?._max.createdAt?.toISOString() ?? null,
          mine: mineKeys.has(`${post.id}:${kind}`),
        };
      }),
    ]),
  );
}

export async function serializePosts(
  rows: IncludedPost[],
  actorKey: string | null,
): Promise<PublicPost[]> {
  const reactions = await readReactions(rows, actorKey);
  return rows.map(row => ({
    id: row.id,
    resortId: row.resortId,
    resortName: row.resort.nameJa,
    observedOn: row.observedOn,
    observedTime: row.observedTime,
    version: row.version,
    entries: row.entries.map(entry => ({
      id: entry.id,
      clientKey: entry.clientKey,
      kind: entry.kind as ReportEntryDraft["kind"],
      courseId: entry.courseId,
      liftId: entry.liftId,
      targetName: entry.targetName,
      body: entry.body,
      snowQualities: entry.snowQualities as ReportEntryDraft["snowQualities"],
      status: entry.status as ReportEntryDraft["status"],
      crowding: entry.crowding as ReportEntryDraft["crowding"],
      latitude: entry.latitude,
      longitude: entry.longitude,
      itemType: entry.itemType as ReportEntryDraft["itemType"],
      size: entry.size,
      waitMinutes: entry.waitMinutes,
      liftSpeed: entry.liftSpeed,
      liftSpeedLevel:
        entry.liftSpeedLevel as ReportEntryDraft["liftSpeedLevel"],
      depth: entry.depth as ReportEntryDraft["depth"],
      photos: entry.photos,
    })),
    author: { id: row.author.id, publicName: row.author.publicName ?? "匿名" },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reactions: reactions.get(row.id) ?? [],
  }));
}

export async function readFeed(input: FeedInput) {
  const actor = await reactionActor();
  const rows = await prisma.communityPost.findMany({
    where: {
      resortId: input.resortIds?.length
        ? { in: [...new Set([input.resortId, ...input.resortIds])] }
        : input.resortId,
      status: "VISIBLE",
      ...(input.authorId ? { authorId: input.authorId } : {}),
      ...(input.courseId || input.liftId || input.kind
        ? {
            entries: {
              some: {
                ...(input.courseId ? { courseId: input.courseId } : {}),
                ...(input.liftId ? { liftId: input.liftId } : {}),
                ...(input.kind ? { kind: input.kind } : {}),
              },
            },
          }
        : {}),
      ...(input.from || input.to
        ? {
            observedOn: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    },
    orderBy:
      input.sort === "observed"
        ? [{ observedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: publicPostInclude,
  });
  return {
    posts: await serializePosts(rows.slice(0, 50), actor?.key ?? null),
    viewerId: actor?.userId ?? null,
    nextCursor: rows.length > 50 ? rows[49].id : null,
  };
}

// 有無・初期期間の判定と地図の取得で、表示できる対象を揃える。
async function mapEntryWhere(input: MapEntriesInput) {
  const data = await courseOptions(input.resortId);
  const usable = (target: CommunityMapData["courses"][number]) =>
    target.lines.some(line => line.length >= 2);
  return {
    ...(input.kind ? { kind: input.kind } : {}),
    OR: [
      { latitude: { not: null }, longitude: { not: null } },
      {
        kind: "COURSE",
        courseId: { in: data.courses.filter(usable).map(course => course.id) },
      },
      {
        kind: "LIFT",
        liftId: { in: data.lifts.filter(usable).map(lift => lift.id) },
      },
    ],
    post: {
      resortId: input.resortId,
      status: "VISIBLE",
      observedOn: {
        ...(input.from ? { gte: input.from } : {}),
        lte: input.to ?? todayInJapan(),
      },
    },
  } satisfies Prisma.CommunityEntryWhereInput;
}

export async function readMapSummary(
  resortId: string,
): Promise<CommunityMapSummary> {
  const where = await mapEntryWhere({ resortId });
  const [total, latest] = await Promise.all([
    prisma.communityEntry.count({ where }),
    prisma.communityEntry.findFirst({
      where,
      orderBy: { post: { observedOn: "desc" } },
      select: { post: { select: { observedOn: true } } },
    }),
  ]);
  return { total, latestObservedOn: latest?.post.observedOn ?? null };
}

export async function readMapEntries(input: MapEntriesInput) {
  const rows = await prisma.communityEntry.findMany({
    where: await mapEntryWhere(input),
    orderBy: [
      { post: { observedOn: "desc" } },
      { post: { createdAt: "desc" } },
      { id: "desc" },
    ],
    take: 101,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      postId: true,
      kind: true,
      latitude: true,
      longitude: true,
      courseId: true,
      liftId: true,
      targetName: true,
      photos: {
        select: { id: true, width: true, height: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
      },
      _count: { select: { photos: true } },
      post: {
        select: { observedOn: true },
      },
    },
  });
  const entries: PublicMapEntry[] = rows.slice(0, 100).map(row => ({
    id: row.id,
    postId: row.postId,
    kind: row.kind as PublicMapEntry["kind"],
    observedOn: row.post.observedOn,
    latitude: row.latitude,
    longitude: row.longitude,
    courseId: row.courseId,
    liftId: row.liftId,
    targetName: row.targetName,
    photo: row.photos[0] ?? null,
    photoCount: row._count.photos,
  }));
  return { entries, nextCursor: rows.length > 100 ? rows[99].id : null };
}
