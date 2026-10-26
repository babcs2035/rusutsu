import "server-only";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import type {
  CommunityAccount,
  CommunityMapData,
  CourseOption,
  FeedInput,
  PublicMapEntry,
  PublicPost,
  ReportEntryDraft,
} from "@/features/community/contract";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { readSkiResortById } from "@/lib/skiResortData";
import { internalCommunityActor } from "./actorContext";

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
  _count: {
    select: { likes: true, comments: { where: { status: "VISIBLE" } } },
  },
} satisfies Prisma.CommunityPostInclude;
type IncludedPost = Prisma.CommunityPostGetPayload<{
  include: typeof publicPostInclude;
}>;

export async function courseOptions(
  resortId: string,
): Promise<CommunityMapData> {
  const resort = usesRemoteDataApi()
    ? await readSkiResortById(resortId)
    : await prisma.skiResort.findFirst({
        where: { id: resortId, isActive: true },
        select: { nameJa: true, longitude: true, latitude: true },
      });
  if (!resort) throw new Error("スキー場が見つかりません。");
  const data = await getFinalizedResortMapData(resortId);
  const courses = new Map<string, CourseOption>();
  for (const feature of data?.courses?.features ?? []) {
    const group = courses.get(feature.groupId);
    if (group) group.lines.push(feature.coordinates);
    else
      courses.set(feature.groupId, {
        id: feature.groupId,
        name: feature.displayName,
        coordinates: feature.coordinates,
        lines: [feature.coordinates],
      });
  }
  return {
    name: resort.nameJa,
    courses: [...courses.values()],
    lifts: (data?.lifts?.features ?? []).map(feature => ({
      id: feature.id,
      name: feature.name,
      coordinates: feature.coordinates,
      lines: [feature.coordinates],
    })),
    center: [resort.longitude, resort.latitude],
  };
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

export async function serializePosts(
  rows: IncludedPost[],
  currentViewerId: string | null,
): Promise<PublicPost[]> {
  const likes =
    currentViewerId && rows.length
      ? await prisma.communityLike.findMany({
          where: {
            userId: currentViewerId,
            postId: { in: rows.map(row => row.id) },
          },
          select: { postId: true },
        })
      : [];
  const likedIds = new Set(likes.map(like => like.postId));
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
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    liked: likedIds.has(row.id),
  }));
}

export async function readFeed(input: FeedInput) {
  const id = await viewerId();
  const rows = await prisma.communityPost.findMany({
    where: {
      resortId: input.resortId,
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
    posts: await serializePosts(rows.slice(0, 50), id),
    viewerId: id,
    nextCursor: rows.length > 50 ? rows[49].id : null,
  };
}

export async function readMapEntries(input: {
  resortId: string;
  kind: "MOGUL" | "ITEM";
  from?: string;
  cursor?: string;
}) {
  const rows = await prisma.communityEntry.findMany({
    where: {
      kind: input.kind,
      post: {
        resortId: input.resortId,
        status: "VISIBLE",
        ...(input.from ? { observedOn: { gte: input.from } } : {}),
      },
    },
    orderBy: [
      { post: { observedOn: "desc" } },
      { post: { createdAt: "desc" } },
      { id: "desc" },
    ],
    take: 101,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      post: {
        select: {
          id: true,
          observedOn: true,
          author: { select: { id: true, publicName: true } },
        },
      },
    },
  });
  const entries: PublicMapEntry[] = rows.slice(0, 100).flatMap(row =>
    row.latitude == null || row.longitude == null
      ? []
      : [
          {
            id: row.id,
            postId: row.postId,
            kind: row.kind as "MOGUL" | "ITEM",
            observedOn: row.post.observedOn,
            body: row.body,
            latitude: row.latitude,
            longitude: row.longitude,
            itemType: row.itemType,
            size: row.size,
            targetName: row.targetName,
            author: {
              id: row.post.author.id,
              publicName: row.post.author.publicName ?? "匿名",
            },
          },
        ],
  );
  return { entries, nextCursor: rows.length > 100 ? rows[99].id : null };
}
