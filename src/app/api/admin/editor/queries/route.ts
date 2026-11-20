/** 編集ワークスペースの読込を，現在の DB 権限を確認して実行する． */
import { z } from "zod";
import { getCurrentActor } from "@/lib/requireEditor";
import { canEdit } from "@/lib/roles";
import * as queries from "@/server/edit-requests/editorQueries";
import { httpProblem } from "@/server/httpProblem";
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { resortIdSchema } from "@/server/ski-resorts/queryContract";

const schema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("lift"), resortId: resortIdSchema }),
  z.strictObject({ operation: z.literal("links"), resortId: resortIdSchema }),
  z.strictObject({
    operation: z.literal("slope"),
    resortId: resortIdSchema,
    sourceKind: z.enum(["curated", "osm"]).default("curated"),
  }),
  z.strictObject({ operation: z.literal("review"), resortId: resortIdSchema }),
  z.strictObject({
    operation: z.literal("ticket"),
    resortId: resortIdSchema,
    seasonId: z.string().max(50),
  }),
  z.strictObject({
    operation: z.literal("mapping"),
    resortId: resortIdSchema,
    kind: z.enum(["courses", "lifts"]),
    geojsonNames: z.array(z.string()).optional(),
  }),
]);

/** ブラウザーの cookie から本人を解決し，本文に actor を取らない． */
export async function POST(request: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !canEdit(actor.role)) {
    return httpProblem(
      actor ? 403 : 401,
      actor ? "FORBIDDEN" : "UNAUTHORIZED",
      "編集者または管理者権限が必要です．",
      { "Cache-Control": "private, no-store", Vary: "Cookie" },
    );
  }
  return respondToPublicQuery<z.infer<typeof schema>, unknown>(
    request,
    schema,
    async query => {
      switch (query.operation) {
        case "lift":
          return queries.loadLiftSourceData(query.resortId);
        case "links":
          return queries.loadResortLinks(query.resortId);
        case "slope":
          return queries.loadSlopeSourceData(query.resortId, query.sourceKind);
        case "review":
          return queries.loadReviewForEdit(query.resortId);
        case "ticket":
          return queries.loadTicketForEdit(query.resortId, query.seasonId);
        case "mapping":
          return queries.loadLatestStatusMapping(
            query.resortId,
            query.kind,
            query.geojsonNames,
          );
      }
    },
  );
}
