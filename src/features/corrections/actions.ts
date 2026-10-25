"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  lift20mDocumentKey,
  parseLiftBeforeGeojson,
  serializeLiftBeforeGeojson,
} from "@/features/lift/server/liftFiles";
import { patchLinksDocument } from "@/features/links/model";
import {
  parseSlopeBeforeGeojson,
  serializeSlopeGeojson,
  slope10mDocumentKey,
} from "@/features/slope/server/slopeFiles";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { normalizePhoto } from "@/server/community/photos";
import {
  AnonymousChallengeError,
  anonymousSubmissionKey,
  limitAnonymous,
} from "@/server/community/rateLimit";
import {
  CORRECTION_LIFT_FIELDS,
  CORRECTION_RESORT_FIELDS,
  CORRECTION_SLOPE_FIELDS,
  correctionItemSchema,
  EMPTY_PLAN,
  type SubmitCorrectionInput,
  submitCorrectionSchema,
} from "@/server/corrections/contract";
import {
  correctionLinkPlatform,
  correctionLinks,
  validateCorrectionLinks,
} from "@/server/corrections/links";
import { getDataDocument } from "@/server/data-documents/client";
import { writeDataDocumentsInTransaction } from "@/server/data-documents/repository";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import {
  type LineGeojsonFeatureCollection,
  synchronizeDerivedGeometry,
} from "@/server/derivedGeometry";
import { assertBoundedPayload } from "@/server/edit-requests/contract";
import { drainEditRequestJobs } from "@/server/edit-requests/jobs";
import { adminSkiResortUpdateSchema } from "@/server/ski-resorts/adminContract";
import { updateAdminSkiResortInTransaction } from "@/server/ski-resorts/repository";
import { featureIdentity } from "@/shared/course-lift/identity";

const asJson = (value: unknown) => value as never;
const publicCorrectionError = (error: unknown, fallback: string) =>
  error instanceof z.ZodError
    ? (error.issues[0]?.message ?? fallback)
    : error instanceof Error &&
        !error.name.startsWith("Prisma") &&
        !("code" in error)
      ? error.message.slice(0, 1000)
      : fallback;

export async function submitCorrection(
  input: SubmitCorrectionInput,
  photos?: FormData,
) {
  try {
    const parsed = submitCorrectionSchema.parse(input);
    if (usesRemoteDataApi())
      throw new Error(
        "正本データAPI接続中は、修正提案の受付を一時停止しています。",
      );
    const submissionKey = await anonymousSubmissionKey(parsed.operationKey);
    const prior = await prisma.editRequest.findUnique({
      where: { submissionKey },
      select: { id: true },
    });
    if (prior) return { ok: true as const, requestId: prior.id };
    await limitAnonymous(`correction:${parsed.resortId}`, 10, parsed.proof);
    const resort = await prisma.skiResort.findUnique({
      where: { id: parsed.resortId },
      select: { id: true },
    });
    if (!resort)
      return { ok: false as const, error: "スキー場が見つかりません。" };
    const items = await snapshotItems(parsed.resortId, parsed.items);
    const payload = {
      resortId: parsed.resortId,
      context: parsed.context,
      comment: parsed.comment,
      items,
      returnTo: safeReturnTo(parsed.returnTo, parsed.resortId),
    };
    assertBoundedPayload(payload);
    const files = photos?.getAll("photos") ?? [];
    if (files.length > 3) throw new Error("写真は3枚までです。");
    const normalizedPhotos = await Promise.all(
      files
        .filter(
          (value): value is File => value instanceof File && value.size > 0,
        )
        .map(normalizePhoto),
    );
    const request = await prisma.$transaction(async tx => {
      const created = await tx.editRequest.create({
        data: {
          authorId: "anonymous",
          authorName: "匿名",
          kind: "public-correction",
          resortId: parsed.resortId,
          submissionKey,
          submittedPayload: asJson(payload),
          submittedPlan: asJson(EMPTY_PLAN),
          candidatePayload: asJson(payload),
          candidatePlan: asJson(EMPTY_PLAN),
          events: { create: { actorId: "anonymous", action: "SUBMITTED" } },
        },
        select: { id: true },
      });
      for (const image of normalizedPhotos) {
        await tx.contributionPhoto.create({
          data: {
            requestId: created.id,
            bytes: image.bytes,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
          },
        });
      }
      return created;
    });
    return { ok: true as const, requestId: request.id };
  } catch (error) {
    if (error instanceof AnonymousChallengeError)
      return {
        ok: false as const,
        error: error.message,
        challenge: error.challenge,
      };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      try {
        const parsed = submitCorrectionSchema.parse(input);
        const submissionKey = await anonymousSubmissionKey(parsed.operationKey);
        const existing = await prisma.editRequest.findUnique({
          where: { submissionKey },
          select: { id: true },
        });
        if (existing) return { ok: true as const, requestId: existing.id };
      } catch {
        /* Keep the original error if this is an unrelated uniqueness conflict. */
      }
    }
    return {
      ok: false as const,
      error: publicCorrectionError(
        error,
        "送信できませんでした。少し待ってからお試しください。",
      ),
    };
  }
}

async function snapshotItems(
  resortId: string,
  items: SubmitCorrectionInput["items"],
) {
  const resortFields = new Set<string>(CORRECTION_RESORT_FIELDS);
  const resorts = await readAdminSkiResorts();
  const resort = resorts.find(value => value.id === resortId);
  return Promise.all(
    items.map(async item => {
      if (item.targetKind === "resort") {
        if (correctionLinkPlatform(item.field)) {
          const document = await getDataDocument("SkiResortLinks.json");
          return {
            ...item,
            before: correctionLinks(
              document?.content ?? null,
              resortId,
              item.field,
            ),
          };
        }
        if (!resort || !resortFields.has(item.field))
          throw new Error("修正対象の項目を確認してください。");
        return { ...item, before: resort[item.field as keyof typeof resort] };
      }
      if (
        item.targetKind === "slope" ||
        item.targetKind === "lift" ||
        item.targetKind === "slope-segment"
      ) {
        if (!item.targetId)
          throw new Error("コースまたはリフトを選択してください。");
        if (item.action === "add") return item;
        const folder =
          item.targetKind === "lift" ? "lift_before" : "slope_before";
        const document = await getDataDocument(
          `resorts-temporary/${folder}/${resortId}.geojson`,
        );
        if (!document) throw new Error("正本の地図データが見つかりません。");
        const data = JSON.parse(document.content) as {
          features?: Array<Record<string, unknown>>;
        };
        const key = `resorts-temporary/${folder}/${resortId}.geojson`;
        const feature = (data.features ?? []).find((value, index) => {
          const properties = value.properties as Record<string, unknown> | null;
          return (
            featureIdentity(properties, key, index) === item.targetId ||
            properties?.id === item.targetId
          );
        });
        if (!feature) throw new Error("修正対象の線が見つかりません。");
        const properties = feature.properties as Record<string, unknown> | null;
        if (item.field === "coordinates")
          return {
            ...item,
            before: (feature.geometry as { coordinates?: unknown } | null)
              ?.coordinates,
          };
        const editable = new Set<string>(
          item.targetKind === "lift"
            ? CORRECTION_LIFT_FIELDS
            : CORRECTION_SLOPE_FIELDS,
        );
        if (!editable.has(item.field))
          throw new Error("この項目は画面から提案できません。");
        return { ...item, before: properties?.[item.field] };
      }
      return item;
    }),
  );
}

function safeReturnTo(value: string | undefined, resortId: string) {
  const fallback = `/${resortId}`;
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

export async function decideCorrectionItem(
  id: string,
  expectedVersion: number,
  index: number,
  decision: "approve" | "reject" | "manual",
  comment = "",
) {
  const admin = await requireAdmin();
  let nextVersion = expectedVersion;
  let resultingDecision = "";
  try {
    if (usesRemoteDataApi())
      throw new Error("正本データAPI接続中は修正の反映を停止しています。");
    await prisma.$transaction(
      async tx => {
        const actor = await tx.user.findUnique({
          where: { id: admin.id },
          select: { role: true },
        });
        if (actor?.role !== "admin")
          throw new Error("管理者権限が変更されました。");
        const request = await tx.editRequest.findUnique({ where: { id } });
        if (
          request?.kind !== "public-correction" ||
          request.status !== "PENDING" ||
          request.version !== expectedVersion
        )
          throw new Error("申請は審査中ではありません。");
        const payload = request.candidatePayload as {
          items?: Array<Record<string, unknown>>;
        };
        const items = [...(payload.items ?? [])];
        const item = items[index];
        if (!item || item.decision)
          throw new Error("項目の状態が変わりました。");
        const noOp =
          decision === "approve"
            ? await applyApprovedItem(tx, request.id, request.resortId, item)
            : false;
        items[index] = {
          ...item,
          decision:
            decision === "approve"
              ? noOp
                ? "APPROVED_NOOP"
                : "APPROVED"
              : decision === "reject"
                ? "REJECTED"
                : "MANUALLY_RESOLVED",
        };
        resultingDecision = String(items[index]?.decision ?? "");
        const allResolved = items.every(entry => Boolean(entry.decision));
        const anyResolved = items.some(
          entry =>
            entry.decision === "APPROVED" ||
            entry.decision === "APPROVED_NOOP" ||
            entry.decision === "MANUALLY_RESOLVED",
        );
        const updated = await tx.editRequest.updateMany({
          where: { id, version: request.version, status: "PENDING" },
          data: {
            candidatePayload: asJson({ ...payload, items }),
            status: allResolved
              ? anyResolved
                ? "APPLIED"
                : "REJECTED"
              : "PENDING",
            version: { increment: 1 },
            reviewComment: comment.slice(0, 2000),
            reviewedById: allResolved ? admin.id : undefined,
            resolvedAt: allResolved ? new Date() : undefined,
          },
        });
        if (!updated.count)
          throw new Error(
            "別の審査操作が先に完了しました。再読み込みしてください。",
          );
        nextVersion = request.version + 1;
        await tx.editRequestEvent.create({
          data: {
            requestId: id,
            actorId: admin.id,
            action:
              decision === "approve"
                ? "ITEM_APPROVED"
                : decision === "reject"
                  ? "ITEM_REJECTED"
                  : "ITEM_MANUALLY_RESOLVED",
            payload: asJson({ index, item, comment }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    return {
      ok: false as const,
      error: publicCorrectionError(
        error,
        "審査を反映できませんでした。最新の内容を確認してください。",
      ),
    };
  }
  revalidatePath("/admin/corrections");
  revalidatePath(`/admin/corrections/${id}`);
  revalidatePath("/", "layout");
  if (decision === "approve") after(() => drainEditRequestJobs());
  return {
    ok: true as const,
    version: nextVersion,
    decision: resultingDecision,
  };
}

export async function adjustCorrectionItem(
  id: string,
  expectedVersion: number,
  index: number,
  proposed: unknown,
) {
  const admin = await requireAdmin();
  try {
    await prisma.$transaction(
      async tx => {
        const actor = await tx.user.findUnique({
          where: { id: admin.id },
          select: { role: true },
        });
        if (actor?.role !== "admin")
          throw new Error("管理者権限が変更されました。");
        const request = await tx.editRequest.findUnique({ where: { id } });
        if (
          request?.kind !== "public-correction" ||
          request.status !== "PENDING" ||
          request.version !== expectedVersion
        )
          throw new Error(
            "申請は審査中ではありません。再読み込みしてください。",
          );
        const payload = request.candidatePayload as {
          items?: Array<Record<string, unknown>>;
        };
        const items = [...(payload.items ?? [])];
        const item = items[index];
        if (!item || item.decision)
          throw new Error("審査済みの項目は変更できません。");
        const adjusted = correctionItemSchema.parse({ ...item, proposed });
        items[index] = {
          ...item,
          proposed: adjusted.proposed,
          adjustedBy: admin.id,
        };
        const updated = await tx.editRequest.updateMany({
          where: { id, status: "PENDING", version: expectedVersion },
          data: {
            candidatePayload: asJson({ ...payload, items }),
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new Error(
            "別の審査操作が先に完了しました。再読み込みしてください。",
          );
        await tx.editRequestEvent.create({
          data: {
            requestId: id,
            actorId: admin.id,
            action: "ITEM_ADJUSTED",
            payload: asJson({
              index,
              before: item.proposed,
              proposed: adjusted.proposed,
            }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    return {
      ok: false as const,
      error: publicCorrectionError(error, "修正案を更新できませんでした。"),
    };
  }
  revalidatePath(`/admin/corrections/${id}`);
  return { ok: true as const, version: expectedVersion + 1 };
}

async function applyApprovedItem(
  tx: Prisma.TransactionClient,
  requestId: string,
  resortId: string,
  item: Record<string, unknown>,
): Promise<boolean> {
  if (
    item.targetKind === "resort" &&
    correctionLinkPlatform(String(item.field))
  ) {
    const document = await getDataDocument("SkiResortLinks.json");
    const request = validateCorrectionLinks(
      resortId,
      String(item.field),
      item.proposed,
      item.before,
    );
    const content = patchLinksDocument(document?.content ?? null, request);
    if (JSON.stringify(request.links) === JSON.stringify(request.expectedLinks))
      return false;
    await writeDataDocumentsInTransaction(tx, [
      {
        key: "SkiResortLinks.json",
        content,
        mediaType: "application/json",
        expectedHash: document?.hash ?? null,
        hash: hashDataDocumentContent(content),
        fallbackHash: null,
      },
    ]);
    return true;
  }
  if (item.targetKind === "resort") {
    const current = (await readAdminSkiResorts()).find(
      value => value.id === resortId,
    );
    if (!current) throw new Error("正本が見つかりません。");
    const field = String(item.field);
    if (
      !(field in current) ||
      JSON.stringify(current[field as keyof typeof current]) !==
        JSON.stringify(item.before)
    )
      throw new Error("元データが更新済みです。最新情報と照合してください。");
    if (JSON.stringify(item.proposed) === JSON.stringify(item.before))
      return true;
    const data = adminSkiResortUpdateSchema.parse({
      ...Object.fromEntries(
        Object.keys(adminSkiResortUpdateSchema.shape).map(key => [
          key,
          key === field ? item.proposed : current[key as keyof typeof current],
        ]),
      ),
    });
    const saved = await updateAdminSkiResortInTransaction(
      tx,
      resortId,
      current.updatedAt,
      data,
    );
    if (saved.status !== "updated") throw new Error("元データが更新済みです。");
    return false;
  }
  if (
    item.targetKind === "slope" ||
    item.targetKind === "lift" ||
    item.targetKind === "slope-segment"
  ) {
    if (usesRemoteDataApi())
      throw new Error("正本データAPI接続中は修正の反映を停止しています。");
    const kind = item.targetKind === "lift" ? "lift" : "slope";
    const key = `resorts-temporary/${kind === "lift" ? "lift_before" : "slope_before"}/${resortId}.geojson`;
    const document = await getDataDocument(key);
    if (!document && item.action !== "add")
      throw new Error("正本の地図データが見つかりません。");
    let previousGeojson: {
      type: string;
      features: Array<Record<string, unknown>>;
    };
    try {
      previousGeojson = document
        ? JSON.parse(document.content)
        : { type: "FeatureCollection", features: [] };
    } catch {
      throw new Error("地図データを読み取れません。");
    }
    const geojson = structuredClone(previousGeojson);
    // Assign stable identities before any deletion so later approvals in the
    // same request keep pointing at their original line after array indexes shift.
    geojson.features = geojson.features.map((value, index) => {
      const properties = {
        ...((value.properties as Record<string, unknown> | null) ?? {}),
      };
      properties.entityId ??= featureIdentity(properties, key, index);
      return { ...value, properties };
    });
    const featureIndex = geojson.features.findIndex((value, index) => {
      const props = value.properties as Record<string, unknown> | null;
      return (
        featureIdentity(props, key, index) === item.targetId ||
        props?.id === item.targetId
      );
    });
    if (item.action === "add") {
      if (
        geojson.features.some(
          (value, index) =>
            featureIdentity(
              value.properties as Record<string, unknown> | null,
              key,
              index,
            ) === item.targetId,
        )
      )
        throw new Error("追加対象のIDが既に使われています。");
      const coordinates = item.proposed;
      if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        coordinates.length > 100_000 ||
        coordinates.some(
          point =>
            !Array.isArray(point) ||
            point.length < 2 ||
            !Number.isFinite(point[0]) ||
            !Number.isFinite(point[1]) ||
            Math.abs(point[0]) > 180 ||
            Math.abs(point[1]) > 90,
        )
      )
        throw new Error("新しい線の座標を確認してください。");
      geojson.features.push({
        type: "Feature",
        properties: {
          entityId: item.targetId,
          name:
            typeof item.targetName === "string" && item.targetName.trim()
              ? item.targetName.trim()
              : `名称未設定の${kind === "lift" ? "リフト" : "コース"}`,
        },
        geometry: { type: "LineString", coordinates },
      });
    } else if (featureIndex < 0) throw new Error("対象の線が見つかりません。");
    if (item.action === "delete") {
      const current = (
        geojson.features[featureIndex]?.geometry as {
          coordinates?: unknown;
        } | null
      )?.coordinates;
      if (JSON.stringify(current) !== JSON.stringify(item.before))
        throw new Error("線が更新済みです。");
      geojson.features.splice(featureIndex, 1);
    } else if (item.action !== "add") {
      const feature = geojson.features[featureIndex];
      if (!feature) throw new Error("対象の線が見つかりません。");
      if (item.field === "coordinates") {
        const geometry = feature.geometry as { coordinates?: unknown } | null;
        if (
          JSON.stringify(geometry?.coordinates) !== JSON.stringify(item.before)
        )
          throw new Error("線が更新済みです。");
        if (JSON.stringify(item.proposed) === JSON.stringify(item.before))
          return true;
        feature.geometry = {
          ...(feature.geometry as object),
          coordinates: item.proposed,
        };
      } else {
        const properties = {
          ...((feature.properties as Record<string, unknown>) ?? {}),
        };
        const rawField = String(item.field);
        const field = rawField.startsWith("property.")
          ? rawField.slice(9)
          : rawField;
        const allowed = new Set<string>(
          kind === "lift" ? CORRECTION_LIFT_FIELDS : CORRECTION_SLOPE_FIELDS,
        );
        if (!allowed.has(field))
          throw new Error("この項目は画面から提案できません。");
        if (JSON.stringify(properties[field]) !== JSON.stringify(item.before))
          throw new Error("項目が更新済みです。");
        if (JSON.stringify(item.proposed) === JSON.stringify(item.before))
          return true;
        properties[field] = item.proposed;
        feature.properties = properties;
      }
    }
    const content = JSON.stringify(geojson);
    try {
      if (hashDataDocumentContent(content) === document?.hash) return true;
      const writes = [
        {
          key,
          content,
          mediaType: document?.mediaType ?? "application/geo+json",
          expectedHash: document?.hash ?? null,
          hash: hashDataDocumentContent(content),
          fallbackHash: null,
        },
      ];
      const spatialChange =
        item.action === "add" ||
        item.action === "delete" ||
        item.field === "coordinates";
      const derivedKey =
        kind === "lift"
          ? lift20mDocumentKey(resortId)
          : slope10mDocumentKey(resortId);
      const derivedDocument = spatialChange
        ? await getDataDocument(derivedKey)
        : null;
      let derivedContent: string | null = null;
      if (spatialChange) {
        if (!derivedDocument && previousGeojson.features.length > 0)
          throw new Error("派生地図データが見つかりません。");
        const previousDerived = derivedDocument
          ? kind === "lift"
            ? parseLiftBeforeGeojson(derivedDocument.content)
            : parseSlopeBeforeGeojson(derivedDocument.content)
          : null;
        const derived = synchronizeDerivedGeometry({
          previousBefore:
            previousGeojson as unknown as LineGeojsonFeatureCollection,
          nextBefore: geojson as unknown as LineGeojsonFeatureCollection,
          existingDerived:
            previousDerived as unknown as LineGeojsonFeatureCollection | null,
          intervalM: kind === "lift" ? 20 : 10,
          kind,
        });
        derivedContent =
          kind === "lift"
            ? serializeLiftBeforeGeojson(derived as never)
            : serializeSlopeGeojson(derived as never);
        writes.push({
          key: derivedKey,
          content: derivedContent,
          mediaType: derivedDocument?.mediaType ?? "application/geo+json",
          expectedHash: derivedDocument?.hash ?? null,
          hash: hashDataDocumentContent(derivedContent),
          fallbackHash: null,
        });
      }
      const saved = await writeDataDocumentsInTransaction(tx, writes);
      const savedDerived = saved.find(value => value.key === derivedKey);
      if (savedDerived && derivedContent) {
        await tx.editRequestJob.create({
          data: {
            requestId,
            payload: asJson({
              key: savedDerived.key,
              hash: savedDerived.hash,
              content: savedDerived.content,
              kind,
              source: geojson,
              force: false,
            }),
          },
        });
      }
    } catch {
      throw new Error("地図データが更新済みです。最新情報と照合してください。");
    }
    return false;
  }
  throw new Error(
    "この項目は管理者による手動確認が必要です。「手動で確認済み」を選んでください。",
  );
}
