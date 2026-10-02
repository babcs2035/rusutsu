import { z } from "zod";
import type {
  DataDocument,
  DataDocumentWrite,
} from "@/server/data-documents/contract";
import type { LineGeojsonFeatureCollection } from "@/server/derivedGeometry";
import type {
  LiftTicketSeason,
  LiftTicketSeasonWrite,
} from "@/server/lift-tickets/contract";
import type {
  AdminSkiResortRecord,
  AdminSkiResortUpdateRequest,
} from "@/server/ski-resorts/adminContract";

export const EDIT_KIND_LABELS = {
  resort: "スキー場マスター",
  links: "リンク",
  lift: "リフト",
  slope: "コース",
  "slope-order": "コースの並べ替え",
  ticket: "リフト券",
  review: "レビュー",
  "review-import": "レビュー取り込み",
  mapping: "営業情報の対応表",
} as const;
export type EditKind = keyof typeof EDIT_KIND_LABELS;
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "承認待ち",
  APPLIED: "反映済み",
  REJECTED: "却下",
  WITHDRAWN: "取り下げ",
  CONFLICT: "競合（再申請が必要）",
};
export type Submission = { requestId: string };
export type ElevationTask = {
  key: string;
  hash: string;
  content: string;
  kind: "slope" | "lift";
  source: LineGeojsonFeatureCollection;
  force: boolean;
};
export type EditPlan = {
  documents: DataDocumentWrite[];
  beforeDocuments: Array<{ key: string; document: DataDocument | null }>;
  resort: {
    id: string;
    request: AdminSkiResortUpdateRequest;
    before: AdminSkiResortRecord;
  } | null;
  ticket: {
    write: LiftTicketSeasonWrite;
    before: LiftTicketSeason | null;
  } | null;
  elevations: ElevationTask[];
};
export const requestIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/);
export const requestVersionSchema = z.number().int().positive();
export const reviewCommentSchema = z.string().trim().max(2000);
export const MAX_EDIT_BYTES = 4 * 1024 * 1024;

export function assertBoundedPayload(value: unknown): void {
  const visit = (item: unknown, depth: number) => {
    if (depth > 40) throw new Error("入力の階層が深すぎます。");
    if (Array.isArray(item)) {
      if (item.length > 100_000) throw new Error("入力の件数が多すぎます。");
      for (const entry of item) visit(entry, depth + 1);
    } else if (item && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("不正な項目名です。");
        visit(entry, depth + 1);
      }
    } else if (typeof item === "number" && !Number.isFinite(item)) {
      throw new Error("不正な数値です。");
    }
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_EDIT_BYTES)
    throw new Error("申請内容は4 MiB以内にしてください。");
}

// 管理者の修正でも対象・競合判定の基準は変更させない。
const IMMUTABLE_FIELDS = new Set([
  "id",
  "entityId",
  "@id",
  "geometryId",
  "resortId",
  "targetSkiId",
  "sourceKind",
  "kind",
  "fileHash",
  "detailFileHash",
  "mappingFileHash",
  "baseVersion",
  "expectedUpdatedAt",
  "expectedHashes",
  "expectedLinks",
  "latestFile",
]);
export function assertCorrectionScope(
  original: unknown,
  candidate: unknown,
): void {
  const walk = (a: unknown, b: unknown) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      a.forEach((entry, index) => {
        walk(entry, b[index]);
      });
    } else if (a && typeof a === "object") {
      if (!b || typeof b !== "object" || Array.isArray(b))
        throw new Error("対象と更新基準は変更できません。");
      for (const [key, value] of Object.entries(a)) {
        const next = (b as Record<string, unknown>)[key];
        if (
          IMMUTABLE_FIELDS.has(key) &&
          JSON.stringify(value) !== JSON.stringify(next)
        )
          throw new Error(
            "対象と更新基準は変更できません。移動先を変更する場合は再申請してください。",
          );
        walk(value, next);
      }
    }
  };
  walk(original, candidate);
}
