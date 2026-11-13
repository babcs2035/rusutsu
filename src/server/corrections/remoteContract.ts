import { z } from "zod";
import {
  requestIdSchema,
  requestVersionSchema,
} from "@/server/edit-requests/contract";

const summary = z.object({
  id: requestIdSchema,
  resortId: z.string(),
  status: z.string(),
  authorName: z.string(),
  createdAt: z.iso.datetime().transform(value => new Date(value)),
});

export const correctionListSchema = z.object({
  requests: z.array(summary).max(200),
  pendingCount: z.number().int().nonnegative(),
});

export const correctionDetailSchema = z.object({
  request: summary
    .extend({
      kind: z.literal("public-correction"),
      version: requestVersionSchema,
      candidatePayload: z.unknown(),
      submittedPayload: z.unknown(),
      photos: z.array(
        z.object({
          id: z.string(),
          mimeType: z.string(),
          width: z.number(),
          height: z.number(),
        }),
      ),
      events: z.array(
        z.object({
          id: z.string(),
          createdAt: z.iso.datetime().transform(value => new Date(value)),
          action: z.string(),
          actorId: z.string(),
          payload: z.unknown(),
        }),
      ),
    })
    .nullable(),
  pending: z.array(
    z.object({ id: requestIdSchema, candidatePayload: z.unknown() }),
  ),
});

export const correctionDecisionSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    version: requestVersionSchema,
    decision: z.string(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const correctionAdjustmentSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), version: requestVersionSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
