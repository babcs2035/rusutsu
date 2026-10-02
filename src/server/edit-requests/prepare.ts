import "server-only";
import { saveLatestStatusMapping } from "@/features/latest-status-mapping/actions";
import { saveLiftEdits } from "@/features/lift/actions";
import { saveResortLink } from "@/features/links/actions";
import { saveReviewFiles } from "@/features/review/actions";
import { publishReviewUpload } from "@/features/review/publicationActions";
import {
  applySlopeFeatureOrder,
  saveSlopeEdits,
} from "@/features/slope/actions";
import { saveTicketFile } from "@/features/ticket/actions";
import { updateAdminSkiResort } from "@/lib/skiResortData";
import { collectEdit } from "./capture";
import { assertBoundedPayload, type EditKind, type EditPlan } from "./contract";
import { validateEditPayload } from "./payloadSchema";
import { assertPreparedPlan, runEdit } from "./workflow";

export async function dispatchEdit(kind: EditKind, payload: unknown) {
  // validateEditPayload is the runtime boundary; the action contracts below
  // retain their existing stronger semantic validation.
  switch (kind) {
    case "resort": {
      const input = payload as {
        id: string;
        request: Parameters<typeof updateAdminSkiResort>[1];
      };
      return runEdit("resort", input.id, payload, async () => {
        const result = await updateAdminSkiResort(input.id, input.request);
        if (result.status !== "updated")
          return {
            ok: false as const,
            status: "error" as const,
            reason:
              result.status === "conflict"
                ? ("conflict" as const)
                : ("not_found" as const),
            message:
              "スキー場が更新されています。最新データを確認してください。",
            errors: ["スキー場が更新されています。再申請してください。"],
          };
        return {
          ok: true as const,
          status: "saved" as const,
          message: "スキー場情報を保存しました。",
          resort: result.resort,
        };
      });
    }
    case "links":
      return saveResortLink(payload);
    case "lift":
      return saveLiftEdits(payload as Parameters<typeof saveLiftEdits>[0]);
    case "slope":
      return saveSlopeEdits(payload as Parameters<typeof saveSlopeEdits>[0]);
    case "slope-order":
      return applySlopeFeatureOrder(
        payload as Parameters<typeof applySlopeFeatureOrder>[0],
      );
    case "ticket":
      return saveTicketFile(payload as Parameters<typeof saveTicketFile>[0]);
    case "review":
      return saveReviewFiles(payload as Parameters<typeof saveReviewFiles>[0]);
    case "review-import":
      return publishReviewUpload(payload);
    case "mapping":
      return saveLatestStatusMapping(
        payload as Parameters<typeof saveLatestStatusMapping>[0],
      );
  }
}
export async function prepareCandidate(
  kind: EditKind,
  payload: unknown,
  baseline: EditPlan,
) {
  assertBoundedPayload(payload);
  validateEditPayload(kind, payload);
  const { result, plan } = await collectEdit(
    () => dispatchEdit(kind, payload),
    baseline,
  );
  if (!result.ok) {
    const message =
      "errors" in result
        ? result.errors.join("\n")
        : "message" in result
          ? result.message
          : result.error;
    throw new Error(message);
  }
  assertPreparedPlan(plan);
  const allowedKeys = new Set(baseline.documents.map(document => document.key));
  if (plan.documents.some(document => !allowedKeys.has(document.key)))
    throw new Error(
      "申請の対象外のデータは修正できません。新しい申請に分けてください。",
    );
  return plan;
}
