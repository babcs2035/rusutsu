import "server-only";
import cron from "node-cron";
import { z } from "zod";
import { prisma, withPostgresAdvisoryLock } from "@/lib/prisma";
import { privateModerationEndpoint } from "./moderationEndpoint";

export const moderationResponseSchema = z.object({
  results: z
    .array(
      z.object({
        flagged: z.boolean(),
        categories: z.record(z.string(), z.boolean().nullable()),
        category_scores: z.record(z.string(), z.number()),
      }),
    )
    .min(1),
});

// Never touches users or account permissions. Administrative actions also
// increment versions, so an in-flight AI decision cannot override a review.
export async function drainModerationJobs() {
  const key = process.env.OPENAI_API_KEY?.trim();
  const localEndpoint = privateModerationEndpoint(
    process.env.COMMUNITY_MODERATION_URL,
  );
  if (!key && !localEndpoint) {
    await prisma.contributionRateBucket.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return;
  }
  await withPostgresAdvisoryLock(7024, 1, async () => {
    await prisma.communityModerationJob.updateMany({
      where: {
        status: "RUNNING",
        lockedAt: { lt: new Date(Date.now() - 10 * 60_000) },
      },
      data: { status: "PENDING", lockedAt: null },
    });
    for (let index = 0; index < 10; index++) {
      const job = await prisma.communityModerationJob.findFirst({
        where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: "asc" },
      });
      if (!job) break;
      const claim = await prisma.communityModerationJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: {
          status: "RUNNING",
          attempts: { increment: 1 },
          lockedAt: new Date(),
        },
      });
      if (claim.count !== 1) continue;
      try {
        const target =
          job.targetKind === "POST"
            ? await prisma.communityPost.findUnique({
                where: { id: job.targetId },
                include: {
                  photos: { select: { bytes: true, mimeType: true } },
                },
              })
            : await prisma.communityComment.findUnique({
                where: { id: job.targetId },
              });
        if (
          !target ||
          target.version !== job.targetVersion ||
          target.status !== "VISIBLE"
        ) {
          await prisma.communityModerationJob.updateMany({
            where: { id: job.id, status: "RUNNING" },
            data: { status: "DONE", lockedAt: null },
          });
          continue;
        }
        const input: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [{ type: "text", text: target.body || "スキー場の現地情報" }];
        const photoReviewPending =
          "photos" in target && target.photos.length > 0 && !localEndpoint;
        if (localEndpoint && "photos" in target)
          for (const photo of target.photos)
            input.push({
              type: "image_url",
              image_url: {
                url: `data:${photo.mimeType};base64,${Buffer.from(photo.bytes).toString("base64")}`,
              },
            });
        const response = await fetch(
          localEndpoint ?? "https://api.openai.com/v1/moderations",
          {
            method: "POST",
            headers: {
              ...((localEndpoint ? process.env.COMMUNITY_MODERATION_TOKEN : key)
                ? {
                    Authorization: `Bearer ${localEndpoint ? process.env.COMMUNITY_MODERATION_TOKEN : key}`,
                  }
                : {}),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: localEndpoint
                ? process.env.COMMUNITY_MODERATION_MODEL || "site-safety"
                : "omni-moderation-latest",
              input,
            }),
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!response.ok) throw new Error(`Moderation HTTP ${response.status}`);
        const checked = moderationResponseSchema.parse(await response.json());
        await prisma.$transaction(async tx => {
          const active = await tx.communityModerationJob.findUnique({
            where: { id: job.id },
          });
          if (active?.status !== "RUNNING") return;
          if (checked.results.some(entry => entry.flagged)) {
            if (job.targetKind === "POST")
              await tx.communityPost.updateMany({
                where: {
                  id: job.targetId,
                  version: job.targetVersion,
                  status: "VISIBLE",
                },
                data: { status: "HIDDEN", version: { increment: 1 } },
              });
            else
              await tx.communityComment.updateMany({
                where: {
                  id: job.targetId,
                  version: job.targetVersion,
                  status: "VISIBLE",
                },
                data: { status: "HIDDEN", version: { increment: 1 } },
              });
          }
          await tx.communityModerationJob.update({
            where: { id: job.id },
            data: {
              status:
                photoReviewPending &&
                !checked.results.some(entry => entry.flagged)
                  ? "FAILED"
                  : "DONE",
              lockedAt: null,
              lastError: photoReviewPending
                ? "本文確認済み。写真のAI確認にはサイト内のCOMMUNITY_MODERATION_URLを設定してください。"
                : null,
              result: checked,
            },
          });
        });
      } catch {
        // No body, photos, API keys or provider response bodies enter logs.
        const attempts = job.attempts + 1;
        await prisma.communityModerationJob.updateMany({
          where: { id: job.id, status: "RUNNING" },
          data: {
            status: attempts >= 6 ? "FAILED" : "PENDING",
            lockedAt: null,
            lastError:
              "AIチェックに失敗しました。再試行または管理者の確認が必要です。",
            nextAttemptAt: new Date(
              Date.now() + Math.min(3600_000, 2 ** attempts * 30_000),
            ),
          },
        });
      }
    }
    await prisma.contributionRateBucket.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  });
}
const globalState = globalThis as unknown as {
  communitySchedulerStarted?: boolean;
};
export function startCommunityModerationScheduler() {
  if (
    globalState.communitySchedulerStarted ||
    process.env.DISABLE_COMMUNITY_MODERATION === "true"
  )
    return;
  globalState.communitySchedulerStarted = true;
  const run = () => {
    void drainModerationJobs().catch(() =>
      console.error("投稿のAIチェックを実行できませんでした。"),
    );
  };
  cron.schedule("* * * * *", run);
  run();
}
