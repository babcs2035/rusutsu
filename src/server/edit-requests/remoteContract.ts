import { z } from "zod";
import type { LiftReview } from "@/features/edit-requests/liftReview";
import type { SlopeReview } from "@/features/edit-requests/slopeReview";
import {
  EDIT_KIND_LABELS,
  type EditPlan,
  MAX_EDIT_BYTES,
  requestIdSchema,
  requestVersionSchema,
  reviewCommentSchema,
} from "./contract";

export const EDIT_REQUESTS_API_PATH = "/api/internal/v1/edit-requests";
export const EDIT_REQUEST_API_MAX_BYTES = MAX_EDIT_BYTES + 64 * 1024;
const kind = z.enum(
  Object.keys(EDIT_KIND_LABELS) as [
    keyof typeof EDIT_KIND_LABELS,
    ...Array<keyof typeof EDIT_KIND_LABELS>,
  ],
);
const identity = { googleAccountId: z.string().min(1).max(512) };
export const editRequestApiCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...identity, operation: z.literal("list") }),
  z.strictObject({
    ...identity,
    operation: z.literal("get"),
    id: requestIdSchema,
  }),
  z.strictObject({
    ...identity,
    operation: z.literal("edit"),
    kind,
    payload: z.unknown(),
  }),
  z.strictObject({
    ...identity,
    operation: z.literal("revise"),
    id: requestIdSchema,
    version: requestVersionSchema,
    payload: z.unknown(),
    comment: reviewCommentSchema,
  }),
  z.strictObject({
    ...identity,
    operation: z.literal("approve"),
    id: requestIdSchema,
    version: requestVersionSchema,
  }),
  z.strictObject({
    ...identity,
    operation: z.literal("reject"),
    id: requestIdSchema,
    version: requestVersionSchema,
    comment: reviewCommentSchema,
  }),
  z.strictObject({
    ...identity,
    operation: z.literal("withdraw"),
    id: requestIdSchema,
    version: requestVersionSchema,
  }),
]);
type WithoutIdentity<T> = T extends unknown
  ? Omit<T, "googleAccountId">
  : never;
export type EditRequestApiOperation = WithoutIdentity<
  z.infer<typeof editRequestApiCommandSchema>
>;

const status = z.enum([
  "PENDING",
  "APPLIED",
  "REJECTED",
  "WITHDRAWN",
  "CONFLICT",
]);
const summary = z.object({
  id: requestIdSchema,
  kind,
  resortId: z.string(),
  resortName: z.string().nullable().optional(),
  status,
  authorName: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const remoteRequestListSchema = z.object({
  isAdmin: z.boolean(),
  requests: z.array(summary).max(200),
});
// Plans are prepared and validated on the canonical server; this response
// validation verifies the fields consumed by the review page.
export const remotePlanSchema = z
  .object({
    documents: z.array(
      z.object({
        key: z.string(),
        content: z.string(),
        mediaType: z.string(),
        expectedHash: z.string().nullable(),
      }),
    ),
    beforeDocuments: z.array(
      z.object({
        key: z.string(),
        document: z
          .object({
            content: z.string(),
            hash: z.string(),
            version: z.number(),
          })
          .passthrough()
          .nullable(),
      }),
    ),
    resort: z
      .object({
        id: z.string(),
        request: z.object({
          data: z.record(z.string(), z.unknown()),
          expectedUpdatedAt: z.string(),
        }),
        before: z.record(z.string(), z.unknown()),
      })
      .nullable(),
    ticket: z
      .object({
        write: z.record(z.string(), z.unknown()),
        before: z.record(z.string(), z.unknown()).nullable(),
      })
      .nullable(),
    elevations: z.array(z.unknown()),
  })
  .transform(value => value as unknown as EditPlan);
const featureReviewSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(["added", "removed", "changed", "unchanged"]),
        fields: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            before: z.string(),
            after: z.string(),
            changed: z.boolean(),
          }),
        ),
        geometryChanged: z.boolean(),
        movedFrom: z.string().nullable(),
        movedTo: z.string().nullable(),
        mappingNames: z.array(z.string()),
        mapName: z.string().nullable(),
        mappingChanged: z.boolean(),
      }),
    ),
    changedCount: z.number(),
    mappingCount: z.number(),
    orderChanged: z.boolean(),
  })
  .nullable()
  .optional();
export const remoteRequestDetailSchema = summary
  .omit({ updatedAt: true })
  .extend({
    version: requestVersionSchema,
    isAdmin: z.boolean(),
    comment: z.string().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    submittedPayload: z.unknown(),
    liftReview: featureReviewSchema.transform(
      value => value as LiftReview | null | undefined,
    ),
    slopeReview: featureReviewSchema.transform(
      value => value as SlopeReview | null | undefined,
    ),
    courseLines: z
      .array(
        z.object({
          name: z.string(),
          coordinates: z.array(z.tuple([z.number(), z.number()])).max(400),
        }),
      )
      .max(2000)
      .optional(),
    liftLines: z
      .array(
        z.object({
          name: z.string(),
          coordinates: z.array(z.tuple([z.number(), z.number()])).max(400),
        }),
      )
      .max(2000)
      .optional(),
    candidatePayload: z.unknown(),
    submittedPlan: remotePlanSchema.nullable(),
    candidatePlan: remotePlanSchema.nullable(),
  });
export const remoteMutationSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export const remoteRevisionSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    version: requestVersionSchema,
    plan: remotePlanSchema,
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export const remoteEditResultSchema = z
  .object({
    ok: z.boolean().optional(),
    status: z.enum(["saved", "error"]).optional(),
    submission: z.object({ requestId: requestIdSchema }).optional(),
  })
  .passthrough()
  .refine(value => typeof value.ok === "boolean" || value.status !== undefined);
