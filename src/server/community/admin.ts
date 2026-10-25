"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/features/community/contract";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function reviewCommunityContent(form: FormData) {
  const actor = await requireAdmin();
  const { targetKind, targetId, version, decision } = z
    .object({
      targetKind: z.enum(["POST", "COMMENT"]),
      targetId: idSchema,
      version: z.coerce.number().int().positive(),
      decision: z.enum(["HIDE", "RESTORE", "DELETE"]),
    })
    .parse(Object.fromEntries(form));
  await prisma.$transaction(async tx => {
    const currentAdmin = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true },
    });
    if (currentAdmin?.role !== "admin")
      throw new Error("管理者権限が必要です。");
    const current =
      targetKind === "POST"
        ? await tx.communityPost.findUnique({ where: { id: targetId } })
        : await tx.communityComment.findUnique({ where: { id: targetId } });
    if (!current || current.version !== version)
      throw new Error("対象が更新されました。再確認してください。");
    const where = { id: targetId, version };
    const changed =
      decision === "DELETE"
        ? targetKind === "POST"
          ? await tx.communityPost.deleteMany({ where })
          : await tx.communityComment.deleteMany({ where })
        : targetKind === "POST"
          ? await tx.communityPost.updateMany({
              where,
              data: {
                status: decision === "HIDE" ? "HIDDEN" : "VISIBLE",
                version: { increment: 1 },
              },
            })
          : await tx.communityComment.updateMany({
              where,
              data: {
                status: decision === "HIDE" ? "HIDDEN" : "VISIBLE",
                version: { increment: 1 },
              },
            });
    if (changed.count !== 1) throw new Error("対象が更新されました。");
    await tx.communityModerationJob.updateMany({
      where: {
        targetKind,
        targetId,
        status: { in: ["PENDING", "RUNNING", "FAILED"] },
      },
      data: { status: "REVIEWED", lockedAt: null },
    });
    await tx.communityReport.updateMany({
      where: { targetKind, targetId, status: "PENDING" },
      data: {
        status: "REVIEWED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
  });
  revalidatePath("/", "layout");
}
export async function resolveCommunityReport(form: FormData) {
  const actor = await requireAdmin();
  const id = idSchema.parse(form.get("id"));
  await prisma.$transaction(async tx => {
    if (
      (
        await tx.user.findUnique({
          where: { id: actor.id },
          select: { role: true },
        })
      )?.role !== "admin"
    )
      throw new Error("管理者権限が必要です。");
    await tx.communityReport.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "REVIEWED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
  });
  revalidatePath("/admin/community");
}
export async function setCommunitySuspension(form: FormData) {
  const actor = await requireAdmin();
  const userId = idSchema.parse(form.get("userId"));
  const suspend =
    z.enum(["true", "false"]).parse(form.get("suspend")) === "true";
  if (form.get("confirm") !== "変更")
    throw new Error("確認欄に「変更」と入力してください。");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${actor.id}, ${userId}) ORDER BY id FOR UPDATE`;
    const admin = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true },
    });
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (admin?.role !== "admin" || !target || target.role === "admin")
      throw new Error("この操作はできません。");
    await tx.user.update({
      where: { id: userId },
      data: { suspendedAt: suspend ? new Date() : null },
    });
  });
  revalidatePath("/admin/community");
}
export async function retryCommunityModeration() {
  await requireAdmin();
  await prisma.communityModerationJob.updateMany({
    where: { status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
    },
  });
  revalidatePath("/admin/community");
}
