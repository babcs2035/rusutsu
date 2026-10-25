import "server-only";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import type {
  CommunityAccount,
  FeedInput,
  PostDraft,
  PublicPost,
  RatingSummary,
} from "@/features/community/contract";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { prisma } from "@/lib/prisma";

export type Tx = Prisma.TransactionClient;
export async function viewerId() {
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
  photos: {
    select: { id: true, width: true, height: true },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: { likes: true, comments: { where: { status: "VISIBLE" } } },
  },
} satisfies Prisma.CommunityPostInclude;
type IncludedPost = Prisma.CommunityPostGetPayload<{
  include: typeof publicPostInclude;
}>;

export async function courseOptions(resortId: string) {
  const resort = await prisma.skiResort.findFirst({
    where: { id: resortId, isActive: true },
    select: { nameJa: true, longitude: true, latitude: true },
  });
  if (!resort) throw new Error("スキー場が見つかりません。");
  const data = await getFinalizedResortMapData(resortId);
  const courses = new Map<
    string,
    { id: string; name: string; coordinates: number[][]; lines: number[][][] }
  >();
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
    center: [resort.longitude, resort.latitude] as [number, number],
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
  const [likes, names] = await Promise.all([
    currentViewerId
      ? prisma.communityLike.findMany({
          where: {
            userId: currentViewerId,
            postId: { in: rows.map(row => row.id) },
          },
          select: { postId: true },
        })
      : [],
    Promise.all(
      [...new Set(rows.map(row => row.resortId))].map(async resortId => {
        const options = await courseOptions(resortId);
        return [
          resortId,
          new Map(options.courses.map(course => [course.id, course.name])),
        ] as const;
      }),
    ),
  ]);
  const likedIds = new Set(likes.map(like => like.postId));
  const courseNames = new Map(names);
  return rows.map(row => ({
    id: row.id,
    resortId: row.resortId,
    courseId: row.courseId,
    kind: row.kind as PostDraft["kind"],
    observedOn: row.observedOn,
    body: row.body,
    snowQualities: row.snowQualities as PostDraft["snowQualities"],
    conditions: row.conditions as PostDraft["conditions"],
    crowding: row.crowding as PostDraft["crowding"],
    rating: row.rating,
    latitude: row.latitude,
    longitude: row.longitude,
    present: row.present,
    itemType: row.itemType as PostDraft["itemType"],
    size: row.size,
    parentId: row.parentId,
    version: row.version,
    author: { id: row.author.id, publicName: row.author.publicName ?? "匿名" },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    photos: row.photos,
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    liked: likedIds.has(row.id),
    courseName: row.courseId
      ? (courseNames.get(row.resortId)?.get(row.courseId) ?? "コース")
      : null,
  }));
}

export async function ratingSummaries(
  resortId: string,
  courseId?: string,
): Promise<RatingSummary[]> {
  const rows = await prisma.$queryRaw<
    Array<{ courseId: string | null; average: number; count: bigint }>
  >(Prisma.sql`
    SELECT "courseId", AVG(rating)::float8 AS average, COUNT(*) AS count FROM (
      SELECT DISTINCT ON ("authorId", "courseId") "courseId", rating
      FROM community_posts WHERE "resortId" = ${resortId} AND status = 'VISIBLE'
        AND kind = 'REPORT' AND rating IS NOT NULL
        ${courseId ? Prisma.sql`AND "courseId" = ${courseId}` : Prisma.empty}
      ORDER BY "authorId", "courseId", "createdAt" DESC, id DESC
    ) latest GROUP BY "courseId"`);
  return rows.map(row => ({ ...row, count: Number(row.count) }));
}

export async function readFeed(input: FeedInput) {
  const id = await viewerId();
  const rows = await prisma.communityPost.findMany({
    where: {
      resortId: input.resortId,
      status: "VISIBLE",
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.authorId ? { authorId: input.authorId } : {}),
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
    ratings: await ratingSummaries(input.resortId, input.courseId),
    viewerId: id,
    nextCursor: rows.length > 50 ? rows[49].id : null,
  };
}
