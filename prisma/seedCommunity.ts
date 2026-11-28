// ローカル開発用のコミュニティ投稿（デモデータ）をシードする。
// 冪等に投入するため、固定の submissionKey で重複を防止する。
// 既存のスキー場があれば最初に並ぶものを使い、なければデモ用を1件作る。
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

const DEMO_AUTHOR_EMAIL = "seed.demo@example.com";
const DEMO_AUTHOR_NAME = "デモスキーヤー";
const DEMO_RESORT_ID = "seed-demo-resort";

// CHECK 制約で、1 投稿のエントリは position 0 の1件のみ。
// COURSE/LIFT は実在の courseId/liftId が必須なので、デモでは
// 座標だけで済む ITEM/MOGUL を使う（どのスキー場でも投入できる）。
type DemoEntry = Omit<
  Prisma.CommunityEntryUncheckedCreateInput,
  "postId" | "clientKey"
>;
type DemoPost = {
  submissionKey: string;
  observedOn: string;
  observedTime: string;
  entry: DemoEntry;
};

const DEMO_POSTS: DemoPost[] = [
  {
    submissionKey: "seed-demo-post-1",
    observedOn: "2026-01-15",
    observedTime: "10:30",
    entry: {
      position: 0,
      kind: "ITEM",
      itemType: "キッカー",
      targetName: "メインキッカー",
      body: "ジャンプ台はコンディション良好です。",
      latitude: 43.0,
      longitude: 141.35,
    },
  },
  {
    submissionKey: "seed-demo-post-2",
    observedOn: "2026-01-20",
    observedTime: "09:00",
    entry: {
      position: 0,
      kind: "MOGUL",
      targetName: "コブ斜面",
      body: "コブは浅めで滑りやすいです。",
      latitude: 43.001,
      longitude: 141.351,
    },
  },
  {
    submissionKey: "seed-demo-post-3",
    observedOn: "2026-02-01",
    observedTime: "13:00",
    entry: {
      position: 0,
      kind: "ITEM",
      itemType: "レール",
      targetName: "レールセクション",
      body: "レールは新しいので滑りやすいです。",
      latitude: 43.002,
      longitude: 141.352,
    },
  },
];

// 既存スキー場がない環境向けの最小デモスキー場
const DEMO_RESORT: Prisma.SkiResortUncheckedCreateInput = {
  id: DEMO_RESORT_ID,
  nameJa: "シードデモスキー場",
  nameEn: "Seed Demo Resort",
  prefecture: "北海道",
  town: "札幌市",
  latitude: 43.0,
  longitude: 141.35,
  topElevation: 800,
  baseElevation: 400,
  verticalDrop: 400,
  numberOfCourses: 10,
  longestCourse: 2000,
  beginnersCoursesPercent: 40,
  intermediateCoursesPercent: 40,
  advancedCoursesPercent: 20,
  courseImages: [],
  numberOfLifts: 5,
  ropeways: 0,
  gondolas: 1,
  quadLifts: 2,
  tripleLifts: 1,
  pairLifts: 0,
  singleLifts: 1,
  otherLifts: 0,
  sources: ["seed"],
};

/** デモ著者と数件のコミュニティ投稿を冪等に投入する。 */
export async function seedCommunityPosts(prisma: PrismaClient) {
  let author = await prisma.user.findUnique({
    where: { email: DEMO_AUTHOR_EMAIL },
  });
  if (!author) {
    author = await prisma.user.create({
      data: {
        email: DEMO_AUTHOR_EMAIL,
        name: DEMO_AUTHOR_NAME,
        publicName: DEMO_AUTHOR_NAME,
      },
    });
  }

  let resort = await prisma.skiResort.findFirst({
    orderBy: { id: "asc" },
  });
  if (!resort) {
    resort = await prisma.skiResort.create({ data: DEMO_RESORT });
    console.log(`🏔️ Created demo resort: ${resort.id}`);
  }

  let created = 0;
  let skipped = 0;
  for (const post of DEMO_POSTS) {
    const existing = await prisma.communityPost.findFirst({
      where: { submissionKey: post.submissionKey },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.communityPost.create({
      data: {
        authorId: author.id,
        resortId: resort.id,
        observedOn: post.observedOn,
        observedTime: post.observedTime,
        status: "VISIBLE",
        version: 1,
        submissionKey: post.submissionKey,
        entries: {
          create: {
            ...post.entry,
            clientKey: randomUUID(),
          },
        },
      },
    });
    created += 1;
  }
  console.log(
    `📝 Community posts: ${created} created, ${skipped} already present (resort: ${resort.id}).`,
  );
}
